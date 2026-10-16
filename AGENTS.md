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
- Semantic Field Image Input Format: The `semantic` field type supports multimodal input but requires an object format — NOT a plain string. Index images as `{ type: 'image', value: 'data:image/jpeg;base64,...' }` and audio as `{ type: 'audio', value: 'data:audio/mpeg;base64,...' }`. Passing the data URL as a bare string causes a 400 inference_exception. knn queries use the same object format in `query_vector_builder.embedding.input`.
- Credential Injection for Customer Demos: `generate-test.js` injects into `output/test/demo.html` only. For customer demos in `output/{slug}/demo.html`, use `pnpm run inject -- --slug {slug}` (`scripts/inject-credentials.js`). Run this after the AI agent generates the demo AND after `pnpm run setup` writes `AGENT_ID` to `.env`. Tokens replaced: `{{ES_URL}}`, `{{ES_API_KEY_READONLY}}`, `{{ES_INDEX}}`, `{{KIBANA_URL}}`, `{{KIBANA_API_KEY}}`, `{{AGENT_ID}}`.
- **Setup Overwrites the Single AGENT_ID Slot**: `pnpm run setup` writes one `AGENT_ID` line in `.env` shared by all slugs, and DAM slugs (`DAM_SLUGS` in `scripts/setup-index.js`: terentia, museum) get Agent/Tool ids `demo-search-assistant-<slug>` / `demo-collection-search-<slug>` via `agentIdFor()`/`toolIdFor()` — a user-chosen `AGENT_ID` is replaced and ids you assume (e.g. `demo-shopping-assistant-<slug>`) will not exist for DAM slugs. — Why the naive alternative is wrong: the ids look hard-coded and per-slug, but `.env` holds only the last one written.
  Do NOT re-run setup for slug `terentia` (it would create differently named objects), and do NOT delay `pnpm run inject -- --slug {slug}` after setup for the same slug.
- **Output Pages Contain Live Credentials When Copied**: after `pnpm run inject`, `output/{slug}/demo.html` holds real keys, so copying it to start another demo carries them over. — Why the naive alternative is wrong: a copy looks ready to use, but inject only substitutes `{{TOKENS}}`, and setup creates the index as `${ES_INDEX}-${slug}`.
  Do NOT copy an injected page without re-tokenising ES_CONFIG (`{{ES_URL}}`, `{{ES_API_KEY_READONLY}}`, `{{KIBANA_URL}}`, `{{KIBANA_API_KEY}}`, `{{AGENT_ID}}`), setting `index: '{{ES_INDEX}}-<slug>'`, and using `{{ES_URL}} {{KIBANA_URL}}` (not `https:`) in the CSP `connect-src`.
- **Agent Shell Has No Network**: agent-run shell commands cannot reach the cluster or the Met API (sandbox), so setup, validate-env, and metmuseum fetches fail there. — Why the naive alternative is wrong: retrying or debugging credentials will not help.
  Do NOT treat a network failure from an agent shell as a config bug; ask the user to run the command via `! <command>`. Also, `validate-env.js` reporting AGENT_ID failed / index not found before a slug's first setup is expected (it checks the base ES_INDEX name).
- **Search Overlay Must Be Opened for New Result Paths**: `searchResultsGrid` lives inside `#searchOverlay`. Rendering results into the grid without first calling `searchOverlay.classList.add('open')` produces a populated but invisible grid — the overlay stays closed. — Why the naive alternative is wrong: result-rendering functions look standalone; the overlay open/close contract is implicit and not co-located with the grid write.
  Do NOT write results to `searchResultsGrid` from a new search mode without also opening `#searchOverlay`.
- **Template Retail Constants Survive a Branding Pass**: `PRODUCTS`, `SUGGESTIONS`, and `FILTER_CHIPS` JS constants in the generated demo are seeded with retail content (e.g., "Nike Running Shoes") — a colour/logo/company-name sweep leaves them untouched, producing retail product names on a non-retail homepage. — Why the naive alternative is wrong: a branding pass naturally targets visual tokens; data constants look like application logic and are easy to miss.
  Do NOT consider a non-retail demo complete after replacing only colours, logos, and company name — sweep and replace all retail content constants.
- **Query Viewer Requires Explicit Branch per Search Mode**: `buildEsQuery()` in the demo has no fallback-safe dispatch — unhandled modes silently fall through and the query viewer renders the wrong query body (e.g., RRF body for a knn-only mode). — Why the naive alternative is wrong: the search execution path and the query viewer path are separate; adding a mode to one does not add it to the other.
  Do NOT add a new search mode without also adding a matching branch to the query viewer rendering logic.

## Met Museum Source Data

The `metmuseum-objects` cluster index was REMOVED by the user (sharding issues). Do NOT query it via MCP tools — it fails with index_not_found. The source is the local CSV `metmuseum/openaccess/MetObjects.csv` (317 MB — stream it, never load it whole). The CSV has metadata only: no image URLs and no description text.

**Image URLs:** Fetch per object: `GET https://collectionapi.metmuseum.org/public/collection/v1/objects/{object_id}` returns `primaryImageSmall` and `primaryImage`. The API rate-limits bulk fetching (empty responses under load; 429/5xx are transient, not "no image"). 403 means the image is restricted — treat as "no image available" (common: only 41 of 149 photograph candidates had images). `node metmuseum/build-museum-products.js` already handles this for the museum demo.

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
