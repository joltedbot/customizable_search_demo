# AGENTS.md

> User-level CLAUDE.md handles: pnpm/socket aliases, MCP servers,
> elasticsearch-expert subagent, RPI framework, three-strikes rule.
> Do not duplicate those here.
> Note: CLAUDE.md is a symlink to this file. They are the same file.

## Stack

Node 18+, vanilla JS (no TypeScript, no frontend framework), pnpm.
ES client: `@elastic/elasticsearch` 9.x — consult the [JS client docs](https://www.elastic.co/docs/api/doc/elasticsearch-js) for API reference.

## Commands

```
node scripts/validate-env.js          # Pre-flight — always run before touching cluster or inference
pnpm dev                              # Serve the frontend locally (output/ on port 3000)
pnpm run setup -- --slug {name}       # Seed index & Agent (double-dash required for flags)
pnpm run reset -- --slug {name}       # Wipe and reseed index (Agents/Tools preserved)
pnpm run inject -- --slug {name}      # Inject .env credentials into output/{name}/demo.html
pnpm run generate-test                # Inject .env credentials into template for testing
pnpm run sbom                         # Generate CycloneDX SBOM for security audits
```

## Elastic Inference Services

All inference goes through cluster endpoints — do not call Jina or any external API directly.

| Service | Model | Purpose |
|---------|-------|---------|
| Semantic search | jina-embeddings-v5-text-small | Embedding generation |
| Reranking | jina-reranker-v3 | Cross-encoder reranking |
| Conversational AI | Elasticsearch Agent Builder | Multi-turn chat |

## Elasticsearch Agent Builder

The conversational chat feature is powered by Elasticsearch Agent Builder, not a direct LLM API. Configuration lives in the cluster, not in this repo. To inspect or reason about agent configuration use the `elastic-agent-builder` MCP server. Do not guess at agent behaviour — query it.

## Validation Approach

This project has no automated test framework. Quality assurance uses:
- `node scripts/validate-env.js` — automated pre-flight (always run this)
- `docs/genai-boundary-tests.md` — manual checklist for AI agent responses (consult when changing anything that affects chat behaviour)

Do not add Jest, Vitest, or any test framework without flagging to the user. The current approach is intentional for SA demo portability.

## Non-Standard Patterns
- Search Mode Disparity (Noise Filtering): Lexical search (BM25) intentionally includes documents where is_noise: true, while Hybrid, Personalized, and GenAI modes explicitly filter them out.
- GenAI Tool ID Extraction: The tool_result SSE event uses a nested path results[].data.reference.id to provide product IDs.
- Gender-Blind Personalization: The Personalized search mode intentionally removes gender signals from the retrieval process, focusing only on preferredBrands and preferredCategories.
- Progressive GenAI Rendering: Product cards are rendered immediately upon the tool_result event, before the AI's textual response has finished streaming.
- Pre-Injected Persona Context: Persona context (name, tagline, brands) is prepended directly to the user's query string before being sent to the Agent Builder API.
- Industry-Specific Label Overrides: The template uses a specific set of constants (CTA_LABEL, GENAI_TITLE, etc.) that must be swapped for non-retail industries (e.g., Banking or Insurance).
- Manual .env Parsing: All scripts in scripts/ use a custom loadEnv() function instead of the dotenv package.
- The Reset + Generate Loop: Changes to product data (products.json) are not reflected until both pnpm run reset (to update the index) and pnpm run generate-test (to update the HTML tokens) are executed.
- EIS Inference ID Suffixes: All inference IDs must be prefixed with a leading dot (e.g., .jina-reranker-v3).
- Double-Dash Argument Passing: All custom flags (like --slug) must be preceded by a double-dash when run via pnpm (e.g., pnpm run setup -- --slug icbc).
- Brand Safety (Non-Retail): Single-brand industries (Banking, Insurance) must use the customer name as `brand` for all real products. Noise products must use fictional brands. Competitor names in brand fields are prohibited.
- Pexels Image Constraints: Only Pexels CDN links are allowed. Unsplash URLs are prohibited as they go stale. Pexels blocks headless/automated fetches (403); verify IDs manually or via API.
- Z-Index Layer Stack: header=1000 → autocomplete=2000 → search overlay=3000 → genai overlay=4000 → query viewer=5000.
- Agent Builder API Headers: All `POST`/`PUT` calls to `{KIBANA_URL}/api/agent_builder/*` require the `kbn-xsrf: true` header in addition to Authorization.
- Token Syntax: Use `{{ALL_CAPS}}` for credentials in `template/index.html` (replaced by scripts) and `[BRACKET_STYLE]` for AI-facing examples in documentation.
- Dynamic Header Branding: Use CSS variables `--header-bg`, `--header-text`, and `--header-divider` for customer-specific theming. Child elements (logo, switchers) must use `--header-text` to ensure contrast against the dynamic background.
- Kibana API Key is a Separate Key: `kibanaApiKey` in ES_CONFIG must be `KIBANA_API_KEY` from `.env` — NOT `ES_API_KEY_READONLY`. The readonly ES key has zero Kibana application privileges and returns 403 on all `/api/agent_builder/*` calls. The Kibana key requires cluster privilege `monitor_inference`, index privileges `read`/`view_index_metadata`, and Kibana app privileges `feature_agentBuilder.read` + `feature_actions.read` on `space:default`. Create it via Dev Tools: `POST /_security/api_key` with a `role_descriptors.applications` block targeting `kibana-.kibana`. This is confirmed by the Elastic docs troubleshooting page for "API calls return 403 Forbidden in Elastic Agent Builder."
- personas-{slug}.json Must Exist Before Setup: `pnpm run setup -- --slug {slug}` requires `scripts/data/personas-{slug}.json` to exist — the script crashes with ENOENT if it is missing. This file is not auto-generated. Create it before running setup using `scripts/data/personas-banking.json` as the format reference. Fields: id, name, tagline, gender, preferredBrands (use ["CPKC"] or equivalent for non-retail), preferredCategories (use category slugs from products-{slug}.json), purchaseHistory, clickHistory, season.
- Credential Injection for Customer Demos: `generate-test.js` injects into `output/test/demo.html` only. For customer demos in `output/{slug}/demo.html`, use `pnpm run inject -- --slug {slug}` (`scripts/inject-credentials.js`). Run this after the AI agent generates the demo AND after `pnpm run setup` writes `AGENT_ID` to `.env`. Tokens replaced: `{{ES_URL}}`, `{{ES_API_KEY_READONLY}}`, `{{ES_INDEX}}`, `{{KIBANA_URL}}`, `{{KIBANA_API_KEY}}`, `{{AGENT_ID}}`.

## Constraints

- No external hosting, CDN, or cloud deployment — laptop-local only
- Do not add TypeScript — this project is intentionally plain JavaScript
- Do not add a frontend framework — vanilla HTML/CSS/JS is intentional
- Do not embed `ES_API_KEY` (write-access) in output HTML; `ES_API_KEY_READONLY` is safe for ES queries, and `KIBANA_API_KEY` (Kibana-privileged, no ES write access) is safe for Agent Builder calls — both are acceptable in browser HTML
- All Elastic documentation queries go through the elastic-docs MCP server, not web search
- Do not modify `scripts/validate-env.js` without flagging — it is the primary safety check for demo environments
- Do not add dependencies without flagging to the user first

## Autonomous Operation

This project is operated by SAs who may not have deep Node/JS familiarity.
Flag to the user and wait for confirmation before:
- Changing anything that affects cluster connectivity or inference calls
- Adding or removing dependencies
- Modifying any script in `scripts/`
- Any refactor touching more than 3 files

When uncertain whether a change is safe, ask.

## Reference Documentation

Do NOT web search for Elastic documentation — use the elastic-docs MCP server.

| Resource | URL | When to use |
|----------|-----|-------------|
| Elasticsearch JS client | https://www.elastic.co/docs/api/doc/elasticsearch-js | 9.x client API |
| elastic-docs MCP | (via MCP server) | All Elastic product docs |

## Context File Maintenance

Updating AGENTS.md is part of task completion, not optional cleanup.

Add an entry to Non-Standard Patterns when:
- You made an incorrect assumption that caused a wrong edit or broken build
- A pattern in the codebase surprised you and the reason was not obvious
- You were corrected by the user on a design decision

Do not add general JavaScript or Node advice. Do not paraphrase existing entries.
