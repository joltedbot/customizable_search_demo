# Elastic Search Demo Builder

A cloneable repo for Elastic SAs to quickly build a branded, interactive search demo for any customer — backed by a live Elastic Cloud cluster with semantic search, ML reranking, and AI chat.

## What You'll Get

A single-page HTML demo that looks like the customer's own website and walks through four search scenarios:

1. **Lexical (BM25)** — Intentionally poor results; shows the limits of keyword-only search
2. **Hybrid Search** — Relevant results via semantic (Jina Embeddings) + lexical (BM25) matching using RRF
3. **Personalized Search** — Linear retriever with 3 weighted branches (persona-brand semantic, general semantic, BM25 keyword), ML-reranked by Jina Reranker v3
4. **GenAI Chat** — Multi-turn conversational search via Elasticsearch Agent Builder with side-by-side layout: chat conversation on left, product recommendations on right, allowing parallel browsing and follow-up questions

The demo connects to a live Elasticsearch Cloud cluster for real semantic search, AI-powered reranking, and Kibana-hosted AI agents.

---

## Requirements

Install the following before starting:

| Requirement | Why | Install |
|---|---|---|
| **Node.js 18+** | Runs setup scripts, seeds Elasticsearch, serves the demo locally | [nodejs.org](https://nodejs.org/) or `brew install node` |
| **pnpm** | Installs dependencies and runs project scripts | `npm install -g pnpm` or `brew install pnpm` |
| **Claude Code** or **Gemini CLI** | AI agent that reads `SETUP.md` and generates the branded demo | `npm install -g @anthropic-ai/claude-code` or [Gemini CLI docs](https://github.com/google-gemini/gemini-cli) |
| **Elastic Cloud deployment** | ES 9.x with ML nodes enabled — hosts the search index, inference endpoints, and Agent Builder | [cloud.elastic.co](https://cloud.elastic.co/) |
| **Jina Embeddings v5 Text-Small** | Semantic embeddings for hybrid and personalized search | Deployed via Elastic Inference Service in your cluster |
| **Jina Reranker v3** | ML cross-encoder reranking for personalized search | Deployed via Elastic Inference Service in your cluster |
| **Three Elasticsearch/Kibana API keys** | Write key (setup only, kept in the macOS Keychain, never in `.env`) + read-only ES key + Kibana key (both written to the gitignored `config.js`) — exact JSON permissions are in `.env.template` | Created in Kibana → Stack Management → API Keys; see [`SECRETS.md`](SECRETS.md) |
| **Kibana CORS enabled** | Allows `localhost` to call ES and Agent Builder APIs | See `SETUP.md` → Elasticsearch Setup for the regex pattern |
| **LLM connector in Kibana** | Powers the GenAI chat mode via Agent Builder | Configured in Kibana → Stack Management → Connectors |

> **Already have git?** You're good — it's the only tool we assume is pre-installed.

---

## Quickstart

**Prerequisites:** See [Requirements](#requirements) above.

```bash
git clone <repo-url> my-customer-demo
cd my-customer-demo

# 1. Configure credentials and seed the index
cp .env.template .env   # fill in ES_URL, ES_INDEX, ES_API_KEY_READONLY, KIBANA_URL, KIBANA_API_KEY (exact key JSON in .env.template)
security add-generic-password -s customizable-search-demo -a ES_API_KEY -w   # write key goes in the Keychain, not .env (prompts for the value)
pnpm install
pnpm run hooks          # one-time: enable the pre-commit secret guard (needs: brew install gitleaks)
pnpm run validate -- --slug <customer-slug>   # pre-flight check — fix any ✗ failures before continuing
pnpm run setup -- --slug <customer-slug>      # creates ES indexes, Agent Builder agent + tools, writes output/<slug>/demo.config.json
# To skip agent creation: pnpm run setup -- --slug <customer-slug> --skip-agent

# 2. Generate the branded demo (via AI agent)
claude   # or: gemini
# → "Please read SETUP.md and follow the instructions."

# 3. Serve and open
pnpm run inject -- --slug <customer-slug>   # writes the gitignored output/<slug>/config.js with the browser credentials
pnpm dev
open http://localhost:3000/<customer-slug>/demo.html
```

See `SETUP.md` → **Elasticsearch Setup** section for CORS configuration and API key setup details, and [`SECRETS.md`](SECRETS.md) for how credentials are stored, rotated, and kept out of git.

---

## Pre-filling the Config (Faster)

Open `SETUP.md` and fill in the `## Customer Config` section before running the AI agent. Any fields you fill in will be used directly; the agent will only ask about missing ones.

---

## Repo Contents

| File / Directory | Purpose |
|---|---|
| `README.md` | This file |
| `SETUP.md` | AI execution script — run this with your AI agent |
| `template/index.html` | Base demo template the AI customizes |
| `image-library/` | Pre-curated Pexels image sets (one JSON per industry) |
| `package.json` | pnpm scripts: `validate`, `dev`, `setup`, `reset`, `inject`, `generate-test`, `hooks`, `test:guard` |
| `SECRETS.md` | Secrets handling: where each key lives, rotation, least-privilege keys, the pre-commit guard, migrating existing demos |
| `.githooks/`, `.gitleaks.toml` | Tracked pre-commit secret guard (path rule + gitleaks); enable with `pnpm run hooks` |
| `.env.template` | Credentials template — copy to `.env` and fill in: ES_URL, ES_INDEX (base prefix), ES_API_KEY_READONLY (read-only ES key), KIBANA_URL, KIBANA_API_KEY. The write key `ES_API_KEY` is NOT stored in `.env` (macOS Keychain or env var). Per-demo ids live in `output/<slug>/demo.config.json`. Exact permission JSON for each key is in the template comments. |
| `scripts/validate-env.js` | Pre-flight check: validates `.env` credentials and the write key before setup; `--slug <name>` checks that demo's index and agent; `--skip-agent` skips Agent Builder checks |
| `scripts/setup-index.js` | Creates the ES index, deploys Jina Embeddings inference endpoint, seeds products, and auto-creates Agent Builder agent + tools. Supports `--slug {name}` for customer-specific indices and `--skip-agent` to reuse an existing agent (v2 mode); writes `output/{name}/demo.config.json` |
| `scripts/inject-credentials.js` | Writes `output/<slug>/config.js` (gitignored) from `.env` + `demo.config.json`; `--slug <name>` or `--all` |
| `scripts/data/products.json` | 46-product sporting goods base dataset (v2 mode); customer-specific data in `products-{slug}.json` (gitignored) |
| `scripts/data/personas.json` | 3 persona documents (Alex, Marcus, Sam) seeded into `demo-personas` ES index for Agent Builder to reference (v2 mode) |
| `docs/genai-boundary-tests.md` | Manual test checklist with 35 prompts to verify the Agent Builder agent rejects off-topic queries and only assists with product search |
| `docs/elasticsearch-reference.md` | Complete reference of all ES index mappings, inference endpoints, and query structures |
| `docs/search-flow-walkthrough.md` | Step-by-step execution trace for Personalized and GenAI search modes with inline code examples |

---

## Tips

- **Logo**: If you have an SVG file, paste the contents into the config. If not, the AI will generate a simple SVG wordmark from the company name and colors.
- **Colors**: Hex values work best (`#006150`). If you only know the brand name, the AI can look up typical brand colors.
- **Personas**: The demo ships with 3 generic personas. You can provide real buyer archetypes from the customer's own marketing materials for added resonance.
- **Demo queries**: SETUP.md will tell you exactly what to type to trigger each search mode during your demo.

---

## Demo Query Guide

The demo tells a story in four acts: **same query, progressively better results**. The key move is using the **same query** for Lexical and Hybrid — the audience sees identical input produce dramatically different output.

### Story arc

1. **Lexical** — Type a broad, natural query (e.g., `outdoor gear`). Results are noise: wrong-category products that happen to keyword-match. Point out how keyword search fails for natural language.
2. **Hybrid** — Type the **exact same query**. Results flip to relevant products. Explain how semantic search (Jina Embeddings) combined with keyword search (BM25) via RRF understands intent, not just keywords.
3. **Personalized** — Switch persona, type a personalization query (e.g., `gear for me`). Results are tailored to that persona's brands, gender, and purchase history, reranked by the Jina ML model. Switch personas again to show different results.
4. **GenAI** — Type a kit-building query (e.g., `complete training kit`). Show the curated product bundle + use the chat box for a live follow-up question.

### Recommended queries by category

Use these queries to demonstrate each search mode. The **Lexical + Hybrid** query should produce visibly different results between the two modes. The **Personalized** queries show how persona brands and activity history drive results; switch personas to see different recommendations.

| Category | Lexical + Hybrid | Personalized (Query 1) | Personalized (Query 2) | GenAI |
|---|---|---|---|---|
| **Sporting Goods** | `outdoor gear` | `training gear` | `shoes and accessories` | `put together a training kit` |
| **Consumer Electronics** | `smart devices` | `office equipment` | `audio gear` | `build a home office setup` |
| **Clothing & Fashion** | `everyday wear` | `footwear and bags` | `outerwear` | `create a summer outfit` |
| **Groceries & Food** | `kitchen essentials` | `beverages and snacks` | `cooking ingredients` | `plan a dinner party menu` |
| **Outdoor & Camping** | `camping gear` | `sleeping and shelter` | `hiking and adventure` | `prepare a camping trip` |

#### Persona-Driven Personalized Results

The three personas have distinct preferred brands and activity histories:

- **Alex** (Competitive runner) — Nike, On Running, Puma, Oakley — sports and performance focus
- **Marcus** (Trail runner & adventurer) — TrailTech, The North Face, Osprey, Hydro Flask — rugged outdoor gear
- **Sam** (Home fitness) — Nike, Under Armour, Adidas, IronForge — gym equipment and training gear

For example, with `training gear`:
- **Alex** gets running shoes, athletic apparel, and performance accessories
- **Marcus** gets trail boots, outdoor packs, and adventure-grade equipment
- **Sam** gets dumbbells, mats, gym apparel, and home fitness gear

Switch personas in the header before searching to see how the same query returns different personalized results.

### Key products to ad-lib with

When the audience asks "what else can I search for?", these work well for live demos:

| Category | Real products (Hybrid/Personalized) | Noise products (Lexical) |
|---|---|---|
| Sporting Goods | running shoes, dumbbells, tennis rackets, cycling helmets, boxing gloves, yoga mats, backpacks, sunglasses | racing helmets, saddles, fishing rods, RC trucks |
| Consumer Electronics | laptops, headphones, earbuds, smartwatches, speakers, monitors, keyboards, mice | toasters, digital pianos, car stereos |
| Clothing & Fashion | shirts, sneakers, jackets, dresses, sunglasses, watches, bags, hats | fabric bolts, sewing kits, costumes |
| Groceries & Food | coffee, bread, cheese, chocolate, pasta, craft beer, produce, olive oil | dog food, cleaning supplies, garden tools |

### Presentation tips

- Open `demo.html` full screen for best visual impact
- Select a persona from the header before starting (shows "Shopping as: [Name]")
- After the Personalized demo, click "Add all to cart" to close the loop
- Use the "View Query" button (top right) to inspect the ES query or Agent Builder payload behind each search mode — great for technical audiences
- The console cheat sheet (open DevTools) lists all demo queries for quick reference

### Security

The template includes:
- **Content-Security-Policy header** — restricts inline scripts, external resources, and enforces HTTPS for Elasticsearch and Kibana connections
- **XSS protection** — all user-facing product data (name, brand, badge) is HTML-escaped before rendering to prevent injection attacks
- **Read-only credentials in browser** — only `ES_API_KEY_READONLY` (read-only, scoped to `demo-*` indices) and `KIBANA_API_KEY` reach the browser, via the gitignored `output/<slug>/config.js`; `demo.html` holds no credentials. The write key (`ES_API_KEY`) lives in the macOS Keychain, is used only by setup, and never appears in output. See [`SECRETS.md`](SECRETS.md)

---

## Commands Reference

All commands are run from the repo root using pnpm. Customer-specific commands use the `--slug` flag.

| Command | What it does | When to use |
|---|---|---|
| `pnpm install` | Installs project dependencies (`@elastic/elasticsearch`, `serve`) | Once after cloning, or after pulling changes that update `package.json` |
| `pnpm run validate` | Pre-flight check — verifies `.env` credentials, the write key (Keychain or `ES_API_KEY` env var), ES connectivity, inference endpoints, and Agent Builder access | Before first `pnpm run setup`, or after changing credentials. Add `-- --slug <name>` to check that demo's index and agent, `-- --skip-agent` to skip Kibana/Agent Builder checks |
| `pnpm run setup -- --slug <name>` | Creates ES product + persona indexes, deploys Jina Embeddings inference endpoint, seeds products, and creates/updates Agent Builder agent + tools | Once per customer to initialize the cluster (`--slug` is required). Add `-- --skip-agent` to skip Agent Builder setup |
| `pnpm run reset -- --slug <name>` | Wipes and reseeds product + persona indexes (does **not** delete the Agent Builder agent/tools) | After editing `products.json` or `products-{slug}.json` to push updated data to ES (`--slug` is required) |
| `pnpm run inject` | Writes the gitignored `output/<slug>/config.js` (browser credentials from `.env` plus ids from `demo.config.json`) | After `pnpm run setup -- --slug <name>` and whenever a key is rotated. Use `-- --slug <name>` or `-- --all` |
| `pnpm run generate-test` | Copies the template to `output/test/demo.html` and writes the gitignored `output/test/config.js` from `.env` | For local testing — run after `pnpm run setup` or `pnpm run reset` to get a working demo without running the AI agent |
| `pnpm run hooks` | Sets `core.hooksPath` to `.githooks` to enable the pre-commit secret guard | Once per clone (needs `brew install gitleaks`); see [`SECRETS.md`](SECRETS.md) |
| `pnpm run test:guard` | Self-test of the pre-commit guard in a temp repo | After enabling the hook, or after editing `.githooks/` or `.gitleaks.toml` |
| `pnpm dev` | Starts a local web server serving the `output/` directory on `http://localhost:3000` | Whenever you want to view the demo in a browser (works for both test and customer builds) |
| `pnpm run sbom` | Generates a CycloneDX SBOM file (`sbom.cdx.json`) listing all project dependencies | For security and compliance audits; output is gitignored |

**Typical workflows:**

- **First-time setup:** `pnpm install` → `pnpm run hooks` → `pnpm run validate -- --slug <name>` → `pnpm run setup -- --slug <name>` → run AI agent with `SETUP.md` → `pnpm run inject -- --slug <name>` → `pnpm dev`
- **Updated product data:** Edit `products.json` → `pnpm run reset -- --slug <name>` → `pnpm run generate-test` (for test build) → `pnpm dev`
- **Quick local test (no AI agent):** `pnpm run generate-test` → `pnpm dev` → open `http://localhost:3000/test/demo.html`

---

## Search Architecture

The demo uses Elasticsearch Cloud (9.3+ with ML) for all search modes:

**Lexical mode** — BM25 on `name`, `brand`, `tags`, `category`, `description` fields, no filtering. Noise products surface naturally for broad queries.

**Hybrid mode** — RRF (Reciprocal Rank Fusion) merges Jina Embeddings semantic vectors and BM25 keyword retrieval, filtered to real products only.

**Personalized mode** — Linear retriever with 3 weighted branches: (1) persona-brand-filtered semantic search with activity-aware query expansion (e.g., "running shoes for trail runner and outdoor adventurer"), weight 3.0; (2) general semantic search, weight 1.0; (3) BM25 keyword search, weight 0.8. Scores normalized via minmax, then reranked by Jina Reranker v3 (a real ML cross-encoder running on Elastic Inference Service) to refine order based on persona brands, gender, and purchase history.

**GenAI chat** — Multi-turn conversational AI via Elasticsearch Agent Builder with a side-by-side layout: chat conversation on the left, product cards on the right. Products are fetched from Agent Builder tool results in real time as the agent responds, allowing users to browse recommendations while reading the AI's response. SAs can customize the agent's system prompt, tools, and LLM connector in Kibana after setup.

**Dataset:** 46 products — 36 real sporting goods + 10 intentional noise products. The noise products only surface in lexical mode; all other modes filter them away.

See `SETUP.md` for full implementation details and setup instructions.
