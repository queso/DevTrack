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

update_version() {
  local file="$1"
  if command -v jq &>/dev/null; then
    local tmp
    tmp="$(mktemp)"
    jq --arg v "$VERSION" '.version = $v' "$file" > "$tmp"
    mv "$tmp" "$file"
  else
    sed -i.bak -E "s/(\"version\"[[:space:]]*:[[:space:]]*\")[^\"]+(\"/\1${VERSION}\2/" "$file"
    rm -f "${file}.bak"
  fi
}

update_version "$PLUGIN_JSON"
update_version "$MARKETPLACE_JSON"

echo "Bumped version to ${VERSION} in plugin.json and marketplace.json"
