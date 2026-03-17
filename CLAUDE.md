# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Table of Contents
1. [Critical Rules](#critical-rules)
2. [RPI Framework](#rpi-framework-research--plan--implement)
3. [Build Commands](#build-commands)
4. [Architecture Overview](#architecture-overview)
5. [Testing Guidelines](#testing-guidelines)
6. [Code Style Guidelines](#code-style-guidelines)
7. [Communication Style](#communication-style)
8. [General Guidelines](#general-guidelines)

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
- Define **acceptance criteria** — measurable conditions that the final implementation must satisfy. These criteria inform the Plan phase (what stages are needed) and validate the Implement phase (did we succeed). Collaborate with the user to refine criteria before finalizing.
- **STOP:** Present research findings and acceptance criteria, get user confirmation before proceeding to Plan

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
When an approach is repeatedly blocked — whether by compilation errors, test failures, tool rejections, user interruptions, or any other blocker — count each failed or rejected attempt as a strike:
1. **First attempt**: Try a straightforward approach
2. **Second attempt**: Try one alternative approach
3. **Third attempt**: Try one more focused variation
4. **After three failures**: STOP, revert any changes, reassess, and ask the user how to proceed — do not keep retrying the same pattern

## Build Commands

- **Serve demo locally:** `npm run dev` — serves `output/` at `http://localhost:3000`
- **Validate credentials:** `npm run validate` — pre-flight check before seeding (requires `.env`)
- **Seed ES index:** `npm run setup` — creates index, deploys ELSER, loads products (requires `.env`). Pass `-- --slug {name}` to create a customer-specific index `{ES_INDEX}-{name}`
- **Reset ES index:** `npm run reset` — wipes and reseeds (requires `.env`). Pass `-- --slug {name}` to work with customer-specific index
- **Generate test build:** `npm run generate-test` — injects `.env` credentials into template → `output/test/demo.html`

**After changing `products.json` or `products-{slug}.json`:** run `npm run reset` (or `npm run reset -- --slug {name}` for customer-specific data) to push new data to the ES index, then `npm run generate-test` to rebuild the test file. Changes are not reflected until the index is reseeded.

## Architecture Overview

**Purpose:** SAs clone this repo, run `SETUP.md` with an AI agent, and get a branded single-page search demo customised for their customer.

**One mode:**
- **ES mode:** live Elasticsearch (required), `npm run dev` for CORS

**Key files:**
- `template/index.html` — ~2100-line single-file demo with `{{TOKEN}}` placeholders; AI replaces these during SETUP.md execution
- `SETUP.md` — AI execution script; the SA runs this with Claude Code or Gemini CLI
- `image-library/` — pre-curated Pexels image sets (one JSON per industry: consumer-electronics, sporting-goods, clothing-fashion, groceries-food, outdoor-camping)
- `scripts/setup-index.js` — seeds the ES index (run once via `npm run setup`)
- `scripts/data/products.json` — 46-product sporting goods dataset (default for testing); customer-specific data goes in `scripts/data/products-{slug}.json`
- `scripts/generate-test.js` — dev helper: injects `.env` → `output/test/demo.html`
- `.env.template` — credentials template; copy to `.env` before running v2 setup
- `output/{customer-slug}/demo.html` — generated output, gitignored

**Search modes (4):**
1. Lexical — BM25 on `name^3`, `brand^2`, `tags^1`, `category^1`, `description^0.5`; no filtering (returns noise + real products based on keyword match). Broadened fields ensure queries like "camping gear" surface relevant results.
2. Hybrid — RRF (Reciprocal Rank Fusion) merges ELSER semantic and BM25 retrieval, filtered to real products
3. Personalized — RRF (ELSER semantic + BM25 + persona affinity signal) followed by Jina reranker (`.jina-reranker-v3` inference endpoint), personalized by active persona's `preferredBrands`, `purchaseHistory`
4. GenAI — Curated product kit + live chat via Elastic inference API

**Personas (3):** Alex (female), Marcus (male), Sam (neutral) — fixed identities, switcher in header; affect Personalized and GenAI responses

**ES stack:** Cloud Hosted 9.x, `semantic_text` field + ELSER v2 (`.elser-2-elasticsearch`), Jina Reranker v3 (`.jina-reranker-v3`), index `demo-products` (or `demo-products-{slug}` for customer-specific)

**Inference endpoints:**
- **ELSER v2** — semantic embeddings (deployed automatically by `npm run setup`)
- **Jina Reranker v3** — ML-based reranking for personalized mode (deployed via Elastic Inference Service; `npm run setup` auto-creates the endpoint)
- **Completion API** — `POST {ES_URL}/_inference/completion/{id}` — body: `{ input: "..." }`, response: `completion[0].result`. Uses `completion` task type (not `chat_completion`).

**Credentials in output HTML:**
- `ES_API_KEY_READONLY` — baked into demo.html for browser queries (read-only, scoped to index)
- `ES_API_KEY` — write key used only by `npm run setup`, never in output HTML

**CORS:** Configured in Kibana with regex `/https?:\/\/localhost(:[0-9]+)?/`

**Dataset:** 46 products — 36 real sporting goods + 10 noise (`is_noise: true`). Lexical mode searches all products (noise surfaces naturally for broad queries); all other modes filter AWAY from noise. SAs generate custom datasets during SETUP.md from the `image-library/` JSON files. Each customer gets their own `products-{slug}.json` file and ES index `{ES_INDEX}-{slug}`.

**Image library:** 5 pre-curated category sets in `image-library/` (~50 images each). SAs pick a set matching their customer's industry. Images are Pexels CDN links — no local storage, no API keys needed. Extensible: add a new industry by adding a new JSON file.

**RPI plans:** stored in `.claude/plans/` within the repo.

**Key JS state variables in `template/index.html`:**
- `activePersona` — current persona object (alex/marcus/sam); set by persona switcher
- `activeMode` — current search mode string (`'lexical'|'hybrid'|'personalized'|'genai'`); set by mode switcher pills
- `cartItems` — array of cart item objects; drives header badge count and cart drawer

**Z-index layer stack (`template/index.html`):**
header=1000 → autocomplete=2000 → search overlay=3000 → genai overlay=4000. New overlays/drawers should use z-index ≥ 5000.

**Empty state (zero results):** When a search returns no products, `openScenario()` displays a "0 results found" message with the search icon, query text, and suggestion to try a different search term. Improves retail demo UX.

## Testing Guidelines

No automated test suite. Manual testing only:

1. Ensure `.env` is filled in and `npm run setup` has been run successfully (look for `✓ All [N] products indexed successfully`)
2. Run `npm run generate-test` → then `npm run dev`
3. Open `http://localhost:3000/test/demo.html`
4. Verify:
   - **Lexical** returns keyword-matched products (mix of noise and real)
   - **Hybrid** returns only real relevant products (RRF of semantic + keyword)
   - **Personalized** returns top 6 results ranked and reranked by persona affinity (RRF + Jina reranker)
   - **GenAI** returns curated kit and live inference chat response
5. Switch personas and confirm Personalized and GenAI results change

**Note — products come from ES, not the template:** Product data (including image URLs) is served from the Elasticsearch index. Fixing `products.json` or `template/index.html` alone won't be reflected until `npm run reset` reseeds the index.


## Code Style Guidelines

- **Vanilla JS/HTML/CSS only** — no frameworks, no TypeScript, no build step
- **Single-file output** — all JS and CSS must remain inline in `template/index.html`
- **Token format:** `{{ALL_CAPS}}` for credential/config placeholders in `template/index.html`; `[BRACKET_STYLE]` in SETUP.md code examples shown to the AI agent
- **Env vars:** `ALL_CAPS_WITH_UNDERSCORES` (e.g. `ES_INFERENCE_URL`)
- **JS config keys:** camelCase (e.g. `inferenceUrl`, `apiKey`)
- **No new dependencies** without discussion — the project intentionally has minimal deps (`@elastic/elasticsearch`, `serve`)
- **Error handling:** ES calls must show user-friendly error messages on failure (network issues, credentials); never silently fall back
- **Images — Pexels only:** All product images use Pexels CDN. **Never use Unsplash** — their URLs go stale/404. Format: `https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=400&h=480&fit=crop`. Use IDs from `image-library/*.json` files. Verify new IDs with `curl -s -o /dev/null -w "%{http_code}" https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg` before committing.
- **Pexels search pages block automation** — `pexels.com/search/*` returns 403 to headless fetches. Find IDs by browsing manually, using the Pexels API (free key at pexels.com/api/), or verifying candidate IDs with curl as above.
- **Bash variable naming in zsh:** `status` is read-only in zsh — use `code`, `result`, or similar instead. Relevant when writing `curl` status-checking loops.


## Communication Style

- **Concise over exhaustive** — Brief, clear answers; offer to elaborate if needed
- **Design questions**: 2-3 options with 1-2 sentence pros/cons, clear recommendation, ask if more detail needed
- **Implementation**: Step-by-step plans when requested; focus on what and why, not full code blocks unless asked
- **No redundancy**: Reference earlier points rather than restating
- **Scale to scope**: Simple questions get simple answers; complex tasks get detailed plans

## General Guidelines

- Prefer simple, idiomatic solutions
- Ask questions when knowledge of intent improves the solution
- Ask before adding new dependencies
- If architecture makes a solution complex, discuss changes rather than working around issues
- Recommend refactoring separately when found code isn't part of the current task
- If a solution fails multiple times, stop and ask for input
