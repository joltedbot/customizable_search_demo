# Elastic Search Demo Builder

A cloneable repo for Elastic SAs to quickly build a branded, interactive search demo for any customer — no Elasticsearch infrastructure required.

## What You'll Get

A single-page HTML demo that looks like the customer's own website and walks through four search scenarios:

1. **Lexical (B25)** — Intentionally poor results; shows the limits of keyword-only search
2. **Hybrid Search** — Relevant results via semantic + lexical matching
3. **Hybrid + LTR** — Personalized, reranked results with cross-sell surfacing
4. **GenAI Search** — Curated "kit" + conversational AI follow-up

The demo works entirely offline, requires no server, and is shareable as a single `.html` file.

---

## Quickstart (Under 30 Minutes)

### Prerequisites
- Git
- Claude Code (`claude`) or Gemini CLI — any AI agent that can read files and edit code

### Steps

**1. Clone this repo**
```bash
git clone <repo-url> my-customer-demo
cd my-customer-demo
```

**2. Open your AI agent in this directory**
```bash
claude   # or: gemini
```

**3. Run the setup script**
```
Please read SETUP.md and follow the instructions.
```

**4. Answer the questions** (or pre-fill `SETUP.md` first — see below)

**5. Open your demo**
```bash
open output/demo.html   # or just double-click it
```

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

## Upgrading to Real Elasticsearch (v2)

The demo uses mock data behind a thin function interface. To swap in real Elasticsearch:

- `searchProducts(query, mode, persona)` → replace with Elasticsearch API calls
- `askAgent(query, persona)` → replace with Elastic Agent Builder API endpoint

No UI changes required.
