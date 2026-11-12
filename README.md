# Chaotic Gaming — ATLAS Adapter

ATLAS integration workspace. Initial target is server-side integration through a verified ATLAS Server API/plugin environment. No DevKit dependency is assumed.

## Safety and compatibility
- Do not install or load experimental plugins on production servers.
- Validate the exact ATLAS server build and Server API version in an isolated test environment.
- Third-party Workshop assets and code must be reviewed for license and compatibility; implement independent replacements rather than copying protected source/assets.
- RCON credentials must remain server-side and must never be committed.

## Milestones
1. Document supported server/API versions and reproducible build environment.
2. Prove a minimal plugin can load, report version, and shut down cleanly on an isolated server.
3. Add authenticated Core adapter communication.
4. Add player/session, grid, character and transfer events only after validating available server hooks.

## Status
Scaffold only. No plugin binary, server installation, or compatibility test has been performed.
