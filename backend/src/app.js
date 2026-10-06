import express from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { logger } from "./config/logger.js";
import { env } from "./config/env.js";
import authRoutes from "./routes/auth.js";
import accountRoutes from "./routes/account.js";
import projectRoutes from "./routes/projects.js";
import templateRoutes from "./routes/templates.js";
import exportRoutes from "./routes/exports.js";
import { notFound, errorHandler } from "./middleware/error.js";

export function createApp() {
  const app = express();

  app.use(
    cors({
      origin: env.frontendOrigin === "*" ? true : env.frontendOrigin.split(","),
      credentials: true
    })
  );
  app.use(express.json({ limit: "1mb" }));
  app.use(pinoHttp({ logger }));

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", service: "user-center", time: new Date().toISOString() });
  });

  app.use("/api/auth", authRoutes);
  app.use("/api/account", accountRoutes);
  app.use("/api/projects", projectRoutes);
  app.use("/api/templates", templateRoutes);
  app.use("/api/exports", exportRoutes);

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
