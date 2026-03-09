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

## Step 1 — Gather Info

Read the `## Customer Config` block above. For every field that is blank or missing, ask the SA for the value conversationally. Ask all missing fields in one message — do not ask one field at a time.

**Defaults you may offer if the SA has no preference:**
- `CUSTOMER_SLUG`: derive from `CUSTOMER_NAME` (lowercase, hyphens, no spaces)
- `SECONDARY_COLOR`: a warm gold or amber that complements the primary color
- `PERSONA_1/2/3`: generate 2–3 personas appropriate to the industry (mix of genders, distinct buyer profiles)
- `CHARACTER_NAME`: use the name from Persona 1
- `DEMO_NARRATIVE`: derive from the character's persona profile and industry

For `LOGO`:
- If the SA provides a URL or SVG code, use it as-is
- If the SA says `"generate wordmark"` or provides no logo, generate a simple inline SVG: the company name in a bold sans-serif font, colored in `PRIMARY_COLOR`, optionally with a minimal geometric mark to the left

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

Create the directory `output/[CUSTOMER_SLUG]/` and write `demo.html` there. Do this by reading `template/index.html` in full, then producing a complete customized copy. Do not modify the template — write a new file.

Also read `image-library.md` to select image URLs appropriate to the customer's industry and products.

Apply every customization listed below.

---

### 3a — Brand Colors

In the `:root` CSS block, replace the color values:

```css
--primary:       [PRIMARY_COLOR];
--primary-dark:  [darken PRIMARY_COLOR by ~15%];
--primary-light: [lighten PRIMARY_COLOR by ~25%];
--accent:        [SECONDARY_COLOR];
--accent-dark:   [darken SECONDARY_COLOR by ~15%];
```

---

### 3b — Page Title and Header

- `<title>`: `[CUSTOMER_NAME] | Find Everything You Need`
- Logo: Replace the placeholder SVG/text in the `<!-- CUSTOMIZE: Logo -->` section with either:
  - The provided SVG or URL, **or**
  - A generated inline SVG wordmark using the company name and `PRIMARY_COLOR`
- Utility bar promo text: write a short seasonal promotion appropriate to the industry (e.g., "Free shipping on orders over $75 — Shop Summer Essentials →")

---

### 3c — Navigation

Replace the `<!-- CUSTOMIZE: navigation categories -->` nav items with 5–7 categories appropriate to the customer's industry and product focus. Examples for sporting goods: `Men's`, `Women's`, `Footwear`, `Apparel`, `Equipment`, `Sale`.

---

### 3d — Hero Slides

Replace the `<!-- CUSTOMIZE: hero slides -->` section with 2–3 slides. Each slide should:
- Have a compelling headline relevant to the industry and season (summer)
- Have 1–2 lines of supporting copy
- Have a CTA button label (e.g., "Shop Now", "Explore Collection")
- Reference the CSS class for hero background (`hero-slide-1`, `hero-slide-2`, etc.) — update the `/* CUSTOMIZE: Hero slide backgrounds */` CSS to use appropriate gradient colors derived from the brand palette

---

### 3e — Trending Search Terms

Replace `SUGGESTIONS.trending` with 7 search terms appropriate to the industry and season. Replace `SUGGESTIONS.categories` with 6–7 category shortcuts appropriate to the nav structure.

---

### 3f — Personas

Replace the `PERSONAS` object with 3 personas based on the SA's input (or generated defaults). Each persona must have:

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

### 3g — Product Catalog (Homepage Grid)

Replace `PRODUCTS` with 12–15 products appropriate to the industry. Requirements:
- Mix of genders: roughly ⅓ women's, ⅓ men's, ⅓ unisex
- Mix of price points: entry-level, mid-range, and premium
- Varied categories: not all the same product type
- Select image URLs from `image-library.md` that match each product type
- Use realistic brand names, product names, prices, ratings, and review counts
- Include 1–2 items with a `sale` price and `badge: 'Sale'`
- Include 1–2 items with `badge: 'New'` and 1–2 with `badge: 'Bestseller'`

