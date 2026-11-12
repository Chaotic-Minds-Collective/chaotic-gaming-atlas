# Chaotic Gaming — ATLAS Integration

ATLAS-specific server integration and original Chaotic Gaming server-side features.

## Integration strategy

The initial design separates game-independent contracts from the loader-specific plugin entry point. This repository currently contains the portable C++ domain contracts and a compile check; it does **not** yet contain a loadable ATLAS plugin.

The known Atlas Server API release is 1.71 (May 2024), described as a C++ server-side plugin loader. Its current compatibility with the target ATLAS dedicated-server build has not been proven. Do not install it on a live server or treat it as a stable dependency until an isolated proof of concept passes.

## Current status

- [x] Portable C++17 integration contracts
- [x] CMake compile check and CI
- [ ] Confirm exact ATLAS server build and platform
- [ ] Validate Atlas Server API 1.71 on an isolated server
- [ ] Build minimal load/unload plugin proof of concept
- [ ] Implement authenticated Core event transport
- [ ] Implement game-specific player, grid, tribe and transfer events
- [ ] Validate RCON/administration command behavior separately

## Build contracts

```sh
cmake -S . -B build
cmake --build build --config Release
ctest --test-dir build --output-on-failure
```

The contract library has no game SDK or loader dependency and does not modify game files.
