#!/bin/sh
# Self-test for .githooks/pre-commit. Runs in a temp repo; never touches the real repo.
# Usage: sh .githooks/test-guard.sh   (or: pnpm run test:guard)
# Fake keys are built at runtime so this file itself contains no key-like literal.
set -u

# Isolate from any inherited git environment (e.g. when run from a git hook)
unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE GIT_OBJECT_DIRECTORY GIT_COMMON_DIR GIT_CONFIG GIT_PREFIX
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1

here=$(cd "$(dirname "$0")" && pwd)
src=$(cd "$here/.." && pwd)
tmp=$(mktemp -d "${TMPDIR:-/tmp}/guard-test.XXXXXX") || exit 1
case "$tmp" in /*/guard-test.*) ;; *) echo "bad temp dir"; exit 1 ;; esac
trap 'rm -rf "$tmp"' EXIT
fails=0

mkdir -p "$tmp/repo/.githooks" || exit 1
cp "$src/.githooks/pre-commit" "$tmp/repo/.githooks/pre-commit" || exit 1
cp "$src/.gitleaks.toml" "$tmp/repo/.gitleaks.toml" || exit 1
cd "$tmp/repo" || exit 1
[ "$(pwd -P)" != "$(cd "$src" && pwd -P)" ] || exit 1
git init -q . || exit 1
[ "$(git rev-parse --show-toplevel)" = "$(pwd -P)" ] || { echo "temp repo isolation failed"; exit 1; }
git config user.email test@example.invalid
git config user.name test
git config commit.gpgsign false
git config core.hooksPath .githooks
git add .gitleaks.toml .githooks
SKIP_SECRET_GUARD=1 git commit -q -m init 2>/dev/null

# Obviously fake, varied-enough 50-char string
fake=$(printf 'Zm9vYmFy%s' QWxhYmFzdGVyQ29sdW1uMTIzNDU2Nzg5MFh5ejk4)
fake="${fake}Qw"

check() { # name expected(pass|block) file content
  name=$1 expect=$2 file=$3 content=$4
  mkdir -p "$(dirname "$file")"
  printf '%s\n' "$content" > "$file"
  git add -f "$file"
  if git commit -q -m "t: $name" >"$tmp/out" 2>&1; then got=pass; else got=block; fi
  if [ "$got" = "$expect" ]; then echo "PASS  $name"; else echo "FAIL  $name (expected $expect, got $got)"; fails=$((fails+1)); fi
  # reset for next case (hook may have blocked, leaving the file staged)
  git rm -q -f --cached "$file" >/dev/null 2>&1
  rm -f "$file"
  git status --porcelain | grep -q . && { SKIP_SECRET_GUARD=1 git commit -q -m cleanup >/dev/null 2>&1 || true; }
}

check "(a) clean file passes"                    pass  a.txt "hello world"
check "(b) seeded api key assignment blocked"    block b.js  "const c = { apiKey: \"$fake\" };"
check "(c) output/x/config.js blocked"           block output/x/config.js "window.ES_CONFIG = {};"
check "(d) output/x/demo.config.json blocked"    block output/x/demo.config.json "{}"
check "(e1) .env blocked"                        block .env "ES_URL=http://localhost"
check "(e2) .env.template passes"                pass  .env.template "ES_URL="
check "(f) {{ES_API_KEY_READONLY}} placeholder passes" pass tpl.html "apiKey: '{{ES_API_KEY_READONLY}}'"
check "(j) .ENV blocked"                       block .ENV "ES_URL=x"
check "(k) Output/x/Config.js blocked"           block Output/x/Config.js "x"
check "(l) output/My Demo/config.js blocked"     block "output/My Demo/config.js" "x"
check "(m) output/démo/demo.config.json blocked" block "output/démo/demo.config.json" "{}"
check "(n) scripts/lib/config.js passes"         pass  scripts/lib/config.js "module.exports = {};"
check "(o) template/config.js passes"            pass  template/config.js "x"
check "(h) output/x/foo.local blocked"           block output/x/foo.local "x"

# (g) fail closed without gitleaks: PATH holds only a symlink to git
mkdir "$tmp/bin"
ln -s "$(command -v git)" "$tmp/bin/git"
echo ok > g.txt; git add g.txt
if PATH="$tmp/bin" /bin/sh .githooks/pre-commit >"$tmp/out" 2>&1; then
  echo "FAIL  (g) hook should fail closed without gitleaks"; fails=$((fails+1))
elif grep -q "gitleaks is not installed" "$tmp/out"; then
  echo "PASS  (g) fails closed when gitleaks missing"
else
  echo "FAIL  (g) failed for the wrong reason"; fails=$((fails+1))
fi
git rm -q -f --cached g.txt >/dev/null 2>&1

# (i) override warns loudly and passes
echo ok > i.txt; git add i.txt
if SKIP_SECRET_GUARD=1 sh .githooks/pre-commit >"$tmp/out" 2>&1 && grep -q "BYPASSED" "$tmp/out"; then
  echo "PASS  (i) SKIP_SECRET_GUARD=1 bypasses with warning"
else
  echo "FAIL  (i) override"; fails=$((fails+1))
fi

if [ "$fails" -eq 0 ]; then echo "ALL PASS"; else echo "$fails FAILED"; exit 1; fi
