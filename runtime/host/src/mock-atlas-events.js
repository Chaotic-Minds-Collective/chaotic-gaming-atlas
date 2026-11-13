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

function requireNonEmptyString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
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

  if (typeof event.occurredAt !== "string" || Number.isNaN(Date.parse(event.occurredAt))) {
    throw new MockAtlasEventError("occurredAt must be a valid date-time string");
  }

  if (event.correlationId !== undefined && event.correlationId !== null) {
    requireNonEmptyString(event.correlationId, "correlationId");
  }
  if (!event.payload || typeof event.payload !== "object" || Array.isArray(event.payload)) {
    throw new MockAtlasEventError("payload must be an object");
  }

  return Object.freeze({
    ...event,
    scope: Object.freeze({ ...event.scope }),
    payload: Object.freeze({ ...event.payload })
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
  if (typeof occurredAt !== "string" || Number.isNaN(Date.parse(occurredAt))) {
    throw new MockAtlasEventError("occurredAt must be a valid date-time string");
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
