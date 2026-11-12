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
**Not yet validated.** A public listing describes Atlas Server API 1.71 as a C++ server plugin loader. That is a research lead only. Before implementation depends on it, validate the exact ATLAS server build, loader binary, compiler/toolchain, available headers/SDK, hook lifecycle, and host OS in an isolated test environment.

No DevKit or client asset pipeline is required for the initial server-side plugin roadmap.

## Repository rules
- Do not copy third-party source, assets, or proprietary designs.
- Each plugin gets its own folder, manifest, tests, docs and version.
- No plugin gets database credentials. Use a scoped service identity and authenticated Core API.
- Privileged actions fail closed when authorization cannot be verified.
- Network failures must not crash the game server.
- Do not test on a live production server.
