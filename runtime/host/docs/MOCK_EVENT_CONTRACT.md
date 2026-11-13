# Mock ATLAS Event Contract

**Status:** implemented as a server-independent test contract. It is not evidence that the corresponding native ATLAS callbacks or loader hooks have been verified.

## Purpose

The mock event stream lets Connect, Commerce, Player, Tribes, Sentinel, World, GridForge and Adventures develop against a stable envelope before a dedicated ATLAS server exists. Fixtures are deterministic and perform no network, RCON, filesystem, native-loader or in-game write operations.

## Envelope (schema version 1)

| Field | Type | Requirement |
| --- | --- | --- |
| `schemaVersion` | integer | Must equal `1` |
| `eventId` | string | Stable unique identifier within the source |
| `eventType` | string | Must be in the exported allowlist |
| `occurredAt` | ISO date-time string | Required |
| `scope.clusterId` | string | Required; cluster scope |
| `scope.gridId` | string | Required; grid/map scope |
| `scope.serverId` | string | Required; source server scope |
| `correlationId` | string or null | Optional cross-service workflow correlation |
| `payload` | object | Event-specific data; provider IDs remain strings |

The simulator uses strings for provider identifiers and never treats display names as identifiers. A transfer event records source and destination grid IDs. Consumers should deduplicate by source event ID and preserve the full cluster/grid/server scope.

<!-- coderabbit-ai-generated:v1 -->

<!-- coderabbit-ai-generated-section:v1:d1ba47b40ac53b730bcf05d20e7c721aee4424bb5376e2031e35e4302c3fdb64 -->

Payload arrays may have at most 10,000 elements.

<!-- /coderabbit-ai-generated:v1 -->

## Initial event allowlist

- Player: `player.connected`, `player.disconnected`, `player.died`, `player.killed`
- Character: `character.created`, `character.transferred`
- Tribe: `tribe.created`, `tribe.member.joined`, `tribe.member.left`, `tribe.updated`
- Chat: `chat.global`, `chat.tribe`
- World: `ship.sunk`, `ship.retrieved`, `structure.destroyed`, `tame.created`, `tame.died`
- Server: `server.state.changed`

This is a product-facing normalized event vocabulary for mock-driven development. Mapping each event to a real game callback, its payload fields, timing and reliability remains a server/SDK verification task.

## Use

From `runtime/host`:

```sh
node --test
```

Import `createMockAtlasEventStream` from `src/mock-atlas-events.js` in module integration tests. Pass explicit `clusterId`, `gridId`, and `serverId` values to test multi-grid isolation. The returned events and their top-level nested objects are frozen.

## Boundaries

- No mock event grants items, changes player state, executes RCON, restarts a server or changes world configuration.
- The fixtures are not production telemetry and must not be sent to a live Core endpoint by default.
- Native event mapping, loader compatibility, server build, thread-safety and real reward/action acknowledgements remain unverified until a test server is available.
