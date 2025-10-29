import { randomUUID } from 'node:crypto';

import type { Driver } from 'neo4j-driver';

import type {
  ComputeResult,
  PartyTargets,
  RefusalMap,
  SampleCount,
  TargetSet,
  WeightingRun
} from '../models/types.js';
import { logger } from '../utils/logger.js';
import { computeWeights } from './weightingEngine.js';
import { TargetService } from './targetService.js';

type RunInternal = WeightingRun & {
  sampleCounts: SampleCount[];
  lastResult?: ComputeResult;
};

export class RunService {
  private readonly runs = new Map<string, RunInternal>();
  private readonly targetService: TargetService;

  constructor(driver: Driver | null) {
    this.targetService = new TargetService(driver);
  }

  async createRun(payload: {
    targetSetId: string;
    variables: string[];
    partyVariable: string;
    partyTargets: PartyTargets;
    refusals: RefusalMap;
    caps: { min: number; max: number };
  }): Promise<WeightingRun> {
    const runId = randomUUID();
    const run: RunInternal = {
      id: runId,
      targetSetId: payload.targetSetId,
      variables: payload.variables,
      partyVariable: payload.partyVariable,
      partyTargets: payload.partyTargets,
      refusals: payload.refusals,
      caps: payload.caps,
      createdAt: new Date().toISOString(),
      sampleCounts: []
    };
    this.runs.set(runId, run);
    return run;
  }

  getRun(runId: string): RunInternal | undefined {
    return this.runs.get(runId);
  }

  addSampleCounts(runId: string, counts: SampleCount[]): RunInternal {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error('Run not found');
    }
    run.sampleCounts.push(...counts);
    return run;
  }

  async compute(runId: string): Promise<ComputeResult> {
    const run = this.runs.get(runId);
    if (!run) {
      throw new Error('Run not found');
    }
    const targetSet = await this.targetService.getTargetSet(run.targetSetId);
    if (!targetSet) {
      throw new Error(`Target set ${run.targetSetId} not found`);
    }
    const filteredTargetSet: TargetSet = {
      ...targetSet,
      variables: targetSet.variables.filter((variable) => run.variables.includes(variable.key))
    };
    if (!filteredTargetSet.variables.some((variable) => variable.key === run.partyVariable)) {
      const partyVariable = targetSet.variables.find((variable) => variable.key === run.partyVariable);
      if (partyVariable) {
        filteredTargetSet.variables.push(partyVariable);
      } else {
        logger.warn({ runId, partyVariable: run.partyVariable }, 'Party variable not found in target set; skipping');
      }
    }

    const result = computeWeights(
      run.id,
      filteredTargetSet,
      run.sampleCounts,
      run.refusals,
      run.partyTargets,
      run.caps
    );
    run.lastResult = result;
    return result;
  }

  getLastResult(runId: string): ComputeResult | undefined {
    return this.runs.get(runId)?.lastResult;
  }
}

