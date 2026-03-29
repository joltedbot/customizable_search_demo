# SETUP.md — Elastic Search Demo Generator

**You are an AI agent.** Follow the steps in this file to generate a customized search demo for a specific customer. Read every section before you begin.

---

## Customer Config

Fill in the fields below before running this file. Leave any field blank to be asked conversationally.

```
CUSTOMER_NAME:
CUSTOMER_SLUG:
PRIMARY_COLOR:
SECONDARY_COLOR:
HEADER_BG_COLOR:
LOGO:
INDUSTRY:
PRODUCT_FOCUS:
PERSONA_1:
PERSONA_2:
PERSONA_3:
DEMO_NARRATIVE:
```

**Field reference:**

| Field | Description | Example |
|---|---|---|
| `CUSTOMER_NAME` | Company name as it appears in the UI | `Acme Sports` |
| `CUSTOMER_SLUG` | URL-safe folder name (derive from name if blank) | `acme-sports` |
| `PRIMARY_COLOR` | Main brand color — buttons, active states | `#006150` |
| `SECONDARY_COLOR` | Accent color — CTAs, highlights | `#F5A623` |
| `HEADER_BG_COLOR` | Header/nav bar background from customer's website (defaults to `#ffffff`) | `#1a1a1a` |
| `LOGO` | One of: SVG URL, raw SVG code, or `"generate wordmark"` | `generate wordmark` |
| `INDUSTRY` | Short description of what the company does | `outdoor sporting goods` |
| `PRODUCT_FOCUS` | 1–2 sentences on what the customer sells | `Premium trail running and outdoor apparel` |
| `PERSONA_1/2/3` | Name, gender (female/male/neutral), and buyer profile — or `"use defaults"` | `Jordan, female, competitive trail runner` |
| `DEMO_NARRATIVE` | One sentence about the demo scenario goal | `preparing for a summer trail race` |

---

## Elasticsearch Setup (Required)

The demo runs against a real Elasticsearch cluster with semantic search and live AI responses. Complete these pre-steps before proceeding to Step 1.

**Prerequisites:** Node.js 18+, Elastic Cloud deployment (ES 9.x with ML), ELSER v2 deployed as an inference endpoint, Jina Reranker v3 (`.jina-reranker-v3`) deployed in Kibana ML Trained Models, two API keys (exact JSON provided below), Kibana CORS enabled for localhost origins, and an LLM connector configured in Kibana (GenAI Settings → Default AI Connector).

### v2-A — Configure credentials

```bash
cp .env.template .env
```

Fill in `.env` — you need exactly **two API keys** and a Kibana URL:

- `ES_URL` — your Cloud deployment URL
- `ES_INDEX` — leave as `demo-products` or choose your own name
- `KIBANA_URL` — your Kibana URL (e.g., `https://cloud-deployment-id.kb.us-central1.gcp.cloud.es.io`)
- `AGENT_ID` — leave blank; auto-written by `npm run setup` after agent creation

**`ES_API_KEY` — write key, used only by `npm run setup`. Never baked into HTML.**
Create in Kibana: Stack Management → API Keys → Create API key, paste this JSON into "Restrict privileges":
```json
{
  "demo-setup": {
    "cluster": ["monitor_inference"],
    "indices": [
      { "names": ["*"], "privileges": ["all"] }
    ],
    "applications": [
      { "application": "kibana-.kibana", "privileges": ["manage_onechat"], "resources": ["*"] }
    ]
  }
}
```

**`ES_API_KEY_READONLY` — read-only key, baked into the demo HTML for ES queries and Agent Builder conversations.**
Create in Kibana: Stack Management → API Keys → Create API key, paste this JSON into "Restrict privileges":
```json
{
  "demo-readonly": {
    "cluster": ["monitor_inference"],
    "indices": [
      { "names": ["*"], "privileges": ["read", "view_index_metadata"] }
    ],
    "applications": [
      { "application": "kibana-.kibana", "privileges": ["feature_agentBuilder.read", "feature_actions.read"], "resources": ["*"] }
    ]
  }
}
```

### v2-B — Validate credentials and seed the index

```bash
npm install
npm run validate
```

This checks that all `.env` values are set, the cluster is reachable, both API keys work, and Kibana is reachable. Fix any `✗` failures before continuing.

```bash
npm run setup
```

