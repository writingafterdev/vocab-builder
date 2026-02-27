#!/bin/bash
# strip-og-wasm.sh — Removes unused @vercel/og WASM files from the build
# These add ~1.4 MiB to the worker bundle but are never used (no OG image routes exist)

echo "Stripping unused OG image WASM files..."

# Remove resvg.wasm (~1.3 MiB) and yoga.wasm (~87 KB)
find node_modules/next/dist/compiled/@vercel/og -name "*.wasm" -exec rm -f {} \; 2>/dev/null
echo "Done. Removed resvg.wasm + yoga.wasm (~1.4 MiB saved)"
