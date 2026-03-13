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
LOGO:
INDUSTRY:
PRODUCT_FOCUS:
PERSONA_1:
PERSONA_2:
PERSONA_3:
CHARACTER_NAME:
DEMO_NARRATIVE:
```

**Field reference:**

| Field | Description | Example |
|---|---|---|
| `CUSTOMER_NAME` | Company name as it appears in the UI | `Acme Sports` |
| `CUSTOMER_SLUG` | URL-safe folder name (derive from name if blank) | `acme-sports` |
| `PRIMARY_COLOR` | Main brand color — buttons, active states | `#006150` |
| `SECONDARY_COLOR` | Accent color — CTAs, highlights | `#F5A623` |
| `LOGO` | One of: SVG URL, raw SVG code, or `"generate wordmark"` | `generate wordmark` |
| `INDUSTRY` | Short description of what the company does | `outdoor sporting goods` |
| `PRODUCT_FOCUS` | 1–2 sentences on what the customer sells | `Premium trail running and outdoor apparel` |
| `PERSONA_1/2/3` | Name, gender (female/male/neutral), and buyer profile — or `"use defaults"` | `Jordan, female, competitive trail runner` |
| `CHARACTER_NAME` | Name for the LTR personalization narrative | `Jordan` |
| `DEMO_NARRATIVE` | One sentence about the character's goal | `preparing for a summer trail race` |

---

## Elasticsearch Setup (Default)

The demo runs against a real Elasticsearch cluster with semantic search and live AI responses. Complete these pre-steps before proceeding to Step 1.

**To skip this and generate a mock-only demo instead**, jump straight to Step 1. The agent will set `V2_ENABLED = false` and skip steps 3o and 3p automatically if `.env` does not exist or is not filled in.

**Prerequisites:** Node.js 18+, Elastic Cloud deployment (ES 9.x with ML), an Elastic inference endpoint configured for an LLM.

### v2-A — Configure credentials

```bash
cp .env.template .env
```

Fill in `.env`:
- `ES_URL` — your Cloud deployment URL
- `ES_API_KEY` — write API key (used once by `npm run setup` to seed the index)
- `ES_INDEX` — leave as `demo-products` or choose your own name
- `ES_API_KEY_READONLY` — read-only API key scoped to `ES_INDEX` (baked into the demo HTML)
- `ES_INFERENCE_URL` — your Elastic inference endpoint URL, e.g. `{ES_URL}/_inference/completion/{inference_id}`
- `ES_INFERENCE_API_KEY` — API key for the inference endpoint

### v2-B — Validate credentials and seed the index

```bash
npm install
npm run validate
```

This checks that all `.env` values are set, the cluster is reachable, both API keys work, and the inference endpoint responds. Fix any `✗` failures before continuing.

```bash
npm run setup
```

This creates the index, enables ELSER semantic embeddings, and bulk-loads the product dataset. Confirm the output shows `✓ All [N] products indexed successfully`. Run `npm run setup -- --reset` to wipe and reseed.

### v2-C — Configure CORS

In Kibana: **Stack Management → Elasticsearch → Edit deployment settings**, add:

```yaml
http.cors.enabled: true
http.cors.allow-origin: ["/https?:\\/\\/localhost(:[0-9]+)?/"]
http.cors.allow-headers: "X-Requested-With, Content-Type, Content-Length, Authorization"
```

### Pre-step D — Note for Step 3

During Step 3, you (the AI agent) will inject the credentials into the output file. Before proceeding to Step 1, read `.env` and store the following values for use in step 3p:
- `ES_URL`, `ES_API_KEY_READONLY`, `ES_INDEX`, `ES_INFERENCE_URL`, `ES_INFERENCE_API_KEY`

If `.env` does not exist or is not filled in, fall back to mock mode: set `V2_ENABLED = false` and leave the credential tokens as empty strings.

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

