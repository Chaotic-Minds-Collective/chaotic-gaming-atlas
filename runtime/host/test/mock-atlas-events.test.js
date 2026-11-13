import test from "node:test";
import assert from "node:assert/strict";
import {
  createMockAtlasEventStream,
  validateMockAtlasEvent,
  MockAtlasEventError,
  MOCK_ATLAS_EVENT_TYPES
} from "../src/mock-atlas-events.js";

test("creates a deterministic, scoped event stream without a server", () => {
  const events = createMockAtlasEventStream();
  assert.equal(events.length, 8);
  assert.equal(events[0].eventType, "player.connected");
  assert.equal(events[0].scope.clusterId, "cg-test-cluster");
  assert.equal(events[0].scope.gridId, "A1");
  assert.equal(events[0].scope.serverId, "cg-test-server-a1");
  assert.equal(events[7].eventType, "character.transferred");
  assert.equal(new Set(events.map((event) => event.eventId)).size, events.length);
});

test("supports isolated grid and server fixtures", () => {
  const [event] = createMockAtlasEventStream({
    clusterId: "cluster-x",
    gridId: "C3",
    serverId: "server-c3"
  });
  assert.deepEqual(event.scope, {
    clusterId: "cluster-x",
    gridId: "C3",
    serverId: "server-c3"
  });
  assert.match(event.eventId, /^mock-server-c3-/);
});

test("freezes the event list and returned event envelopes", () => {
  const events = createMockAtlasEventStream();
  assert.equal(Object.isFrozen(events), true);
  assert.equal(Object.isFrozen(events[0]), true);
  assert.equal(Object.isFrozen(events[0].scope), true);
  assert.equal(Object.isFrozen(events[0].payload), true);
});

test("rejects unknown event types and malformed scope", () => {
  assert.throws(() => validateMockAtlasEvent({
    schemaVersion: 1,
    eventId: "evt-1",
    eventType: "player.magic",
    occurredAt: "2026-01-01T00:00:00.000Z",
    scope: { clusterId: "c", gridId: "g", serverId: "s" },
    payload: {}
  }), MockAtlasEventError);

  assert.throws(() => validateMockAtlasEvent({
    schemaVersion: 1,
    eventId: "evt-2",
    eventType: "player.connected",
    occurredAt: "2026-01-01T00:00:00.000Z",
    scope: { clusterId: "c", gridId: "", serverId: "s" },
    payload: {}
  }), /scope.gridId/);
});

test("rejects invalid schema versions, timestamps and payloads", () => {
  const valid = createMockAtlasEventStream()[0];
  assert.throws(() => validateMockAtlasEvent({ ...valid, schemaVersion: 2 }), /schemaVersion/);
  assert.throws(() => validateMockAtlasEvent({ ...valid, occurredAt: "not-a-date" }), /occurredAt/);
  assert.throws(() => validateMockAtlasEvent({ ...valid, payload: [] }), /payload/);
});

test("rejects provider IDs that are not non-empty strings, including nested IDs", () => {
  const valid = createMockAtlasEventStream()[0];
  assert.throws(() => validateMockAtlasEvent({
    ...valid,
    payload: { player: { platformId: 123 } }
  }), /payload\.player\.platformId/);
  assert.throws(() => validateMockAtlasEvent({
    ...valid,
    payload: { tribeId: 42 }
  }), /payload\.tribeId/);
  assert.throws(() => validateMockAtlasEvent({
    ...valid,
    payload: { player: { characterId: "" } }
  }), /payload\.player\.characterId/);
});

test("rejects null and undefined provider IDs while allowing omitted IDs and null correlation IDs", () => {
  const valid = createMockAtlasEventStream()[0];
  for (const invalidId of [null, undefined]) {
    assert.throws(() => validateMockAtlasEvent({
      ...valid,
      payload: { tribeId: invalidId }
    }), /payload\.tribeId/);
    assert.throws(() => validateMockAtlasEvent({
      ...valid,
      payload: { players: [{ platformId: invalidId }] }
    }), /payload\.players\[0\]\.platformId/);
  }
  assert.doesNotThrow(() => validateMockAtlasEvent({
    ...valid,
    correlationId: null,
    payload: { player: {} }
  }));
});

test("rejects cyclic and repeated object references in payloads", () => {
  const valid = createMockAtlasEventStream()[0];
  const cyclic = {};
  cyclic.self = cyclic;
  assert.throws(() => validateMockAtlasEvent({ ...valid, payload: cyclic }), /cyclic or repeated/);

  const shared = { nested: true };
  assert.throws(() => validateMockAtlasEvent({
    ...valid,
    payload: { first: shared, second: shared }
  }), /cyclic or repeated/);
});

test("bounds nested array lengths before traversing their elements", () => {
  const valid = createMockAtlasEventStream()[0];
  const oversized = new Proxy(new Array(0xFFFFFFFF), {
    get(target, key, receiver) {
      if (key !== "length") throw new Error("oversized array was traversed");
      return Reflect.get(target, key, receiver);
    }
  });

  for (const items of [new Array(10001), oversized]) {
    assert.throws(() => validateMockAtlasEvent({
      ...valid,
      payload: { groups: [{ items }] }
    }), /payload\.groups\[0\]\.items exceeds maximum array length/);
  }

  const items = new Array(10000);
  items[9999] = { platformId: "platform-1001" };
  assert.doesNotThrow(() => validateMockAtlasEvent({ ...valid, payload: { items } }));
  items[9999] = { platformId: null };
  assert.throws(() => validateMockAtlasEvent({ ...valid, payload: { items } }),
    /payload\.items\[9999\]\.platformId/);
});

test("rejects payload nesting beyond the configured depth limit", () => {
  const valid = createMockAtlasEventStream()[0];
  const payload = {};
  let current = payload;
  for (let index = 0; index < 102; index += 1) {
    current.next = {};
    current = current.next;
  }
  assert.throws(() => validateMockAtlasEvent({ ...valid, payload }), /maximum payload nesting depth/);
});

test("requires an ISO date-time with an explicit timezone", () => {
  const valid = createMockAtlasEventStream()[0];
  for (const occurredAt of [
    "January 1, 2026",
    "2026-01-01",
    "2026-01-01T00:00:00",
    "2026-01-01T00:00:00.000"
  ]) {
    assert.throws(() => validateMockAtlasEvent({ ...valid, occurredAt }), /ISO 8601/);
  }
});

test("rejects impossible calendar dates and invalid clock values", () => {
  const valid = createMockAtlasEventStream()[0];
  for (const occurredAt of [
    "2026-02-30T00:00:00Z",
    "2026-13-01T00:00:00Z",
    "2026-01-01T24:00:00Z",
    "2026-01-01T00:60:00Z"
  ]) {
    assert.throws(() => validateMockAtlasEvent({ ...valid, occurredAt }), /ISO 8601/);
  }
});

test("applies the same strict timestamp contract to simulator options", () => {
  assert.throws(() => createMockAtlasEventStream({ occurredAt: "2026-01-01" }), /ISO 8601/);
  assert.throws(() => createMockAtlasEventStream({ occurredAt: "2026-02-30T00:00:00Z" }), /ISO 8601/);
});

test("exports the event type allowlist as immutable contract metadata", () => {
  assert.ok(MOCK_ATLAS_EVENT_TYPES.includes("ship.sunk"));
  assert.ok(MOCK_ATLAS_EVENT_TYPES.includes("structure.destroyed"));
  assert.equal(Object.isFrozen(MOCK_ATLAS_EVENT_TYPES), true);
});
