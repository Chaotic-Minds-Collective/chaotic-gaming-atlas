# Chaotic Gaming — ATLAS Plugins

Original, modular server-side plugins for the Chaotic Gaming ATLAS network.

## Goals

- Replace useful third-party mod functionality with independently maintained implementations.
- Keep shared identity, permissions, economy, entitlements and community logic in Chaotic Gaming Core.
- Keep ATLAS-specific game calls behind a small adapter boundary.
- Support ATLAS cluster/grid topology explicitly.
- Prefer server-side functionality; do not require clients to install files unless a feature truly needs it.

## Planned first plugins

1. Server Status & Health
2. Audit & Activity Log
3. Announcements & Scheduler
4. Player Sessions & Statistics
5. Permissions Bridge
6. Admin Toolkit
7. Starter Kits & Welcome Flow
8. Events & Challenges
9. Rewards & Entitlements
10. Tribe / Group Utilities
11. Teleport & Travel Tools
12. Claims & Territory Tools
13. Economy Adapter
14. Anti-Abuse Rules
15. Backup & Recovery Coordinator

See the [central plugin catalogue](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-docs/blob/main/plugins/PLUGIN_CATALOG.md).

## Compatibility status

**Not yet validated.** A public listing describes ATLAS Server API 1.71 as a C++ server plugin loader. That is a research lead only. Before implementation depends on it, validate the exact ATLAS server build, loader binary, compiler/toolchain, available headers/SDK, hook lifecycle, and host OS in an isolated test environment.

No DevKit or client asset pipeline is required for the initial server-side plugin roadmap.

## Repository rules

- Do not copy third-party source, assets, or proprietary designs.
- Each plugin gets its own folder, manifest, tests, docs and version.
- No plugin gets database credentials. Use a scoped service identity and authenticated Core API.
- Privileged actions fail closed when authorization cannot be verified.
- Network failures must not crash the game server.
- Do not test on a live production server.

## ATLAS integration workspace

The adapter workspace now includes:
- Compatibility matrix and isolated plugin proof-of-concept acceptance criteria.
- A minimal plugin milestone that reports startup, version and shutdown only.
- Explicit validation gates before player, tribe, grid, transfer or reward features are implemented.

CI builds a Windows x64 plugin artifact, but no binary has been loaded on an actual ATLAS server. The ATLAS Server API dependency remains unverified.

## Core heartbeat integration

The plugin can optionally report a read-only server heartbeat to Chaotic Gaming Core. It does not issue gameplay commands or require direct database access. If the integration is not configured, the plugin remains in lifecycle-only mode.

Register the ATLAS server in Core first, then create a dedicated service identity scoped to that one server:

```bash
npm run service:create -- atlas-server-main --role server_heartbeat --scope-type server --scope-id <SERVER_UUID>
```

Configure the ATLAS server process with:

- `CHAOTIC_CORE_API_URL` — HTTPS Core API origin (HTTP is accepted only for localhost development)
- `CHAOTIC_CORE_SERVICE_TOKEN` — one-time service credential; never commit or share it between servers
- `CHAOTIC_CORE_SERVER_ID` — the registered Core server UUID
- `ATLAS_SERVER_BUILD` — optional server build label
- `HEARTBEAT_INTERVAL_SECONDS` — optional interval from 30 to 300 seconds (default 60)

The service identity needs only the `server_heartbeat` role at that server scope. Network failures are logged and retried; they do not stop the game server. The heartbeat currently reports online state and version metadata; player counts and game-event hooks remain future work.

The HTTP client rejects non-loopback plaintext URLs and disables redirects so credentials and request bodies cannot be forwarded to another host.
