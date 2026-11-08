#!/usr/bin/env bash
set -euo pipefail
export PATH="$HOME/.cargo/bin:$PATH"
if ! command -v wasm-bindgen >/dev/null || [[ "$(wasm-bindgen --version)" != 'wasm-bindgen 0.2.100' ]]; then
  cargo install wasm-bindgen-cli --version 0.2.100 --locked
fi
bash scripts/build.sh
npm run build:site
