# Chaotic Gaming — ATLAS Plugins

Original, modular server-side plugins for the Chaotic Gaming ATLAS network.

## Shared architecture

- [Chaotic Gaming Core](https://github.com/Chaotic-Minds-Collective/chaotic-gaming-core) owns identity, scoped permissions, platform APIs, durable events, commerce, entitlements and reward jobs.
- This repository owns the ATLAS-native adapter boundary and verified game integration contracts.
- Product modules live in separate repositories and use Core APIs; they do not connect directly to PostgreSQL.

See the [complete Chaotic Gaming ATLAS Plugin Suite](docs/PLUGIN_SUITE.md) for module links, ownership boundaries, dependencies, known gaps and delivery order.

## Compatibility status

**Not yet validated.** The current C++ scaffold and CI build are not proof that a plugin loads on a live ATLAS server. Exact server build, loader, SDK/headers, callback lifecycle, threading model, OS and toolchain must be verified in an isolated test environment before native gameplay features are implemented.

## Repository rules

- Do not copy third-party source, assets or proprietary designs.
- Each module has its own repository, manifest, tests, docs and version.
- No plugin receives database credentials; use authenticated, least-privilege Core APIs.
- Privileged actions fail closed when authorization cannot be verified.
- Network failures must not crash or block game-critical threads.
- Do not test on a live production server.
