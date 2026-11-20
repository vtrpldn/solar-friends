#!/bin/sh
# Builds V3 for the browser into bevy-v3/web/dist. Serve that folder with any static server.
set -e
cd "$(dirname "$0")/.."
profile=${1:-release}
cargo build --target wasm32-unknown-unknown --profile "$profile"
rm -rf web/dist && mkdir -p web/dist
wasm-bindgen --target web --no-typescript --out-dir web/dist \
  "target/wasm32-unknown-unknown/$profile/solar-friends-v3.wasm"
cp web/index.html web/dist/
