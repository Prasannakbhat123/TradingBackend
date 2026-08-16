import express from 'express';
import cors from 'cors';
import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { connectDb } from './db/connect.js';
import { env } from './config/env.js';
import { errorHandler } from './middleware/error.js';
import { authRouter } from './routes/auth.js';
import { inventoryRouter } from './routes/inventory.js';
import { rfqRouter } from './routes/rfq.js';
import { ordersRouter } from './routes/orders.js';
import {
  executionsRouter,
  portfolioRouter,
  settlementRouter,
} from './routes/portfolio.js';
import {
  marketDataRouter,
  auditRouter,
  hedgingRouter,
  dealerRouter,
} from './routes/marketData.js';
import { pipelineRouter } from './routes/pipeline.js';
import { startFeedScheduler } from './services/feeds/runner.js';

async function main() {
  await connectDb();

  const app = express();
  const corsOrigin =
    env.frontendOrigins.length > 0
      ? env.frontendOrigins
      : true;
  app.use(cors({ origin: corsOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));

  app.get('/health', (_req, res) => res.json({ ok: true, service: 'lattice' }));

  app.use('/v1/auth', authRouter);
  app.use('/v1/inventory', inventoryRouter);
  app.use('/v1/rfq', rfqRouter);
  app.use('/v1/orders', ordersRouter);
  app.use('/v1/executions', executionsRouter);
  app.use('/v1/portfolio', portfolioRouter);
  app.use('/v1/settlement', settlementRouter);
  app.use('/v1/market-data', marketDataRouter);
  app.use('/v1/pipeline', pipelineRouter);
  app.use('/v1/audit', auditRouter);
  app.use('/v1/hedging', hedgingRouter);
  app.use('/v1/dealer', dealerRouter);

  app.use(errorHandler);

  const server = http.createServer(app);
  const io = new Server(server, { cors: { origin: corsOrigin } });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(new Error('unauthorized'));
    try {
      jwt.verify(String(token), env.jwtSecret);
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.emit('hello', { message: 'connected to lattice stream' });
  });

  // expose broadcaster for future OMS events
  (globalThis as unknown as { latticeIo?: Server }).latticeIo = io;

  startFeedScheduler();

  server.listen(env.port, '0.0.0.0', () => {
    console.log(`[lattice] API listening on port ${env.port}`);
  });
}

main().catch((err) => {
  console.error('Fatal', err);
  process.exit(1);
});
