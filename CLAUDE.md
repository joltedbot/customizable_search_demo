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
When an approach is repeatedly blocked — whether by compilation errors, test failures, tool rejections, user interruptions, or any other blocker — count each failed or rejected attempt as a strike:
1. **First attempt**: Try a straightforward approach
2. **Second attempt**: Try one alternative approach
3. **Third attempt**: Try one more focused variation
4. **After three failures**: STOP, revert any changes, reassess, and ask the user how to proceed — do not keep retrying the same pattern

## Build Commands

- **Serve demo locally:** `npm run dev` — serves `output/` at `http://localhost:3000`
- **Seed ES index:** `npm run setup` — creates index, deploys ELSER, loads 75 products (requires `.env`)
- **Reset ES index:** `npm run reset` — wipes and reseeds (requires `.env`)
- **Generate test build:** `npm run generate-test` — injects `.env` credentials into template → `output/test/demo.html` with `V2_ENABLED=true`

No build step for mock mode — open `output/{slug}/demo.html` directly in a browser.

## Architecture Overview

**Purpose:** SAs clone this repo, run `SETUP.md` with an AI agent, and get a branded single-page search demo customised for their customer.

**Two modes — same codebase:**
- **Mock** (`V2_ENABLED = false`, default): fully offline, no ES, opens as `file://`
- **v2** (`V2_ENABLED = true`): live Elasticsearch, requires `npm run dev` for CORS

**Key files:**
- `template/index.html` — ~2600-line single-file demo with `{{TOKEN}}` placeholders; AI replaces these during SETUP.md execution
- `SETUP.md` — AI execution script; the SA runs this with Claude Code or Gemini CLI
- `scripts/setup-index.js` — seeds the ES index (run once via `npm run setup`)
- `scripts/data/products.json` — canonical 75-product athletic/retail dataset
- `scripts/generate-test.js` — dev helper: injects `.env` → `output/test/demo.html`
- `.env.template` — credentials template; copy to `.env` before running v2 setup
- `output/{customer-slug}/demo.html` — generated output, gitignored

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

**RPI plans:** stored in `.claude/plans/` within the repo.

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


## Code Style Guidelines

- **Vanilla JS/HTML/CSS only** — no frameworks, no TypeScript, no build step
- **Single-file output** — all JS and CSS must remain inline in `template/index.html`
- **Token format:** `{{ALL_CAPS}}` for credential/config placeholders in `template/index.html`; `[BRACKET_STYLE]` in SETUP.md code examples shown to the AI agent
- **Env vars:** `ALL_CAPS_WITH_UNDERSCORES` (e.g. `ES_INFERENCE_URL`)
- **JS config keys:** camelCase (e.g. `inferenceUrl`, `apiKey`)
- **No new dependencies** without discussion — the project intentionally has minimal deps (`@elastic/elasticsearch`, `serve`)
- **Mock fallback pattern:** all v2 ES calls must fall back to mock silently on failure; never let a failed ES call break the demo
- **Images — Pexels only:** All product images use Pexels CDN. **Never use Unsplash** — their URLs go stale/404. Format: `https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=400&h=480&fit=crop`. Use IDs from `image-library.md`. Verify new IDs with `curl -I` before committing.


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
