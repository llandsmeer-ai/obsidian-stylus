#!/usr/bin/env bash
set -e

VAULT_DIR="vault-dev"
PLUGIN_DIR="$VAULT_DIR/.obsidian/plugins/obsidian-stylus"

# Build
npm run build

# Copy plugin files into dev vault
mkdir -p "$PLUGIN_DIR"
cp main.js "$PLUGIN_DIR/"
cp manifest.json "$PLUGIN_DIR/"
cp styles.css "$PLUGIN_DIR/"

echo "Installed to $PLUGIN_DIR"
