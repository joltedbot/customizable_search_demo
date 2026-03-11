# Project Overview

This is the **Elastic Search Demo Builder** (`customizable-search-demo`), a cloneable repository designed for Elastic Solutions Architects (SAs) to quickly build branded, interactive search demos for customers.

The project supports two modes:
1. **Mock Mode (Default):** Generates a single-page HTML demo that works entirely offline with mock data. No server or Elasticsearch infrastructure required.
2. **v2 Mode (Live):** Connects to a real Elasticsearch cluster (ES 9.x with ML) and an Elastic inference endpoint to demonstrate semantic search, Learning to Rank (LTR), and Generative AI chat.

## Architecture Overview & Key Files

**Purpose:** SAs clone this repo, run `SETUP.md` with an AI agent, and get a branded single-page search demo customised for their customer.

**Two modes — same codebase:**
- **Mock** (`V2_ENABLED = false`, default): fully offline, no ES, opens as `file://`
- **v2** (`V2_ENABLED = true`): live Elasticsearch, requires `npm run dev` for CORS

**Key files:**
- `SETUP.md`: The core AI execution script. This file contains instructions for an AI agent (like Gemini or Claude) to interview the user and generate a customized demo.
- `template/index.html`: The base HTML/CSS/JS template (~2600-line single-file) that the AI customizes to create the final demo by replacing `{{TOKEN}}` placeholders.
- `image-library.md`: Curated product image URLs used by the AI to populate the demo's mock product catalog.
- `scripts/setup-index.js`: A Node.js script used in v2 mode to create the ES index, deploy ELSER, and seed 75 products.
- `scripts/data/products.json`: Canonical 75-product athletic/retail dataset.
- `scripts/generate-test.js`: Dev helper: injects `.env` → `output/test/demo.html` with `V2_ENABLED=true`.
- `output/`: The directory where generated customer demos are saved (e.g., `output/<customer-slug>/demo.html`). Gitignored.
- `package.json`: Contains npm scripts for v2 mode operations.
- `.env.template`: Credentials template; copy to `.env` before running v2 setup.

**Search modes (4):**
1. Lexical — BM25 on `name`/`brand`, filtered to noise products (guaranteed bad results)
2. Hybrid — ELSER semantic + BM25, filtered to real products
3. Hybrid + LTR — Hybrid base + `function_score` boosting on persona `preferredBrands`, `gender`, `purchaseHistory`
4. GenAI — Curated product kit + live chat via Elastic inference API

**Personas (3):** Alex, Marcus, Sam — switcher in header; affect LTR and GenAI responses

**ES stack:** Cloud Hosted 9.x, `semantic_text` field + ELSER v2 (`.elser-2-elasticsearch`), index `demo-products`

**Inference API:** `POST {ES_URL}/_inference/completion/{id}` — body: `{ input: "..." }`, response: `completion[0].result`. Uses `completion` task type (not `chat_completion`).

**Credentials in output HTML:**
- `ES_API_KEY_READONLY` — baked into demo.html for browser queries (read-only, scoped to index)
- `ES_API_KEY` — write key used only by `npm run setup`, never in output HTML

**CORS:** Configured in Kibana with regex `/https?:\/\/localhost(:[0-9]+)?/`

**Dataset:** 75 products — 65 real athletic/retail + 10 noise (`is_noise: true`) for lexical failure demo. Lexical mode filters TO noise; all other modes filter AWAY from noise.

## Building and Running

### Build Commands
- **Serve demo locally:** `npm run dev` — serves `output/` at `http://localhost:3000`
- **Seed ES index:** `npm run setup` — creates index, deploys ELSER, loads 75 products (requires `.env`)
- **Reset ES index:** `npm run reset` — wipes and reseeds (requires `.env`)
- **Generate test build:** `npm run generate-test` — injects `.env` credentials into template → `output/test/demo.html` with `V2_ENABLED=true`

### Mock Mode (No ES required)
1. Run the AI agent in the project root.
2. Instruct the agent: `Please read SETUP.md and follow the instructions.`
3. Answer the agent's questions about the customer brand.
4. Open the generated file in a browser: `open output/<customer-slug>/demo.html`

### v2 Mode (Real Elasticsearch required)
1. Configure credentials: `cp .env.template .env` and fill in the required Elasticsearch and API keys.
2. Install dependencies: `npm install`
3. Seed the Elasticsearch index: `npm run setup`
4. Run the AI agent to generate the customized demo (instructing it to follow `SETUP.md`).
5. Serve the project: `npm run dev`
6. Open the demo in a browser via localhost (e.g., `http://localhost:3000/<customer-slug>/demo.html`).

## Testing Guidelines

No automated test suite. Manual testing only:

**Mock mode:**
1. Have the AI agent run SETUP.md to generate `output/{slug}/demo.html`
2. Open directly in browser (`file://`) — no server needed
3. Verify all 4 search modes return results, persona switcher works, GenAI chat shows mock response

