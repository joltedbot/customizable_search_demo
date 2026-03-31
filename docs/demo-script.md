# Demo Script — Search Mode Walkthrough

A cheat sheet for SAs walking customers through the four search modes. Each section has a recommended query, what to point out, and talking points. Adapt the wording to your style — this is a starting framework, not a script to read verbatim.

> **Tip:** Run queries in order (Lexical → Hybrid → Personalized → GenAI). The narrative builds: each mode solves a problem the previous one couldn't.

---

## Setup Before the Demo

1. Have the demo open with **Alex** selected as the persona
2. Know the customer's pain points — map them to the relevant mode
3. If time is short, Lexical + Personalized tells the strongest story in two steps

---

## 1. Lexical Search — "Where keyword search breaks"

### Query: `helmet`

### What happens
Lexical search matches the word "helmet" across all products — including the **noise items** (motorsport racing helmets, equestrian gear). You'll see PitLane Racing Helmet, GridStart Full-Face Racing Helmet mixed in with the cycling helmets the customer actually sells.

### What to point out
- "Notice the **motorsport racing helmets** in the results — these are from categories this retailer doesn't even sell. Keyword search can't tell the difference between a cycling helmet and a racing helmet because they both contain the word 'helmet'."
- "This is what your customers see today when keyword matching is your only retrieval strategy."

### Bonus query: `something for recovery after a workout`

- Lexical returns **zero results** — none of these words appear verbatim in product names or tags
- "A real shopper would say this. Keyword search has no idea what 'recovery' means in context."

### Key talking points
- BM25 matches tokens, not intent
- No understanding of context or synonyms
- Noise products surface because they share keywords with real inventory
- This is the baseline — every retailer has this problem today

---

## 2. Hybrid Search — "Adding semantic understanding"

### Query: `helmet`

### What happens
Hybrid mode uses RRF (Reciprocal Rank Fusion) to combine semantic embeddings with BM25 keyword matching. Noise products are filtered out — only **cycling helmets** appear (AeroShield Road, VentFlow Pro, UrbanRide Commuter, TrailGuard MTB).

### What to point out
- "Same query, completely different results. The motorsport and equestrian noise is gone."
- "Hybrid search understands that in the context of *this* product catalog, 'helmet' means cycling helmets."

### Bonus query: `something for recovery after a workout`

- Now returns **foam rollers and yoga mats** — the system understands the *intent* behind the words
- "The shopper didn't need to know your exact product names. Semantic search bridges the vocabulary gap."

### Key talking points
- Semantic embeddings capture meaning, not just keywords
- RRF merges the best of both worlds — semantic relevance + keyword precision
- Noise filtering removes irrelevant categories automatically
- This is the foundation — but it treats every shopper the same

---

## 3. Personalized Search — "Knowing the customer"

This is where the demo shines. Run the **same query with different personas** to show how results adapt.

### Query: `running shoes`

### Step A: Search as Alex

Alex is a **competitive runner** who prefers Nike, On Running, Puma, and Oakley.

**What you'll see:** Nike CloudStrike and On Running PureStep rank highest. Puma VelocityMax Racing Flat also appears near the top. The results skew toward **performance and racing** gear.

**What to say:** "Alex is a competitive runner. The system knows her brand preferences and running style — it promotes Nike and On Running because that's what she buys."

### Step B: Switch to Marcus, same query

Marcus is a **trail runner and outdoor adventurer** who prefers TrailTech, The North Face, Osprey, and Hydro Flask.

**What you'll see:** TrailTech FlexMotion Trail Runner jumps to the top. The results shift toward **trail and outdoor** running shoes. The same query, totally different ranking.

**What to say:** "Same search, different person. Marcus gets trail-focused results because the system knows he's an outdoor runner, not a track runner."

### Step C: Switch to Sam, same query

Sam is into **general fitness and home gym** — prefers Nike, Under Armour, Adidas, and IronForge.

**What you'll see:** Nike and Adidas running shoes surface, but the results are more **general-purpose trainers** than specialist racing or trail shoes.

**What to say:** "Sam isn't a dedicated runner — they're a general fitness person. The system doesn't push racing flats or trail shoes because that's not Sam's profile."

### Step D: Show category differentiation

**Query: `new gear`** (keep the same persona switching pattern)

This query is intentionally vague — there's no strong keyword or category signal, so category affinity becomes the deciding factor.

