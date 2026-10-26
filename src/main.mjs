import http from "node:http";
import { loadConfig, publicConfigSummary } from "./config.mjs";
import { createLogger } from "./logger.mjs";
import { StateStore } from "./state-store.mjs";
import { CodexRunner } from "./codex-runner.mjs";
import { WeComClient } from "./wecom-client.mjs";
import { TaskService } from "./task-service.mjs";

const logger = createLogger();
let stopping = false;

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function startHealthServer(config, client, service) {
  const startedAt = Date.now();
  const server = http.createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/health") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ ok: false }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ok: true,
        authenticated: client.authenticated,
        queue: service.queue.length,
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
      }),
    );
  });
  server.listen(config.health.port, config.health.host);
  return server;
}

async function main() {
  const config = loadConfig();
  logger.info(`Configuration loaded: ${JSON.stringify(publicConfigSummary(config))}`);

  const stateStore = new StateStore(config.stateDir);
  const runner = new CodexRunner({ config, logger });
  const client = new WeComClient({
    botId: config.wecom.botId,
    secret: config.wecom.secret,
    wsUrl: config.wecom.wsUrl,
    ackTimeoutMs: config.wecom.ackTimeoutMs,
    logger,
  });
  const service = new TaskService({ config, client, runner, stateStore, logger });
  service.initialize();
  client.on("frame", (frame) => {
    service.handleFrame(frame).catch((error) => logger.error("Frame handler failed", error));
  });
  client.on("disconnect", () => logger.info("WeCom connection closed"));

  const healthServer = startHealthServer(config, client, service);
  logger.info(`Health endpoint: http://${config.health.host}:${config.health.port}/health`);

  const shutdown = () => {
    if (stopping) return;
    stopping = true;
    logger.info("Shutting down");
    runner.stop();
    client.close();
    healthServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  let attempt = 0;
  while (!stopping) {
    try {
      await client.connect();
      attempt = 0;
      logger.info("Authenticated with WeCom");
      await client.waitForClose();
    } catch (error) {
      logger.error("WeCom connection failed", error);
    }
    if (stopping) break;
    attempt += 1;
    const wait = Math.min(30000, 1000 * 2 ** Math.min(attempt, 5));
    logger.info(`Reconnecting in ${wait}ms`);
    await delay(wait);
  }
}

main().catch((error) => {
  logger.error("Fatal startup error", error);
  process.exit(1);
});
