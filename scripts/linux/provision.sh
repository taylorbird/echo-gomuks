#!/usr/bin/env bash
# Installs the echo Linux build toolchain inside an OrbStack Debian machine.
# Run as the machine's normal user; it uses sudo for the system packages.
# Idempotent: rerunning only fills in whatever is missing or out of date.
set -euo pipefail

GO_VERSION="${GO_VERSION:-1.27.1}"
NODE_VERSION="${NODE_VERSION:-22.23.1}"

case "$(uname -m)" in
aarch64) GOARCH=arm64; NODEARCH=arm64 ;;
x86_64) GOARCH=amd64; NODEARCH=x64 ;;
*) echo "unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

# Tauri 2's documented Debian prerequisites, plus what the bundler and this script use.
sudo apt-get update
sudo DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
	build-essential pkg-config curl wget file ca-certificates git rsync jq xz-utils \
	libwebkit2gtk-4.1-dev libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev \
	patchelf desktop-file-utils squashfs-tools xdg-utils

if [[ "$(/usr/local/go/bin/go version 2>/dev/null)" != *"go$GO_VERSION "* ]]; then
	curl -fsSL "https://go.dev/dl/go$GO_VERSION.linux-$GOARCH.tar.gz" -o /tmp/go.tgz
	sudo rm -rf /usr/local/go
	sudo tar -C /usr/local -xzf /tmp/go.tgz
	rm /tmp/go.tgz
fi

NODE_DIR="/opt/node-v$NODE_VERSION"
if [[ ! -x "$NODE_DIR/bin/node" ]]; then
	curl -fsSL "https://nodejs.org/dist/v$NODE_VERSION/node-v$NODE_VERSION-linux-$NODEARCH.tar.xz" -o /tmp/node.txz
	sudo mkdir -p "$NODE_DIR"
	sudo tar -C "$NODE_DIR" --strip-components=1 -xJf /tmp/node.txz
	rm /tmp/node.txz
fi
sudo ln -sfn "$NODE_DIR" /opt/node

if [[ ! -x "$HOME/.cargo/bin/cargo" ]]; then
	curl -fsSL https://sh.rustup.rs | sh -s -- -y --profile minimal
else
	"$HOME/.cargo/bin/rustup" update stable
fi

echo "provisioned: $(/usr/local/go/bin/go version), node $(/opt/node/bin/node --version), $("$HOME/.cargo/bin/cargo" --version)"
