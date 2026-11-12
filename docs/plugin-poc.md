# Minimal Plugin Proof of Concept

The first plugin milestone is deliberately narrow:
- Initialize without modifying game state.
- Log plugin name, plugin version, server build and API version.
- Handle clean shutdown.
- Report initialization errors without crashing the server.

Acceptance criteria:
1. Builds reproducibly from documented source.
2. Loads on a disposable ATLAS test server.
3. Emits startup and shutdown logs.
4. Does not require DevKit assets.
5. Does not connect to production Core or production servers.

Do not begin gameplay features until this proof of concept passes.
