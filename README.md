# CMG ATLAS Plugin

Original, modular server-side plugins for the **Chaotic Minds Gaming (CMG)** ATLAS network.

## Shared architecture

- [Chaotic Gaming Core](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-core) owns identity, scoped permissions, platform APIs, durable events, commerce, entitlements, and reward jobs.
- This repository owns the ATLAS-native adapter boundary and verified game integration contracts.
- Product modules live in separate repositories and use authenticated Core APIs; they do not connect directly to PostgreSQL.

See the [complete Chaotic Gaming ATLAS Plugin Suite](docs/PLUGIN_SUITE.md) for module links, ownership boundaries, dependencies, known gaps, and delivery order.

## Server-independent development

The host runtime now includes a deterministic mock event contract and test stream. This allows module development and integration testing before a dedicated ATLAS server is available.

- [Mock event contract and usage](runtime/host/docs/MOCK_EVENT_CONTRACT.md)
- Run host tests from `runtime/host` with `npm test`.

The mock stream is test-only. It does not connect to a game server, issue RCON commands, grant items, or modify game state.

## Compatibility status

**Not yet validated against a live ATLAS server. **** The current C++ scaffold and CI build are not proof that a plugin loads on a live server. Exact server build, loader, SDK/headers, callback lifecycle, threading model, OS, and toolchain must be verified in an isolated test environment before native gameplay features are enabled.

## Repository rules

- Do not copy third-party source, assets, or proprietary designs.
- Each module has its own repository, manifest, tests, documentation, and version.
- No plugin receives database credentials; use authenticated, least-privilege Core APIs.
- Privileged actions fail closed when authorization cannot be verified.
- Network failures must not crash or block game-critical threads.
- Do not test on a live production server.
