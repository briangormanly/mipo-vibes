import { DecimalPipe, NgClass, NgFor, NgIf } from '@angular/common';
import { Component, OnInit, Signal, WritableSignal, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';

import type { CapsConfig, CategoryResult, ComputeResult, TargetCategory, TargetSet, VariableDefinition } from './models';
import { WeightingService } from './services/weighting.service';

type CategoryInputState = Record<string, Record<string, number>>;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [NgIf, NgFor, FormsModule, DecimalPipe, NgClass],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly weightingService = inject(WeightingService);

  title = 'MIPO Weighting Calculator';

  targetSet: WritableSignal<TargetSet | null> = signal<TargetSet | null>(null);
  selectedVariables: WritableSignal<Set<string>> = signal(new Set(['RACE', 'GENDER', 'AGE', 'INCOME', 'REGION']));
  refusalRates: WritableSignal<Record<string, number>> = signal({ INCOME: 0.13 });
  partyTargets: WritableSignal<Record<string, number>> = signal({ DEM: 0.33, REP: 0.3, IND_OTHER: 0.37 });
  caps: WritableSignal<CapsConfig> = signal({ min: 0.5, max: 2.0 });

  counts: WritableSignal<CategoryInputState> = signal({});
  computeResult: WritableSignal<ComputeResult | null> = signal<ComputeResult | null>(null);
  isComputing: WritableSignal<boolean> = signal(false);
  errorMessage: WritableSignal<string | null> = signal(null);

  categoriesTable: Signal<CategoryResult[]> = computed(() => this.computeResult()?.categoryTable ?? []);
  partyCategories: Signal<TargetCategory[]> = computed(() => {
    const target = this.targetSet();
    if (!target) {
      return [];
    }
    const partyVariable = target.variables.find((variable) => variable.key === 'PARTY');
    return partyVariable?.categories ?? [];
  });

  async ngOnInit(): Promise<void> {
    const target = await this.http.get<TargetSet>('assets/targets/acs_all_adults_national.json').toPromise();
    if (target) {
      this.targetSet.set(target);
      this.initializeCounts(target.variables);
      const partyVariable = target.variables.find((variable) => variable.key === 'PARTY');
      if (partyVariable) {
        const defaultPartyTargets: Record<string, number> = {};
        for (const category of partyVariable.categories) {
          defaultPartyTargets[category.key] = category.share;
        }
        this.partyTargets.set(defaultPartyTargets);
      }
    }
  }

  toggleVariable(variableKey: string, checked: boolean): void {
    const next = new Set(this.selectedVariables().values());
    if (checked) {
      next.add(variableKey);
    } else {
      next.delete(variableKey);
    }
    this.selectedVariables.set(next);
  }

  updateRefusal(variableKey: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const next = { ...this.refusalRates() };
    if (Number.isNaN(value)) {
      delete next[variableKey];
    } else {
      next[variableKey] = Math.min(Math.max(value, 0), 0.9);
    }
    this.refusalRates.set(next);
  }

  updatePartyTarget(categoryKey: string, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const next = { ...this.partyTargets() };
    if (!Number.isNaN(value)) {
      next[categoryKey] = value;
    }
    this.partyTargets.set(next);
  }

  updateCaps(key: keyof CapsConfig, event: Event): void {
    const value = Number((event.target as HTMLInputElement).value);
    const next = { ...this.caps() };
    if (!Number.isNaN(value)) {
      next[key] = value;
    }
    this.caps.set(next);
  }

  updateCount(variableKey: string, categoryKey: string, event: Event): void {
    const rawValue = (event.target as HTMLInputElement).value;
    const value = Number(rawValue);
    const next = this.cloneCounts();
    if (!next[variableKey]) {
      next[variableKey] = {};
    }
    next[variableKey][categoryKey] = Number.isNaN(value) ? 0 : Math.max(value, 0);
    this.counts.set(next);
  }

  resetCounts(): void {
    const target = this.targetSet();
    if (!target) {
      return;
    }
    this.initializeCounts(target.variables);
    this.computeResult.set(null);
  }

  async compute(): Promise<void> {
    const target = this.targetSet();
    if (!target) {
      return;
    }
    this.isComputing.set(true);
    this.errorMessage.set(null);
    try {
      const counts = this.extractCounts();
      const result = this.weightingService.compute({
        targetSet: target,
        variables: Array.from(this.selectedVariables()),
        partyVariable: 'PARTY',
        partyTargets: this.partyTargets(),
        refusals: this.refusalRates(),
        caps: this.caps(),
        counts
      });
      this.computeResult.set(result);
    } catch (error) {
      console.error(error);
      this.errorMessage.set((error as Error).message ?? 'Unable to compute weights');
    } finally {
      this.isComputing.set(false);
    }
  }

  exportCategoryCsv(): void {
    const result = this.computeResult();
    if (!result) {
      return;
    }
    const header = 'Variable,Category,Target,Sample Share,Weight,Capped\n';
    const rows = result.categoryTable
      .map((row) => `${row.variable},${row.category},${row.target.toFixed(4)},${row.sampleShare.toFixed(4)},${row.weight.toFixed(4)},${row.capped}`)
      .join('\n');
    const csv = `${header}${rows}`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'category-weights.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  private initializeCounts(variables: VariableDefinition[]): void {
    const next: CategoryInputState = {};
    for (const variable of variables) {
      next[variable.key] = {};
      for (const category of variable.categories) {
        next[variable.key][category.key] = 0;
      }
    }
    this.counts.set(next);
  }

  private extractCounts(): Array<{ variable: string; category: string; n: number }> {
    const counts: Array<{ variable: string; category: string; n: number }> = [];
    for (const [variable, categories] of Object.entries(this.counts())) {
      for (const [category, value] of Object.entries(categories)) {
        counts.push({ variable, category, n: value ?? 0 });
      }
    }
    return counts;
  }

  private cloneCounts(): CategoryInputState {
    const snapshot = this.counts();
    const clone: CategoryInputState = {};
    for (const [variable, categories] of Object.entries(snapshot)) {
      clone[variable] = { ...categories };
    }
    return clone;
  }
}

