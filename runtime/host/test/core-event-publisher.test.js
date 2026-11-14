import test from "node:test";
import assert from "node:assert/strict";
import { createMockAtlasEventStream } from "../src/mock-atlas-events.js";
import {
  CoreEventPublishError,
  createCoreEventPublisher
} from "../src/core-event-publisher.js";

const clusterId = "11111111-1111-4111-8111-111111111111";
const serverId = "22222222-2222-4222-8222-222222222222";
const credential = `cg_srv_${"a".repeat(40)}`;

function makeEvents() {
  return createMockAtlasEventStream({ clusterId, gridId: "A1", serverId });
}

function makePublisher(overrides = {}) {
  return createCoreEventPublisher({
    allowMockEvents: true,
    baseUrl: "https://core.example.test",
    credential,
    clusterId,
    serverId,
    sleep: async () => {},
    ...overrides
  });
}

function response(status, body = {}, cancel = async () => {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    body: { cancel },
    async json() { return body; }
  };
}

test("requires explicit mock-event opt-in and valid Core configuration", () => {
  assert.throws(() => createCoreEventPublisher({}), /allowMockEvents/);
  assert.throws(() => makePublisher({ credential: "not-a-token" }), /service credential/);
  assert.throws(() => makePublisher({ serverId: "not-a-uuid" }), /serverId/);
  assert.throws(() => makePublisher({ clusterId: "not-a-uuid" }), /clusterId/);
  assert.throws(() => makePublisher({ baseUrl: "http://core.example.test" }), /HTTPS/);
  assert.throws(() => makePublisher({ maxRetries: 6 }), /maxRetries/);
  assert.throws(() => makePublisher({ requestTimeoutMs: 0 }), /requestTimeoutMs/);
});

test("posts the normalized Core envelope with scoped Bearer authentication", async () => {
  const [event] = makeEvents();
  let request;
  const publisher = makePublisher({
    fetchImpl: async (url, options) => {
      request = { url: String(url), ...options };
      return response(202, { data: { accepted: true, duplicate: false }, requestId: "req-1" });
    }
  });

  const result = await publisher.publish(event);
  assert.deepEqual(result, {
    accepted: true,
    status: 202,
    duplicate: false,
    eventId: event.eventId,
    requestId: "req-1"
  });
  assert.equal(request.url,
    `https://core.example.test/integrations/servers/${serverId}/events`);
  assert.equal(request.method, "POST");
  assert.equal(request.redirect, "error");
  assert.ok(request.signal instanceof AbortSignal);
  assert.equal(request.headers.authorization, `Bearer ${credential}`);
  assert.equal(request.headers["content-type"], "application/json");

  const body = JSON.parse(request.body);
  assert.deepEqual(body, {
    game: "atlas",
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    scope: { clusterId, gridId: "A1", serverId },
    correlationId: event.correlationId,
    payload: event.payload
  });
  assert.equal("schemaVersion" in body, false);
});

test("publishes nested Dates with their original JSON values", async () => {
  const payload = {
    nested: { at: new Date("2026-01-02T03:04:05.000Z") },
    times: [new Date("2026-02-03T04:05:06.000Z"), new Date(NaN)]
  };
  const expected = JSON.parse(JSON.stringify(payload));
  let publishedPayload;
  const publisher = makePublisher({
    fetchImpl: async (_url, options) => {
      publishedPayload = JSON.parse(options.body).payload;
      return response(202);
    }
  });

  await publisher.publish({ ...makeEvents()[0], payload });
  assert.deepEqual(publishedPayload, expected);
});

test("publishes every mock fixture event using a Core-supported event name", async () => {
  const events = makeEvents();
  const publishedTypes = [];
  const publisher = makePublisher({
    fetchImpl: async (_url, options) => {
      publishedTypes.push(JSON.parse(options.body).eventType);
      return response(202);
    }
  });
  for (const event of events) await publisher.publish(event);
  assert.deepEqual(publishedTypes, events.map((event) => event.eventType));
});

test("preserves an API base path when constructing the Core endpoint", async () => {
  const [event] = makeEvents();
  let requestUrl;
  const publisher = makePublisher({
    baseUrl: "https://core.example.test/api/v1/",
    fetchImpl: async (url) => { requestUrl = String(url); return response(202); }
  });
  await publisher.publish(event);
  assert.equal(requestUrl,
    `https://core.example.test/api/v1/integrations/servers/${serverId}/events`);
});

test("keeps protocol-relative-looking base paths on the configured origin", async () => {
  const [event] = makeEvents();
  let requestUrl;
  const publisher = makePublisher({
    baseUrl: "https://core.example.test//collector.example.test/api",
    fetchImpl: async (url) => { requestUrl = new URL(String(url)); return response(202); }
  });
  await publisher.publish(event);
  assert.equal(requestUrl.origin, "https://core.example.test");
  assert.equal(requestUrl.pathname, `//collector.example.test/api/integrations/servers/${serverId}/events`);
});

test("accepts Core duplicate acknowledgements without changing event identity", async () => {
  const [event] = makeEvents();
  const publisher = makePublisher({
    fetchImpl: async () => response(202, { data: { accepted: true, duplicate: true } })
  });
  const result = await publisher.publish(event);
  assert.equal(result.accepted, true);
  assert.equal(result.duplicate, true);
  assert.equal(result.eventId, event.eventId);
});

