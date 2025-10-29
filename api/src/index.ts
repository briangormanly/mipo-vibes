import 'express-async-errors';
import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';

import { createNeo4jDriver } from './neo4j.js';
import { registerRoutes } from './routes/index.js';
import { logger } from './utils/logger.js';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json({ limit: '5mb' }));

const port = process.env.PORT ?? '4000';

async function bootstrap(): Promise<void> {
  const driver = await createNeo4jDriver();
  if (driver) {
    await driver.verifyConnectivity();
    registerRoutes(app, driver);
  } else {
    registerRoutes(app, null);
  }

  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    logger.error({ err }, 'Unhandled error');
    res.status(500).json({ message: 'Internal server error' });
  });

  app.listen(port, () => {
    logger.info(`API listening on port ${port}`);
  });
}

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to bootstrap API');
  process.exit(1);
});

