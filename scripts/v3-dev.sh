#!/usr/bin/env bash
# Run the V3 desktop game with local iteration tools. See bevy-v3/docs/iteration.md.
#
#   scripts/v3-dev.sh [game args]              fast relinks, live asset reloading
#   scripts/v3-dev.sh --hot [game args]        experimental: patch edited systems live
#   scripts/v3-dev.sh --inspector [game args]  also the entity inspector (Alt+`)
#
# Game args pass through, e.g. `scripts/v3-dev.sh --hot --play --sandbox`.
set -euo pipefail
cd "$(dirname "$0")/../bevy-v3"
export PATH="$HOME/.cargo/bin:$PATH"

mode=dev
case "${1:-}" in
  --hot) mode=hot; shift ;;
  --inspector) mode=inspector; shift ;;
esac

if [[ $mode == hot ]]; then
  # Homebrew's `dx` is Deno's; the Dioxus CLI lives in ~/.cargo/bin.
  dx="$HOME/.cargo/bin/dx"
  if ! "$dx" --version 2>/dev/null | grep -q '^dioxus 0\.7\.'; then
    echo "Hot patching needs the Dioxus CLI that matches Bevy 0.18's subsecond:" >&2
    echo "  cargo install dioxus-cli@0.7.10 --locked" >&2
    exit 1
  fi
  serve=(serve --desktop --hot-patch --features hot --always-on-top false)
  # `=` keeps dx from reading game flags such as --play as its own.
  (($#)) && serve+=("--args=$*")
  exec "$dx" "${serve[@]}"
fi

exec cargo run --features "$mode" -- "$@"
