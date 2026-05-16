#!/usr/bin/env bash
# Build the distributable .mcpb bundle (node server/index.js stdio mode).
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$PWD"
BUNDLE_DIR="$ROOT/build/mcpb"

echo "==> Compiling TypeScript (tsconfig.build.json -> dist/)"
npm run build

echo "==> Assembling bundle at $BUNDLE_DIR"
rm -rf "$ROOT/build"
mkdir -p "$BUNDLE_DIR/server"
cp "$ROOT/manifest.json" "$BUNDLE_DIR/manifest.json"
cp "$ROOT"/dist/*.js "$BUNDLE_DIR/server/"

node -e '
const p = require("./package.json");
const fs = require("fs");
const out = {
  name: p.name + "-bundled",
  version: p.version,
  private: true,
  type: "module",
  main: "index.js",
  dependencies: p.dependencies,
};
fs.writeFileSync(process.argv[1], JSON.stringify(out, null, 2) + "\n");
' "$BUNDLE_DIR/server/package.json"

echo "==> Installing production dependencies into the bundle"
( cd "$BUNDLE_DIR/server" && npm install --omit=dev --no-audit --no-fund --loglevel=error )

echo "==> Validating manifest"
( cd "$BUNDLE_DIR" && npx --yes @anthropic-ai/mcpb validate manifest.json )

echo "==> Packing"
( cd "$BUNDLE_DIR" && npx --yes @anthropic-ai/mcpb pack . "$ROOT/build/google-calendar-mcp.mcpb" )

echo "==> Done."
ls -lh "$ROOT/build/google-calendar-mcp.mcpb"
