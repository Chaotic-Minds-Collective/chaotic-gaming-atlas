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
    capabilities: [],
    loader: { name: "unverified-loader", version: "unknown", verified: false },
    ...overrides
  });
}

function makeVerifiedHost(overrides = {}) {
  return makeHost({
    ...overrides,
    capabilities: overrides.capabilities ?? ["server.status.read", "server.events.read"],
    loader: { name: "verified-loader", version: "1.0.0", verified: true, ...overrides.loader }
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

test("rejects invalid host identity, duplicate capabilities, and capabilities from an unverified loader", () => {
  assert.throws(() => makeHost({ platform: "macos" }), AtlasHostRuntimeError);
  assert.throws(() => makeVerifiedHost({ capabilities: ["x", "x"] }), AtlasHostRuntimeError);
  assert.throws(() => makeHost({ loader: { name: "loader", version: "1" } }), AtlasHostRuntimeError);
  assert.throws(
    () => makeHost({ capabilities: ["server.status.read"] }),
    /Unverified ATLAS loaders cannot report/
  );
});

test("registers and starts a plugin only when required capabilities exist on a verified loader", async () => {
  const host = new AtlasPluginHost(makeVerifiedHost());
  host.register(makePlugin());
  const running = await host.start("com.chaoticgaming.atlas.health");
  assert.equal(running.status, "running");
  assert.equal((await host.health("com.chaoticgaming.atlas.health")).healthy, true);
});

test("does not start a plugin when a required capability is missing", async () => {
  const host = new AtlasPluginHost(makeVerifiedHost({ capabilities: [] }));
  host.register(makePlugin());
  await assert.rejects(
    host.start("com.chaoticgaming.atlas.health"),
    /requires unavailable capabilities/
  );
  assert.equal(host.get("com.chaoticgaming.atlas.health").status, "registered");
});

test("does not start a capability-bearing plugin when the loader is unverified", async () => {
  const host = new AtlasPluginHost(makeVerifiedHost());
  let starts = 0;
  host.register(makePlugin({ async start() { starts += 1; } }));
  await assert.rejects(
    host.start("com.chaoticgaming.atlas.health"),
    /requires unavailable capabilities/
  );
  assert.equal(starts, 0);
  assert.equal(host.get("com.chaoticgaming.atlas.health").status, "registered");
});

test("rejects duplicate plugin IDs and invalid plugin contracts", () => {
  const host = new AtlasPluginHost(makeVerifiedHost());
  host.register(makePlugin());
  assert.throws(() => host.register(makePlugin()), /already registered/);
  assert.throws(
    () => host.register(makePlugin({ stop: undefined })),
    /start and stop functions/
  );
});

test("stops a running plugin and prevents invalid lifecycle transitions", async () => {
  const host = new AtlasPluginHost(makeVerifiedHost());
  host.register(makePlugin());
  await host.start("com.chaoticgaming.atlas.health");
  assert.equal((await host.stop("com.chaoticgaming.atlas.health")).status, "stopped");
  await assert.rejects(host.stop("com.chaoticgaming.atlas.health"), /Cannot stop plugin/);
});

test("retries cleanup after a stop hook fails", async () => {
  const host = new AtlasPluginHost(makeVerifiedHost());
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
  const host = new AtlasPluginHost(makeVerifiedHost());
  host.register(makePlugin({
    async start() { throw new Error("startup exploded"); }
  }));
  await assert.rejects(host.start("com.chaoticgaming.atlas.health"), /failed to start/);
  assert.equal(host.get("com.chaoticgaming.atlas.health").status, "failed");

  const second = new AtlasPluginHost(makeVerifiedHost());
  second.register(makePlugin({
    async health() { throw new Error("health unavailable"); }
  }));
  await second.start("com.chaoticgaming.atlas.health");
  const result = await second.health("com.chaoticgaming.atlas.health");
  assert.equal(result.status, "degraded");
  assert.equal(result.healthy, false);
});

test("does not dynamically discover or execute plugin code", () => {
  const host = new AtlasPluginHost(makeVerifiedHost());
  assert.equal(typeof host.register, "function");
  assert.equal(host.load, undefined);
  assert.equal(host.discover, undefined);
});

test("constructor validates and snapshots mutable host metadata", async () => {
  assert.throws(() => new AtlasPluginHost({ game: "atlas" }), AtlasHostRuntimeError);
  assert.throws(() => new AtlasPluginHost({ ...makeHost(), game: "other" }), AtlasHostRuntimeError);
  assert.throws(
    () => new AtlasPluginHost({ ...makeHost(), capabilities: ["x", "x"] }),
    AtlasHostRuntimeError
  );
  const input = {
    ...makeHost(),
    capabilities: [],
    loader: { ...makeHost().loader }
  };
  const host = new AtlasPluginHost(input);
  input.capabilities.length = 0;
  input.loader.verified = true;
  input.serverBuild = "changed";
  host.register(makePlugin({
    manifest: {
      id: "com.chaoticgaming.atlas.health",
      version: "0.1.0",
      requiredCapabilities: []
    },
    async start(context) {
      assert.equal(context.host.serverBuild, "unverified-target-build");
      assert.equal(context.host.loader.verified, false);
      assert.equal(context.hasCapability("server.status.read"), false);
      assert.throws(() => context.host.capabilities.push("extra"), TypeError);
      assert.throws(() => { context.host.loader.verified = true; }, TypeError);
    }
  }));
  await host.start("com.chaoticgaming.atlas.health");
});

for (const rejects of [false, true]) {
  for (const state of ["stopping", "stopped", "stop_failed", "restarted"]) {
    test(`pending health ${rejects ? "failure" : "success"} is discarded after ${state}`, async () => {
      let settleHealth;
      let finishStop;
      const host = new AtlasPluginHost(makeVerifiedHost());
      host.register(makePlugin({
        health: () => new Promise((resolve, reject) => {
          settleHealth = () => rejects ? reject(new Error("stale failure")) : resolve("stale details");
        }),
        stop: () => state === "stopping"
          ? new Promise((resolve) => { finishStop = resolve; })
          : state === "stop_failed" ? Promise.reject(new Error("cleanup failed")) : undefined
      }));
      const id = "com.chaoticgaming.atlas.health";
      await host.start(id);
      const pending = host.health(id);
      const stopping = host.stop(id);
      if (state === "stop_failed") {
        await assert.rejects(stopping, /failed to stop/);
      } else if (state !== "stopping") {
        await stopping;
      }
      if (state === "restarted") await host.start(id);
      settleHealth();
      assert.deepEqual(await pending, {
        pluginId: id,
        status: state === "restarted" ? "running" : state,
        healthy: false,
        details: null
      });
      if (finishStop) {
        finishStop();
        await stopping;
      }
    });
  }
}
