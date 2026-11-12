const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)+$/;
const PLUGIN_VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export class AtlasHostRuntimeError extends Error {
  constructor(message, options) {
    super(message, options);
    this.name = "AtlasHostRuntimeError";
  }
}

function requireString(value, field) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AtlasHostRuntimeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function uniqueStrings(value, field) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim() === "")) {
    throw new AtlasHostRuntimeError(`${field} must be an array of non-empty strings`);
  }
  const normalized = value.map((item) => item.trim());
  if (new Set(normalized).size !== normalized.length) {
    throw new AtlasHostRuntimeError(`${field} must not contain duplicates`);
  }
  return Object.freeze(normalized);
}

/**
 * Capture facts reported by a separately verified ATLAS adapter.
 * This object does not discover, load, or invoke the game's native plugin loader.
 */
export function createAtlasHostContext(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AtlasHostRuntimeError("Host context must be an object");
  }

  const platform = requireString(input.platform, "platform");
  if (!["win32", "linux"].includes(platform)) {
    throw new AtlasHostRuntimeError("platform must be win32 or linux");
  }

  if (!input.loader || typeof input.loader !== "object" || Array.isArray(input.loader)) {
    throw new AtlasHostRuntimeError("loader must be an object");
  }
  if (typeof input.loader.verified !== "boolean") {
    throw new AtlasHostRuntimeError("loader.verified must be a boolean");
  }

  return Object.freeze({
    game: "atlas",
    serverBuild: requireString(input.serverBuild, "serverBuild"),
    platform,
    runtimeVersion: requireString(input.runtimeVersion, "runtimeVersion"),
    capabilities: uniqueStrings(input.capabilities, "capabilities"),
    loader: Object.freeze({
      name: requireString(input.loader.name, "loader.name"),
      version: requireString(input.loader.version, "loader.version"),
      verified: input.loader.verified
    })
  });
}

function validatePlugin(plugin) {
  if (!plugin || typeof plugin !== "object" || Array.isArray(plugin)) {
    throw new AtlasHostRuntimeError("Plugin must be an object");
  }
  const manifest = plugin.manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new AtlasHostRuntimeError("Plugin manifest must be an object");
  }

  const id = requireString(manifest.id, "manifest.id");
  if (!PLUGIN_ID_PATTERN.test(id)) {
    throw new AtlasHostRuntimeError("manifest.id must be a stable reverse-domain identifier");
  }
  const version = requireString(manifest.version, "manifest.version");
  if (version.length > 128 || !PLUGIN_VERSION_PATTERN.test(version)) {
    throw new AtlasHostRuntimeError("manifest.version must be a valid SemVer string of at most 128 characters");
  }
  const requiredCapabilities = uniqueStrings(
    manifest.requiredCapabilities ?? [],
    "manifest.requiredCapabilities"
  );

  if (typeof plugin.start !== "function" || typeof plugin.stop !== "function") {
    throw new AtlasHostRuntimeError("Plugin must provide start and stop functions");
  }
  if (plugin.health !== undefined && typeof plugin.health !== "function") {
    throw new AtlasHostRuntimeError("Plugin health must be a function when provided");
  }

  return Object.freeze({ id, version, requiredCapabilities });
}

/**
 * Manages explicitly registered, trusted in-process adapters.
 * It intentionally has no filesystem discovery, dynamic import, eval, or network access.
 */
export class AtlasPluginHost {
  constructor(hostContext) {
    if (!hostContext || hostContext.game !== "atlas") {
      throw new AtlasHostRuntimeError("A valid ATLAS host context is required");
    }
    this.host = hostContext;
    this.plugins = new Map();
  }

  register(plugin) {
    const manifest = validatePlugin(plugin);
    if (this.plugins.has(manifest.id)) {
      throw new AtlasHostRuntimeError(`Plugin is already registered: ${manifest.id}`);
    }

    const record = { plugin, manifest, status: "registered", lastError: null };
    this.plugins.set(manifest.id, record);
    return this.#snapshot(record);
  }

  async start(pluginId) {
    const record = this.#get(pluginId);
    if (!["registered", "stopped"].includes(record.status)) {
      throw new AtlasHostRuntimeError(`Cannot start plugin from state: ${record.status}`);
    }

    const available = new Set(this.host.capabilities);
    const missing = record.manifest.requiredCapabilities.filter((capability) => !available.has(capability));
    if (missing.length > 0) {
      throw new AtlasHostRuntimeError(
        `Plugin ${pluginId} requires unavailable capabilities: ${missing.join(", ")}`
      );
    }

    record.status = "starting";
    record.lastError = null;
    try {
      const context = Object.freeze({
        host: this.host,
        pluginId,
        hasCapability: (capability) => available.has(capability)
      });
      await record.plugin.start(context);
      record.status = "running";
      return this.#snapshot(record);
    } catch (error) {
      record.status = "failed";
      record.lastError = error instanceof Error ? error.message : "Plugin start failed";
      throw new AtlasHostRuntimeError(`Plugin failed to start: ${pluginId}`, { cause: error });
    }
  }

  async stop(pluginId) {
    const record = this.#get(pluginId);
    if (record.status !== "running") {
      throw new AtlasHostRuntimeError(`Cannot stop plugin from state: ${record.status}`);
    }

    record.status = "stopping";
    try {
      await record.plugin.stop();
      record.status = "stopped";
      record.lastError = null;
      return this.#snapshot(record);
    } catch (error) {
      record.status = "failed";
      record.lastError = error instanceof Error ? error.message : "Plugin stop failed";
      throw new AtlasHostRuntimeError(`Plugin failed to stop: ${pluginId}`, { cause: error });
    }
  }

  async health(pluginId) {
    const record = this.#get(pluginId);
    if (record.status !== "running") {
      return Object.freeze({ pluginId, status: record.status, healthy: false, details: null });
    }
    if (!record.plugin.health) {
      return Object.freeze({ pluginId, status: "running", healthy: true, details: null });
    }

    try {
      const details = await record.plugin.health();
      return Object.freeze({ pluginId, status: "running", healthy: true, details: details ?? null });
    } catch (error) {
      return Object.freeze({
        pluginId,
        status: "degraded",
        healthy: false,
        details: error instanceof Error ? error.message : "Health check failed"
      });
    }
  }

  get(pluginId) {
    return this.#snapshot(this.#get(pluginId));
  }

  list() {
    return Object.freeze([...this.plugins.values()].map((record) => this.#snapshot(record)));
  }

  #get(pluginId) {
    const record = this.plugins.get(pluginId);
    if (!record) {
      throw new AtlasHostRuntimeError(`Unknown plugin: ${pluginId}`);
    }
    return record;
  }

  #snapshot(record) {
    return Object.freeze({
      id: record.manifest.id,
      version: record.manifest.version,
      requiredCapabilities: record.manifest.requiredCapabilities,
      status: record.status,
      lastError: record.lastError
    });
  }
}
