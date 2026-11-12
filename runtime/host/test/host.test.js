import test from "node:test";
import assert from "node:assert/strict";
import {
  AtlasHostRuntimeError,
  AtlasPluginHost,
  createAtlasHostContext
} from "../src/host.js";

function makeHost(overrides = {}) {
  return createAtlasHostContext({
    serverBuild: "unverified-target-build",
    platform: "win32",
    runtimeVersion: "0.1.0",
    capabilities: ["server.status.read", "server.events.read"],
    loader: { name: "unverified-loader", version: "unknown", verified: false },
    ...overrides
  });
}

function makePlugin(overrides = {}) {
  return {
    manifest: {
      id: "com.chaoticgaming.atlas.health",
      version: "0.1.0",
      requiredCapabilities: ["server.status.read"]
    },
    async start() {},
    async stop() {},
    ...overrides
  };
}

test("creates an immutable ATLAS host context without assuming loader compatibility", () => {
  const host = makeHost();
  assert.equal(host.game, "atlas");
  assert.equal(host.loader.verified, false);
  assert.equal(Object.isFrozen(host), true);
  assert.equal(Object.isFrozen(host.capabilities), true);
});

test("rejects invalid host identity and duplicate capabilities", () => {
  assert.throws(() => makeHost({ platform: "macos" }), AtlasHostRuntimeError);
  assert.throws(() => makeHost({ capabilities: ["x", "x"] }), AtlasHostRuntimeError);
  assert.throws(() => makeHost({ loader: { name: "loader", version: "1" } }), AtlasHostRuntimeError);
});

test("registers and starts a plugin only when required capabilities exist", async () => {
  const host = new AtlasPluginHost(makeHost());
  host.register(makePlugin());
  const running = await host.start("com.chaoticgaming.atlas.health");
  assert.equal(running.status, "running");
  assert.equal((await host.health("com.chaoticgaming.atlas.health")).healthy, true);
});

test("does not start a plugin when a required capability is missing", async () => {
  const host = new AtlasPluginHost(makeHost({ capabilities: [] }));
  host.register(makePlugin());
  await assert.rejects(
    host.start("com.chaoticgaming.atlas.health"),
    /requires unavailable capabilities/
  );
  assert.equal(host.get("com.chaoticgaming.atlas.health").status, "registered");
});

test("rejects duplicate plugin IDs and invalid plugin contracts", () => {
  const host = new AtlasPluginHost(makeHost());
  host.register(makePlugin());
  assert.throws(() => host.register(makePlugin()), /already registered/);
  assert.throws(
    () => host.register(makePlugin({ stop: undefined })),
    /start and stop functions/
  );
});

test("stops a running plugin and prevents invalid lifecycle transitions", async () => {
  const host = new AtlasPluginHost(makeHost());
  host.register(makePlugin());
  await host.start("com.chaoticgaming.atlas.health");
  assert.equal((await host.stop("com.chaoticgaming.atlas.health")).status, "stopped");
  await assert.rejects(host.stop("com.chaoticgaming.atlas.health"), /Cannot stop plugin/);
});

test("retries cleanup after a stop hook fails", async () => {
  const host = new AtlasPluginHost(makeHost());
  let stopAttempts = 0;
  host.register(makePlugin({
    async stop() {
      stopAttempts += 1;
      if (stopAttempts === 1) throw new Error("temporary cleanup failure");
    }
  }));

  await host.start("com.chaoticgaming.atlas.health");
  await assert.rejects(host.stop("com.chaoticgaming.atlas.health"), /failed to stop/);
  assert.equal(host.get("com.chaoticgaming.atlas.health").status, "stop_failed");
  assert.equal(stopAttempts, 1);

  const stopped = await host.stop("com.chaoticgaming.atlas.health");
  assert.equal(stopped.status, "stopped");
  assert.equal(stopAttempts, 2);
});

test("records startup failures and exposes degraded health checks", async () => {
  const host = new AtlasPluginHost(makeHost());
  host.register(makePlugin({
    async start() { throw new Error("startup exploded"); }
  }));
  await assert.rejects(host.start("com.chaoticgaming.atlas.health"), /failed to start/);
  assert.equal(host.get("com.chaoticgaming.atlas.health").status, "failed");

  const second = new AtlasPluginHost(makeHost());
  second.register(makePlugin({
    async health() { throw new Error("health unavailable"); }
  }));
  await second.start("com.chaoticgaming.atlas.health");
  const result = await second.health("com.chaoticgaming.atlas.health");
  assert.equal(result.status, "degraded");
  assert.equal(result.healthy, false);
});

test("does not dynamically discover or execute plugin code", () => {
  const host = new AtlasPluginHost(makeHost());
  assert.equal(typeof host.register, "function");
  assert.equal(host.load, undefined);
  assert.equal(host.discover, undefined);
});