**Try to fetch colors automatically before asking.** Once you know the customer name, attempt to fetch their website (e.g., `https://www.[brand].com`) and extract CSS color values (hex codes, CSS custom properties, button/background/link colors).

- **If successful:** Present the colors you found and ask the SA to confirm or adjust before using them.
- **If the site blocks the fetch or times out:** Do not ask for hex codes directly — most SAs won't know them. Instead offer these practical options:

  > "I wasn't able to read their website directly. Here are a few easy ways to grab the brand colors — whichever is easiest for you:
  >
  > 1. **Screenshot** — take a screenshot of their homepage or any branded page and share the file path. I can read images and identify the colors visually.
  > 2. **macOS Color Picker** — open **Digital Color Meter** (Applications → Utilities), browse their site, and hover over any brand element. It shows the hex value live.
  > 3. **Browser DevTools** — right-click any colored element on their site → Inspect → look in the Styles panel for `color`, `background-color`, or CSS variables like `--primary`.
  > 4. **Brand press page** — their investor or press page (e.g., `corporate.[brand].com`) often loads faster and may mention brand colors.
  >
  > If none of these work, just describe the brand vibe (e.g., 'dark green and gold', 'black and white with a red accent') and I'll suggest hex values for your approval."

- **If the SA provides a description** (not a hex code): suggest 2–3 plausible hex options with a recommendation and ask them to pick.
- **If a logo file is already in the repo:** inspect it for color values and use those as the primary color candidate.

---

### 1c — Logo

Ask:
> "Do you have a logo file? You can drop an SVG file into the repo folder, paste a URL, or paste SVG code directly. If not, I can generate a simple text wordmark."

- If the SA provides a file path, URL, or SVG code: use it as-is.
- If no logo is available: generate a simple inline SVG wordmark — the company name in a bold sans-serif font, colored in `PRIMARY_COLOR`, optionally with a minimal geometric mark to the left.

---

### 1d — Personas

Ask:
> "Do you want me to generate default personas based on the industry, or do you have specific people in mind? If you have preferences — genders, buyer types, how experienced they are — share them and I'll build from there."

- If the SA says generate defaults: create 2–3 personas with distinct genders and buyer motivations appropriate to the industry.
- If the SA gives partial guidance: build on it and fill gaps.

From the personas, derive `CHARACTER_NAME` (the name used in the LTR "Shopping as" banner — typically the most interesting persona for the personalization story) and `DEMO_NARRATIVE` automatically. Only ask about these if the SA wants to customize them.

---

**General defaults (apply silently unless the SA asks):**
- `CUSTOMER_SLUG`: derived from `CUSTOMER_NAME`
- `SECONDARY_COLOR`: a warm gold, amber, or contrasting accent that complements the primary
- `CHARACTER_NAME`: the persona most central to the LTR demo narrative
- `DEMO_NARRATIVE`: derived from that persona's profile and the industry

---

## Step 2 — Confirm Before Generating

Once all fields are resolved, print a summary:

