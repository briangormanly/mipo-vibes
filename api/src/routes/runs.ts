import express from 'express';
import type { Driver } from 'neo4j-driver';
import { z } from 'zod';
import { stringify } from 'csv-stringify/sync';

import { RunService } from '../services/runService.js';

const createRunSchema = z.object({
  targetSetId: z.string().min(1),
  variables: z.array(z.string().min(1)).min(1),
  partyVariable: z.string().min(1),
  partyTargets: z.record(z.number().min(0)),
  refusals: z.record(z.number().min(0).max(1)).default({}),
  caps: z.object({ min: z.number().positive(), max: z.number().positive() })
});

const sampleCountsSchema = z.object({
  counts: z
    .array(
      z.object({
        variable: z.string().min(1),
        category: z.string().min(1),
        n: z.number().nonnegative()
      })
    )
    .min(1)
});

export function createRunsRouter(driver: Driver | null): express.Router {
  const router = express.Router();
  const runService = new RunService(driver);

  router.post('/', async (req, res) => {
    const parseResult = createRunSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ message: 'Invalid payload', issues: parseResult.error.issues });
      return;
    }
    const run = await runService.createRun(parseResult.data);
    res.status(201).json({ runId: run.id });
  });

  router.post('/:runId/sample-counts', (req, res) => {
    const parseResult = sampleCountsSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({ message: 'Invalid payload', issues: parseResult.error.issues });
      return;
    }
    try {
      runService.addSampleCounts(req.params.runId, parseResult.data.counts);
      res.status(204).send();
    } catch (error) {
      res.status(404).json({ message: (error as Error).message });
    }
  });

  router.post('/:runId/compute', async (req, res) => {
    try {
      const result = await runService.compute(req.params.runId);
      res.json(result);
    } catch (error) {
      res.status(404).json({ message: (error as Error).message });
    }
  });

  router.get('/:runId/export/category-weights.csv', (req, res) => {
    const result = runService.getLastResult(req.params.runId);
    if (!result) {
      res.status(404).json({ message: 'Run results not found. Compute the run first.' });
      return;
    }

    const csv = stringify(
      result.categoryTable.map((row) => ({
        variable: row.variable,
        category: row.category,
        target: row.target,
        sampleShare: row.sampleShare,
        weight: row.weight,
        capped: row.capped
      })),
      {
        header: true
      }
    );

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${req.params.runId}-category-weights.csv"`);
    res.send(csv);
  });

  router.get('/:runId/export/respondent-weights.csv', (_req, res) => {
    res.status(404).json({ message: 'Respondent-level weights are not available in the demo implementation.' });
  });

  return router;
}

