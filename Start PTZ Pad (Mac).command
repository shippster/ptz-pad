#!/bin/bash
# Double-click to start PTZ Pad. The first run downloads what it needs into this folder.
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"

launch() {
  # Fetch the auto-tracking model if an earlier download didn't finish (skipped when offline).
  if [ ! -f "$ROOT/models/pose_landmarker_lite.task" ] && [ -x "$ROOT/runtime/node/bin/node" ]; then "$ROOT/runtime/node/bin/node" "$ROOT/tools/get-models.js"; fi
  if [ "$(uname)" = "Darwin" ]; then
    open -n "$ROOT/node_modules/electron/dist/Electron.app" --args "$ROOT"
  else
    nohup "$ROOT/node_modules/electron/dist/electron" "$ROOT" >/dev/null 2>&1 &
  fi
  exit 0
}
fail() {
  echo
  echo " Setup didn't finish: $1"
  echo " Check your internet connection and run this again."
  echo " If it keeps failing, delete the runtime and node_modules folders and retry."
  read -r -p " Press Return to close." _
  exit 1
}

if { [ -d node_modules/electron/dist/Electron.app ] || [ -x node_modules/electron/dist/electron ]; } && [ -f node_modules/.ptz-pad-1.4.0 ]; then launch; fi

echo
echo " Setting up PTZ Pad. This happens once and needs an internet connection."
echo

if [ ! -x runtime/node/bin/npm ]; then
  case "$(uname)" in Darwin) os=darwin ;; Linux) os=linux ;; *) fail "unsupported system" ;; esac
  case "$(uname -m)" in arm64|aarch64) arch=arm64 ;; x86_64|amd64) arch=x64 ;; *) fail "unsupported processor $(uname -m)" ;; esac
  v=$(curl -fsSL https://nodejs.org/dist/index.json | tr '{' '\n' | grep -v '"lts":false' | grep -m1 '"lts"' | sed -E 's/.*"version":"(v[0-9.]+)".*/\1/')
  [ -n "$v" ] || fail "couldn't look up the Node.js version"
  name="node-$v-$os-$arch"
  echo " Downloading Node.js $v ($arch)..."
  rm -rf runtime && mkdir -p runtime
  curl -fL --progress-bar "https://nodejs.org/dist/$v/$name.tar.gz" | tar -xz -C runtime || fail "download failed"
  mv "runtime/$name" runtime/node
fi
export PATH="$ROOT/runtime/node/bin:$PATH"

echo " Installing PTZ Pad components..."
npm install --include=optional --no-audit --no-fund --loglevel=error || fail "npm install failed"
launch
