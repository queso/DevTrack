#!/usr/bin/env bash
# Tests for bump-plugin-version.sh. Run directly: ./scripts/bump-plugin-version.test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BUMP_SCRIPT="${SCRIPT_DIR}/bump-plugin-version.sh"
BASH_BIN="$(command -v bash)"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

FAILURES=0

pass() { echo "ok   - $1"; }
fail() { echo "FAIL - $1" >&2; FAILURES=$((FAILURES + 1)); }

# Create a fake repo (scripts/ + .claude-plugin/) with fixture manifests that
# mirror the real files' shape, pre-normalized to jq's output style so the jq
# and sed code paths can be compared byte-for-byte.
setup_repo() {
  local dir="$1"
  mkdir -p "${dir}/scripts" "${dir}/.claude-plugin"
  cp "$BUMP_SCRIPT" "${dir}/scripts/bump-plugin-version.sh"
  cat > "${dir}/.claude-plugin/plugin.json" <<'EOF'
{
  "name": "devtrack",
  "version": "1.0.0",
  "minCliVersion": "2.0.0",
  "description": "Test fixture"
}
EOF
  cat > "${dir}/.claude-plugin/marketplace.json" <<'EOF'
{
  "name": "devtrack",
  "version": "1.0.0",
  "owner": {
    "name": "Test"
  },
  "plugins": [
    {
      "name": "devtrack",
      "source": {
        "source": "github",
        "repo": "queso/DevTrack"
      },
      "version": "1.0.0"
    }
  ]
}
EOF
}

run_bump() {
  local dir="$1" version="$2"
  "$BASH_BIN" "${dir}/scripts/bump-plugin-version.sh" "$version"
}

# Run the bump with jq hidden from PATH so the sed fallback executes. The
# restricted PATH contains only the external tools the script needs.
run_bump_without_jq() {
  local dir="$1" version="$2"
  local nojq_bin="${WORK}/nojq-bin"
  if [[ ! -d "$nojq_bin" ]]; then
    mkdir -p "$nojq_bin"
    local tool
    for tool in dirname mktemp sed cat rm; do
      ln -s "$(command -v "$tool")" "${nojq_bin}/${tool}"
    done
  fi
  env PATH="$nojq_bin" "$BASH_BIN" "${dir}/scripts/bump-plugin-version.sh" "$version"
}

count_lines() { grep -c "$1" "$2" || true; }

assert_bumped() {
  local dir="$1" label="$2"
  local plugin="${dir}/.claude-plugin/plugin.json"
  local marketplace="${dir}/.claude-plugin/marketplace.json"

  if [[ "$(count_lines '"version": "9.9.9"' "$plugin")" == "1" ]]; then
    pass "${label}: plugin.json .version bumped"
  else
    fail "${label}: plugin.json .version not bumped"
  fi

  if [[ "$(count_lines '"minCliVersion": "2.0.0"' "$plugin")" == "1" ]]; then
    pass "${label}: plugin.json minCliVersion untouched"
  else
    fail "${label}: plugin.json minCliVersion was modified"
  fi

  if [[ "$(count_lines '"version": "9.9.9"' "$marketplace")" == "2" ]]; then
    pass "${label}: marketplace.json top-level and plugins[].version bumped"
  else
    fail "${label}: marketplace.json versions not fully bumped"
  fi
}

# --- jq path ---------------------------------------------------------------
if command -v jq &>/dev/null; then
  setup_repo "${WORK}/jq-path"
  run_bump "${WORK}/jq-path" 9.9.9 > /dev/null
  assert_bumped "${WORK}/jq-path" "jq path"
else
  echo "skip - jq not installed; jq-path tests skipped" >&2
fi

# --- sed fallback ------------------------------------------------------------
setup_repo "${WORK}/sed-path"
run_bump_without_jq "${WORK}/sed-path" 9.9.9 > /dev/null
assert_bumped "${WORK}/sed-path" "sed fallback"

# --- jq and sed outputs are identical ---------------------------------------
if command -v jq &>/dev/null; then
  if diff -q "${WORK}/jq-path/.claude-plugin/plugin.json" \
             "${WORK}/sed-path/.claude-plugin/plugin.json" > /dev/null \
  && diff -q "${WORK}/jq-path/.claude-plugin/marketplace.json" \
             "${WORK}/sed-path/.claude-plugin/marketplace.json" > /dev/null; then
    pass "jq and sed paths produce identical output"
  else
    fail "jq and sed paths diverge"
  fi
fi

# --- atomicity: a failing render must leave both files untouched -------------
if command -v jq &>/dev/null; then
  setup_repo "${WORK}/atomic"
  echo '{ not json' > "${WORK}/atomic/.claude-plugin/marketplace.json"
  if run_bump "${WORK}/atomic" 9.9.9 > /dev/null 2>&1; then
    fail "atomicity: script succeeded on malformed marketplace.json"
  else
    pass "atomicity: script fails on malformed marketplace.json"
  fi
  if [[ "$(count_lines '"version": "1.0.0"' "${WORK}/atomic/.claude-plugin/plugin.json")" == "1" ]]; then
    pass "atomicity: plugin.json untouched after marketplace.json failure"
  else
    fail "atomicity: plugin.json was modified despite marketplace.json failure"
  fi
fi

# --- input validation ---------------------------------------------------------
setup_repo "${WORK}/badver"
if run_bump "${WORK}/badver" "not-a-version" > /dev/null 2>&1; then
  fail "validation: non-semver version accepted"
else
  pass "validation: non-semver version rejected"
fi
if "$BASH_BIN" "${WORK}/badver/scripts/bump-plugin-version.sh" > /dev/null 2>&1; then
  fail "validation: missing argument accepted"
else
  pass "validation: missing argument rejected"
fi

# -----------------------------------------------------------------------------
if [[ "$FAILURES" -gt 0 ]]; then
  echo "${FAILURES} test(s) failed" >&2
  exit 1
fi
echo "All tests passed"
