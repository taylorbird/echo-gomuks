#!/usr/bin/env bash
#
# Builds the gomuks backend (pkg/ffi) as a static library for iOS, for linking into an app.
#
# Usage: scripts/ios-ffi-build.sh <simulator|device> [out-dir]
#
# Upstream's pkg/ffi/build.sh makes a shared library; iOS apps link static archives, so this
# calls go build with -buildmode=c-archive instead. Every C and C++ compiler cgo uses must be
# pointed at the iOS SDK: libde265 (HEIC decoding) is C++, and with only CC set it was built
# for macOS and the archive mixed platforms, which Xcode refuses to link.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TARGET="${1:-}"
OUT_DIR="${2:-$REPO_ROOT/target/ios-ffi/$TARGET}"
MIN_IOS="16.0"

case "$TARGET" in
	simulator)
		SDK_NAME=iphonesimulator
		CLANG_TARGET="arm64-apple-ios${MIN_IOS}-simulator"
		;;
	device)
		SDK_NAME=iphoneos
		CLANG_TARGET="arm64-apple-ios${MIN_IOS}"
		;;
	*)
		echo "usage: scripts/ios-ffi-build.sh <simulator|device> [out-dir]" >&2
		exit 1
		;;
esac

SDK_PATH="$(xcrun --sdk "$SDK_NAME" --show-sdk-path)"
FLAGS="-isysroot $SDK_PATH -target $CLANG_TARGET"
mkdir -p "$OUT_DIR"

GOOS=ios GOARCH=arm64 CGO_ENABLED=1 \
	CC="$(xcrun --sdk "$SDK_NAME" --find clang)" \
	CXX="$(xcrun --sdk "$SDK_NAME" --find clang++)" \
	CGO_CFLAGS="$FLAGS" CGO_CXXFLAGS="$FLAGS" CGO_LDFLAGS="$FLAGS" \
	go -C "$REPO_ROOT" build -tags goolm,sqlite_fts5 -buildmode=c-archive \
	-o "$OUT_DIR/libgomuksffi.a" ./pkg/ffi

# The generated header only #includes upstream's; ship the real one alongside the archive.
cp "$REPO_ROOT/pkg/ffi/gomuksffi.h" "$OUT_DIR/"
rm -f "$OUT_DIR/libgomuksffi.h"

# Fail loudly if any object came out for the wrong platform (7 = iOS simulator, 2 = iOS).
want=$([[ "$TARGET" == simulator ]] && echo 7 || echo 2)
bad=$(xcrun otool -l "$OUT_DIR/libgomuksffi.a" | awk '/LC_BUILD_VERSION/{getline;getline;print $2}' | grep -vx "$want" | sort -u || true)
if [[ -n "$bad" ]]; then
	echo "error: archive contains objects for platform(s) $bad, expected $want" >&2
	exit 1
fi
echo "built $OUT_DIR/libgomuksffi.a ($TARGET)"
