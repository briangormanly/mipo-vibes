export type VariableKey = 'RACE' | 'GENDER' | 'AGE' | 'INCOME' | 'REGION' | 'PARTY';

export type TargetCategory = {
  key: string;
  label: string;
  share: number;
};

export type VariableDefinition = {
  key: VariableKey | string;
  label: string;
  categories: TargetCategory[];
};

export type TargetSet = {
  id: string;
  name: string;
  universe: string;
  geography: string;
  variables: VariableDefinition[];
};

export type RefusalMap = Record<string, number>;

export type PartyTargets = Record<string, number>;

export type SampleCount = {
  variable: string;
  category: string;
  n: number;
};

export type WeightingRun = {
  id: string;
  targetSetId: string;
  variables: string[];
  partyVariable: string;
  partyTargets: PartyTargets;
  refusals: RefusalMap;
  caps: {
    min: number;
    max: number;
  };
  createdAt: string;
};

export type CategoryResult = {
  variable: string;
  category: string;
  target: number;
  sampleShare: number;
  weight: number;
  capped: boolean;
};

export type Diagnostics = {
  iterations: number;
  converged: boolean;
  capHits: Array<{
    variable: string;
    category: string;
    suggestedWeight: number;
    cappedTo: number;
  }>;
};

export type ComputeResult = {
  runId: string;
  categoryTable: CategoryResult[];
  diagnostics: Diagnostics;
  respondentWeightsAvailable: boolean;
};

