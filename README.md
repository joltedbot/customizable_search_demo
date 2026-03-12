# Elastic Search Demo Builder

A cloneable repo for Elastic SAs to quickly build a branded, interactive search demo for any customer — in mock mode (no Elasticsearch required) or backed by a live Elastic cluster.

## What You'll Get

A single-page HTML demo that looks like the customer's own website and walks through four search scenarios:

1. **Lexical (B25)** — Intentionally poor results; shows the limits of keyword-only search
2. **Hybrid Search** — Relevant results via semantic + lexical matching
3. **Hybrid + LTR** — Personalized, reranked results with cross-sell surfacing
4. **GenAI Search** — Curated "kit" + conversational AI follow-up

In mock mode, the demo works entirely offline and is shareable as a single `.html` file. In v2 mode, it connects to a live Elasticsearch cluster for real semantic search and AI chat.

---

## Quickstart

### Mock mode (no Elasticsearch required — under 30 minutes)

**Prerequisites:** Git, Claude Code (`claude`) or Gemini CLI

```bash
git clone <repo-url> my-customer-demo
cd my-customer-demo
claude   # or: gemini
```

Then tell the agent:
```
Please read SETUP.md and follow the instructions.
```

Answer the questions, then open the generated file:
```bash
open output/<customer-slug>/demo.html
```

---

### v2 mode (live Elasticsearch + AI chat)

**Additional prerequisites:** Node.js 18+, Elastic Cloud deployment (ES 9.x with ML), an Elastic inference endpoint

```bash
# 1. Validate credentials, then seed the index
cp .env.template .env   # fill in ES_URL, ES_API_KEY, ES_INDEX, ES_API_KEY_READONLY, ES_INFERENCE_URL, ES_INFERENCE_API_KEY
npm install
npm run validate        # pre-flight check — fix any ✗ failures before continuing
npm run setup

# 2. Generate the branded demo (via AI agent)
claude
# → "Please read SETUP.md and follow the instructions."

# 3. Serve and open
npm run dev
open http://localhost:3000/<customer-slug>/demo.html
```

See `SETUP.md` → **v2 Mode** section for CORS configuration and API key setup details.

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
| `image-library.md` | Curated product image URLs organized by category |
| `package.json` | npm scripts: `validate`, `dev`, `setup`, `reset` (v2 mode) |
| `.env.template` | Credentials template — copy to `.env` and fill in (v2 mode) |
| `scripts/validate-env.js` | Pre-flight check: validates all `.env` credentials before setup (v2 mode) |
| `scripts/setup-index.js` | Creates the ES index, deploys ELSER, seeds 75 products (v2 mode) |
| `scripts/data/products.json` | Canonical 75-product athletic/retail dataset (v2 mode) |

---

## Tips

- **Logo**: If you have an SVG file, paste the contents into the config. If not, the AI will generate a simple SVG wordmark from the company name and colors.
- **Colors**: Hex values work best (`#006150`). If you only know the brand name, the AI can look up typical brand colors.
- **Personas**: The demo ships with 3 generic personas. You can provide real buyer archetypes from the customer's own marketing materials for added resonance.
- **Demo queries**: SETUP.md will tell you exactly what to type to trigger each search mode during your demo.

---

## Demo Flow (During a Customer Presentation)

1. Open `demo.html` in a browser — full screen looks best
2. Select a persona from the header (shows "Shopping as: [Name]")
3. Type the **Lexical query** → show poor results, explain why
4. Type the **Hybrid query** → show improved relevance, explain semantic search
5. Switch persona → type the **LTR query** → show personalized results + cross-sell
6. Type the **GenAI query** → show curated kit + use the chat box for a live follow-up
7. Click "Add all to cart" to close the loop

All queries are scripted and printed in the demo file's HTML comments so you can reference them.

---

## v2: Real Elasticsearch

The demo ships with a complete v2 Elasticsearch integration. Mock mode is the default — v2 is enabled by setting `V2_ENABLED = true` and injecting credentials into the output HTML.

**What v2 adds:**
- Lexical mode → BM25 on `name`/`brand` fields, filtered to noise products (guaranteed wrong results)
- Hybrid mode → ELSER semantic + BM25 combined, filtered to real products
- LTR mode → Hybrid base + `function_score` boosting on persona `preferredBrands`, `gender`, and `purchaseHistory`
- GenAI chat → Live responses via Elastic inference API (Claude, Bedrock, Azure OpenAI, etc.)

**Index:** 75 athletic/retail products — 65 real + 10 deliberately wrong-category noise products for the lexical failure demo. ELSER embeddings on the `description.semantic` field power hybrid and LTR modes.

See `SETUP.md` → **v2 Mode** for full setup instructions.
