# ATLAS Host Runtime Foundation

This package is the first host-neutral lifecycle layer for Chaotic Gaming's original ATLAS integrations.

## What it provides

- A validated, immutable host context populated by an explicitly supplied adapter.
- Explicit registration of trusted in-process plugin objects.
- Capability checks before plugin startup.
- Controlled start/stop lifecycle transitions.
- Health reporting and failure-state visibility.
- A dependency-free Node.js implementation with built-in tests.

## What it deliberately does not do

- It does not load Workshop packages or reuse third-party code/assets.
- It does not scan directories, dynamically import plugins, evaluate code, or execute downloaded artifacts.
- It does not call undocumented ATLAS server APIs.
- It does not claim compatibility with Atlas Server API 1.71 or any particular server build.
- It does not install, update, or modify a game server.

The `loader.verified` field is supplied by the adapter and remains `false` until the exact target server build, loader binary, SDK/headers, toolchain, lifecycle hooks, and operating system have been independently verified.

## Host context

The adapter supplies:

- `serverBuild`: exact build identifier observed from the target server.
- `platform`: `win32` or `linux`.
- `runtimeVersion`: this host runtime's version.
- `capabilities`: explicit capabilities the adapter can safely provide.
- `loader`: loader name/version and a verification flag.

No capability is assumed. Plugins declare their required capabilities and cannot start when the host does not provide them.

## Plugin contract

A trusted plugin object provides:

- `manifest.id`: stable reverse-domain identifier.
- `manifest.version`: semantic version.
- `manifest.requiredCapabilities`: capability names required at startup.
- `start(context)`: asynchronous startup hook.
- `stop()`: asynchronous shutdown hook.
- `health()`: optional asynchronous health check.

The host passes a frozen context with host metadata, the plugin ID, and a capability query function. It does not expose filesystem, database, or network credentials.

## Lifecycle

`registered -> starting -> running -> stopping -> stopped`

Startup or shutdown exceptions move the plugin to `failed`. A missing capability blocks startup without changing the registered state. Health-check exceptions are reported as degraded health and do not crash the host.

## Development

Requires Node.js 20.9 or newer.

```sh
npm run check
npm test
```

## Compatibility gate before native integration

Before connecting this package to an actual ATLAS server, record and verify the exact server build, loader version and binary hash, available SDK/headers, compiler/toolchain, host OS, and supported lifecycle/API hooks in an isolated non-production environment. Native integration is a separate adapter implementation and must not be inferred from this package.