This creates the index, enables ELSER semantic embeddings, bulk-loads the product dataset, and auto-creates the Agent Builder agent + tools via the Kibana API. Confirm the output shows `✓ All [N] products indexed successfully` and `✓ Agent Builder setup complete`. The `AGENT_ID` will be auto-written to `.env`. Run `npm run setup -- --slug {name} --skip-agent` to skip agent creation and use an existing agent.

### v2-C — Configure CORS (Elasticsearch)

In Kibana: **Stack Management → Elasticsearch → Edit deployment settings**, add:

```yaml
http.cors.enabled: true
http.cors.allow-origin: ["/https?:\\/\\/localhost(:[0-9]+)?/"]
http.cors.allow-headers: "X-Requested-With, Content-Type, Content-Length, Authorization"
```

### v2-D — Configure Kibana CORS (for Agent Builder)

In Kibana: **Stack Management → Advanced Settings**, search for `csp.strict` and set to `false` to allow Agent Builder API access from localhost demo URLs. Alternatively, verify your Kibana deployment allows CORS from localhost origins.

### Pre-step E — Note for Step 3

During Step 3, you (the AI agent) will inject the credentials into the output file. Before proceeding to Step 1, read `.env` and store the following values for use in step 3p:
- `ES_URL`, `ES_API_KEY_READONLY`, `ES_INDEX`, `KIBANA_URL`, `AGENT_ID`

Note: `ES_INDEX` is a base name. The actual index will be `{ES_INDEX}-{CUSTOMER_SLUG}` (e.g., if `ES_INDEX=demo-products` and `CUSTOMER_SLUG=acme-sports`, the index is `demo-products-acme-sports`).

---

## Step 1 — Gather Info

Read the `## Customer Config` block above. Use any pre-filled values without asking. For missing fields, gather information **conversationally** — ask one topic at a time in the order below. Do not present a table of questions all at once.

---

### 1a — Customer Name and Industry

If `CUSTOMER_NAME` is blank, ask:
> "Which customer is this demo for? Just the company name is fine."

Once you have the name, derive `CUSTOMER_SLUG` automatically (lowercase, hyphens). Confirm it only if it's ambiguous.

Then ask:
> "What does [CUSTOMER_NAME] sell? A sentence or two about their products is enough."

Use the answer to fill both `INDUSTRY` and `PRODUCT_FOCUS`.

---

### 1b — Brand Colors

