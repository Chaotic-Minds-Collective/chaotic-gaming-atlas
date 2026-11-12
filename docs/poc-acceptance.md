# ATLAS Plugin Lifecycle and Core Heartbeat Proof of Concept

## Scope

The native DLL:
- Exports the existing `Plugin_Init` and `Plugin_Unload` lifecycle symbols.
- Logs plugin version, candidate API version and optional server build/runtime API metadata.
- Optionally sends a server-scoped heartbeat to the Chaotic Gaming Core over WinHTTP.
- Stops and joins its heartbeat worker during plugin unload.

It does **not** call ATLAS gameplay APIs, register console commands, access player data, report player counts, deliver items or modify game state.

## Core heartbeat configuration

Set these environment variables for the dedicated server process:
- `CHAOTIC_CORE_API_URL` — Core API origin (HTTPS in production; no path or query string).
- `CHAOTIC_CORE_SERVICE_TOKEN` — server-scoped `cg_srv_` credential with only `servers.heartbeat`.
- `CHAOTIC_CORE_SERVER_ID` — UUID of the registered ATLAS server.
- `ATLAS_SERVER_BUILD` — exact server build string; defaults to `unknown` if omitted.
- `ATLAS_SERVER_API_VERSION` — optional runtime diagnostic value.
- `HEARTBEAT_INTERVAL_SECONDS` — optional interval from 30 to 300 seconds; defaults to 60.

The service token is never logged. If the Core URL, token or server ID is missing, the plugin remains in lifecycle-only mode. A failed heartbeat is retried on the next interval; the plugin does not write an immediate false-offline status.

## Two manifests

- `PluginInfo.json` is the loader-facing manifest for the candidate AtlasApi plugin loader.
- `manifest.json` is the Chaotic Gaming Core plugin-registry manifest.

They serve different systems and must not be substituted for one another. The Core manifest describes declared capability/permission metadata; the Core registry does not install or execute this DLL.

## Compatibility boundary

The ATLAS Server API 1.71 resource describes a C++ server-side plugin loader and documents the Windows server installation location. The underlying ARK Server API plugin manager source shows the common `Plugin_Init` / `Plugin_Unload` export convention. This is a strong implementation lead, not proof that the ATLAS 1.71 binary uses an identical ABI.

Before enabling this on a live server, validate against the exact ATLAS dedicated-server build and installed AtlasApi 1.71 binary in an isolated test environment:
1. Confirm the loader reads the supplied `PluginInfo.json` keys and version.
2. Confirm the loader accepts the exported calling convention and resolves both symbols.
3. Confirm the DLL loads and unloads without a crash.
4. Confirm lifecycle logs and a heartbeat accepted by a non-production Core instance.
5. Confirm server shutdown/restart leaves no worker threads or handles behind.

## Build

On Windows with Visual Studio 2022 and CMake 3.24+:

```powershell
cmake --preset windows-x64-release
cmake --build --preset windows-x64-release
```

Output: `build/windows-x64-release/plugins/ChaoticGamingCore/ChaoticGamingCore.dll`.

Do not install on a production server. Use a disposable copy of the exact server build.
