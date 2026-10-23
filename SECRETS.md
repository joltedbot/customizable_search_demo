# Secrets Handling

How credentials are stored, used, rotated, and kept out of git in this repo.

## 1. Rules at a glance

| What | Secret? | Where it lives | Tracked in git? |
|---|---|---|---|
| Write key `ES_API_KEY` | Yes | macOS Keychain (service `customizable-search-demo`), or the `ES_API_KEY` env var on non-macOS/CI | Never |
| Read-only ES key `ES_API_KEY_READONLY`, `KIBANA_API_KEY` | Yes (reach the browser) | `.env`, then generated into `output/<slug>/config.js` | Never |
| `ES_URL`, `KIBANA_URL`, `ES_INDEX`, `JINA_OMNI_INFERENCE_ID` | No, but deployment-specific | `.env` | Never (`.env`); `.env.template` holds placeholders only |
| Index, tool, and agent ids | Semi-sensitive (the agent id helps someone attacking the cluster's Agent Builder API) | `output/<slug>/demo.config.json` | Never |
| `output/<slug>/demo.html` | No credentials inside | `output/<slug>/` | Yes, safe to commit once migrated to the `config.js` model |

`ES_API_KEY` entries in `.env` are ignored with a warning. Nothing per-demo is written to `.env`.

## 2. One-time setup

```bash
brew install gitleaks
pnpm run hooks         # sets core.hooksPath to .githooks (pre-commit guard)
pnpm run test:guard    # self-test of the guard in a temp repo
security add-generic-password -s customizable-search-demo -a ES_API_KEY -w   # prompts for the write key; add -U to update
security find-generic-password -s customizable-search-demo -a ES_API_KEY -w  # read-back check (prints the key)
```

`pnpm install` also enables the hook through the `prepare` script (`git config core.hooksPath .githooks`); `pnpm run hooks` does the same by hand, and `pnpm run validate` warns when it is not set.

On non-macOS or CI, export `ES_API_KEY` in the environment instead.

Keychain read-prompt tradeoff: by default the `security` tool that created the entry can read it back without a prompt, so any script running as you can read the write key silently. Adding `-T ""` to `add-generic-password` makes every read show a macOS approval prompt (safer, but each `pnpm run setup` asks).

## 3. Day-to-day

```bash
pnpm run validate -- --slug <name>
pnpm run setup -- --slug <name>      # writes output/<name>/demo.config.json
pnpm run inject -- --slug <name>     # writes output/<name>/config.js
pnpm dev                             # serves output/ on 127.0.0.1:3000 only
```

- `demo.html` loads credentials from `config.js` through a `<script>` tag and contains none itself, so a page in this model is safe to commit. This applies only to pages already migrated (run `migrate-demo.js`, then `inject`, first; an old page may still hold inline keys).
- `config.js` and `demo.config.json` are gitignored and blocked by the pre-commit guard. Never commit them.
- `pnpm dev` binds to 127.0.0.1 (loopback), so other machines on the network cannot fetch `config.js`. `serve.json` turns off directory listings and hides `*.pre-migrate`, `demo.config.json`, and dotfiles from them, but `serve` cannot refuse a direct request for a file that exists: anything under `output/` is readable by URL from this machine.
- `output/<slug>/` is gitignored, so committing a new demo page needs `git add -f output/<slug>/demo.html`. The same migrated-page caveat applies. Do not force-add anything else under `output/`.

## 4. Rotating a key

1. Create the new key in Kibana (Stack Management, API Keys) or with `POST /_security/api_key`, with an `expiration`.
2. Edit `.env` (browser keys) or update the Keychain entry with `-U` (write key).
3. Regenerate pages: `pnpm run inject -- --all`.
4. Invalidate the old key, typically with `DELETE /_security/api_key` and the old key's id in the request body (`{"ids": ["<old key id>"]}`), or from Kibana.

To change a key's role or expiry without issuing a new key, `PUT /_security/api_key/{id}` typically works, and the caller is typically the key's owner. These API details were not verified against live docs here; confirm them against the current Elastic documentation before relying on them.

## 5. Least-privilege keys and expiry

- Browser keys use `demo-*` index patterns, never `*`. The pattern must cover every demo index. Custom names are listed in the `indexName` field of each `demo.config.json`.
- Create every browser key with an expiration (for example `"expiration": "30d"`) and prefer one key per demo or engagement.
- The exact role JSON for each key is in `.env.template`.

Residual risk, stated plainly: Elastic API keys have no origin or IP restriction and no per-key rate limit. Anyone who obtains `config.js`, or reads the page's memory in a browser, can use the key until it expires or is invalidated. Narrow scope, short expiry, and per-demo keys limit the damage; they do not remove the risk.

The agent id is not a credential, but it is treated as semi-sensitive: together with a leaked Kibana key it tells an attacker which Agent Builder agent to call. It lives only in gitignored files (`demo.config.json`, `config.js`), never in `.env` or tracked pages.

## 6. Migrating an existing demo

Older pages carry credentials inline in `ES_CONFIG` (or `{{TOKENS}}`). `scripts/migrate-demo.js` (temporary; delete it once all demos are migrated) moves them to the new model: it writes `demo.config.json` (names only), rewrites the page to load `config.js`, and loosens the CSP `connect-src`. It never prints or copies key values.

```bash
node scripts/migrate-demo.js --slug <name>            # dry run (default)
node scripts/migrate-demo.js --slug <name> --apply
node scripts/migrate-demo.js --all --apply            # every dir under output/ except test
pnpm run inject -- --slug <name>
```

`--apply` saves `output/<slug>/demo.html.pre-migrate` first. These backups hold the old page's live keys (they are gitignored and blocked by the pre-commit guard). Delete them once `inject` works and the page loads.

## 7. Guard details

`.githooks/pre-commit` (enabled by `pnpm run hooks`) blocks a commit when:

- gitleaks is not installed (fail closed);
- a staged path is `.env`, `.env.*` (except `.env.template` and `.env.example`), `.envrc`, `output/**/config.js`, `output/**/demo.config.json`, `output/**/*.local`, or `output/**/*.pre-migrate` (paths are matched case-insensitively and read NUL-delimited, so unusual characters do not slip past);
- gitleaks finds a secret in the staged changes (rules in `.gitleaks.toml`, run with `--redact`, so values are never printed). No path is allowlisted: `.env.template` and these docs are scanned too, so use short obvious placeholders in examples.

Override: `SKIP_SECRET_GUARD=1 git commit ...` prints a loud warning. Do not use it: it disables the only automated check between a mistake and the remote history. Fix the staged content instead.

Test: `pnpm run test:guard` builds a throwaway repo and checks that the hook blocks and allows what it should.

## 8. Adopting this in another project

1. Copy `.githooks/` and `.gitleaks.toml`.
2. Edit only the path-rule list in `.githooks/pre-commit` to your project's secret-bearing paths.
3. Add the scripts `"hooks": "git config core.hooksPath .githooks"` and `"prepare": "git config core.hooksPath .githooks || true"` to `package.json`. The hook needs bash.
4. Optional CI step: `gitleaks git --no-banner --redact -c .gitleaks.toml` (no third-party action is pinned here).

The reference project `support_bundle_visualizer` uses secretlint plus an untracked gitleaks hook. This kit replaces the untracked hook with a tracked one, so every clone gets the same guard.

## 9. If a key leaks

1. Invalidate it immediately (`DELETE /_security/api_key`, or Kibana, API Keys, Invalidate).
2. Rotate: create a replacement and run section 4.
3. Check whether it reached git: `gitleaks git --no-banner --redact -c .gitleaks.toml`. Do not paste key fragments into shell commands (they land in shell history).
4. Rewrite history only if the repo owner decides to. Invalidation is what makes the leak harmless.
