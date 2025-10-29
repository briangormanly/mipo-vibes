# MIPO Weighting Calculator — Two Implementation Specs

**Context & Constraints (for both specs)**  
- **Universe:** All adults  
- **Party:** Self-identified Party ID (not voter-file registration)  
- **Geography:** National  
- **Buckets:** Use the same ACS buckets as in the provided sheet  
- **Education:** Skip for demo  
- **Computation Order:** **Demographics first**, then **Party**  
- **Inputs:** Category counts (not respondent-level for the demo)  
- **Caps:** Min **0.5**, Max **2.0**  
- **Outputs:** Both category targets and (optionally) respondent-level weights

---

## Spec A — Full Application (Node/TypeScript API + Neo4j + Angular 20)

### 1) Goal & Scope
Build a production-oriented web app that:
1. Preloads **ACS national targets** (same buckets as the sheet) for **Race/Hispanic, Gender, Age, Income, Region**.  
2. Accepts **category counts** (pasted or CSV).  
3. Accepts **per-variable refusal %**, adjusts targets accordingly, and **re-normalizes**.  
4. Computes weights by **raking demographics first** (IPF), then **post-stratifying Party ID**.  
5. Enforces **caps** (min 0.5, max 2.0).  
6. Exports **category-level targets** and **respondent-level weights** (if respondent file provided).  
7. Flags when any group would exceed the cap and explains tradeoffs.

### 2) Users & Roles
- **Analyst:** Run weight computations, upload/download files.  
- **Admin (optional v1):** Manage target tables, scenarios, audits.

### 3) Architecture
- **Front-end:** Angular 20 (TypeScript)
- **API:** Node 20+ / TypeScript, Express (or Fastify)
- **DB:** Neo4j 5 Enterprise (graph model for scenarios, variables, categories, runs, and optional respondent nodes)
- **Auth:** Basic JWT or session cookie (simple for v1)
- **File handling:** CSV import/export; (optional) S3/minio for storage

**Data Flow**
1. Load **TargetSet** (ACS buckets) from Neo4j.  
2. Analyst inputs **refusal %** per variable → adjust targets & re-normalize.  
3. Paste **category counts** (or upload respondent CSV) → compute **demographic rake** via IPF.  
4. **Apply caps** and iterate until convergence.  
5. **Post-stratify Party ID** to requested distribution; re-apply caps as needed.  
6. Return results: category table, (optional) respondent weights, diagnostics, CSV exports.

### 4) Data Model (Neo4j)
**Nodes**
- `Variable { key, label }` — e.g., `RACE`, `GENDER`, `AGE`, `INCOME`, `REGION`, `PARTY`  
- `Category { key, label, variableKey }` — e.g., `NH_WHITE`, `HISPANIC`, `18_29`, etc.  
- `TargetSet { id, name, universe, geography }` — e.g., `All Adults`, `National`  
- `Target { share }` — target share per Category for a TargetSet  
- `WeightingRun { id, createdAt, minCap, maxCap, refusalByVariable: Map, status }`  
- `SampleCount { n }` — sample count per Category for a run  
- `Respondent { respondentId, categories: Map, weight }` (optional)  
- `PartyTarget { share }` — party ID targets for a run or target set

**Relationships (examples)**
- `(Variable)-[:HAS_CATEGORY]->(Category)`  
- `(TargetSet)-[:HAS_TARGET]->(Target)-[:FOR_CATEGORY]->(Category)`  
- `(WeightingRun)-[:USED_TARGETS]->(TargetSet)`  
- `(WeightingRun)-[:HAS_SAMPLE_COUNT]->(SampleCount)-[:FOR_CATEGORY]->(Category)`  
- `(Respondent)-[:IN_CATEGORY]->(Category)`

### 5) API (TypeScript / Express)
Base path: `/api/v1`

**Targets & Config**
- `GET /targets/sets` → list TargetSets (name, universe, geography)  
- `GET /targets/sets/:id` → TargetSet with categories and shares  
- `POST /targets/sets` → create/update (admin)  
- `GET /variables` → variables and categories (from graph)

**Runs**
- `POST /runs` — create a run  
  **Body example**
  ```json
  {
    "targetSetId": "acs_all_adults_national",
    "variables": ["RACE","GENDER","AGE","INCOME","REGION"],
    "partyVariable": "PARTY",
    "partyTargets": {"DEM":0.33,"REP":0.30,"IND_OTHER":0.37},
    "refusals": {"INCOME": 0.13},
    "caps": {"min":0.5,"max":2.0}
  }
  ```
  **Returns:** `{ "runId": "..." }`

