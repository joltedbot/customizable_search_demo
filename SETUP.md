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

2. Read `image-library.md` to select image URLs for the customer's industry and products. Do this before making any edits.

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

### 3g — Product Catalog (Homepage Grid)

**Edit target:** the `const PRODUCTS` array in the JS (between its opening `[` and closing `];`).

Replace with 12–15 products appropriate to the industry. Requirements:
- Mix of genders: roughly ⅓ women's, ⅓ men's, ⅓ unisex
- Mix of price points: entry-level, mid-range, and premium
- Varied categories: not all the same product type
- Select image URLs from `image-library.md` that match each product type
- Use realistic brand names, product names, prices, ratings, and review counts
- Include 1–2 items with a `sale` price and `badge: 'Sale'`
- Include 1–2 items with `badge: 'New'` and 1–2 with `badge: 'Bestseller'`

---

### 3h — Lexical Mode Products

**Edit target:** the `const PRODUCTS_LEXICAL` array and the `DEMO_QUERIES.lexical` value in `const DEMO_QUERIES`.

Replace `PRODUCTS_LEXICAL` with 6 intentionally wrong/irrelevant products. These demonstrate keyword-matching failure when the SA types a misspelled or ambiguous search query.

Rules for lexical results:
- Products must be in completely wrong categories (e.g., for a sporting goods store: motorcycle gear, equestrian equipment, or archery supplies — items that technically match keywords but are wrong context)
- Low review counts (under 100) and mediocre ratings (3.2–3.9) to reinforce "bad results" feeling
- Select images from the `"Bad Results"` section of `image-library.md`

Set `DEMO_QUERIES.lexical` to a misspelled or ambiguous version of a common product name (e.g., `'footware for runing'` — intentional misspellings trigger the lexical failure scenario).

---

### 3i — Hybrid Mode Products

**Edit target:** the `const PRODUCTS_HYBRID` array and the `DEMO_QUERIES.hybrid` value.

Replace `PRODUCTS_HYBRID` with 6 relevant, high-quality results. These demonstrate semantic search understanding — the results are correct and relevant even when the query is natural language.

Rules:
- All products should be directly relevant to the demo query
- Include a mix of product types (not all the same item)
- High ratings (4.5–4.9) and healthy review counts
- Good images from matching categories in `image-library.md`

Set `DEMO_QUERIES.hybrid` to a natural language query appropriate to the industry (e.g., `'trail running shoes'`, `'summer workout gear'`).

---

### 3j — LTR Mode Products (Personalized)

**Edit target:** the `const PRODUCTS_LTR` object and the `DEMO_QUERIES.ltr` value.

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

Set `DEMO_QUERIES.genai` to a natural language "curated kit" query (e.g., `'complete race day kit'`, `'build my summer workout setup'`).

---

### 3l — Mid-Page Promo Banner

**Edit target:** the `<!-- CUSTOMIZE: mid-page promo banner -->` div.

Update with a short promotional message appropriate to the industry (e.g., "Summer Essentials — Shop the Collection").

---

### 3m — Footer

**Edit target:** the `<!-- CUSTOMIZE: footer links and copyright -->` footer block.

- Replace brand name in copyright with `CUSTOMER_NAME`
- Update footer nav links to match the nav categories from 3c

---

### 3n — Search Routing Keywords

**Edit target:** the `doSearch()` function's `if` conditions in the JS.

Update the lexical and GenAI keyword triggers to match the customer's specific demo queries set in 3h and 3k. The LTR trigger (`'for me'`, `'my '`) is generic and rarely needs changing.

### 3o — Console Cheat Sheet

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
- No references to the template brand names (e.g., "On Running", "Salomon") remain unless intentional

If any section was missed or still contains template defaults, apply the missing edit before proceeding.

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