**Try to fetch the customer's website automatically before asking.** Once you know the customer name, attempt to fetch their website (e.g., `https://www.[brand].com`) and extract:
- CSS color values (hex codes, CSS custom properties, button/background/link colors)
- The header/nav bar background color (`background-color` of the site's `<header>`, `<nav>`, or top navigation bar). This becomes `HEADER_BG_COLOR`.
- The logo SVG (look for `<svg>` elements with logo-related classes, or `<img>` tags in the header pointing to SVG files)

- **If successful:** Present the colors and logo you found and ask the SA to confirm or adjust before using them.
- **If the site blocks the fetch or times out:** Ask the SA to save the webpage locally so you can extract the branding directly:

  > "I wasn't able to read their website directly. The easiest way to get accurate branding is:
  >
  > 1. **Save the webpage** — open the customer's homepage in your browser, then **File → Save As → Webpage, Complete** (or **Save Page As**). This saves the HTML and all assets (CSS, images, SVGs) into a folder. Drop that folder into this repo directory and tell me the folder name. I'll extract the logo, colors, and header styling directly from the saved page.
  >
  > This is the recommended approach because it gives me the actual logo SVG, exact brand colors, and header background — all from one step.
  >
  > Alternatively:
  > 2. **Logo file** — if you have the customer's logo as an SVG file, drop it into the repo folder or paste the SVG code.
  > 3. **Screenshot** — take a screenshot of their homepage and share the file path. I can read images and identify colors visually (but I won't be able to extract a vector logo this way)."

- **Extracting from a saved webpage:** When the SA provides a saved webpage folder:
  1. Search the HTML file for `<svg>` elements in the header/nav area — look for logo-related class names, `data-testid` attributes containing "logo", or SVGs near the top of `<header>` elements. Extract the full SVG markup.
  2. Look for `<meta name="theme-color">` for the primary brand color.
  3. Search CSS files and inline styles for header/nav `background-color` values.
  4. Present what you found and ask the SA to confirm before using.

- **If the SA provides a description** (not a hex code): suggest 2–3 plausible hex options with a recommendation and ask them to pick.
- **If a logo file is already in the repo:** inspect it for color values and use those as the primary color candidate.
- **`HEADER_BG_COLOR` default:** If the header color can't be determined, default to `#ffffff` (white). The demo header will match the customer's site when set, and looks clean when left as white. Only accept plain color values (hex or rgb/rgba). Do not use extracted values that contain semicolons, braces, `url()`, `@import`, or any non-color CSS syntax.

---

### 1c — Logo

The logo should come from the customer's actual website — either extracted from a saved webpage (step 1b) or provided directly by the SA. **Do not generate a text wordmark** unless the SA explicitly asks for one. The customer's real logo is critical for brand authenticity.

- **If a logo was already extracted in step 1b** (from a saved webpage or direct fetch): confirm it with the SA and use it.
- **If no logo yet:** Ask:
  > "I still need the customer's logo. The best option is to save their webpage (File → Save As → Webpage, Complete) — I can extract the SVG logo directly. Or you can drop an SVG file into the repo folder, paste a URL, or paste SVG code."
- If the SA provides a file path, URL, or SVG code: use it as-is.
- **Last resort only:** If the SA explicitly says they don't have a logo and can't save the webpage, generate a simple inline SVG wordmark — the company name in a bold sans-serif font, colored with `--header-text` so it contrasts with the header background.

---

### 1d — Personas

Ask:
> "Do you want me to generate default personas based on the industry, or do you have specific people in mind? If you have preferences — genders, buyer types, how experienced they are — share them and I'll build from there."

- If the SA says generate defaults: create 3 personas (Alex female, Marcus male, Sam neutral) with distinct buyer motivations appropriate to the industry.
- If the SA gives partial guidance: customize `preferredBrands` and `purchaseHistory` to match; keep the persona names/genders/taglines fixed.

From the personas, derive `DEMO_NARRATIVE` automatically based on one of the personas' profiles. This narrative is used in search result overlays to personalize context.

---

**General defaults (apply silently unless the SA asks):**
- `CUSTOMER_SLUG`: derived from `CUSTOMER_NAME`
- `SECONDARY_COLOR`: a warm gold, amber, or contrasting accent that complements the primary
- `HEADER_BG_COLOR`: defaults to `#ffffff` (white) if not determined from the customer's site
- `DEMO_NARRATIVE`: derived from one of the persona profiles and the industry

---

## Step 2 — Confirm Before Generating

Once all fields are resolved, print a summary:

```
Ready to generate the demo. Here's what I have:

  Customer:    [CUSTOMER_NAME]
  Output:      output/[CUSTOMER_SLUG]/demo.html
  Colors:      [PRIMARY_COLOR] / [SECONDARY_COLOR]
  Header:      [HEADER_BG_COLOR] (text: [white if dark bg, dark if light bg])
  Industry:    [INDUSTRY]
  Personas:    [list names + one-line profiles]
  Narrative:   [DEMO_NARRATIVE]

Generate the demo now? (yes / make changes)
```

Wait for the SA to confirm before proceeding to Step 3.

---

## Step 3 — Generate the Demo

**Do not generate the file from scratch.** Use the copy-then-edit approach below to stay well within output token limits and avoid truncation.

### Setup: Copy the template and read reference files

1. Create the output directory and copy the template:
   ```bash
   mkdir -p output/[CUSTOMER_SLUG]
   cp template/index.html output/[CUSTOMER_SLUG]/demo.html
   ```

2. Read the JSON files in `image-library/` to find the category set closest to the customer's industry. Available sets:
   - `consumer-electronics.json` — laptops, headphones, earbuds, smartwatches, speakers, etc.
   - `sporting-goods.json` — running shoes, dumbbells, tennis rackets, cycling helmets, boxing gloves, etc.
   - `clothing-fashion.json` — shirts, tops, sneakers, jackets, dresses, sunglasses, etc.
   - `groceries-food.json` — coffee, bread, cheese, chocolate, pasta, craft beverages, etc.
   - `outdoor-camping.json` — tents, sleeping bags, hiking boots, backpacks, camp stoves, lanterns, etc.

   Each file contains ~50 pre-curated image entries with Pexels CDN URLs, suggested product names, brands, and tags. Ask the SA which set best matches their customer, or recommend the closest one. The SA can mix images across sets if needed.

3. Read `output/[CUSTOMER_SLUG]/demo.html` to confirm the copy succeeded before editing.

Now apply each customization below as a **targeted Edit** to the copied file. Each section is an independent edit — complete them in order.

---

### 3a — Brand Colors

**Edit target:** the `:root { }` block near the top of the `<style>` section.

Replace the color custom property values:

```css
--primary:        [PRIMARY_COLOR];
--primary-dark:   [darken PRIMARY_COLOR by ~15%];
--primary-light:  [lighten PRIMARY_COLOR by ~25%];
--accent:         [SECONDARY_COLOR];
--accent-dark:    [darken SECONDARY_COLOR by ~15%];
--header-bg:      [HEADER_BG_COLOR];
--header-text:    [#ffffff if HEADER_BG_COLOR is dark (luminance < 0.5), else #1a1a1a];
--header-divider: [rgba(255,255,255,0.2) if HEADER_BG_COLOR is dark, else rgba(0,0,0,0.1)];
```

**Determining light vs dark:** Compute relative luminance from the header background hex value. If luminance < 0.5, use white text and light dividers; otherwise use dark text and dark dividers.

**Color value validation:** All color values must be plain CSS color literals only — hex (`#RGB` or `#RRGGBB`), `rgb(N, N, N)`, `rgba(N, N, N, D)`, or named CSS colors. Do not accept values containing semicolons, braces, `url()`, `@import`, quotes, or any non-color CSS syntax. If an extracted value is not a plain color literal, default to `#ffffff`.

---

### 3b — Page Title and Header

**Edit target:** three separate edits — `<title>`, the `<!-- CUSTOMIZE: Logo -->` block, and the `<!-- CUSTOMIZE: promo message -->` span.

- `<title>`: `[CUSTOMER_NAME] | Find Everything You Need`
- Logo: Replace the placeholder SVG/text in the `<!-- CUSTOMIZE: Logo -->` section with either:
  - The provided SVG or URL (the logo should be designed for the header background color — this is the main reason we match `HEADER_BG_COLOR` to the customer's site), **or**
  - A generated inline SVG wordmark using the company name, colored with `--header-text` (not `PRIMARY_COLOR`) so it contrasts with the header background
- Utility bar promo text: write a short seasonal promotion appropriate to the industry (e.g., "Free shipping on orders over $75 — Shop Summer Essentials →")

---

### 3c — Navigation

**Edit target:** the `<!-- CUSTOMIZE: navigation categories -->` nav block.

Replace the nav items with 5–7 categories appropriate to the customer's industry and product focus. Examples for sporting goods: `Men's`, `Women's`, `Footwear`, `Apparel`, `Equipment`, `Sale`.

---

### 3d — Hero Slides

**Edit target:** the `<!-- CUSTOMIZE: hero slides -->` section and the `/* CUSTOMIZE: Hero slide backgrounds */` CSS rule block.

Replace with 2–3 slides. Each slide should:
- Have a compelling headline relevant to the industry and season (summer)
- Have 1–2 lines of supporting copy
- Have a CTA button label (e.g., "Shop Now", "Explore Collection")
- Reference the CSS class for hero background (`hero-slide-1`, `hero-slide-2`, etc.) — update the `/* CUSTOMIZE: Hero slide backgrounds */` CSS to use appropriate gradient colors derived from the brand palette

---

### 3e — Trending Search Terms

**Edit target:** the `<!-- CUSTOMIZE: trending search terms -->` strip in the HTML, and the `const SUGGESTIONS` object in the JS.

Replace `SUGGESTIONS.trending` with 7 search terms appropriate to the industry and season. Replace `SUGGESTIONS.categories` with 6–7 category shortcuts appropriate to the nav structure.

---

### 3f — Personas

**Edit target:** the `const PERSONAS` object and the `let activePersona` initialisation line in the JS.

The personas are fixed as Alex (female), Marcus (male), and Sam (neutral). Customize only `preferredBrands` and `purchaseHistory` to match the customer's product set. Each persona must have:

```js
{
  id: 'alex' | 'marcus' | 'sam',
  name: 'Alex' | 'Marcus' | 'Sam',
  initials: 'AX' | 'MR' | 'SM',
  gender: 'female' | 'male' | 'neutral',
  tagline: 'One sentence buyer profile',
  preferredBrands: [...],  // 3–5 brand names relevant to the industry
  purchaseHistory: [...],  // 4–6 product types they've bought
  clickHistory: [...],     // 3–5 product types they've browsed
  season: 'summer',
}
```

Customize `preferredBrands` and `purchaseHistory` to reflect the customer's actual product set and industry. Keep the persona names, genders, and IDs fixed.

---

### 3g — Image Selection & Review

Before building product data, the SA must review and approve the images that will be used. This step is critical for content safety.

1. Read the selected category set JSON file from `image-library/`
2. Present the available images to the SA, organized by product type. For each image, show:
   - The Pexels CDN URL (SA can open in browser to preview)
   - The suggested product name and category
   - Whether it's a noise product (`isNoise: true`)
3. Ask the SA to review. Tell them the image URLs are in the JSON file at `image-library/[selected-set].json` — they can open the file, browse the URLs in their browser, and verify each image visually:
   > "Please review the images before I use them. You can find all the URLs in `image-library/[selected-set].json` — open any in your browser to preview. Let me know which to keep, skip, or if you'd like to pull images from a different category set."
4. **Content safety reminder:**
   > "Please verify all images are appropriate for a customer-facing demo. Flag any that should be removed."
5. The SA can:
   - Approve the full set
   - Skip specific images
   - Request images from other category sets (cross-set mixing)
   - Paste manual Pexels CDN URLs for products not covered (`https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=400&h=480&fit=crop`)

Once approved, use the selected images for all product data in steps 3h–3l below. **Write product data to match the images** — names, descriptions, and brands should reflect what's shown in each image.

---

### 3h — Product Catalog (Homepage Grid)

> **v2 mode:** This array powers the homepage grid only — search results come from Elasticsearch via the seeded dataset.

**Edit target:** the `const PRODUCTS` array in the JS (between its opening `[` and closing `];`).

Replace with 12–15 products using SA-approved images from step 3g. Requirements:
- Mix of genders: roughly ⅓ women's, ⅓ men's, ⅓ unisex
- Mix of price points: entry-level, mid-range, and premium
- Varied categories: not all the same product type
- Use image URLs from the approved set — all must be Pexels CDN URLs
- Write product names, brands, prices, ratings, and review counts to match the images
- Include 1–2 items with a `sale` price and `badge: 'Sale'`
- Include 1–2 items with `badge: 'New'` and 1–2 with `badge: 'Bestseller'`

---

### 3i — Lexical Mode Query

> **v2 mode:** Lexical results come from Elasticsearch via BM25 across all products including noise. Noise surfaces naturally for broad queries.

**Edit target:** the `DEMO_QUERIES.lexical` value in `const DEMO_QUERIES`.

Set `DEMO_QUERIES.lexical` to a broad, natural language query appropriate to the industry. **Do not misspell the query** — the point is that even a perfectly reasonable query returns wrong results with keyword-only search.

**Demo query strategy — "same query, different results":**

The most compelling demo story uses the **same query** for lexical and hybrid modes. This makes the contrast unmistakable: identical input, dramatically different output.

| Category | Recommended lexical query | Why it works |
|---|---|---|
| Sporting Goods | `'outdoor gear'` | Returns noise: motorsport helmets, saddles, fishing rods — technically "outdoor" but wrong context |
| Consumer Electronics | `'smart devices'` | Returns noise: toasters, car stereos — technically "devices" but not what shoppers mean |
| Clothing & Fashion | `'everyday wear'` | Returns noise: fabric bolts, costumes — keyword match on "wear" but wrong category |
| Groceries & Food | `'kitchen essentials'` | Returns noise: cleaning supplies, garden tools — keyword match on "kitchen" but not food |

---

### 3j — Hybrid Mode Query

> **v2 mode:** Hybrid results come from Elasticsearch using RRF (Reciprocal Rank Fusion) to merge ELSER semantic and BM25 keyword retrieval, filtered to real products only (noise excluded).

**Edit target:** the `DEMO_QUERIES.hybrid` value.

**Set `DEMO_QUERIES.hybrid` to the same query as `DEMO_QUERIES.lexical`.** This is the key to the demo story: the same natural language query returns noise with lexical search but relevant products with hybrid/semantic search. The audience sees the difference without changing what they typed.

---

### 3k — Personalized Mode Query

> **v2 mode:** Personalized results come from Elasticsearch using a 3-stage pipeline:
> 1. RRF (Reciprocal Rank Fusion) merges 3 retrievers: ELSER semantic, BM25 keyword, and persona affinity signal
> 2. Jina reranker (`.jina-reranker-v3`) does ML-based reranking
> 3. Client-side split: top 6 = primary, next 2 = cross-sell
>
> No static array needed — results are entirely dynamic from ES.

**Edit target:** the `DEMO_QUERIES.personalized` value.

Set `DEMO_QUERIES.personalized` to a short personalization query like `'gear for me'` or `'picks for me'` — the trigger words `'for me'` / `'my'` activate the persona-based RRF retrieval.

The "Shopping as [persona-name]" overlay is displayed at the top of search results in personalized mode.

---

### 3l — GenAI Agent Query

**Edit target:** the `DEMO_QUERIES.genai` value.

Set `DEMO_QUERIES.genai` to a natural language query that triggers multi-turn Agent Builder conversation (e.g., `'put together a complete training kit'`, `'help me build a summer outfit'`). The query will be sent to the Agent Builder agent, which will respond with product recommendations and allow follow-up questions. **No static kit arrays needed** — the agent dynamically retrieves products from the index via tool calls.

---

### 3m — Mid-Page Promo Banner

**Edit target:** the `<!-- CUSTOMIZE: mid-page promo banner -->` div.

Update with a short promotional message appropriate to the industry (e.g., "Summer Essentials — Shop the Collection").

---

### 3n — Footer

**Edit target:** the `<!-- CUSTOMIZE: footer links and copyright -->` footer block.

- Replace brand name in copyright with `CUSTOMER_NAME`
- Update footer nav links to match the nav categories from 3c

---

### 3o — Product Data for Elasticsearch

**Skip this step if `.env` is missing or empty (mock-only mode).**

In v2 mode, search results come from Elasticsearch — not the template constants. Each customer gets their own product data file and ES index to prevent overwrites.

1. Generate `scripts/data/products-[CUSTOMER_SLUG].json` from the SA-approved images and product data built in steps 3h–3l. Each product entry needs:

```json
{
  "id": 1,
  "name": "Product Name",
  "brand": "Brand",
  "category": "category-slug",
  "gender": "Women's" | "Men's" | null,
  "price": 99.99,
  "sale": null,
  "rating": 4.7,
  "reviews": 1234,
  "badge": "New" | "Best Seller" | "Sale" | null,
  "tags": ["keyword1", "keyword2", "keyword3"],
  "description": "2-3 sentence description with keywords for semantic search.",
  "image": "https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=400&h=480&fit=crop",
  "is_noise": false
}
```

2. Include all products from the homepage grid, search modes, and GenAI kits. Also include noise products with `"is_noise": true`.
3. Real product IDs: 1–50. Noise product IDs: 101+.
4. Write rich `description` fields — these power semantic search (ELSER). Include use cases, features, materials, and scenarios.
5. Reseed the Elasticsearch index:

```bash
npm run reset -- --slug [CUSTOMER_SLUG]
```

The `--slug` flag reads from `products-[CUSTOMER_SLUG].json` and creates index `{ES_INDEX}-[CUSTOMER_SLUG]` (where `ES_INDEX` is the base name from `.env`). This keeps each customer's data isolated.

Confirm output shows `✓ All [N] products indexed successfully`.

---

### 3p — Credential Injection

**Edit target:** the `ES_CONFIG` block near the top of the `<script>` section in `output/[CUSTOMER_SLUG]/demo.html`.

Replace each `{{token}}` with the value read from `.env` in step v2-E:

```js
const ES_CONFIG = {
  url:              '[ES_URL]',
  apiKey:           '[ES_API_KEY_READONLY]',
  index:            '[ES_INDEX]-[CUSTOMER_SLUG]',
  kibanaUrl:        '[KIBANA_URL]',
  kibanaApiKey:     '[KIBANA_API_KEY_READONLY]',
  agentId:          '[AGENT_ID]'
};
```

The `index` value is computed as `{ES_INDEX}-{CUSTOMER_SLUG}` — the base name from `.env` plus the customer slug. This matches the index created by the `npm run reset -- --slug [CUSTOMER_SLUG]` command in step 3o.

The `kibanaUrl`, `kibanaApiKey`, and `agentId` are required for GenAI mode — the demo will fail without them.

---

### 3q — Search Routing Keywords

**Edit target:** the `doSearch()` function's `if` conditions in the JS.

Update the lexical and GenAI keyword triggers to match the customer's specific demo queries set in 3i and 3l. The Personalized trigger (`'for me'`, `'my '`) is generic and rarely needs changing.

### 3r — Console Cheat Sheet

**Edit target:** the `console.log` calls at the very end of the `<script>` block.

Update the background color in the first `console.log` to `PRIMARY_COLOR` and update the query strings to match `DEMO_QUERIES`. Update mode names: `lexical`, `hybrid`, `personalized`, `genai`.

---

## Step 3 Validation

After completing all edits, read back `output/[CUSTOMER_SLUG]/demo.html` and verify:
- The `:root` colors are updated (not still `#1a6b4a`)
- The `<title>` contains the customer name
- `const PERSONAS` uses Alex, Marcus, and Sam with customized `preferredBrands` and `purchaseHistory`
- `const PRODUCTS` contains customer-specific products (not the template's trail running defaults)
- `DEMO_QUERIES` contains all four customized query strings: `lexical`, `hybrid`, `personalized`, `genai`
- `ES_CONFIG` is populated with the correct ES and Kibana credentials, agent ID, and `[ES_INDEX]-[CUSTOMER_SLUG]` index name
- No references to the template brand names remain unless intentional
- All image URLs are valid Pexels CDN links from the approved image set

If any section was missed or still contains template defaults, apply the missing edit before proceeding.

---

## Post-Setup: Agent Customization (Optional)

After `npm run setup` creates the Agent Builder agent, SAs can customize the agent's behavior in Kibana:

1. Open **Kibana → Standalone Agents → {AGENT_ID}**
2. Edit the agent's **System Prompt** to match the customer's brand voice and product expertise
3. Add or remove **Tools** as needed (the setup creates default search and product-retrieval tools)
4. Adjust the **LLM Connector** if a different model is preferred
5. Save changes — the updated agent will be used on the next customer query

No code changes required — customization is entirely through the Kibana UI.

---

## Step 4 — Print the Cheat Sheet

After writing the file, print:

```
✅ Demo generated: output/[CUSTOMER_SLUG]/demo.html
✅ Agent Builder agent created (ID: [AGENT_ID]) — customize in Kibana if needed

Run `npm run dev` and open http://localhost:3000/[CUSTOMER_SLUG]/demo.html

DEMO CHEAT SHEET — queries to type during your presentation:
  1. Lexical:     "[DEMO_QUERIES.lexical]"       → bad results, wrong category
  2. Hybrid:      "[DEMO_QUERIES.hybrid]"        → relevant, semantically matched
  3. Personalized: "[DEMO_QUERIES.personalized]" → ranked by active persona preferences
  4. GenAI:       "[DEMO_QUERIES.genai]"         → multi-turn Agent Builder conversation

Switch personas using the avatar buttons in the top bar.
For the Personalized and GenAI modes, switch personas and re-run the same query to show how results change.
In GenAI mode, try follow-up questions to demonstrate multi-turn conversation.
```

---

## Notes for the AI Agent

- **Do not modify `template/index.html`** — always write to `output/[CUSTOMER_SLUG]/demo.html`
- **Images use Pexels CDN only — never Unsplash** — Unsplash URLs go stale and 404. All image URLs use the Pexels CDN format: `https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=400&h=480&fit=crop`
- **Do not invent image URLs** — use only URLs from the `image-library/*.json` files or URLs manually provided by the SA. If no image matches well, reuse the closest category match
- **Images drive product data** — write product names, descriptions, and brands to match the SA-approved images, not the reverse
- **Content safety is mandatory** — always ask the SA to review images before including them in the demo
- **Keep all JavaScript logic intact** — only replace the data constants (`PERSONAS`, `PRODUCTS`, `GENAI_KITS`, `DEMO_QUERIES`, `SUGGESTIONS`) and the `ES_CONFIG` credential block
- **Keep all CSS intact** — only change the `:root` color values and hero slide background gradients
- **Keep all HTML structure intact** — only replace text content and the logo element
- **ES mode (required):** the demo must be served via `npm run dev` (localhost:3000) — direct `file://` opening will cause CORS errors on ES queries
- **All credentials are mandatory** — if any `.env` value is missing, the setup cannot proceed
