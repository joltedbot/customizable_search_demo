# Plan: Customizable Search Demo — SETUP.md (Remaining Work)

## Status
- [x] README.md — written
- [x] image-library.md — 80+ curated Unsplash URLs by category
- [x] template/index.html — complete base demo (~1100 lines, fully functional with 4 search modes + persona switcher)
- [ ] SETUP.md — **remaining work, described below**

---

## Customer Directory Structure (new requirement)

Each SETUP.md run should produce output in `output/{customer-slug}/demo.html` so multiple customers don't clobber each other. Example:
```
output/
  acme-sports/
    demo.html          ← generated, self-contained
  techstart-inc/
    demo.html
```

The SA can zip the directory and email it, or open `demo.html` directly.

---

## SETUP.md Plan

SETUP.md is a Markdown file the SA feeds to their AI agent (Claude Code or Gemini CLI). It instructs the AI to:

### Step 1 — Gather customer info
Either read from the pre-filled `## Customer Config` block at the top, or ask conversationally for any missing fields:
- `CUSTOMER_NAME` — e.g. "Acme Sports"
- `CUSTOMER_SLUG` — URL-safe name for directory, e.g. "acme-sports" (AI derives from name if empty)
- `PRIMARY_COLOR` — hex, e.g. "#006150"
- `SECONDARY_COLOR` — hex, e.g. "#F5A623"
- `LOGO` — SVG URL, SVG code, or "generate wordmark" (AI generates simple SVG from name + colors)
- `INDUSTRY` — e.g. "outdoor sporting goods", "consumer electronics", "fashion apparel"
- `PRODUCT_FOCUS` — 1-2 sentence description of what the customer sells
- `PERSONA_1`, `PERSONA_2`, `PERSONA_3` — name, gender, buyer profile (or "use defaults")
- `CHARACTER_NAME` — for the LTR "shopping as" narrative (or leave blank for AI to generate)
- `DEMO_NARRATIVE` — one sentence about the character's goal (e.g. "preparing for a trail race")

### Step 2 — Confirm before generating
AI prints a summary of gathered info and asks: "Ready to generate the demo?" before writing any files.

### Step 3 — Generate output
AI creates `output/{customer-slug}/demo.html` by:
1. Reading `template/index.html`
2. Replacing all `CUSTOMIZE:` blocks with customer-specific content:
   - CSS custom property values
   - Logo SVG in header
   - Nav items appropriate to industry
   - Trending search terms
   - Hero slide copy
   - Product catalog (10-15 products from `image-library.md`)
   - Persona definitions
   - All 4 search result sets (lexical/hybrid/LTR/GenAI)
   - Demo query strings
   - Character name in LTR cross-sell text
   - Footer text / brand name

### Step 4 — Print cheat sheet
After writing the file, AI prints the 4 demo queries so the SA can run the demo immediately.

---

## Key constraints for SETUP.md
- Must work with Claude Code AND Gemini CLI — use plain natural language instructions, no tool-specific syntax
- SA can pre-fill the config block and skip all questions, OR answer them conversationally
- SETUP.md itself has no code — it's instructions for the AI, not code to execute
- Output directory: always `output/{customer-slug}/` relative to repo root

---

## Research Context

An Elastic SA team needs a repeatable, cloneable repo that any SA can use to build a customizable search demo for a specific customer. The demo showcases the progressive value of 4 Elastic search modes. The goal is to make the customer feel like they are looking at something close to their own website — increasing identification and perceived relevance — without requiring real Elasticsearch infrastructure.

## Key Design Decisions

1. **Search modes**: Same 4 as prior art (Lexical, Hybrid, Hybrid+LTR, GenAI)
2. **Backend**: Mock-first. No real Elasticsearch required.
3. **Industry focus**: E-commerce/retail primary. Tight scope.
4. **Images**: Curated list of known-good stock image URLs in `image-library.md`. Upgrade path to Unsplash API if needed.
5. **Site structure**: Single HTML file preferred (self-contained, no server).
6. **Customization flow**: SETUP.md is a template prompt the SA can pre-fill or execute conversationally with their AI agent.
7. **Repo deliverable**: SETUP.md + base HTML template (not generated from scratch each time).

