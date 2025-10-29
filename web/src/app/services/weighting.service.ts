import { Injectable } from '@angular/core';

import type {
  CapsConfig,
  CategoryResult,
  ComputeResult,
  Diagnostics,
  SampleCount,
  TargetSet,
  VariableDefinition
} from '../models';

export interface WeightingRunInput {
  targetSet: TargetSet;
  variables: string[];
  partyVariable: string;
  partyTargets: Record<string, number>;
  refusals: Record<string, number>;
  caps: CapsConfig;
  counts: SampleCount[];
}

type CategoryState = {
  target: number;
  sampleShare: number;
  weight: number;
  capped: boolean;
};

type VariableState = Record<string, CategoryState>;

@Injectable({ providedIn: 'root' })
export class WeightingService {
  compute(input: WeightingRunInput): ComputeResult {
    const adjustedVariables = this.applyRefusalAdjustments(input.targetSet.variables, input.refusals).filter((variable) =>
      input.variables.includes(variable.key)
    );

    const sampleShares = this.buildSampleShareMap(input.counts);

    const states: Record<string, VariableState> = {};
    for (const variable of adjustedVariables) {
      states[variable.key] = this.computeVariableWeights(variable, sampleShares[variable.key] ?? {}, input.caps);
    }

    const partyVariable = input.targetSet.variables.find((variable) => variable.key === input.partyVariable);
    if (partyVariable) {
      states[partyVariable.key] = this.computeVariableWeights(partyVariable, sampleShares[partyVariable.key] ?? {}, input.caps);
      this.applyPartyPostStratification(states, input.partyTargets, input.caps);
    }

    return {
      categoryTable: this.flattenCategoryResults(states),
      diagnostics: this.summarizeDiagnostics(states)
    } satisfies ComputeResult;
  }

  private applyRefusalAdjustments(variables: VariableDefinition[], refusals: Record<string, number>): VariableDefinition[] {
    return variables.map((variable) => {
      const refusalRate = refusals[variable.key] ?? 0;
      if (refusalRate <= 0) {
        return variable;
      }
      const adjustedTotal = variable.categories.reduce((sum, category) => sum + category.share * (1 - refusalRate), 0);
      return {
        ...variable,
        categories: variable.categories.map((category) => ({
          ...category,
          share: ((category.share * (1 - refusalRate)) / adjustedTotal) || 0
        }))
      } satisfies VariableDefinition;
    });
  }

  private buildSampleShareMap(counts: SampleCount[]): Record<string, Record<string, number>> {
    const result: Record<string, Record<string, number>> = {};
    const totals: Record<string, number> = {};
    for (const count of counts) {
      result[count.variable] = result[count.variable] ?? {};
      result[count.variable][count.category] = (result[count.variable][count.category] ?? 0) + count.n;
      totals[count.variable] = (totals[count.variable] ?? 0) + count.n;
    }
    for (const [variable, categories] of Object.entries(result)) {
      const total = totals[variable] ?? 0;
      if (total === 0) {
        continue;
      }
      for (const [category, value] of Object.entries(categories)) {
        categories[category] = value / total;
      }
    }
    return result;
  }

  private clip(value: number, caps: CapsConfig): { weight: number; capped: boolean } {
    if (value < caps.min) {
      return { weight: caps.min, capped: true };
    }
    if (value > caps.max) {
      return { weight: caps.max, capped: true };
    }
    return { weight: value, capped: false };
  }

  private computeVariableWeights(variable: VariableDefinition, sampleShares: Record<string, number>, caps: CapsConfig): VariableState {
    const state: VariableState = {};
    for (const category of variable.categories) {
      const observed = sampleShares[category.key] ?? 0;
      const rawWeight = observed === 0 ? caps.max : category.share / observed;
      const { weight, capped } = this.clip(rawWeight, caps);
      state[category.key] = {
        target: category.share,
        sampleShare: observed,
        weight,
        capped
      };
    }
    return state;
  }

  private applyPartyPostStratification(states: Record<string, VariableState>, partyTargets: Record<string, number>, caps: CapsConfig): void {
    const partyState = states['PARTY'];
    if (!partyState) {
      return;
    }
    for (const [categoryKey, state] of Object.entries(partyState)) {
      const desiredShare = partyTargets[categoryKey] ?? state.target;
      const observed = state.sampleShare;
      const rawWeight = observed === 0 ? caps.max : desiredShare / observed;
      const { weight, capped } = this.clip(rawWeight, caps);
      state.weight = weight;
      state.capped = capped;
      state.target = desiredShare;
    }
  }

  private summarizeDiagnostics(states: Record<string, VariableState>): Diagnostics {
    const capHits: Diagnostics['capHits'] = [];
    for (const [variable, categories] of Object.entries(states)) {
      for (const [category, state] of Object.entries(categories)) {
        if (state.capped) {
          capHits.push({
            variable,
            category,
            suggestedWeight: state.target / Math.max(state.sampleShare, 1e-6),
            cappedTo: state.weight
          });
        }
      }
    }
    return {
      iterations: 1,
      converged: true,
      capHits
    } satisfies Diagnostics;
  }

  private flattenCategoryResults(states: Record<string, VariableState>): CategoryResult[] {
    const rows: CategoryResult[] = [];
    for (const [variable, categories] of Object.entries(states)) {
      for (const [category, state] of Object.entries(categories)) {
        rows.push({ variable, category, target: state.target, sampleShare: state.sampleShare, weight: state.weight, capped: state.capped });
      }
    }
    return rows;
  }
}