```
Ready to generate the demo. Here's what I have:

  Customer:    [CUSTOMER_NAME]
  Output:      output/[CUSTOMER_SLUG]/demo.html
  Colors:      [PRIMARY_COLOR] / [SECONDARY_COLOR]
  Industry:    [INDUSTRY]
  Personas:    [list names + one-line profiles]
  Character:   [CHARACTER_NAME] — [DEMO_NARRATIVE]

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

Replace the five color custom property values:

```css
--primary:       [PRIMARY_COLOR];
--primary-dark:  [darken PRIMARY_COLOR by ~15%];
--primary-light: [lighten PRIMARY_COLOR by ~25%];
--accent:        [SECONDARY_COLOR];
--accent-dark:   [darken SECONDARY_COLOR by ~15%];
```

---

### 3b — Page Title and Header

**Edit target:** three separate edits — `<title>`, the `<!-- CUSTOMIZE: Logo -->` block, and the `<!-- CUSTOMIZE: promo message -->` span.

- `<title>`: `[CUSTOMER_NAME] | Find Everything You Need`
- Logo: Replace the placeholder SVG/text in the `<!-- CUSTOMIZE: Logo -->` section with either:
  - The provided SVG or URL, **or**
  - A generated inline SVG wordmark using the company name and `PRIMARY_COLOR`
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

Replace with 3 personas based on the SA's input (or generated defaults). Each persona must have:

```js
{
  id: 'firstname_lowercase',
  name: 'FirstName',
  initials: 'XX',          // 2-letter initials
  gender: 'female' | 'male' | 'neutral',
  tagline: 'One sentence buyer profile',
  preferredBrands: [...],  // 3–5 brand names relevant to the industry
  purchaseHistory: [...],  // 4–6 product types they've bought
  clickHistory: [...],     // 3–5 product types they've browsed
  season: 'summer',
}
```

Make personas distinct: different genders, different buying motivations, and different preferred brands where possible. The persona IDs (`alex`, `marcus`, `sam` in the template) should be replaced with the actual persona first names in lowercase.

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

> **v2 mode:** This array powers the homepage grid only — search results come from Elasticsearch. Still fill it in for a complete-looking homepage.

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

### 3i — Lexical Mode Products

> **v2 mode:** `PRODUCTS_LEXICAL` is bypassed — lexical results come from Elasticsearch via BM25 across all products (noise surfaces naturally for broad queries). You may skip this array. Still set `DEMO_QUERIES.lexical`.

**Edit target:** the `const PRODUCTS_LEXICAL` array and the `DEMO_QUERIES.lexical` value in `const DEMO_QUERIES`.

Replace `PRODUCTS_LEXICAL` with 6 intentionally wrong/irrelevant products. These demonstrate keyword-matching failure — lexical search returns noise products that partially match query terms but are completely wrong context.

Rules for lexical results:
- Products must be in completely wrong categories (e.g., for a sporting goods store: motorcycle gear, equestrian equipment, or archery supplies — items that technically match keywords but are wrong context)
- Low review counts (under 100) and mediocre ratings (3.2–3.9) to reinforce "bad results" feeling
- Use images from the noise products (`isNoise: true`) in the selected category set

**Demo query strategy — "same query, different results":**

The most compelling demo story uses the **same query** for lexical and hybrid modes. This makes the contrast unmistakable: identical input, dramatically different output.

Set `DEMO_QUERIES.lexical` to a broad, natural language query appropriate to the industry. **Do not misspell the query** — the point is that even a perfectly reasonable query returns wrong results with keyword-only search.

| Category | Recommended lexical query | Why it works |
|---|---|---|
| Sporting Goods | `'outdoor gear'` | Returns noise: motorsport helmets, saddles, fishing rods — technically "outdoor" but wrong context |
| Consumer Electronics | `'smart devices'` | Returns noise: toasters, car stereos — technically "devices" but not what shoppers mean |
| Clothing & Fashion | `'everyday wear'` | Returns noise: fabric bolts, costumes — keyword match on "wear" but wrong category |
| Groceries & Food | `'kitchen essentials'` | Returns noise: cleaning supplies, garden tools — keyword match on "kitchen" but not food |

---

### 3j — Hybrid Mode Products

> **v2 mode:** `PRODUCTS_HYBRID` is bypassed — hybrid results come from Elasticsearch (semantic + BM25 on the seeded dataset). You may skip this array. Still set `DEMO_QUERIES.hybrid`.

**Edit target:** the `const PRODUCTS_HYBRID` array and the `DEMO_QUERIES.hybrid` value.

Replace `PRODUCTS_HYBRID` with 6 relevant, high-quality results. These demonstrate semantic search understanding — the results are correct and relevant even when the query is natural language.

Rules:
- All products should be directly relevant to the demo query
- Include a mix of product types (not all the same item)
- High ratings (4.5–4.9) and healthy review counts
- Use image URLs from the SA-approved set

**Set `DEMO_QUERIES.hybrid` to the same query as `DEMO_QUERIES.lexical`.** This is the key to the demo story: the same natural language query returns noise with lexical search but relevant products with hybrid/semantic search. The audience sees the difference without changing what they typed.

---

### 3k — LTR Mode Products (Personalized)

> **v2 mode:** `PRODUCTS_LTR` is bypassed — personalized results come from Elasticsearch using `function_score` boosting on the persona's `preferredBrands`, `gender`, and `purchaseHistory`. You may skip this array. Still set `DEMO_QUERIES.ltr`.

**Edit target:** the `const PRODUCTS_LTR` object and the `DEMO_QUERIES.ltr` value.

Replace `PRODUCTS_LTR` with persona-specific results for each of the 3 personas. Each persona entry needs:

**`primary`** — 5 products ranked for that persona:
- Lead with gender-matching products for that persona
- Prioritize their `preferredBrands` in the ranking order
- Products should reflect their `purchaseHistory` context (complementary items they'd logically want)

**`xsell`** — 2–3 cross-sell products ("you might also need"):
- Draw from their `purchaseHistory` for contextual relevance
- Include at least one consumable or accessory (lower price point)

Set `DEMO_QUERIES.ltr` to a short personalization query like `'gear for me'` or `'picks for me'` — the trigger words `'for me'` / `'my'` activate the persona overlay.

The LTR overlay displays the character name in a "Shopping as [CHARACTER_NAME]" banner. Update any hardcoded character name references to use the SA's chosen `CHARACTER_NAME`.

---

### 3l — GenAI Kit

**Edit target:** the `const GENAI_KITS` object and the `DEMO_QUERIES.genai` value.

Replace `GENAI_KITS` with persona-specific curated kits. Each persona entry needs:

**`intro`** — one sentence introducing the kit, mentioning the persona by name and their goal

**`sub`** — one line describing what the kit is optimized for

**`products`** — 6 products forming a complete "kit" for the persona's scenario:
- Should tell a coherent story (e.g., shoes + apparel + accessory + nutrition)
- Persona-appropriate gender and brand preferences
- Include an image URL for each (use `w=300&h=300` format as in the template)

**`chatResponse`** — a JavaScript arrow function `(q) => \`...\`` that returns a simulated AI response. Write 2 branches:
- If the query mentions a specific product type or comparison keyword, give a specific recommendation
- Otherwise, give a general persona-appropriate response with an emoji

