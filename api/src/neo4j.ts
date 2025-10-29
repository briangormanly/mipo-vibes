import neo4j, { type Driver } from 'neo4j-driver';

import { logger } from './utils/logger.js';

type Neo4jConfig = {
  uri: string;
  username: string;
  password: string;
};

function readConfig(): Neo4jConfig | null {
  const { NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD } = process.env;
  if (!NEO4J_URI || !NEO4J_USERNAME || !NEO4J_PASSWORD) {
    return null;
  }
  return {
    uri: NEO4J_URI,
    username: NEO4J_USERNAME,
    password: NEO4J_PASSWORD
  };
}

export async function createNeo4jDriver(): Promise<Driver | null> {
  const config = readConfig();
  if (!config) {
    logger.warn('Neo4j credentials missing; running in seed-only mode.');
    return null;
  }
  return neo4j.driver(config.uri, neo4j.auth.basic(config.username, config.password));
}

