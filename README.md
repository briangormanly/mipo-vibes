# MIPO Weighting Calculator

This repository implements both the production-oriented API (Spec A) and the fast Angular proof of concept (Spec B) defined in `spec.md`.

- `api/`: Node 20 / TypeScript Express service with Neo4j integration (seed fallback) for managing target sets and weighting runs.
- `web/`: Angular single-page application that reproduces the analyst UX and performs the weighting math client-side.

> **Note:** Package installation commands may require internet access. The sandbox environment used for code generation did not execute installs.

## Getting Started

### Prerequisites

- Node.js 20+
- npm 9+
- Neo4j 5 (optional – the API falls back to seeded ACS targets when credentials are missing)

### Install dependencies

```bash
npm install
```

### API (Spec A)

```bash
cd api
npm install

# Environment (example)
cp .env.example .env

npm run dev
```

#### Environment Variables

Create `api/.env` with:

```
NEO4J_URI=neo4j://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
PORT=4000
```

When these variables are absent, the API operates in **seed-only mode**, returning the bundled ACS targets and supporting demo runs in-memory.

### Web (Spec B)

```bash
cd web
npm install
npm start
```

The Angular app loads the ACS target JSON, lets analysts configure refusals/caps/party targets, paste sample counts, run the weighting algorithm client-side, and export category-level weights.

## Testing

- `api`: `npm test`
- `web`: `npm test`

## Project Status & Next Steps

- ✅ Weighting engine for demographic rake + party post-stratification (caps enforced)
- ✅ REST endpoints for target sets, run lifecycle, and category-weight CSV export
- ✅ Angular UX with configurable inputs, diagnostics, and CSV export
- ⏳ Neo4j persistence and respondent-level weight exports (API stubs in place)
- ⏳ Worker offloading for IPF loop (current implementation is synchronous)

Refer to `spec.md` for the complete requirements and roadmap items.

