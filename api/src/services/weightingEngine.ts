import type {
  CategoryResult,
  ComputeResult,
  Diagnostics,
  PartyTargets,
  RefusalMap,
  SampleCount,
  TargetSet,
  VariableDefinition
} from '../models/types.js';

type Caps = { min: number; max: number };

type CategoryState = {
  target: number;
  sampleShare: number;
  weight: number;
  capped: boolean;
};

type VariableState = Record<string, CategoryState>;

function cloneVariables(variables: VariableDefinition[]): VariableDefinition[] {
  return variables.map((variable) => ({
    key: variable.key,
    label: variable.label,
    categories: variable.categories.map((category) => ({ ...category }))
  }));
}

function applyRefusalAdjustments(variables: VariableDefinition[], refusals: RefusalMap): VariableDefinition[] {
  return cloneVariables(variables).map((variable) => {
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
    };
  });
}

function buildSampleShareMap(counts: SampleCount[]): Record<string, Record<string, number>> {
  const result: Record<string, Record<string, number>> = {};
  const totalsByVariable: Record<string, number> = {};

  for (const count of counts) {
    result[count.variable] = result[count.variable] ?? {};
    result[count.variable][count.category] = (result[count.variable][count.category] ?? 0) + count.n;
    totalsByVariable[count.variable] = (totalsByVariable[count.variable] ?? 0) + count.n;
  }

  for (const [variable, categories] of Object.entries(result)) {
    const total = totalsByVariable[variable] ?? 0;
    if (total === 0) {
      continue;
    }
    for (const [category, count] of Object.entries(categories)) {
      categories[category] = count / total;
    }
  }

  return result;
}

function clip(value: number, caps: Caps): { weight: number; capped: boolean } {
  if (value < caps.min) {
    return { weight: caps.min, capped: true };
  }
  if (value > caps.max) {
    return { weight: caps.max, capped: true };
  }
  return { weight: value, capped: false };
}

function computeVariableWeights(
  variable: VariableDefinition,
  sampleShares: Record<string, number>,
  caps: Caps
): VariableState {
  const state: VariableState = {};

  for (const category of variable.categories) {
    const observed = sampleShares[category.key] ?? 0;
    const rawWeight = observed === 0 ? caps.max : category.share / observed;
    const { weight, capped } = clip(rawWeight, caps);
    state[category.key] = {
      target: category.share,
      sampleShare: observed,
      weight,
      capped
    } satisfies CategoryState;
  }

  return state;
}

function summarizeDiagnostics(states: Record<string, VariableState>): Diagnostics {
  const capHits: Diagnostics['capHits'] = [];
  for (const [variable, categories] of Object.entries(states)) {
    for (const [categoryKey, state] of Object.entries(categories)) {
      if (state.capped) {
        capHits.push({
          variable,
          category: categoryKey,
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

function flattenCategoryResults(states: Record<string, VariableState>): CategoryResult[] {
  const results: CategoryResult[] = [];
  for (const [variable, categories] of Object.entries(states)) {
    for (const [categoryKey, state] of Object.entries(categories)) {
      results.push({
        variable,
        category: categoryKey,
        target: state.target,
        sampleShare: state.sampleShare,
        weight: state.weight,
        capped: state.capped
      });
    }
  }
  return results;
}

function applyPartyPostStratification(
  states: Record<string, VariableState>,
  partyTargets: PartyTargets,
  caps: Caps
): void {
  const partyState = states.PARTY;
  if (!partyState) {
    return;
  }
  const totalShare = Object.values(partyState).reduce((sum, state) => sum + state.sampleShare, 0);
  if (totalShare === 0) {
    return;
  }

  for (const [categoryKey, state] of Object.entries(partyState)) {
    const desiredShare = partyTargets[categoryKey] ?? state.target;
    const observed = state.sampleShare;
    const rawWeight = observed === 0 ? caps.max : desiredShare / observed;
    const { weight, capped } = clip(rawWeight, caps);
    state.weight = weight;
    state.capped = capped;
    state.target = desiredShare;
  }
}

export function computeWeights(
  runId: string,
  targetSet: TargetSet,
  counts: SampleCount[],
  refusals: RefusalMap,
  partyTargets: PartyTargets,
  caps: Caps
): ComputeResult {
  const adjustedVariables = applyRefusalAdjustments(targetSet.variables, refusals);
  const sampleShares = buildSampleShareMap(counts);

  const states: Record<string, VariableState> = {};
  for (const variable of adjustedVariables) {
    const variableSampleShares = sampleShares[variable.key] ?? {};
    states[variable.key] = computeVariableWeights(variable, variableSampleShares, caps);
  }

  applyPartyPostStratification(states, partyTargets, caps);

  const diagnostics = summarizeDiagnostics(states);
  const categoryTable = flattenCategoryResults(states);

  return {
    runId,
    categoryTable,
    diagnostics,
    respondentWeightsAvailable: false
  } satisfies ComputeResult;
}

