# ATLAS loader proof of concept

## Why this is gated

Atlas Server API 1.71 is documented as a C++ plugin loader with a Windows installation path under `Atlas/ShooterGame/Binaries/Win64`. Its published release is dated May 10, 2024. That does not establish compatibility with the current server build or guarantee that a third-party loader is safe for a production cluster.

## Required isolated test

1. Record the exact ATLAS dedicated-server build, OS, compiler toolset and server launch configuration.
2. Clone a disposable server instance; preserve the production server untouched.
3. Verify loader release provenance and inspect its files before installation.
4. Install only on the disposable instance, with a restorable backup.
5. Build a minimal plugin that logs load, version and unload; do not register commands or mutate game state.
6. Start, stop and restart the server repeatedly; inspect loader logs and crash dumps.
7. Confirm no unexplained crashes, memory growth or persistence changes.
8. Pin the loader and server versions in the compatibility matrix before feature work.

## Feature implementation sequence

After the loader passes: server identity and heartbeat; player connect/disconnect; character identity mapping; grid/cluster transfer events; tribe membership; controlled command bridge.

## Security

The game plugin must never contain a database credential. It should authenticate to a local/remote adapter using a dedicated rotatable service credential. The Core API validates the service principal and scopes every operation to the assigned game, cluster and server.
