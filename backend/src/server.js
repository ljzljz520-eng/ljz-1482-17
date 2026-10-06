import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./config/logger.js";
import { prisma } from "./config/prisma.js";
import { startWorker } from "./workers/exportWorker.js";

async function main() {
  await prisma.$connect();
  const app = createApp();
  startWorker();

  const server = app.listen(env.port, () => {
    logger.info({ port: env.port, env: env.nodeEnv }, "User Center API listening");
  });

  const shutdown = async (signal) => {
    logger.info({ signal }, "Shutdown signal received");
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal startup error");
  process.exit(1);
});
