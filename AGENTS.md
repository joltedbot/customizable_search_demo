# AGENTS.md

> User-level CLAUDE.md handles: pnpm/socket aliases, MCP servers,
> elasticsearch-expert subagent, RPI framework, three-strikes rule.
> Do not duplicate those here.
> Note: CLAUDE.md is a symlink to this file. They are the same file.

## Tech Stack

| Layer | Package | Pinned Version |
|-------|---------|----------------|
| Runtime | Node.js | 18+ (current: v25.8.2) |
| Language | JavaScript | ES modules, no TypeScript |
| Frontend | Vanilla HTML/CSS/JS | Single-page, no framework |
| Elasticsearch client | @elastic/elasticsearch | 8.19.1 |
| Static server | serve | ^14.0.0 |
| SBOM | @cyclonedx/cyclonedx-npm | ^4.2.1 |
| Package manager | pnpm | 10.33.0 |

## Commands

```
pnpm install                  # Install dependencies
node scripts/validate-env.js  # Pre-flight check — always run first
pnpm start                    # Serve the frontend locally
pnpm run setup -- --slug {name}  # Seed index & Agent (use double-dash for flags)
pnpm run reset -- --slug {name}  # Wipe and reseed index (Agents/Tools preserved)
pnpm run generate-test           # Inject .env credentials into template for testing
pnpm run sbom                    # Generate CycloneDX SBOM for security audits
```

## Pre-Flight Validation

Always run `node scripts/validate-env.js` before starting work on anything
that touches the Elasticsearch cluster or inference services. It validates
environment variables, cluster connectivity, and inference endpoint
availability. Do not skip it and assume the environment is healthy.

## Elasticsearch Client Version — Known Constraint

The client is pinned to `@elastic/elasticsearch` 8.19.1.
The target cluster is **Elasticsearch 9.3+**.

The 8.x client is broadly compatible with a 9.x cluster for the operations
this project uses, but there are gaps. Before using any client API:
- Check the 8.x client docs, not the 9.x docs
- Use the elasticsearch-expert subagent to verify query and API behaviour
  against the actual cluster
- Do NOT upgrade the client to 9.x without flagging to the user —
  there are breaking changes that require testing

## Elastic Inference Services

The following inference endpoints are deployed on the cluster via EIS.
All inference goes through cluster endpoints — do not call Jina or any
external embedding API directly.

| Service | Model | Purpose |
|---------|-------|---------|
| Semantic search | jina-embeddings-v5-text-small | Embedding generation |
| Reranking | jina-reranker-v3 | Cross-encoder reranking |
| Conversational AI | Elasticsearch Agent Builder | Multi-turn chat |

## Elasticsearch Agent Builder

The conversational chat feature is powered by Elasticsearch Agent Builder,
not a direct LLM API. Configuration lives in the cluster, not in this repo.
To inspect or reason about agent configuration use the `elastic-agent-builder`
MCP server. Do not guess at agent behaviour — query it.

## Validation Approach

This project has no automated test framework. Quality assurance uses:
- `scripts/validate-env.js` — automated pre-flight (always run this)
- `docs/genai-boundary-tests.md` — manual checklist for AI agent responses
  (consult when changing anything that affects chat behaviour)

Do not add Jest, Vitest, or any test framework without flagging to the user.
The current approach is intentional for SA demo portability.

