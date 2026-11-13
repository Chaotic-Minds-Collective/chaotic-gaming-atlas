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


test("rejects parseable timestamps outside the ISO date-time contract", () => {
  const valid = createMockAtlasEventStream()[0];
  for (const occurredAt of [
    "January 1, 2026", "2026-01-01", "2026-01-01T12:00:00",
    "2026-01-01 12:00:00Z", "2026-13-01T00:00:00Z"
  ]) {
    assert.throws(() => validateMockAtlasEvent({ ...valid, occurredAt }), /occurredAt/);
  }
});

test("preserves ISO timestamps with UTC or explicit offsets", () => {
  const valid = createMockAtlasEventStream()[0];
  for (const occurredAt of [
    "2026-01-01T00:00:00Z", "2026-01-01T00:00:00.123Z",
    "2026-01-01T12:00:00+05:30", "2026-01-01T12:00:00.123456-04:00"
  ]) {
    assert.equal(validateMockAtlasEvent({ ...valid, occurredAt }).occurredAt, occurredAt);
  }
});

test("requires strings for known payload identifiers when present", () => {
  const valid = createMockAtlasEventStream()[0];
  const paths = [
    ["player", "platformId"], ["player", "characterId"],
    ["tribeId"], ["ownerTribeId"], ["tameId"], ["structureId"], ["shipId"],
    ["sourceGridId"], ["destinationGridId"]
  ];
  for (const path of paths) {
    const payloadWith = (value) => path.length === 2
      ? { player: { [path[1]]: value } }
      : { [path[0]]: value };
    for (const value of [123, null, true, {}, []]) {
      assert.throws(() => validateMockAtlasEvent({ ...valid, payload: payloadWith(value) }),
        /must be a string/, path.join("."));
    }
    const payload = payloadWith("00012345678901234567890");
    assert.deepEqual(validateMockAtlasEvent({ ...valid, payload }).payload, payload);
  }
  const payload = { location: { x: 10, y: 20, z: 30 } };
  assert.deepEqual(validateMockAtlasEvent({ ...valid, payload }).payload, payload);
  assert.deepEqual(validateMockAtlasEvent({ ...valid, payload: {} }).payload, {});
});