---

## Acceptance Criteria

### AC1 — Repo Structure
- [ ] Repo contains `SETUP.md` and a `template/` directory with the base demo HTML
- [ ] A `README.md` explains the workflow: clone → open AI agent → run SETUP.md
- [ ] Repo is clean enough that an SA unfamiliar with the project can onboard in under 5 minutes

### AC2 — SETUP.md Bootstrap Flow
- [ ] SETUP.md instructs the AI to ask the SA for: customer name, brand colors (primary/secondary), logo (URL or description for SVG generation), product category focus, and character name/scenario
- [ ] SA can pre-fill answers in a "config" section of SETUP.md before running, or answer conversationally during execution
- [ ] SETUP.md is self-contained: no external tools, API keys, or accounts required to execute it
- [ ] After gathering all required info, AI generates a customized demo file based on the base template

### AC3 — Demo Output Quality
- [ ] Output is a single HTML file that opens in any modern browser with no server
- [ ] Customer branding applied throughout: company name, brand colors, logo in header
- [ ] Product catalog (10–15 products) appropriate to the customer's industry
- [ ] Each product card shows a real stock photo (not emoji, not placeholder)

### AC4 — Search Mode Fidelity (4 modes)
- [ ] **Lexical**: Intentionally poor/irrelevant results demonstrating keyword-matching failure
- [ ] **Hybrid**: Relevant results showing semantic understanding of search intent
- [ ] **Hybrid+LTR**: Personalized ranked results + 2–3 cross-sell items; varies per persona
- [ ] **GenAI**: Curated "kit" result set + conversational follow-up with simulated AI responses; varies per persona
- [ ] Mode triggered by keyword routing so SA can script demo flow predictably

### AC4a — User Persona System
- [ ] 2–3 pre-built fake personas selectable via avatar switcher in header
- [ ] Each persona has: gender, purchase history, preferred brands/categories, fixed season (summer)
- [ ] Personas visibly affect Hybrid+LTR results and GenAI kit composition
- [ ] SETUP.md prompts SA to define personas or accepts AI-generated defaults

### AC5 — Product Images
- [ ] `image-library.md` has 50–100 known-good stock image URLs by e-commerce category
- [ ] AI selects appropriate images when generating product catalog
- [ ] All URLs publicly accessible without authentication

### AC6 — Narrative Structure
- [ ] Demo includes a character with name, goal, and scenario appropriate to customer context
- [ ] Character's journey maps to 4 search modes (frustration → improvement → personalization → delight)

### AC7 — Shareability
- [ ] Generated demo HTML shareable via email, Slack, or file transfer
- [ ] No credentials, server, or build tools required to open and run

### AC8 — SA Repeatability
- [ ] SA who has never used the repo can produce a working on-brand demo in under 30 minutes
- [ ] SETUP.md includes quick start — SAs can skip questions by pre-filling the config section
- [ ] Base template is stable — AI customizes it rather than rewriting from scratch

---

## Open Questions / Risks

- **Image URL reliability**: Curated URLs may go dead. Note Unsplash upgrade path.
- **Logo handling**: Fallback: AI generates a simple SVG wordmark from name + colors.
- **SETUP.md AI compatibility**: Must work with Claude Code and Gemini CLI — agent-agnostic instructions.
- **Scope creep risk**: Keep to e-commerce/retail. Resist adding verticals in v1.

## Future Extensibility (v2+ — do not build now)

- **Real Elasticsearch index**: Mock search functions should be swappable for API calls
- **Real Agent Builder**: `askAgent(query, persona)` abstraction for GenAI chat — point at real Agent Builder API in v2
- **Design principle**: Mock data behind thin interface, not hardcoded in event handlers

---

## Implementation Guardrails

- No brand-specific references (prior demo brands/characters) in any repo files cloned by SAs
- All repo files (SETUP.md, README.md, template, image library) must be generic and customer-agnostic

## Phase Status
- Research: COMPLETE — accepted
- Plan: COMPLETE — accepted
- Implementation: PENDING — awaiting user approval to start