## Non-Standard Patterns
- Search Mode Disparity (Noise Filtering): Lexical search (BM25) intentionally includes documents where is_noise: true, while Hybrid, Personalized, and GenAI modes explicitly filter them out.
- GenAI Tool ID Extraction: The tool_result SSE event uses a nested path results[].data.reference.id to provide product IDs.
- Gender-Blind Personalization: The Personalized search mode intentionally removes gender signals from the retrieval process, focusing only on preferredBrands and preferredCategories.
- Progressive GenAI Rendering: Product cards are rendered immediately upon the tool_result event, before the AI's textual response has finished streaming.
- Pre-Injected Persona Context: Persona context (name, tagline, brands) is prepended directly to the user's query string before being sent to the Agent Builder API.
- Industry-Specific Label Overrides: The template uses a specific set of constants (CTA_LABEL, GENAI_TITLE, etc.) that must be swapped for non-retail industries (e.g., Banking or Insurance).
- Manual .env Parsing: All scripts in scripts/ use a custom loadEnv() function instead of the dotenv package.
- The Reset + Generate Loop: Changes to product data (products.json) are not reflected until both npm run reset (to update the index) and npm run generate-test (to update the HTML tokens) are executed.
- EIS Inference ID Suffixes: All inference IDs must be prefixed with a leading dot (e.g., .jina-reranker-v3).
- Double-Dash npm Argument Passing: All custom flags (like --slug) must be preceded by a double-dash when run via npm (e.g., npm run setup -- --slug icbc).
- Brand Safety (Non-Retail): Single-brand industries (Banking, Insurance) must use the customer name as `brand` for all real products. Noise products must use fictional brands. Competitor names in brand fields are prohibited.
- Pexels Image Constraints: Only Pexels CDN links are allowed. Unsplash URLs are prohibited as they go stale. Pexels blocks headless/automated fetches (403); verify IDs manually or via API.
- Z-Index Layer Stack: header=1000 → autocomplete=2000 → search overlay=3000 → genai overlay=4000 → query viewer=5000.
- Agent Builder API Headers: All `POST`/`PUT` calls to `{KIBANA_URL}/api/agent_builder/*` require the `kbn-xsrf: true` header in addition to Authorization.
- Token Syntax: Use `{{ALL_CAPS}}` for credentials in `template/index.html` (replaced by scripts) and `[BRACKET_STYLE]` for AI-facing examples in documentation. 
- Dynamic Header Branding: Use CSS variables `--header-bg`, `--header-text`, and `--header-divider` for customer-specific theming. Child elements (logo, switchers) must use `--header-text` to ensure contrast against the dynamic background.- 


## Constraints

- No external hosting, CDN, or cloud deployment — laptop-local only
- Do not add TypeScript — this project is intentionally plain JavaScript
- Do not add a frontend framework — vanilla HTML/CSS/JS is intentional
- Do not embed `ES_API_KEY` (write-access) in output HTML; only `ES_API_KEY_READONLY` is safe for browser-side distribution.
- All Elastic documentation queries go through the elastic-docs MCP server,
  not web search
- Do not modify `scripts/validate-env.js` without flagging — it is the
  primary safety check for demo environments
- Do not add dependencies without flagging to the user first

## Autonomous Operation

This project is operated by SAs who may not have deep Node/JS familiarity.
Flag to the user and wait for confirmation before:
- Changing anything that affects cluster connectivity or inference calls
- Adding or removing dependencies
- Modifying any script in `scripts/`
- Any refactor touching more than 3 files

When uncertain whether a change is safe, ask.

## Reference Documentation

Consult these before web searching. Do not fetch speculatively — only when
verifying a specific API, version constraint, or behaviour you are uncertain of.

| Resource | URL | When to use |
|----------|-----|-------------|
| Node.js docs | https://nodejs.org/docs/latest-v18.x/api/ | Core API — pinned to v18 |
| pnpm docs | https://pnpm.io/motivation | Workspace and CLI behaviour |
| Elasticsearch JS client | https://www.elastic.co/docs/api/doc/elasticsearch-js | 8.x client API — use this not 9.x docs |
| elastic-docs MCP | (via MCP server) | Elastic product docs — use MCP, not elastic.co/docs |

Do NOT web search for Elastic documentation — use the elastic-docs MCP server.

## Context File Maintenance

### Updating this file

Updating AGENTS.md is part of task completion, not optional cleanup.

Add an entry to Non-Standard Patterns when:
- You made an incorrect assumption that caused a wrong edit or broken build
- A pattern in the codebase surprised you and the reason was not obvious
- You were corrected by the user on a design decision

Do not add general JavaScript or Node advice. Do not paraphrase existing entries.

### Split Threshold

When this file exceeds 150 lines, flag to the user before continuing:

> "AGENTS.md is approaching the split threshold. Recommend extracting
> `<package-name>` content to `<package-name>/AGENTS.md` before this session."

Do not split autonomously. Wait for confirmation. After a split, root file
retains only: workspace structure table, commands, and workspace-wide
constraints. Package-level files are authoritative for that package.
