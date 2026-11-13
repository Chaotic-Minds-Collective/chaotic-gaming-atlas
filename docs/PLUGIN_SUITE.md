# Chaotic Gaming ATLAS Plugin Suite

Chaotic Gaming's ATLAS work is organized as a coordinated suite of independently versioned modules. The modules are original CG implementations; existing community plugins may inform compatibility research but are not dependencies or copied source.

## Shared foundations

- [Chaotic Gaming Core](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-core) — identity, authentication, scoped RBAC, server registry, platform APIs, PostgreSQL-backed domain data, event outbox, commerce, entitlements, reward queue and plugin metadata registry.
- [Chaotic Gaming ATLAS Adapter](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas) — native integration boundary, C++ contracts, plugin scaffold and host-runtime experiments.
- [ATLAS Admin tools](https://github.com/Chaotic-Minds-Collective/chaotic-atlas-admin) — existing Python backend, Discord bot, frontend and backup scripts; reuse only after security and dependency review.
- [ATLAS Resource Map](https://github.com/Chaotic-Minds-Collective/ChaoticAtlasResourceMap) — existing icon/data material for GridForge; provenance and license must be checked before redistribution.

## Product modules

| Module | Repository | Domain |
|---|---|---|
| CG Connect | [chaotic-gaming-atlas-connect](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas-connect) | Cross-grid chat, announcements, MOTDs, rules, invite links and Discord relay |
| CG Commerce | [chaotic-gaming-atlas-commerce](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas-commerce) | Shop, wallet presentation, catalogue, rewards, loot boxes and game delivery |
| CG Player | [chaotic-gaming-atlas-player](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas-player) | Recovery, teleport, commands, tame tracking, progression and ship recovery |
| CG Tribes | [chaotic-gaming-atlas-tribes](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas-tribes) | Cluster-aware tribe membership, roles, ownership and activity |
| CG Sentinel | [chaotic-gaming-atlas-sentinel](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas-sentinel) | RCON, admin/mod permissions, health, crash coordination and alerts |
| CG World | [chaotic-gaming-atlas-world](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas-world) | Safe zones, collision, ownership, limits, loot and spawns |
| CG GridForge | [chaotic-gaming-atlas-gridforge](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas-gridforge) | Grid JSON authoring, visual maps and resource/creature validation |
| CG Adventures | [chaotic-gaming-atlas-adventures](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-atlas-adventures) | Quests, challenges, progression, events and rewards |

Each module repository contains its own README and `docs/IMPLEMENTATION_PLAN.md`.

## Integration rules

1. Modules call Core through authenticated APIs. No game plugin or module receives Core database credentials.
2. The ATLAS adapter is the only boundary for native game callbacks and server operations.
3. Core is authoritative for CG player identity, permissions, orders, entitlements and durable reward jobs.
4. ATLAS is authoritative for live in-game state such as current tribe membership, location, inventory and ship state until verified adapter hooks support controlled writes.
5. All events and state that cross grids retain cluster, grid and server context. Provider IDs are strings; display names are never identifiers.
6. Event consumers use idempotency keys and correlation IDs. Network failures must not block game-critical threads.
7. Feature capability checks prevent modules from calling hooks not confirmed by the installed server build.

## Current implementation facts and gaps

- Core is a TypeScript/Node.js modular monolith using PostgreSQL and REST APIs.
- Core's current normalized game-event ingestion supports `player.joined`, `player.left`, `player.chat`, `server.started`, `server.stopped` and `player.died`. Ship sinking, kills, structure destruction, tame, crafting and many other event types require explicit Core schema/API expansion.
- Core has a durable reward claim/acknowledgement workflow. It does not itself grant items in ATLAS; the adapter must perform and confirm the game-side grant.
- Core's plugin registry records metadata, versions and desired state. It does not download, install, dynamically load, sandbox or execute plugin binaries.
- The current ATLAS C++ plugin scaffold reports lifecycle and can optionally send a read-only heartbeat. It is not yet a verified game-hook implementation.
- The JavaScript host runtime manages explicitly registered in-process adapters; it is not a native ATLAS plugin loader.
- Exact ATLAS server build, plugin loader, SDK/headers, callback availability, threading model and OS/toolchain remain unverified. CI artifact compilation is not proof of successful loading in a real server.

## Recommended delivery sequence

1. Verify the ATLAS server/API/loader in an isolated test environment and extend the shared adapter contract.
2. Close Core gaps for normalized event ingestion, module configuration and reliable cross-grid identity/event correlation.
3. Implement CG Sentinel's read-only health/event foundation and CG Tribes' read-only synchronization.
4. Implement CG Connect messaging and CG GridForge's configuration validation.
5. Implement CG Commerce reward delivery, then CG Player and CG World enforcement.
6. Implement CG Adventures on top of verified event and reward contracts.
7. Run cross-module integration, security and multi-grid failure/recovery tests.

No production server changes, paid services, live payments or public binary releases are authorized by this planning document.
