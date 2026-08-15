#!/usr/bin/env bash
set -e

echo ""
echo "Installing opencode-token-usage..."
echo ""

REPO="YUNonce2233/opencode-token-usage"
BRANCH="${OPENCODE_BRANCH:-master}"

if [ -n "$OPENCODE_CONFIG_DIR" ]; then
  CONFIG_DIR="$OPENCODE_CONFIG_DIR"
else
  CONFIG_DIR="$HOME/.config/opencode"
fi

PLUGINS_DIR="$CONFIG_DIR/plugins"
COMMANDS_DIR="$CONFIG_DIR/command"
mkdir -p "$PLUGINS_DIR" "$COMMANDS_DIR"

echo "Downloading from GitHub (branch: $BRANCH)..."
curl -fsSL "https://raw.githubusercontent.com/$REPO/$BRANCH/plugin/opencode-token-usage.ts" -o "$PLUGINS_DIR/opencode-token-usage.ts"
curl -fsSL "https://raw.githubusercontent.com/$REPO/$BRANCH/command/token-usage.md" -o "$COMMANDS_DIR/token-usage.md"

echo "Copied plugin  -> $PLUGINS_DIR/opencode-token-usage.ts"
echo "Copied command -> $COMMANDS_DIR/token-usage.md"
echo ""
echo "Register the plugin in your config (e.g. $CONFIG_DIR/opencode.json):"
echo "  \"plugin\": [\"file:///$PLUGINS_DIR/opencode-token-usage.ts\"]"
echo ""
echo "Restart opencode, then each completed main-agent reply shows a token badge."
echo ""