**v2 mode:**
1. Ensure `.env` is filled in and `npm run setup` has been run successfully (look for `✓ All 75 products indexed successfully`)
2. Run `npm run generate-test` → then `npm run dev`
3. Open `http://localhost:3000/test/demo.html`
4. Verify: Lexical returns noise/irrelevant products; Hybrid/LTR return real products; GenAI chat returns live inference response
5. Switch personas and confirm LTR results change

## Development Conventions & Code Style

- **Vanilla JS/HTML/CSS only** — no frameworks, no TypeScript, no build step
- **Single-file output** — all JS and CSS must remain inline in `template/index.html`
- **Token format:** `{{ALL_CAPS}}` for credential/config placeholders in `template/index.html`; `[BRACKET_STYLE]` in SETUP.md code examples shown to the AI agent
- **Env vars:** `ALL_CAPS_WITH_UNDERSCORES` (e.g. `ES_INFERENCE_URL`)
- **JS config keys:** camelCase (e.g. `inferenceUrl`, `apiKey`)
- **No new dependencies** without discussion — the project intentionally has minimal deps (`@elastic/elasticsearch`, `serve`)
- **Mock fallback pattern:** all v2 ES calls must fall back to mock silently on failure; never let a failed ES call break the demo
- **AI-Assisted Generation:** The primary workflow involves an AI agent reading `SETUP.md` and modifying a copy of `template/index.html`. Do not manually edit the template for customer-specific changes.
- **Configuration Pre-filling:** Users can pre-fill the `## Customer Config` section in `SETUP.md` to skip the conversational prompt step with the AI agent.
- **Self-Contained Output:** In mock mode, the generated demo is fully self-contained within a single `.html` file.

## Critical Rules

**Uncommitted Changes Check — Session Start:**
- **ALWAYS run `git status` as the very first action at the start of every session**
- If there are uncommitted changes (modified, staged, or new untracked source files):
  - **STOP — do not modify, create, or delete any files**
  - Show the affected files and warn: "There are uncommitted changes. Making edits now risks losing work done since the last commit."
  - Ask: "How would you like to handle this before I proceed? (e.g., commit, stash, discard, or confirm it is safe to continue)"
  - **Do not make any file changes until the user explicitly confirms**

**Unexpected File Changes — Mid-Session Detection:**
- If you detect changes to files you did not make in the current session:
  - **STOP immediately — do not make any further changes**
  - **Do NOT attempt to fix, roll back, stash, drop, reset, or otherwise "correct" this** — any automated correction risks overwriting the user's work
  - Inform the user which files changed and that concurrent human and agent edits can cause conflicts
  - Ask: "Did you make these changes? How would you like to proceed?"
  - **Wait for explicit instructions before taking any further action**

## RPI Framework: Research → Plan → Implement

For non-trivial changes, follow this three-phase approach with explicit user approval at each phase boundary. Each STOP is a hard gate — do not proceed without explicit user approval.

**Requires RPI:** Architecture changes, multi-file refactors, new features, complex bug fixes
**Skip RPI:** Typo fixes, single-line edits, formatting changes, simple corrections

Track each RPI project in a single `.md` file stored in `.claude/plans/` within the repo. Use a descriptive filename (e.g., `setup-md-plan.md`). The file should have three sections corresponding to the phases below, plus a **Phase Status** block at the bottom showing which phases are complete and whether implementation is pending/in-progress.

### Phase 1: Research (What should be done)
- Understand the request and analyze current codebase state
- Ask clarifying questions iteratively to define scope and desired outcomes
- Document key decisions, constraints, and critical context for later phases
- Define and approve acceptance criteria with the user, proportional to the task's complexity.
- **STOP:** Present research findings and get user confirmation before proceeding to Plan

### Phase 2: Plan (How should it be done)
- Design implementation approach based on Research phase findings
- Break down work into discrete, validatable stages
- Collaborate with user to refine plan where helpful
- Self-review holistically — does it achieve the goal? Are there issues?
- Document the complete plan with stage-by-stage breakdown
- **STOP:** Get explicit user approval before proceeding to Implement

### Phase 3: Implement (Execute the plan)
- **STOP FIRST:** Get explicit user approval to START work
- Follow all standing instructions including the three-strikes rule
- Execute plan in stages; validate success after EACH stage
- If major deviations from plan are needed:
  - STOP implementation immediately
  - Analyze impact on overall plan, revise the plan document
  - Get user approval before continuing
- Perform final validation and testing after all stages complete
- Document what was implemented and any deviations from plan

### Implementation Verification
- **Always ask for explicit confirmation before implementing code changes**
- After clarifying questions are answered, ask: "Should I proceed with the implementation?"
- Wait for explicit confirmation before writing any code
- For non-RPI changes, the same applies — confirm approach before writing code

### Three-Strike Rule
When changes result in compilation errors, test failures, or other blocking issues:
1. **First attempt**: Try a straightforward fix
2. **Second attempt**: Try one alternative approach
3. **Third attempt**: Try one more focused solution
4. **After three failures**: STOP, revert changes, reassess, and ask the user how to proceed