**`altProduct`** — one alternative product suggestion (shown as "or consider this" in the UI)

Set `DEMO_QUERIES.genai` to a natural language "curated kit" query (e.g., `'complete training kit'`, `'build my summer workout setup'`).

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

In v2 mode, search results come from Elasticsearch — not the template constants. The SA needs a custom `products.json` that matches their approved images and product data.

1. Generate a custom `scripts/data/products.json` from the SA-approved images and product data built in steps 3h–3l. Each product entry needs:

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

2. Include all products from the homepage grid, search modes, LTR, and GenAI kits. Also include noise products with `"is_noise": true`.
3. Real product IDs: 1–50. Noise product IDs: 101+.
4. Write rich `description` fields — these power semantic search (ELSER). Include use cases, features, materials, and scenarios.
5. Reseed the Elasticsearch index:

```bash
npm run reset
```

Confirm output shows `✓ All [N] products indexed successfully`.

---

### 3p — Credential Injection

**Skip this step if `.env` is missing or empty (mock-only mode).**

**Edit target:** the `ES_CONFIG` and `V2_ENABLED` block near the top of the `<script>` section in `output/[CUSTOMER_SLUG]/demo.html`.

Replace each `{{token}}` with the value read from `.env` in step v2-D:

```js
const ES_CONFIG = {
  url:                '[ES_URL]',
  apiKey:             '[ES_API_KEY_READONLY]',
  index:              '[ES_INDEX]',
  inferenceUrl:    '[ES_INFERENCE_URL]',
  inferenceApiKey: '[ES_INFERENCE_API_KEY]'
};
const V2_ENABLED = true;
```

