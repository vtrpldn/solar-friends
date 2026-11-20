#!/usr/bin/env bash
set -euo pipefail

if [[ ${1:-} == "" || ${2:-} == "" || $# != 2 ]]; then
  echo "Usage: $0 <solar-friends-v3 executable> <output.zip>" >&2
  exit 2
fi
if [[ $(uname -s) != Darwin ]]; then
  echo "Build the macOS app bundle on macOS." >&2
  exit 2
fi

binary=$1
archive=$2
if [[ ! -f $binary || ! -x $binary ]]; then
  echo "Executable not found: $binary" >&2
  exit 2
fi

repo=$(cd "$(dirname "$0")/.." && pwd)
version=$(sed -n 's/^version = "\([0-9.]*\)"$/\1/p' "$repo/bevy-v3/Cargo.toml")
if [[ -z $version ]]; then
  echo "Could not read the game version." >&2
  exit 1
fi

staging=$(mktemp -d)
trap 'rm -rf "$staging"' EXIT
bundle="$staging/Solar Friends V3.app"
mkdir -p "$bundle/Contents/MacOS" "$(dirname "$archive")"
cp "$binary" "$bundle/Contents/MacOS/solar-friends-v3"

cat > "$bundle/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleDisplayName</key>
  <string>Solar Friends V3</string>
  <key>CFBundleName</key>
  <string>Solar Friends V3</string>
  <key>CFBundleIdentifier</key>
  <string>com.solarfriends.v3</string>
  <key>CFBundleExecutable</key>
  <string>solar-friends-v3</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>$version</string>
  <key>CFBundleVersion</key>
  <string>$version</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
PLIST

plutil -lint "$bundle/Contents/Info.plist"
codesign --force --sign - "$bundle"
codesign --verify --strict "$bundle"
ditto -c -k --keepParent "$bundle" "$archive"
