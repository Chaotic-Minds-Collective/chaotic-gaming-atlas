# ATLAS Plugin Lifecycle Proof of Concept

## Scope

The first native DLL intentionally does only two things:
- Export `Plugin_Init`.
- Export `Plugin_Unload`.

It writes lifecycle messages to the Windows debugger output. It does not call game APIs, register console commands, access player data, open sockets, or modify server state.

## Two manifests

- `PluginInfo.json` is the loader-facing manifest for the candidate AtlasApi plugin loader.
- `manifest.json` is the Chaotic Gaming Core plugin-registry manifest.

They serve different systems and must not be substituted for one another. The Core manifest is valid against the existing registry contract; its compatibility fields are metadata, not proof of a tested build.

## Evidence and compatibility boundary

The ATLAS Server API 1.71 resource describes a C++ server-side plugin loader and documents the Windows server installation location. The underlying ARK Server API plugin manager source shows the common `Plugin_Init` / `Plugin_Unload` export convention. This is a strong implementation lead, not proof that the ATLAS 1.71 binary uses an identical ABI.

Before any gameplay feature is added, validate against the exact ATLAS dedicated-server build and installed AtlasApi 1.71 binary in an isolated test environment. Confirm:
1. The loader reads the supplied `PluginInfo.json` keys and version value.
2. The loader accepts the exported calling convention and resolves both symbols.
3. The DLL loads and unloads without a crash.
4. Lifecycle messages are visible in the expected diagnostic channel.
5. Server shutdown/restart leaves no worker threads or resources behind.

## Build

On Windows with Visual Studio 2022 and CMake 3.24+:

```powershell
cmake --preset windows-x64-release
cmake --build --preset windows-x64-release
```

Output: `build/windows-x64-release/plugins/ChaoticGamingCore/ChaoticGamingCore.dll`.

## Installation test

Do not install on a production server. Use a disposable copy of the exact server build. The documented AtlasApi plugin directory is under `Atlas/ShooterGame/Binaries/Win64/AtlasApi/Plugins`; the exact per-plugin folder layout must be confirmed with the loader before copying the DLL.

## Exit criteria

The POC passes only after a real ATLAS server loads and unloads the DLL cleanly. A Windows CI compile is necessary but not sufficient.
