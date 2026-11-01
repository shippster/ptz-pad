#!/bin/bash
# Double-click to add the PTZ Pad helper to the Claude desktop app.
cd "$(dirname "$0")" || exit 1
ROOT="$(pwd)"
fail() { echo; echo " Setup didn't finish: $1"; read -r -p " Press Return to close." _; exit 1; }
echo
echo " Setting up the PTZ Pad helper for the Claude desktop app."
echo " The first run needs an internet connection."
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
if [ ! -d node_modules/koffi ]; then
  echo " Installing helper components..."
  npm install --omit=dev --no-audit --no-fund --loglevel=error || fail "npm install failed"
fi
"$ROOT/runtime/node/bin/node" tools/install-claude-helper.js || fail "couldn't update the Claude settings"
echo
read -r -p " Press Return to close." _
