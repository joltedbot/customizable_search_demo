# Elastic Search Demo Builder

A cloneable repo for Elastic SAs to quickly build a branded, interactive search demo for any customer — backed by a live Elastic Cloud cluster with semantic search, ML reranking, and AI chat.

## What You'll Get

A single-page HTML demo that looks like the customer's own website and walks through four search scenarios:

1. **Lexical (BM25)** — Intentionally poor results; shows the limits of keyword-only search
2. **Hybrid Search** — Relevant results via semantic (Jina Embeddings) + lexical (BM25) matching using RRF
3. **Personalized Search** — RRF-merged results from 3 retrievers (semantic + lexical + persona affinity), ML-reranked by Jina Reranker v3
4. **GenAI Chat** — Multi-turn conversational search via Elasticsearch Agent Builder, with dynamic product recommendations

The demo connects to a live Elasticsearch Cloud cluster for real semantic search, AI-powered reranking, and Kibana-hosted AI agents.

---

## Quickstart

**Prerequisites:** Git, Node.js 18+, Claude Code (`claude`) or Gemini CLI, Elastic Cloud deployment (ES 9.x with ML), Jina Embeddings v5 Text-Small available via Elastic Inference Service, Jina Reranker v3 available via Elastic Inference Service, two API keys (write + read-only — exact JSON in `.env.template`), Kibana CORS enabled for localhost, LLM connector configured in Kibana

```bash
git clone <repo-url> my-customer-demo
cd my-customer-demo

# 1. Configure credentials and seed the index
cp .env.template .env   # fill in ES_URL, ES_API_KEY, ES_INDEX, ES_API_KEY_READONLY, KIBANA_URL (+ AGENT_ID if reusing existing agent; exact key JSON in .env.template)
npm install
npm run validate        # pre-flight check — fix any ✗ failures before continuing
npm run setup           # creates ES index, products index, Agent Builder agent + tools
# For customer-specific index: npm run setup -- --slug <customer-slug>
# To skip agent creation: npm run setup -- --slug <customer-slug> --skip-agent

# 2. Generate the branded demo (via AI agent)
claude   # or: gemini
# → "Please read SETUP.md and follow the instructions."

# 3. Serve and open
npm run dev
open http://localhost:3000/<customer-slug>/demo.html
```

See `SETUP.md` → **Elasticsearch Setup** section for CORS configuration and API key setup details.

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
| `package.json` | npm scripts: `validate`, `dev`, `setup`, `reset` (v2 mode) |
| `.env.template` | Credentials template — copy to `.env` and fill in: ES_URL, ES_API_KEY (write), ES_INDEX, ES_API_KEY_READONLY (read — covers ES + Kibana), KIBANA_URL, AGENT_ID (auto-populated). Exact permission JSON for both keys is in the template comments. |
| `scripts/validate-env.js` | Pre-flight check: validates all `.env` credentials before setup (v2 mode); `--skip-agent` flag to skip Agent Builder checks |
| `scripts/setup-index.js` | Creates the ES index, deploys Jina Embeddings inference endpoint, seeds products, and auto-creates Agent Builder agent + tools. Supports `--slug {name}` for customer-specific indices and `--skip-agent` to reuse an existing agent (v2 mode) |
| `scripts/data/products.json` | 46-product sporting goods base dataset (v2 mode); customer-specific data in `products-{slug}.json` (gitignored) |
| `scripts/data/personas.json` | 3 persona documents (Alex, Marcus, Sam) seeded into `demo-personas` ES index for Agent Builder to reference (v2 mode) |

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

| Category | Lexical + Hybrid | Personalized | GenAI |
|---|---|---|---|
| Sporting Goods | `outdoor gear` | `gear for me` | `put together a training kit` |
| Consumer Electronics | `smart devices` | `tech for me` | `build a home office setup` |
| Clothing & Fashion | `everyday wear` | `style for me` | `create a summer outfit` |
| Groceries & Food | `kitchen essentials` | `picks for me` | `plan a dinner party menu` |

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
- **Read-only credentials in browser** — only `ES_API_KEY_READONLY` (read-only, scoped to index) and `KIBANA_API_KEY` are exposed in the generated demo; the write key (`ES_API_KEY`) is used only server-side during setup and never baked into output HTML

---

## Search Architecture

The demo uses Elasticsearch Cloud (9.x with ML) for all search modes:

**Lexical mode** — BM25 on `name`, `brand`, `tags`, `category`, `description` fields, no filtering. Noise products surface naturally for broad queries.

**Hybrid mode** — RRF (Reciprocal Rank Fusion) merges Jina Embeddings semantic vectors and BM25 keyword retrieval, filtered to real products only.

**Personalized mode** — RRF merges 3 retrievers: Jina Embeddings semantic, BM25 keyword, and persona affinity signal. Results are then reranked by Jina Reranker v3 (a real ML cross-encoder running on Elastic Inference Service) to refine order based on persona brands, gender, and purchase history.

**GenAI chat** — Multi-turn conversational AI via Elasticsearch Agent Builder. The agent dynamically retrieves products and answers follow-up questions. SAs can customize the agent's system prompt, tools, and LLM connector in Kibana after setup.

**Dataset:** 46 products — 36 real sporting goods + 10 intentional noise products. The noise products only surface in lexical mode; all other modes filter them away.

See `SETUP.md` for full implementation details and setup instructions.
