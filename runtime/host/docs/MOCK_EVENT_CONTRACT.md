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

## Verified capability boundary

The host context may advertise native ATLAS capabilities only when `loader.verified` is true. An unverified loader must provide an empty capability list; the runtime rejects contradictory context instead of trusting declared capability names. Plugins that require native capabilities therefore cannot start against an unverified loader. Host-neutral plugins may still run with no native capabilities.

A verified flag is a caller-supplied assertion from an isolated compatibility-validation process, not something this host runtime proves. Do not set it to true until the exact server build, loader, SDK/toolchain, callback lifecycle and platform have been independently tested.

## Use

From `runtime/host`:

```sh
node --test
```

Import `createMockAtlasEventStream` from `src/mock-atlas-events.js` in module integration tests. Pass explicit `clusterId`, `gridId`, and `serverId` values to test multi-grid isolation. The returned events and their top-level nested objects are frozen.

## Core event publisher

`createCoreEventPublisher` in `src/core-event-publisher.js` maps schema-v1 mock envelopes to Core's normalized ingestion request:

`POST /integrations/servers/{serverId}/events`

It sends `Authorization: Bearer {service credential}`, the Core game key `atlas`, the stable source `eventId`, event type, timestamp, cluster/grid/server scope, optional correlation ID and payload. The mock-only publisher requires the explicit `allowMockEvents: true` option. It also requires the event cluster and server UUIDs to match the configured publisher scope. Its event allowlist mirrors Core's current normalized game-event schema; event names are forwarded unchanged only when Core accepts them, and unsupported names are rejected before a request is made. This is a test bridge, not a native ATLAS adapter.

Transient network failures, request timeouts and HTTP 408, 425, 429, 500, 502, 503 and 504 responses are retried with a bounded exponential delay. Permanent 4xx responses are not retried. Redirects are rejected, each attempt has a bounded deadline that covers response-body reading, and unused error response bodies are cancelled before retry or failure. The exact JSON request body is serialized once and reused unchanged for every retry. Every retry uses the same event ID so Core's server-scoped idempotency key can acknowledge duplicate deliveries. The publisher does not persist a delivery queue; durable offline delivery remains a later adapter responsibility.

The publisher is inert until a caller explicitly constructs it with a Core URL, a service credential and `allowMockEvents: true`. Never place service credentials in source control, fixtures or logs. Use a server-scoped service credential with only `events.publish` permission.

## Boundaries

- No mock event grants items, changes player state, executes RCON, restarts a server or changes world configuration.
- The fixtures are not production telemetry and must not be sent to a live Core endpoint by default.
- Native event mapping, loader compatibility, server build, thread-safety and real reward/action acknowledgements remain unverified until a test server is available.
