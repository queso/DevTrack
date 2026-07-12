#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PLUGIN_JSON="${REPO_ROOT}/.claude-plugin/plugin.json"
MARKETPLACE_JSON="${REPO_ROOT}/.claude-plugin/marketplace.json"

usage() {
  echo "Usage: $0 <version>"
  echo "  version: semver string, e.g. 1.2.3"
  exit 1
}

if [[ $# -ne 1 ]]; then
  usage
fi

VERSION="$1"

if ! [[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Error: version must be in semver format (e.g. 1.2.3), got: ${VERSION}" >&2
  exit 1
fi

if [[ ! -f "$PLUGIN_JSON" ]]; then
  echo "Error: plugin.json not found at ${PLUGIN_JSON}" >&2
  exit 1
fi

if [[ ! -f "$MARKETPLACE_JSON" ]]; then
  echo "Error: marketplace.json not found at ${MARKETPLACE_JSON}" >&2
  exit 1
fi

# Render the bumped content of one file into a temp file. Both files are
# rendered before either original is overwritten, so a failure cannot leave
# plugin.json and marketplace.json out of sync.
render_bumped() {
  local file="$1" out="$2"
  if command -v jq &>/dev/null; then
    # Top-level .version always; marketplace.json also carries per-plugin
    # versions in .plugins[] that must stay in sync.
    jq --arg v "$VERSION" '.version = $v
      | if .plugins then .plugins |= map(.version = $v) else . end' "$file" > "$out"
  else
    # sed handles one "version" key per line; /g covers multiple keys on a
    # single line (minified JSON).
    sed -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\")/\1${VERSION}\2/g" "$file" > "$out"
  fi
}

PLUGIN_TMP="$(mktemp)"
MARKETPLACE_TMP="$(mktemp)"
trap 'rm -f "$PLUGIN_TMP" "$MARKETPLACE_TMP"' EXIT

render_bumped "$PLUGIN_JSON" "$PLUGIN_TMP"
render_bumped "$MARKETPLACE_JSON" "$MARKETPLACE_TMP"

cat "$PLUGIN_TMP" > "$PLUGIN_JSON"
cat "$MARKETPLACE_TMP" > "$MARKETPLACE_JSON"

echo "Bumped version to ${VERSION} in plugin.json and marketplace.json"
