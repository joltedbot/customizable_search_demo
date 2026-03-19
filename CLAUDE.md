# CLAUDE.md

Project-specific instructions for the Customizable Search Demo. General workflow instructions (Critical Rules, RPI Framework, Communication Style, General Guidelines, Agent Usage Policy) belong in the user's `~/.claude/CLAUDE.md`.

## Build Commands

- **Serve demo locally:** `npm run dev` — serves `output/` at `http://localhost:3000`
- **Validate credentials:** `npm run validate` — pre-flight check before seeding (requires `.env`). Use `--skip-agent` to skip Kibana/Agent Builder checks.
- **Seed ES index:** `npm run setup` — creates product index, persona index, deploys ELSER, loads products, and creates Agent Builder agent + tools via Kibana API (requires `.env`). Pass `-- --slug {name}` for customer-specific indexes. Use `-- --skip-agent` to skip Agent Builder setup.
- **Reset ES index:** `npm run reset` — wipes and reseeds product + persona indexes (requires `.env`). Agent/tools are NOT deleted (SA may have customized). Pass `-- --slug {name}` for customer-specific indexes.
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
- `scripts/setup-index.js` — seeds the ES index, persona index, and creates Agent Builder agent + tools (run once via `npm run setup`)
- `scripts/data/products.json` — 46-product sporting goods dataset (default for testing); customer-specific data goes in `scripts/data/products-{slug}.json`
- `scripts/data/personas.json` — 3 persona documents (alex/marcus/sam) indexed into `demo-personas`
- `scripts/generate-test.js` — dev helper: injects `.env` → `output/test/demo.html`
- `.env.template` — credentials template; copy to `.env` before running v2 setup
- `output/{customer-slug}/demo.html` — generated output, gitignored

**Search modes (4):**
1. Lexical — BM25 on `name^3`, `brand^2`, `tags^1`, `category^1`, `description^0.5`; no filtering (returns noise + real products based on keyword match). Broadened fields ensure queries like "camping gear" surface relevant results.
2. Hybrid — RRF (Reciprocal Rank Fusion) merges ELSER semantic and BM25 retrieval, filtered to real products
3. Personalized — RRF (ELSER semantic + BM25 + persona affinity signal) followed by Jina reranker (`.jina-reranker-v3` inference endpoint), personalized by active persona's `preferredBrands`, `purchaseHistory`
4. GenAI — Dynamic multi-turn chat via Elasticsearch Agent Builder API (SSE streaming with sync fallback); product cards from agent tool results

**Personas (3):** Alex (female), Marcus (male), Sam (neutral) — fixed identities, switcher in header; affect Personalized and GenAI responses

**ES stack:** Cloud Hosted 9.x, `semantic_text` field + ELSER v2 (`.elser-2-elasticsearch`), Jina Reranker v3 (`.jina-reranker-v3`), indexes `demo-products` + `demo-personas` (or `demo-products-{slug}` + `demo-personas-{slug}` for customer-specific)

**Inference endpoints:**
- **ELSER v2** — semantic embeddings (deployed automatically by `npm run setup`)
- **Jina Reranker v3** — ML-based reranking for personalized mode (deployed via Elastic Inference Service; `npm run setup` auto-creates the endpoint)

**Agent Builder API (GenAI mode):**
- **Streaming:** `POST {KIBANA_URL}/api/agent_builder/converse/async` — SSE events: `reasoning`, `tool_call`, `tool_result`, `message_chunk`, `message_complete`, `round_complete`
- **Sync fallback:** `POST {KIBANA_URL}/api/agent_builder/converse` — returns `{ response: { message }, conversation_id }`
- **Headers:** `Authorization: ApiKey {key}`, `kbn-xsrf: true`, `Content-Type: application/json`
- **Management:** `POST /api/agent_builder/agents`, `POST /api/agent_builder/tools` — used by `npm run setup` to create agent + tools

**Credentials in output HTML:**
- `ES_API_KEY_READONLY` — baked into demo.html for both ES queries and Agent Builder conversations (combined read key)
- `ES_API_KEY` — write key used only by `npm run setup`, never in output HTML
- `KIBANA_URL` + `AGENT_ID` — baked into demo.html for GenAI mode

**CORS:** Configured in Kibana with regex `/https?:\/\/localhost(:[0-9]+)?/`

