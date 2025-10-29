import type { Driver, QueryResult } from 'neo4j-driver';

import targetsSeed from '../data/acs_all_adults_national.json' assert { type: 'json' };
import type { TargetSet, VariableDefinition } from '../models/types.js';
import { logger } from '../utils/logger.js';

function normalizeTargetSet(record: QueryResult['records'][number]): TargetSet {
  const targetSetProps = record.get('targetSet');
  const variables = record.get('variables') as Array<{
    key: string;
    label: string;
    categories: VariableDefinition['categories'];
  }>;
  return {
    id: targetSetProps.id,
    name: targetSetProps.name,
    universe: targetSetProps.universe,
    geography: targetSetProps.geography,
    variables
  } satisfies TargetSet;
}

const seedTargetSet: TargetSet = {
  id: targetsSeed.targetSetId,
  name: targetsSeed.name,
  universe: targetsSeed.universe,
  geography: targetsSeed.geography,
  variables: targetsSeed.variables.map((variable) => ({
    key: variable.key,
    label: variable.label,
    categories: variable.categories
  }))
};

export class TargetService {
  constructor(private readonly driver: Driver | null) {}

  async listTargetSets(): Promise<Array<Pick<TargetSet, 'id' | 'name' | 'universe' | 'geography'>>> {
    if (!this.driver) {
      return [seedTargetSet].map(({ id, name, universe, geography }) => ({ id, name, universe, geography }));
    }
    try {
      const session = this.driver.session();
      const result = await session.run(
        `MATCH (ts:TargetSet)
         RETURN ts.id as id, ts.name as name, ts.universe as universe, ts.geography as geography
         ORDER BY ts.name`
      );
      await session.close();
      if (result.records.length === 0) {
        return [seedTargetSet].map(({ id, name, universe, geography }) => ({ id, name, universe, geography }));
      }
      return result.records.map((record) => ({
        id: record.get('id'),
        name: record.get('name'),
        universe: record.get('universe'),
        geography: record.get('geography')
      }));
    } catch (error) {
      logger.warn({ error }, 'Falling back to seed target set list');
      return [seedTargetSet].map(({ id, name, universe, geography }) => ({ id, name, universe, geography }));
    }
  }

  async getTargetSet(id: string): Promise<TargetSet | null> {
    if (id === seedTargetSet.id) {
      return seedTargetSet;
    }
    if (!this.driver) {
      return null;
    }
    try {
      const session = this.driver.session();
      const result = await session.run(
        `MATCH (ts:TargetSet { id: $id })
         OPTIONAL MATCH (ts)-[:HAS_TARGET]->(target:Target)-[:FOR_CATEGORY]->(category:Category)-[:OF_VARIABLE]->(variable:Variable)
         WITH ts, variable, collect({ key: category.key, label: category.label, share: target.share }) AS categories
         WITH ts, collect({ key: variable.key, label: variable.label, categories: categories }) AS variables
         RETURN ts AS targetSet, variables`,
        { id }
      );
      await session.close();
      if (result.records.length === 0) {
        return null;
      }
      return normalizeTargetSet(result.records[0]);
    } catch (error) {
      logger.warn({ error }, 'Falling back to seed target set detail');
      return null;
    }
  }
}