test("accepts malformed JSON acknowledgements without retrying", async () => {
  const [event] = makeEvents();
  for (const makeResponse of [
    () => new Response("not JSON", { status: 202 }),
    () => ({ ok: true, status: 202, json: async () => { throw new SyntaxError("invalid JSON"); } })
  ]) {
    let calls = 0;
    const publisher = makePublisher({
      fetchImpl: async () => { calls += 1; return makeResponse(); }
    });
    const result = await publisher.publish(event);
    assert.equal(result.accepted, true);
    assert.equal(result.duplicate, false);
    assert.equal(result.requestId, null);
    assert.equal(calls, 1);
  }
});

test("rejects mismatched server and cluster scope before making a request", async () => {
  const [event] = makeEvents();
  let calls = 0;
  const publisher = makePublisher({ fetchImpl: async () => { calls += 1; return response(202); } });

  await assert.rejects(
    publisher.publish({ ...event, scope: { ...event.scope, serverId: "33333333-3333-4333-8333-333333333333" } }),
    /server scope/
  );
  await assert.rejects(
    publisher.publish({ ...event, scope: { ...event.scope, clusterId: "44444444-4444-4444-8444-444444444444" } }),
    /cluster scope/
  );
  assert.equal(calls, 0);
});

test("does not retry permanent authorization or validation failures", async () => {
  const [event] = makeEvents();
  let calls = 0;
  const publisher = makePublisher({
    fetchImpl: async () => { calls += 1; return response(403); }
  });
  await assert.rejects(publisher.publish(event), (error) => {
    assert.ok(error instanceof CoreEventPublishError);
    assert.equal(error.status, 403);
    return true;
  });
  assert.equal(calls, 1);
});

test("retries transient server responses and preserves the same event ID", async () => {
  const [fixture] = makeEvents();
  const event = { ...fixture, payload: structuredClone(fixture.payload) };
  const bodies = [];
  const delays = [];
  let calls = 0;
  const publisher = makePublisher({
    retryDelayMs: 25,
    sleep: async (delay) => {
      delays.push(delay);
      if (delays.length === 1) event.payload.player.name = "MutatedDuringRetry";
    },
    fetchImpl: async (_url, options) => {
      calls += 1;
      bodies.push(JSON.parse(options.body));
      return calls < 3
        ? response(503)
        : response(202, { data: { accepted: true, duplicate: false } });
    }
  });

  const result = await publisher.publish(event);
  assert.equal(result.accepted, true);
  assert.equal(calls, 3);
  assert.deepEqual(delays, [25, 50]);
  assert.deepEqual(bodies.map((body) => body.eventId), [event.eventId, event.eventId, event.eventId]);
  assert.equal(bodies[0].payload.player.name, "TestSailor");
  assert.deepEqual(bodies[1], bodies[0]);
  assert.deepEqual(bodies[2], bodies[0]);
});

test("retries network failures within the bounded retry budget", async () => {
  const [event] = makeEvents();
  let calls = 0;
  const publisher = makePublisher({
    maxRetries: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) throw new Error("connection reset");
      return response(202);
    }
  });
  const result = await publisher.publish(event);
  assert.equal(result.accepted, true);
  assert.equal(calls, 2);
});

test("fails after exhausting retries and exposes no credential material", async () => {
  const [event] = makeEvents();
  let calls = 0;
  const publisher = makePublisher({
    maxRetries: 1,
    fetchImpl: async () => { calls += 1; return response(503); }
  });
  await assert.rejects(publisher.publish(event), (error) => {
    assert.ok(error instanceof CoreEventPublishError);
    assert.equal(error.status, 503);
    assert.equal(error.eventId, event.eventId);
    assert.equal(error.message.includes(credential), false);
    return true;
  });
  assert.equal(calls, 2);
});


test("aborts a request that exceeds its deadline", async () => {
  const [event] = makeEvents();
  let aborted = false;
  const publisher = makePublisher({
    maxRetries: 0,
    requestTimeoutMs: 10,
    fetchImpl: async (_url, { signal }) => new Promise((_resolve, reject) => {
      signal.addEventListener("abort", () => { aborted = true; reject(new Error("aborted")); }, { once: true });
    })
  });
  await assert.rejects(publisher.publish(event), /timed out/);
  assert.equal(aborted, true);
});

test("request deadline also covers a stalled successful response body", async () => {
  const [event] = makeEvents();
  const publisher = makePublisher({
    maxRetries: 0,
    requestTimeoutMs: 10,
    fetchImpl: async (_url, { signal }) => ({
      ok: true,
      status: 202,
      body: { cancel: async () => {} },
      json: () => new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new Error("body aborted")), { once: true });
      })
    })
  });
  await assert.rejects(publisher.publish(event), /timed out/);
});

test("cancels failed response bodies before retrying or throwing", async () => {
  const [event] = makeEvents();
  const cancelled = [];
  let calls = 0;
  const publisher = makePublisher({
    maxRetries: 1,
    fetchImpl: async () => {
      calls += 1;
      if (calls === 1) return response(503, {}, async () => cancelled.push(503));
      return response(403, {}, async () => cancelled.push(403));
    }
  });
  await assert.rejects(publisher.publish(event), /HTTP 403/);
  assert.deepEqual(cancelled, [503, 403]);
  assert.equal(calls, 2);
});

test("rejects malformed events before attempting delivery", async () => {
  const [event] = makeEvents();
  let calls = 0;
  const publisher = makePublisher({ fetchImpl: async () => { calls += 1; return response(202); } });
  await assert.rejects(
    publisher.publish({ ...event, eventType: "player.teleport" }),
    /unsupported eventType/
  );
  assert.equal(calls, 0);
});
