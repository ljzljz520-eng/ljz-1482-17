import dotenv from "dotenv";

dotenv.config();

const required = ["DATABASE_URL"];
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

export const env = {
  port: Number(process.env.PORT || 4000),
  nodeEnv: process.env.NODE_ENV || "development",
  databaseUrl: process.env.DATABASE_URL,
  jwtSecret: process.env.JWT_SECRET || "user-center-development-secret-change-me",
  frontendOrigin: process.env.FRONTEND_ORIGIN || "*",
  heartbeatTimeoutMs: Number(process.env.WORKER_HEARTBEAT_TIMEOUT_MS || 7000)
};