If any optional credential (e.g. `ES_INFERENCE_URL`) is blank, leave it as an empty string — the code falls back to mock gracefully.

---

### 3q — Search Routing Keywords

**Edit target:** the `doSearch()` function's `if` conditions in the JS.

Update the lexical and GenAI keyword triggers to match the customer's specific demo queries set in 3i and 3l. The LTR trigger (`'for me'`, `'my '`) is generic and rarely needs changing.

### 3r — Console Cheat Sheet

**Edit target:** the `console.log` calls at the very end of the `<script>` block.

Update the background color in the first `console.log` to `PRIMARY_COLOR` and update the query strings to match `DEMO_QUERIES`.

---

## Step 3 Validation

After completing all edits, read back `output/[CUSTOMER_SLUG]/demo.html` and verify:
- The `:root` colors are updated (not still `#1a6b4a`)
- The `<title>` contains the customer name
- `const PERSONAS` uses the correct persona names/IDs
- `const PRODUCTS` contains customer-specific products (not the template's trail running defaults)
- `DEMO_QUERIES` contains all four customized query strings
- No references to the template brand names remain unless intentional
- All image URLs are valid Pexels CDN links from the approved image set

If any section was missed or still contains template defaults, apply the missing edit before proceeding.

---

## Step 4 — Print the Cheat Sheet

After writing the file, print:

```
✅ Demo generated: output/[CUSTOMER_SLUG]/demo.html

v2 mode: Run `npm run dev` and open http://localhost:3000/[CUSTOMER_SLUG]/demo.html
Mock mode: Open the file directly in any browser — no server needed.

DEMO CHEAT SHEET — queries to type during your presentation:
  1. Lexical:     "[DEMO_QUERIES.lexical]"   → bad results, wrong category
  2. Hybrid:      "[DEMO_QUERIES.hybrid]"    → relevant, semantically matched
  3. LTR:         "[DEMO_QUERIES.ltr]"       → personalized by active persona
  4. GenAI:       "[DEMO_QUERIES.genai]"     → curated kit + chat

Switch personas using the avatar buttons in the top bar.
For the LTR/GenAI modes, switch personas and re-run the same query to show personalization.
```

---

## Notes for the AI Agent

- **Do not modify `template/index.html`** — always write to `output/[CUSTOMER_SLUG]/demo.html`
- **Images use Pexels CDN only — never Unsplash** — Unsplash URLs go stale and 404. All image URLs use the Pexels CDN format: `https://images.pexels.com/photos/{ID}/pexels-photo-{ID}.jpeg?auto=compress&cs=tinysrgb&w=400&h=480&fit=crop`
- **Do not invent image URLs** — use only URLs from the `image-library/*.json` files or URLs manually provided by the SA. If no image matches well, reuse the closest category match
- **Images drive product data** — write product names, descriptions, and brands to match the SA-approved images, not the reverse
- **Content safety is mandatory** — always ask the SA to review images before including them in the demo
- **Keep all JavaScript logic intact** — only replace the data constants (`PERSONAS`, `PRODUCTS`, `PRODUCTS_LEXICAL`, `PRODUCTS_HYBRID`, `PRODUCTS_LTR`, `GENAI_KITS`, `DEMO_QUERIES`, `SUGGESTIONS`)
- **Keep all CSS intact** — only change the `:root` color values and hero slide background gradients
- **Keep all HTML structure intact** — only replace text content and the logo element
- **v2 mode** (default): the demo must be served via `npm run dev` (localhost:3000) — direct `file://` opening will cause CORS errors on ES queries
- **Mock mode** (fallback): the demo works when opened from `file://` with no server, no credentials, and no internet-dependent assets beyond Google Fonts. Used when `.env` is not configured.