| Persona | What you'll see | Why |
|---------|----------------|-----|
| Alex | Running shoes, sunglasses, yoga mats | Her preferred categories: running-shoes, sunglasses, yoga-mats |
| Marcus | Backpacks, water bottles, cycling helmets | His preferred categories: backpacks, water-bottles, cycling-helmets |
| Sam | Dumbbells, boxing gloves, foam rollers | Sam's preferred categories: dumbbells, boxing-gloves, foam-rollers |

**What to say:** "With 'running shoes', we saw brand differentiation — same product type, different brands. With 'new gear', we see *category* differentiation — each persona gets entirely different *types* of products. The system knows Alex is a runner, Marcus is an outdoor adventurer, and Sam is building a home gym."

### What to point out (across all three)
- "Three people, one query, three different result sets — ranked by *who they are*, not just what they typed"
- Point out the **"Picked for [Name]"** cross-sell section at the bottom — these are products based on the persona's purchase history and brand affinity, not the search query
- "This is what it looks like when search becomes a personal shopper"
- "Two dimensions of personalization working together: **brand affinity** decides *which* running shoe you see, **category affinity** decides *whether* you see running shoes at all vs. dumbbells or backpacks"

### Key talking points
- Three-branch retriever: persona-brand semantic (dominant), general semantic, BM25 keyword
- Jina Reranker rescores the top candidates against the persona's style
- Cross-sell recommendations require zero manual merchandising rules
- No query expansion visible to the user — it all happens behind the scenes
- "This isn't collaborative filtering ('people like you bought X'). This is real-time intent matching against the individual's profile."

---

## 4. GenAI Search — "Conversational commerce"

### Query: `I need a complete outfit for trail running`

### What happens
The GenAI overlay opens with a side-by-side layout: chat on the left, product cards on the right. Products appear **before** the AI text finishes — the system streams results progressively.

### What to point out
- "Notice the products appeared before the AI finished writing. That's progressive rendering — the customer isn't waiting for the full response."
- "The AI is curating across categories — shoes, a backpack, sunglasses, a water bottle — things a keyword search would never combine in one result set."
- Products in the right panel have Add to Cart buttons — "this isn't just a chatbot, it's a shopping experience."

### Follow-up query: `anything cheaper?` or `do you have something waterproof?`

- "This is multi-turn. The AI remembers what we just discussed and refines. Try doing that with a search box."

### Switch personas and try again
- With **Alex**: recommendations lean toward performance brands (Nike, On Running)
- With **Marcus**: TrailTech and The North Face dominate
- "Same conversation starter, different persona, different product curation — the AI knows who it's talking to."

### Key talking points
- Natural language — customers describe what they need, not what to search for
- Multi-turn conversation replaces the filter-refine-filter loop
- Cross-category bundling (shoes + pack + bottle + sunglasses) happens naturally
- Agent Builder handles the orchestration — no custom LLM pipeline to build
- "This is the future of product discovery. Search becomes a conversation."

---

## Quick Reference — Query Cheat Sheet

| Mode | Best Demo Query | What It Proves |
|------|----------------|----------------|
| Lexical | `helmet` | Noise pollution from keyword-only matching |
| Lexical | `something for recovery after a workout` | Zero results — keywords can't understand intent |
| Hybrid | `helmet` | Noise eliminated, only relevant cycling helmets |
| Hybrid | `something for recovery after a workout` | Intent understood — foam rollers and yoga mats appear |
| Personalized (Alex) | `running shoes` | Performance/racing shoes from Nike, On Running |
| Personalized (Marcus) | `running shoes` | Trail shoes from TrailTech surface first |
| Personalized (Sam) | `running shoes` | General trainers — no specialist bias |
| Personalized (Alex) | `new gear` | Running shoes + sunglasses — category affinity |
| Personalized (Marcus) | `new gear` | Backpacks + water bottles — outdoor categories |
| Personalized (Sam) | `new gear` | Dumbbells + boxing gloves — home gym categories |
| GenAI | `I need a complete outfit for trail running` | Cross-category curation + streaming + conversation |
| GenAI follow-up | `anything cheaper?` | Multi-turn context — AI refines without re-explaining |

---

## The Narrative Arc

Tell this story:

1. **Lexical** — "This is where most retailers are today. It works, until it doesn't."
2. **Hybrid** — "Adding semantic search fixes relevance. Same infrastructure, better results."
3. **Personalized** — "Now make it personal. Same query, different customer, different brands *and* different product categories."
4. **GenAI** — "Now remove the search box entirely. Let customers describe what they need."

Each step is additive. Each solves a real problem. Each is available in Elasticsearch today.
