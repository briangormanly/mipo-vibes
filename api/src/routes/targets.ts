import express from 'express';
import type { Driver } from 'neo4j-driver';

import { TargetService } from '../services/targetService.js';

export function createTargetsRouter(driver: Driver | null): express.Router {
  const router = express.Router();
  const targetService = new TargetService(driver);

  router.get('/sets', async (_req, res) => {
    const sets = await targetService.listTargetSets();
    res.json(sets);
  });

  router.get('/sets/:id', async (req, res) => {
    const targetSet = await targetService.getTargetSet(req.params.id);
    if (!targetSet) {
      res.status(404).json({ message: 'Target set not found' });
      return;
    }
    res.json(targetSet);
  });

  return router;
}

