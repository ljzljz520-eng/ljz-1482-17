import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { pinoHttp } from 'pino-http';
import { logger } from './logger.js';
import authRoutes from './routes/auth.js';
import tenantRoutes from './routes/tenants.js';
import projectRoutes from './routes/projects.js';
import templateRoutes from './routes/templates.js';
import exportRoutes from './routes/exports.js';
import { errorHandler } from './utils/http.js';
import { reapExpiredLeases } from './services/taskService.js';

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(pinoHttp({ logger }));

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'user-center' }));
app.use('/api/auth', authRoutes);
app.use('/api/tenants', tenantRoutes);
app.use('/api/projects', projectRoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/exports', exportRoutes);

app.use(errorHandler);

const port = Number(process.env.PORT ?? 8080);
const server = app.listen(port, () => {
  logger.info(`User Center API listening on :${port}`);
});

const reaper = setInterval(() => {
  reapExpiredLeases()
    .then((count) => { if (count > 0) logger.warn({ released: count }, 'expired worker leases released'); })
    .catch((error) => logger.error({ err: error }, 'lease reaper failed'));
}, 15_000);

const shutdown = (signal: string) => {
  logger.info({ signal }, 'shutting down');
  clearInterval(reaper);
  server.close(() => process.exit(0));
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
