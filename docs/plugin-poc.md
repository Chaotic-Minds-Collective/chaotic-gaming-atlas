# Minimal Plugin Proof of Concept

The first plugin milestone is deliberately narrow:
- Initialize without modifying game state.
- Log plugin name, plugin version, server build and API version.
- Handle clean shutdown.
- Report initialization metadata without crashing the server.

The plugin reads optional diagnostic values from its process environment:
- `ATLAS_SERVER_BUILD`
- `ATLAS_SERVER_API_VERSION`

If either value is absent, the log records `unreported`. The build embeds the candidate API version (1.71) as compile-time metadata. This is not proof that the runtime ABI has been validated.

Acceptance criteria:
1. Builds reproducibly from documented source.
2. Loads on a disposable ATLAS test server.
3. Emits startup and shutdown logs with the metadata above.
4. Does not require DevKit assets.
5. Does not connect to production Core or production servers.

Do not begin gameplay features until this proof of concept passes.
