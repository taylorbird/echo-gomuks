#!/usr/bin/env bash
# Builds the Linux echo bundles (AppImage + .deb) inside an OrbStack machine and copies
# them back to target/linux/<arch>/ in this repo.
#
#   scripts/linux-build.sh            # arm64, machine "echo-builder"
#   ARCH=amd64 scripts/linux-build.sh # x86_64 under Rosetta, machine "echo-builder-amd64"
#
# The source is rsynced into the machine's own disk rather than built in place over the
# /Users share: node_modules and target/ here hold macOS binaries, and building across the
# share is much slower. Same order as release.sh: web build -> go build -> tauri build,
# because the Go sidecar embeds web/dist.
#
# Updater artifacts are only produced when TAURI_SIGNING_PRIVATE_KEY is set; otherwise the
# bundles are built unsigned for manual install.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ARCH="${ARCH:-arm64}"
case "$ARCH" in
arm64) MACHINE="${MACHINE:-echo-builder}"; TRIPLE=aarch64-unknown-linux-gnu ;;
amd64) MACHINE="${MACHINE:-echo-builder-amd64}"; TRIPLE=x86_64-unknown-linux-gnu ;;
*) echo "ARCH must be arm64 or amd64" >&2; exit 1 ;;
esac
DISTRO="${DISTRO:-debian:bookworm}"
OUT="$REPO_ROOT/target/linux/$ARCH"

log() { printf '\033[1m==> %s\033[0m\n' "$*"; }

if ! orbctl info "$MACHINE" >/dev/null 2>&1; then
	log "creating OrbStack machine $MACHINE ($DISTRO, $ARCH)"
	orbctl create -a "$ARCH" "$DISTRO" "$MACHINE"
fi
orbctl start "$MACHINE" >/dev/null 2>&1 || true

if ! orb -m "$MACHINE" sh -c 'test -x "$HOME/.cargo/bin/cargo" && test -x /usr/local/go/bin/go && test -x /opt/node/bin/node'; then
	log "provisioning $MACHINE"
	orb -m "$MACHINE" bash "$REPO_ROOT/scripts/linux/provision.sh"
fi

log "building in $MACHINE"
orb -m "$MACHINE" env REPO_ROOT="$REPO_ROOT" TRIPLE="$TRIPLE" OUT="$OUT" \
	TAURI_SIGNING_PRIVATE_KEY="${TAURI_SIGNING_PRIVATE_KEY:-}" \
	TAURI_SIGNING_PRIVATE_KEY_PASSWORD="${TAURI_SIGNING_PRIVATE_KEY_PASSWORD:-}" \
	bash -s <<'EOF'
set -euo pipefail
export PATH="$HOME/.cargo/bin:/usr/local/go/bin:/opt/node/bin:$PATH"
SRC="$HOME/echo-src"
mkdir -p "$SRC"
rsync -a --delete \
	--exclude .git --exclude .claude --exclude /target \
	--exclude node_modules --exclude /web/dist --exclude /web/src-tauri/target \
	--exclude '/web/src-tauri/binaries/gomuks-*' --exclude /web/src-tauri/gen \
	"$REPO_ROOT/" "$SRC/"

cd "$SRC/web"
# npm ci is the slow step, so only rerun it when the lockfile changes.
LOCK_HASH="$(sha256sum package-lock.json | cut -d' ' -f1)"
if [[ ! -d node_modules || "$(cat node_modules/.lock-hash 2>/dev/null)" != "$LOCK_HASH" ]]; then
	npm ci
	echo "$LOCK_HASH" > node_modules/.lock-hash
fi
npm run build

cd "$SRC"
go build -buildvcs=false -tags goolm,sqlite_fts5 -o "web/src-tauri/binaries/gomuks-$TRIPLE" ./cmd/gomuks

cd "$SRC/web"
# OrbStack machines have no FUSE, so the AppImage tooling must unpack itself to run,
# and linuxdeploy's bundled strip is too old for newer ELF sections.
export APPIMAGE_EXTRACT_AND_RUN=1 NO_STRIP=true
OVERRIDE='{"build":{"beforeBuildCommand":""}}'
if [[ -z "$TAURI_SIGNING_PRIVATE_KEY" ]]; then
	unset TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
	OVERRIDE='{"build":{"beforeBuildCommand":""},"bundle":{"createUpdaterArtifacts":false}}'
fi
./node_modules/.bin/tauri build --config "$OVERRIDE"

rm -rf "$OUT"
mkdir -p "$OUT"
BUNDLE="$SRC/web/src-tauri/target/release/bundle"
cp "$BUNDLE"/appimage/*.AppImage* "$OUT/"
cp "$BUNDLE"/deb/*.deb "$OUT/"
ls -la "$OUT"
EOF
log "done: $OUT"
