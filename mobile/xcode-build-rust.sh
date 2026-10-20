#!/usr/bin/env bash
#
# Xcode's "Build Rust Code" step for echo on iOS (see src-tauri/gen/apple/project.yml).
#
# Replaces Tauri's `tauri ios xcode-script`, which only works while `tauri ios build` is
# running and refuses to build unless a simulator runtime matching the SDK is installed
# (this Mac has the iOS 18.5 runtime with SDK 27.1; the app targets iOS 16, so that's fine).
# Plain cargo builds the same library: tauri-build embeds web/dist at compile time.
#
# Needs target/ios-ffi/<simulator|device>/libgomuksffi.a from scripts/ios-ffi-build.sh.
set -euo pipefail

export PATH="$HOME/.cargo/bin:/opt/homebrew/bin:$PATH"
CRATE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/src-tauri" && pwd)"

case "${PLATFORM_NAME:?}" in
	iphonesimulator) TARGET=aarch64-apple-ios-sim ;;
	iphoneos) TARGET=aarch64-apple-ios ;;
	*) echo "error: unsupported platform $PLATFORM_NAME" >&2; exit 1 ;;
esac

PROFILE_FLAG=""
if [[ "${CONFIGURATION:?}" == "release" ]]; then
	PROFILE_FLAG="--release"
fi

# Xcode exports its own SDK and deployment settings, which would leak into cargo's host
# build scripts; give cargo a clean environment apart from the deployment target.
env -i HOME="$HOME" PATH="$PATH" IPHONEOS_DEPLOYMENT_TARGET=16.0 \
	cargo build --manifest-path "$CRATE_DIR/Cargo.toml" --lib --target "$TARGET" $PROFILE_FLAG

OUT_DIR="${SRCROOT:?}/Externals/arm64/$CONFIGURATION"
mkdir -p "$OUT_DIR"
cp "$CRATE_DIR/target/$TARGET/$CONFIGURATION/libecho_mobile_lib.a" "$OUT_DIR/libapp.a"