- `POST /runs/:runId/sample-counts` — attach counts  
  **Body example**
  ```json
  {
    "counts": [
      {"variable":"RACE","category":"NH_WHITE","n":1234}
    ]
  }
  ```

- `POST /runs/:runId/respondents` — optional CSV upload with `respondentId` and categorical columns

- `POST /runs/:runId/compute` — execute: **Rake (demographics) → Cap → Converge → Party post-stratify → Cap/Converge**  
  **Returns**
  ```json
  {
    "runId":"...",
    "categoryTable":[
      {"variable":"RACE","category":"NH_WHITE","target":0.62,"sampleShare":0.55,"weight":1.127}
    ],
    "diagnostics":{
      "iterations":7,
      "converged":true,
      "capHits":[{"variable":"AGE","category":"18_29","suggestedWeight":2.31,"cappedTo":2.0}]
    },
    "respondentWeightsAvailable": true
  }
  ```

- `GET /runs/:runId/export/category-weights.csv`  
- `GET /runs/:runId/export/respondent-weights.csv` (if uploaded)

**Validation & Errors**
- 400 for missing/mismatched category keys  
- 422 if infeasible targets under caps; include suggested relaxations

### 6) Weighting Algorithm (IPF + Post-stratification)
1) **Adjust Targets for Refusals (per variable)**  
- For each variable with refusal rate `r`, scale each category share by `(1 - r)` and **re-normalize within that variable**.

2) **Demographic Raking (IPF)**  
- Initialize weights to 1.  
- Iteratively scale to match each variable’s margins:  
  ```
  for iter in 1..maxIter:
    for variable in [RACE, GENDER, AGE, INCOME, REGION]:
      w <- w * (target_margin[variable] / current_margin[variable])
      w <- clip(w, minCap, maxCap)
    stop if max(abs(delta_margins)) < epsilon
  ```
- If respondent-level file exists, compute margins by summing respondent weights by category; otherwise work in category space using counts.

3) **Party Post-stratification**  
- Multiply by per-party factors to hit party targets, then **re-cap** in `[minCap, maxCap]`.  
- If infeasible, return diagnostics to relax caps or smooth targets.

### 7) Front-End (Angular 20)
**Pages**  
- **Run Builder:** select TargetSet, choose variables, input refusal %, paste counts/upload CSV, set caps, click **Compute**.  
- **Results:** table of Target vs Sample vs Weight, cap warnings, export buttons.

**Components**  
- `VariableSelectorComponent`  
- `RefusalInputsComponent`  
- `CountsPasteComponent` (+ CSV parser)  
- `CapsControlComponent`  
- `ResultsTableComponent`  
- `DiagnosticsPanelComponent`

**Nice Touches**  
- Red highlight if computed weight exceeds cap; tooltip explains variance–bias tradeoff.  
- Persist last run config per user (local storage).

### 8) Non-functional & CI/CD
- Node 20+, Angular 20, TypeScript strict mode  
- Unit tests: Jest (server), Vitest or Karma/Jasmine (client)  
- E2E: Playwright or Cypress  
- Dockerfiles for API & Web; GitHub Actions for build/test  
- Basic RBAC optional

### 9) Acceptance Criteria
- Given ACS TargetSet and pasted counts, app returns converged demographic weights with caps enforced.  
- Party post-stratification applies **after** demographic convergence.  
- CSV exports match on-screen results.  
- Diagnostics list categories hitting caps.

---

## Spec B — Fast POC (Angular-only, client-side compute)

> **Purpose:** Prove the end-to-end UX and core math in a single-page web app. No backend or DB required. Optional respondent-level upload handled entirely in-browser.

### 1) Scope
- **Single-page Angular 20** app.  
- Preload **ACS targets** as **static JSON** (same buckets as your sheet).  
- Inputs:  
  - Per-variable **refusal %** (e.g., Income 13%).  
  - **Category counts** pasted into a grid (or small CSV upload parsed client-side).  
  - **Party targets** (three bins by default: DEM, REP, IND/OTHER; editable).  
  - **Caps** (min 0.5, max 2.0).  
- Compute:  
  - **Rake demographics** (RACE, GENDER, AGE, INCOME, REGION) → **then Party**.  
  - Enforce caps; iterate until convergence.  
- Output:  
  - **Table**: Target | Sample Share | Weight | Cap-Hit?  
  - **Diagnostics**: iterations, cap hits.  
  - **Exports**: CSV of category weights.  
  - **Optional** respondent CSV upload: compute **weight** column client-side and export.

