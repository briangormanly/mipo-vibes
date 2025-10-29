export interface TargetCategory {
  key: string;
  label: string;
  share: number;
}

export interface VariableDefinition {
  key: string;
  label: string;
  categories: TargetCategory[];
}

export interface TargetSet {
  targetSetId: string;
  name: string;
  universe: string;
  geography: string;
  variables: VariableDefinition[];
}

export interface SampleCount {
  variable: string;
  category: string;
  n: number;
}

export interface CategoryResult {
  variable: string;
  category: string;
  target: number;
  sampleShare: number;
  weight: number;
  capped: boolean;
}

export interface Diagnostics {
  iterations: number;
  converged: boolean;
  capHits: Array<{ variable: string; category: string; suggestedWeight: number; cappedTo: number }>;
}

export interface ComputeResult {
  categoryTable: CategoryResult[];
  diagnostics: Diagnostics;
}

export interface CapsConfig {
  min: number;
  max: number;
}

