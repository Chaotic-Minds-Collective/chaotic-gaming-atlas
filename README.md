# Chaotic Gaming — ATLAS Integration

ATLAS-specific adapter and server-side plugin work. Keep game implementation details isolated from the website, Core and Discord bot.

## First milestone
1. Validate the existing ATLAS Server API/plugin loader against a disposable test server.
2. Build a diagnostic plugin that reports load/version/shutdown without changing gameplay state.
3. Define authenticated adapter-to-Core contracts using the shared SDK.
4. Add player, cluster/grid, server and event features only after loader/API behavior is verified.

## Constraints
- No ATLAS DevKit or Unreal Editor dependency for the server-plugin path.
- Do not copy third-party mod source, cooked assets or licensed content.
- Never embed Core database credentials in the game plugin.
- Keep RCON private; never expose credentials to browser or Discord clients.
- Test on an isolated server before live deployment.

Scaffold only: no plugin binary, server installation or compatibility test has been performed.
