const EVENT_TYPES = Object.freeze([
  "player.connected",
  "player.disconnected",
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
  "server.state.changed"
]);

const REQUIRED_SCOPE = Object.freeze(["clusterId", "gridId", "serverId"]);
const ISO_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(\.\d+)?(Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function isValidIsoDateTime(value) {
  if (typeof value !== "string") return false;
  const match = ISO_DATE_TIME.exec(value);
  if (!match) return false;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const daysInMonth = [
    31,
    year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,
    31, 30, 31, 30, 31, 31, 30, 31, 30, 31
  ];

  if (month < 1 || month > 12 || day < 1 || day > daysInMonth[month - 1]) {
    return false;
  }
  if (hour > 23 || minute > 59 || second > 59) return false;

  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp);
}

const MAX_PROVIDER_ID_DEPTH = 100;
const MAX_PROVIDER_ID_NODES = 10000;
const MAX_PROVIDER_ID_ARRAY_LENGTH = 10000;

function validateProviderIds(value, path = "payload") {
  const stack = [{ value, path, depth: 0 }];
  const visited = new WeakSet();
  let visitedCount = 0;

  while (stack.length > 0) {
    const current = stack.pop();
    const nestedValue = current.value;
    if (!nestedValue || typeof nestedValue !== "object") continue;

    if (current.depth > MAX_PROVIDER_ID_DEPTH) {
      throw new TypeError(`${current.path} exceeds maximum payload nesting depth`);
    }
    if (visited.has(nestedValue)) {
      throw new TypeError(`${current.path} contains a cyclic or repeated object reference`);
    }
    visited.add(nestedValue);
    visitedCount += 1;
    if (visitedCount > MAX_PROVIDER_ID_NODES) {
      throw new TypeError("payload exceeds maximum object count");
    }

    if (Array.isArray(nestedValue)) {
      if (nestedValue.length > MAX_PROVIDER_ID_ARRAY_LENGTH) {
        throw new TypeError(`${current.path} exceeds maximum array length`);
      }
      for (let index = nestedValue.length - 1; index >= 0; index -= 1) {
        stack.push({
          value: nestedValue[index],
          path: `${current.path}[${index}]`,
          depth: current.depth + 1
        });
      }
      continue;
    }

    for (const [key, childValue] of Object.entries(nestedValue)) {
      const childPath = `${current.path}.${key}`;
      if (key.endsWith("Id")) {
        requireNonEmptyString(childValue, childPath);
      }
      if (childValue && typeof childValue === "object") {
        stack.push({ value: childValue, path: childPath, depth: current.depth + 1 });
      }
    }
  }
}

function cloneAndDeepFreeze(value) {
  if (value instanceof Date) {
    // Preserve the JSON value without retaining a mutable Date in the snapshot.
    return Date.prototype.toJSON.call(value);
  }
  if (Array.isArray(value)) {
    return Object.freeze(value.map((item) => cloneAndDeepFreeze(item)));
  }
  if (value && typeof value === "object") {
    const copy = {};
    for (const [key, childValue] of Object.entries(value)) {
      Object.defineProperty(copy, key, {
        value: cloneAndDeepFreeze(childValue),
        enumerable: true,
        writable: true,
        configurable: true
      });
    }
    return Object.freeze(copy);
  }
  return value;
}

export class MockAtlasEventError extends Error {
  constructor(message) {
    super(message);
    this.name = "MockAtlasEventError";
  }
}

/**
 * Validate the host-neutral event envelope used by simulator fixtures.
 * This is a test contract, not a claim about native ATLAS callback support.
 */
export function validateMockAtlasEvent(event) {
  if (!event || typeof event !== "object" || Array.isArray(event)) {
    throw new MockAtlasEventError("event must be an object");
  }

  requireNonEmptyString(event.eventId, "eventId");
  requireNonEmptyString(event.eventType, "eventType");
  if (!EVENT_TYPES.includes(event.eventType)) {
    throw new MockAtlasEventError(`unsupported eventType: ${event.eventType}`);
  }

  if (event.schemaVersion !== 1) {
    throw new MockAtlasEventError("schemaVersion must be 1");
  }

  if (!event.scope || typeof event.scope !== "object" || Array.isArray(event.scope)) {
    throw new MockAtlasEventError("scope must be an object");
  }
  for (const field of REQUIRED_SCOPE) {
    requireNonEmptyString(event.scope[field], `scope.${field}`);
  }

  if (!isValidIsoDateTime(event.occurredAt)) {
    throw new MockAtlasEventError("occurredAt must be a valid ISO 8601 date-time with timezone");
  }

  if (event.correlationId !== undefined && event.correlationId !== null) {
    requireNonEmptyString(event.correlationId, "correlationId");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)
    || event.payload instanceof Date) {
    throw new MockAtlasEventError("payload must be an object");
  }
  validateProviderIds(event.payload);

  return Object.freeze({
    ...event,
    scope: Object.freeze({ ...event.scope }),
    payload: cloneAndDeepFreeze(event.payload)
  });
}

/**
 * Create a deterministic, server-free event stream for module integration tests.
 * No sockets, RCON, native loader, filesystem access, or live game writes.
 */
export function createMockAtlasEventStream(options = {}) {
  const clusterId = requireNonEmptyString(options.clusterId ?? "cg-test-cluster", "clusterId");
  const gridId = requireNonEmptyString(options.gridId ?? "A1", "gridId");
  const serverId = requireNonEmptyString(options.serverId ?? "cg-test-server-a1", "serverId");
  const occurredAt = options.occurredAt ?? "2026-01-01T00:00:00.000Z";
  if (!isValidIsoDateTime(occurredAt)) {
    throw new MockAtlasEventError("occurredAt must be a valid ISO 8601 date-time with timezone");
  }

  const scope = Object.freeze({ clusterId, gridId, serverId });
  const samples = [
    ["player.connected", { player: { platformId: "platform-1001", characterId: "char-a1-01", name: "TestSailor" } }],
    ["chat.global", { player: { platformId: "platform-1001" }, message: "Hello from the mock grid" }],
    ["tribe.member.joined", { tribeId: "tribe-42", player: { platformId: "platform-1001" } }],
    ["tame.created", { tameId: "tame-77", species: "TestCreature", ownerTribeId: "tribe-42" }],
    ["structure.destroyed", { structureId: "structure-9", ownerTribeId: "tribe-42", cause: "test" }],
    ["ship.sunk", { shipId: "ship-12", ownerTribeId: "tribe-42", location: { x: 10, y: 20, z: 30 } }],
    ["player.died", { player: { platformId: "platform-1001" }, cause: "test" }],
    ["character.transferred", { player: { platformId: "platform-1001", characterId: "char-a1-01" }, sourceGridId: gridId, destinationGridId: "B2" }]
  ];

  const events = samples.map(([eventType, payload], index) => validateMockAtlasEvent({
    schemaVersion: 1,
    eventId: `mock-${serverId}-${String(index + 1).padStart(4, "0")}`,
    eventType,
    occurredAt: new Date(Date.parse(occurredAt) + index * 1000).toISOString(),
    scope,
    correlationId: `mock-session-${serverId}`,
    payload
  }));

  return Object.freeze(events);
}

export { EVENT_TYPES as MOCK_ATLAS_EVENT_TYPES };