---

### 3h — Lexical Mode Products

Replace `PRODUCTS_LEXICAL` with 6 intentionally wrong/irrelevant products. These demonstrate keyword-matching failure when the SA types a misspelled or ambiguous search query.

Rules for lexical results:
- Products must be in completely wrong categories (e.g., for a sporting goods store: motorcycle gear, equestrian equipment, or archery supplies — items that technically match keywords but are wrong context)
- Low review counts (under 100) and mediocre ratings (3.2–3.9) to reinforce "bad results" feeling
- Select images from the `"Bad Results"` section of `image-library.md`

Set `DEMO_QUERIES.lexical` to a misspelled or ambiguous version of a common product name (e.g., `'footware for runing'` — intentional misspellings trigger the lexical failure scenario).

---

### 3i — Hybrid Mode Products

Replace `PRODUCTS_HYBRID` with 6 relevant, high-quality results. These demonstrate semantic search understanding — the results are correct and relevant even when the query is natural language.

Rules:
- All products should be directly relevant to the demo query
- Include a mix of product types (not all the same item)
- High ratings (4.5–4.9) and healthy review counts
- Good images from matching categories in `image-library.md`

Set `DEMO_QUERIES.hybrid` to a natural language query appropriate to the industry (e.g., `'trail running shoes'`, `'summer workout gear'`).

---

### 3j — LTR Mode Products (Personalized)

Replace `PRODUCTS_LTR` with persona-specific results for each of the 3 personas. Each persona entry needs:

**`primary`** — 5 products ranked for that persona:
- Lead with gender-matching products for that persona
- Prioritize their `preferredBrands` in the ranking order
- Products should reflect their `purchaseHistory` context (complementary items they'd logically want)

**`xsell`** — 2–3 cross-sell products ("you might also need"):
- Draw from their `purchaseHistory` for contextual relevance
- Include at least one consumable or accessory (lower price point)

Set `DEMO_QUERIES.ltr` to a query that includes a personalization trigger word like `'for me'` or `'my'` (e.g., `'running gear for me'`, `'show me workout essentials'`).

The LTR overlay displays the character name in a "Shopping as [CHARACTER_NAME]" banner. Update any hardcoded character name references to use the SA's chosen `CHARACTER_NAME`.

---

### 3k — GenAI Kit

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

Set `DEMO_QUERIES.genai` to a natural language "curated kit" query (e.g., `'complete race day kit'`, `'build my summer workout setup'`).

---

### 3l — Mid-Page Promo Banner

Update the `<!-- CUSTOMIZE: mid-page promo banner -->` section with a short promotional message appropriate to the industry (e.g., "Summer Essentials — Shop the Collection").

---

### 3m — Footer

Update the `<!-- CUSTOMIZE: footer links and copyright -->` section:
- Replace brand name in copyright with `CUSTOMER_NAME`
- Update footer nav links to match the nav categories from 3c

---

## Step 4 — Print the Cheat Sheet

After writing the file, print:

```
✅ Demo generated: output/[CUSTOMER_SLUG]/demo.html

Open the file in any browser — no server needed.

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
- **Do not invent image URLs** — use only URLs from `image-library.md`. If no image matches well, reuse the closest category match
- **Keep all JavaScript logic intact** — only replace the data constants (`PERSONAS`, `PRODUCTS`, `PRODUCTS_LEXICAL`, `PRODUCTS_HYBRID`, `PRODUCTS_LTR`, `GENAI_KITS`, `DEMO_QUERIES`, `SUGGESTIONS`)
- **Keep all CSS intact** — only change the `:root` color values and hero slide background gradients
- **Keep all HTML structure intact** — only replace text content and the logo element
- The demo must work when opened from `file://` with no server and no internet-dependent assets (fonts load from Google Fonts; if offline, they degrade gracefully to system sans-serif)
- No credentials, API keys, or build tools required