**Dataset:** 46 products — 36 real sporting goods + 10 noise (`is_noise: true`). Lexical mode searches all products (noise surfaces naturally for broad queries); all other modes filter AWAY from noise. SAs generate custom datasets during SETUP.md from the `image-library/` JSON files. Each customer gets their own `products-{slug}.json` file and ES index `{ES_INDEX}-{slug}`.

**Image library:** 5 pre-curated category sets in `image-library/` (~50 images each). SAs pick a set matching their customer's industry. Images are Pexels CDN links — no local storage, no API keys needed. Extensible: add a new industry by adding a new JSON file.

**RPI plans:** stored in `.claude/plans/` within the repo.

**Key JS state variables in `template/index.html`:**
- `activePersona` — current persona object (alex/marcus/sam); set by persona switcher
- `activeMode` — current search mode string (`'lexical'|'hybrid'|'personalized'|'genai'`); set by mode switcher pills
- `cartItems` — array of cart item objects; drives header badge count and cart drawer
- `agentConversationId` — Agent Builder conversation ID for multi-turn GenAI chat; reset on persona switch or new session
- `genaiProducts` — products extracted from agent tool results; used by "Add all to cart"
- `lastSearchQuery` — last query string passed to `openScenario()`; used by View Query button

**Z-index layer stack (`template/index.html`):**
header=1000 → autocomplete=2000 → search overlay=3000 → genai overlay=4000 → query viewer=5000. New overlays/drawers should use z-index ≥ 6000.

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
   - **GenAI** returns streaming Agent Builder response with multi-turn conversation; product cards from tool results
5. Switch personas and confirm Personalized and GenAI results change

**Note — products come from ES, not the template:** Product data (including image URLs) is served from the Elasticsearch index. Fixing `products.json` or `template/index.html` alone won't be reflected until `npm run reset` reseeds the index.

## Code Style Guidelines

- **Vanilla JS/HTML/CSS only** — no frameworks, no TypeScript, no build step
- **Single-file output** — all JS and CSS must remain inline in `template/index.html`
- **Token format:** `{{ALL_CAPS}}` for credential/config placeholders in `template/index.html`; `[BRACKET_STYLE]` in SETUP.md code examples shown to the AI agent
- **Env vars:** `ALL_CAPS_WITH_UNDERSCORES` (e.g. `KIBANA_URL`)
- **JS config keys:** camelCase (e.g. `kibanaUrl`, `apiKey`)
- **No new dependencies** without discussion — the project intentionally has minimal deps (`@elastic/elasticsearch`, `serve`)
- **Error handling:** ES calls must show user-friendly error messages on failure (network issues, credentials); never silently fall back
- **Images — Pexels only:** All product images use Pexels CDN. **Never use Unsplash** — their URLs go stale/404. Format: `https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=400&h=480&fit=crop`. Use IDs from `image-library/*.json` files. Verify new IDs with `curl -s -o /dev/null -w "%{http_code}" https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg` before committing.
- **Pexels search pages block automation** — `pexels.com/search/*` returns 403 to headless fetches. Find IDs by browsing manually, using the Pexels API (free key at pexels.com/api/), or verifying candidate IDs with curl as above.
- **Bash variable naming in zsh:** `status` is read-only in zsh — use `code`, `result`, or similar instead. Relevant when writing `curl` status-checking loops.

## Security Guidelines

- **Content-Security-Policy header** — `template/index.html` includes a CSP meta tag that enforces:
  - Inline scripts/styles allowed (`'unsafe-inline'` for demo context; fine for internal template)
  - External resources restricted to `fonts.googleapis.com`, `fonts.gstatic.com` (fonts only)
  - Elasticsearch and Kibana API calls allowed via `connect-src` with `{{ES_URL}}` and `{{KIBANA_URL}}` tokens
  - Images only from Pexels CDN (`https://images.pexels.com`) + data URIs for generated content
- **XSS protection:** All user-facing product data rendered via `renderProduct()` and `renderGenAIProduct()` must use `escapeHtml()` before inserting into the DOM. This includes: product name, brand, and badge fields.
- **Credentials in output HTML:**
  - `ES_API_KEY_READONLY` — combined read-only key covering both ES index queries and Kibana Agent Builder conversations; safe to embed in browser
  - `ES_API_KEY` (write) — **never embed in output HTML**; use only server-side during `npm run setup`
  - Credential tokens are replaced during SETUP.md execution; never commit `.env` or generated `demo.html` files