### 2) Tech & Packaging
- Angular 20 + TypeScript only.  
- No backend, no auth.  
- Use a **Web Worker** for the IPF loop to keep the UI responsive with larger inputs.  
- Static assets:  
  - `assets/targets/acs_all_adults_national.json`  
  - `assets/config/default_party.json`

### 3) UI Layout
**Left Panel**  
- Variable toggles (pre-checked): Race, Gender, Age, Income, Region  
- Refusal % inputs (per variable; Income default **13%**)  
- Caps: min (**0.5**), max (**2.0**)  
- Party targets (DEM/REP/IND-OTHER)

**Center**  
- Paste grid for **Category Counts** (one section per variable; categories from ACS buckets)  
- CSV Upload (optional respondent-level; columns must match category keys)

**Right Panel (Results)**  
- Table: Variable | Category | Target | Sample Share | Weight | Cap-Hit?  
- Diagnostics: iterations, convergence tolerance, cap warnings  
- Buttons: **Compute**, **Export Category Weights CSV**, **Export Respondent Weights CSV** (shown only if respondent file provided)

### 4) Algorithm (client-side TypeScript)
Same algorithm as in Spec A:
- Adjust targets for refusals → re-normalize within each variable.  
- IPF across demographics until `epsilon`.  
- Post-stratify Party → re-cap → quick convergence check.  
- Show warnings if infeasible under caps.

### 5) Data Contracts (POC JSON)
**Targets JSON (example) — `assets/targets/acs_all_adults_national.json`**
```json
{
  "targetSetId": "acs_all_adults_national",
  "variables": ["RACE","GENDER","AGE","INCOME","REGION","PARTY"],
  "buckets": {
    "RACE": [
      {"key":"NH_WHITE","label":"Non-Hispanic White","share":0.62},
      {"key":"NH_BLACK","label":"Non-Hispanic Black","share":0.12},
      {"key":"HISPANIC","label":"Hispanic (any race)","share":0.19},
      {"key":"NH_OTHER","label":"Non-Hispanic Other","share":0.07}
    ],
    "GENDER": [
      {"key":"MALE","label":"Male","share":0.48},
      {"key":"FEMALE","label":"Female","share":0.52}
    ],
    "AGE": [
      {"key":"18_29","label":"18–29","share":0.21},
      {"key":"30_44","label":"30–44","share":0.24},
      {"key":"45_64","label":"45–64","share":0.33},
      {"key":"65P","label":"65+","share":0.22}
    ],
    "INCOME": [
      {"key":"UNDER_25K","label":"< $25k","share":0.16},
      {"key":"25_49K","label":"$25–49k","share":0.20},
      {"key":"50_99K","label":"$50–99k","share":0.32},
      {"key":"100K_PLUS","label":"$100k+","share":0.32}
    ],
    "REGION": [
      {"key":"NORTHEAST","label":"Northeast","share":0.17},
      {"key":"MIDWEST","label":"Midwest","share":0.21},
      {"key":"SOUTH","label":"South","share":0.38},
      {"key":"WEST","label":"West","share":0.24}
    ],
    "PARTY": [
      {"key":"DEM","label":"Democrat","share":0.33},
      {"key":"REP","label":"Republican","share":0.30},
      {"key":"IND_OTHER","label":"Independent/Other","share":0.37}
    ]
  }
}
```
> Replace shares with exact ACS/party targets; the POC loads them as defaults and allows editing of party shares.

**Counts Paste (held in memory)**
```json
{
  "counts": [
    {"variable":"RACE","category":"NH_WHITE","n":1234}
  ]
}
```

### 6) Acceptance Criteria (POC)
- Analyst can paste counts, set refusals and caps, press **Compute**, and see stable weights with clear cap warnings.  
- Changing refusal % (e.g., Income 13%) updates targets and results.  
- Editing party targets updates the final post-stratification step.  
- Exported category CSV matches the on-screen table.

### 7) Stretch Goals (time permitting)
- **“What changed?”** panel showing how refusals and caps shift targets/weights.  
- **Pin scenario** to a downloadable JSON snapshot (still no backend).

---

### Notes for the Demo
- **Explainability tooltips**: why IPF is used; how refusals re-normalize; caps tradeoffs (variance vs bias).  
- **Red/amber indicators** when a margin cannot be met given current caps.  
- A toggle to show “party second” vs a hypothetical “joint rake” for comparison (keep default as **demographics then party**).
