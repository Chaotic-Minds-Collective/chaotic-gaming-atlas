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

test("exports the event type allowlist as immutable contract metadata", () => {
  assert.ok(MOCK_ATLAS_EVENT_TYPES.includes("ship.sunk"));
  assert.ok(MOCK_ATLAS_EVENT_TYPES.includes("structure.destroyed"));
  assert.equal(Object.isFrozen(MOCK_ATLAS_EVENT_TYPES), true);
});
