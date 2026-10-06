import { PrismaClient } from "@prisma/client";
import { logger } from "./logger.js";

export const prisma = new PrismaClient({
  log: [
    { level: "warn", emit: "event" },
    { level: "error", emit: "event" }
  ]
});

prisma.$on("warn", (event) => {
  logger.warn(event.message);
});
prisma.$on("error", (event) => {
  logger.error(event.message);
});
