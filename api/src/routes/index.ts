import type { Driver } from 'neo4j-driver';
import type express from 'express';

import { createRunsRouter } from './runs.js';
import { createTargetsRouter } from './targets.js';

export function registerRoutes(app: express.Express, driver: Driver | null): void {
  app.get('/api/v1/healthz', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.use('/api/v1/targets', createTargetsRouter(driver));
  app.use('/api/v1/runs', createRunsRouter(driver));
}

