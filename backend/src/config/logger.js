import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  base: { service: "user-center-backend" },
  timestamp: pino.stdTimeFunctions.isoTime
});
