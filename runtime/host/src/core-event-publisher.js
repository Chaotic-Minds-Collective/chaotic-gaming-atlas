import { validateMockAtlasEvent } from "./mock-atlas-events.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SERVICE_CREDENTIAL_PATTERN = /^cg_srv_[A-Za-z0-9_-]{40,}$/;
// Keep this allowlist synchronized with Core's NORMALIZED_GAME_EVENT_TYPES schema.
const CORE_EVENT_TYPES = new Set([
  "player.joined",
  "player.left",
  "player.connected",
  "player.disconnected",
  "player.chat",
  "player.died",
  "player.killed",
  "character.created",
  "character.transferred",
  "tribe.created",
  "tribe.member.joined",
  "tribe.member.left",
  "tribe.updated",
  "chat.global",
  "chat.tribe",
  "ship.sunk",
  "ship.retrieved",
  "structure.destroyed",
  "tame.created",
  "tame.died",
  "server.started",
  "server.stopped",
  "server.state.changed"
]);
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

export class CoreEventPublishError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = "CoreEventPublishError";
    this.status = options.status ?? null;
    this.eventId = options.eventId ?? null;
  }
}

function requireUuid(value, field) {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new TypeError(`${field} must be a UUID`);
  }
  return value.toLowerCase();
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    throw new TypeError("baseUrl must be an absolute URL", { cause: error });
  }

  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && localHosts.has(url.hostname))) {
    throw new TypeError("baseUrl must use HTTPS (HTTP is allowed only for localhost tests)");
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new TypeError("baseUrl must not contain credentials, query parameters, or a fragment");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  return url;
}

function isRetryableStatus(status) {
  return RETRYABLE_STATUSES.has(status);
}

function defaultSleep(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function cancelResponseBody(response) {
  try {
    await response?.body?.cancel();
  } catch {
    // Releasing an unused error body is best-effort; preserve the HTTP result.
  }
}

/**
 * Build an explicitly opted-in publisher for schema-v1 mock events.
 * This sends only to the Core event-ingestion API; it does not call ATLAS,
 * RCON, or any game-server interface.
 */
export function createCoreEventPublisher(options = {}) {
  if (options.allowMockEvents !== true) {
    throw new TypeError("allowMockEvents: true is required to publish simulator events");
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const credential = options.credential;
  if (typeof credential !== "string" || !SERVICE_CREDENTIAL_PATTERN.test(credential)) {
    throw new TypeError("credential must be a valid Core service credential");
  }

  const serverId = requireUuid(options.serverId, "serverId");
  const clusterId = requireUuid(options.clusterId, "clusterId");
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  const sleep = options.sleep ?? defaultSleep;
  const maxRetries = options.maxRetries ?? 2;
  const retryDelayMs = options.retryDelayMs ?? 100;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;

  if (typeof fetchImpl !== "function") {
    throw new TypeError("fetchImpl must be a function");
  }
  if (typeof sleep !== "function") {
    throw new TypeError("sleep must be a function");
  }
  if (!Number.isInteger(maxRetries) || maxRetries < 0 || maxRetries > 5) {
    throw new TypeError("maxRetries must be an integer between 0 and 5");
  }
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 5000) {
    throw new TypeError("retryDelayMs must be an integer between 0 and 5000");
  }
  if (!Number.isInteger(requestTimeoutMs) || requestTimeoutMs < 1 || requestTimeoutMs > 60_000) {
    throw new TypeError("requestTimeoutMs must be an integer between 1 and 60000");
  }

  const endpoint = new URL(baseUrl.origin);
  const basePath = baseUrl.pathname === "/" ? "" : baseUrl.pathname.replace(/\/+$/, "");
  endpoint.pathname = `${basePath}/integrations/servers/${serverId}/events`;

  async function publish(event) {
    const validated = validateMockAtlasEvent(event);
    if (!CORE_EVENT_TYPES.has(validated.eventType)) {
      throw new CoreEventPublishError(`Core does not accept event type: ${validated.eventType}`, {
        eventId: validated.eventId
      });
    }
    if (validated.scope.serverId.toLowerCase() !== serverId) {
      throw new CoreEventPublishError("Event server scope does not match this publisher", {
        eventId: validated.eventId
      });
    }
    if (validated.scope.clusterId.toLowerCase() !== clusterId) {
      throw new CoreEventPublishError("Event cluster scope does not match this publisher", {
        eventId: validated.eventId
      });
    }

    const body = {
      game: "atlas",
      eventId: validated.eventId,
      eventType: validated.eventType,
      occurredAt: validated.occurredAt,
      scope: {
        clusterId,
        gridId: validated.scope.gridId,
        serverId
      },
      correlationId: validated.correlationId ?? null,
      payload: validated.payload
    };

    // Snapshot the exact request once so retries cannot reuse an event ID with changed data.
    const serializedBody = JSON.stringify(body);

    for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
      const controller = new AbortController();
      let timedOut = false;
      let response;
      let result = null;
      let requestError = null;
      const timeout = setTimeout(() => {
        timedOut = true;
        controller.abort(new Error("Core event request timed out"));
      }, requestTimeoutMs);

      try {
        response = await fetchImpl(endpoint, {
          method: "POST",
          redirect: "error",
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${credential}`,
            "content-type": "application/json",
            accept: "application/json"
          },
          body: serializedBody
        });

        if (response.ok) {
          try {
            result = await response.json();
          } catch (error) {
            if (timedOut) throw error;
            // A successful acknowledgement does not require a valid JSON response body.
          }
        } else {
          await cancelResponseBody(response);
        }
      } catch (error) {
        requestError = error;
      } finally {
        clearTimeout(timeout);
      }

      if (requestError || timedOut) {
        if (attempt < maxRetries) {
          await sleep(retryDelayMs * (2 ** attempt));
          continue;
        }
        throw new CoreEventPublishError(
          timedOut ? "Core event request timed out" : "Core event request failed before receiving a response",
          { cause: requestError ?? undefined, eventId: validated.eventId }
        );
      }

      if (response.ok) {
        return Object.freeze({
          accepted: true,
          status: response.status,
          duplicate: result?.data?.duplicate === true,
          eventId: validated.eventId,
          requestId: result?.requestId ?? null
        });
      }

      if (isRetryableStatus(response.status) && attempt < maxRetries) {
        await sleep(retryDelayMs * (2 ** attempt));
        continue;
      }

      throw new CoreEventPublishError(
        `Core rejected event publication with HTTP ${response.status}`,
        { status: response.status, eventId: validated.eventId }
      );
    }

    throw new CoreEventPublishError("Core event publication exhausted its retry budget", {
      eventId: validated.eventId
    });
  }

  return Object.freeze({ publish });
}
