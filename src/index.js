const { GameDig } = require("gamedig");
const config = require("./config");
const { createHeartbeatAgent } = require("./heartbeat");

const agent = createHeartbeatAgent({
  game: "atlas",
  adapterVersion: "0.1.0",
  config,
  queryServer: ({ host, port }) => GameDig.query({
    type: "atlas",
    host,
    port,
    maxAttempts: 2
  })
});

agent.start();
console.info("[atlas] Core heartbeat agent started.");

function shutdown(signal) {
  console.info(`[atlas] Stopping heartbeat agent (${signal}).`);
  agent.stop();
}
process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
