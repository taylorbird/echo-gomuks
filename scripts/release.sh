#!/usr/bin/env bash
#
# Cuts a signed, notarized echo release and publishes it to GitHub with an updater feed.
#
# Usage: scripts/release.sh <version|patch|minor>
#
# The step order below is load-bearing, not stylistic:
#   web build  ->  go build  ->  tauri build
# web/frontend.go has `//go:embed dist`, so the Go sidecar bakes in whatever is in web/dist at
# the moment it is compiled, and the shipped app loads its UI from the sidecar (not from the
# Tauri bundle). Building the sidecar before the frontend would ship the previous release's UI.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TAURI_CONF="$REPO_ROOT/web/src-tauri/tauri.conf.json"
PACKAGE_JSON="$REPO_ROOT/web/package.json"
CARGO_TOML="$REPO_ROOT/web/src-tauri/Cargo.toml"
CARGO_LOCK="$REPO_ROOT/web/src-tauri/Cargo.lock"
BUNDLE_DIR="$REPO_ROOT/web/src-tauri/target/release/bundle"

SIGNING_KEY="$HOME/.tauri/echo.key"
APPLE_ACCOUNT="taylor.bird@gmail.com"
APPLE_TEAM="UFCDGSKCXB"
GH_REPO="taylorbird/echo-gomuks"
GH_ACCOUNT_REQUIRED="taylorbird"
GH_REPO_URL="https://github.com/$GH_REPO"

die() {
	echo "error: $*" >&2
	exit 1
}

step() {
	echo
	echo "==> $*"
}

# --------------------------------------------------------------------------------------------
# Argument + preflight checks
# --------------------------------------------------------------------------------------------

[[ $# -eq 1 ]] || die "usage: scripts/release.sh <version|patch|minor>"
BUMP="$1"

for tool in jq gh go npx security xcrun spctl; do
	command -v "$tool" >/dev/null 2>&1 || die "required tool not found on PATH: $tool"
done

# The four version files must already agree — otherwise "the current version" is undefined and
# whichever one we read would silently win.
read_tauri_version() { jq -r '.version' "$TAURI_CONF"; }
read_package_version() { jq -r '.version' "$PACKAGE_JSON"; }
# Only the [package] block; [build-dependencies] and [dependencies] have version keys too.
read_cargo_version() {
	awk '/^\[package\]/ {in_pkg=1; next} /^\[/ {in_pkg=0} in_pkg && /^version[[:space:]]*=/ {
		gsub(/^version[[:space:]]*=[[:space:]]*"|"[[:space:]]*$/, ""); print; exit
	}' "$CARGO_TOML"
}
# Cargo.lock pins this crate's own version too, and `cargo build` rewrites it to match Cargo.toml.
# Leaving it out of the bump means an aborted release strands it at the new version, and a
# successful one tags a commit whose Cargo.toml and Cargo.lock disagree.
read_lock_version() {
	awk '/^name = "app"$/ {found=1; next} found && /^version = / {
		gsub(/^version = "|"$/, ""); print; exit
	}' "$CARGO_LOCK"
}

CUR_TAURI="$(read_tauri_version)"
CUR_PACKAGE="$(read_package_version)"
CUR_CARGO="$(read_cargo_version)"
CUR_LOCK="$(read_lock_version)"

if [[ "$CUR_TAURI" != "$CUR_PACKAGE" || "$CUR_TAURI" != "$CUR_CARGO" || "$CUR_TAURI" != "$CUR_LOCK" ]]; then
	die "version files disagree — fix them before releasing:
  $TAURI_CONF:  $CUR_TAURI
  $PACKAGE_JSON: $CUR_PACKAGE
  $CARGO_TOML:   $CUR_CARGO
  $CARGO_LOCK:   $CUR_LOCK"
fi
CUR_VERSION="$CUR_TAURI"
[[ "$CUR_VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "current version is not semver: $CUR_VERSION"

IFS=. read -r CUR_MAJOR CUR_MINOR CUR_PATCH <<<"$CUR_VERSION"
case "$BUMP" in
patch) VERSION="$CUR_MAJOR.$CUR_MINOR.$((CUR_PATCH + 1))" ;;
minor) VERSION="$CUR_MAJOR.$((CUR_MINOR + 1)).0" ;;
*)
	[[ "$BUMP" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "not a semver version or patch/minor: $BUMP"
	VERSION="$BUMP"
	;;
esac
TAG="v$VERSION"

BRANCH="$(git -C "$REPO_ROOT" rev-parse --abbrev-ref HEAD)"
[[ "$BRANCH" != "HEAD" ]] || die "detached HEAD — check out a branch before releasing"

# The release commit adds only the three version files. Anything already staged would be swept
# into it, and this working tree intentionally carries a lot of unrelated uncommitted work.
git -C "$REPO_ROOT" diff --cached --quiet \
	|| die "there are staged changes; unstage them (git reset) so the release commit stays clean"

git -C "$REPO_ROOT" rev-parse -q --verify "refs/tags/$TAG" >/dev/null \
	&& die "tag $TAG already exists locally"
if git -C "$REPO_ROOT" ls-remote --exit-code --tags origin "$TAG" >/dev/null 2>&1; then
	die "tag $TAG already exists on origin"
fi

# Notes for the release being cut. One file, rewritten each time: whatever is in it now describes
# this version. It is read here rather than at publish time so a missing or empty file fails in
# preflight instead of after the build and two notarization round trips.
RELEASE_NOTES_FILE="$REPO_ROOT/RELEASE_NOTES.md"
[[ -f "$RELEASE_NOTES_FILE" ]] || die "no release notes at $RELEASE_NOTES_FILE"
RELEASE_NOTES="$(sed -e '/<!--/,/-->/d' -e 's/[[:space:]]*$//' "$RELEASE_NOTES_FILE" \
	| awk 'NF {found = 1} found' )"
[[ -n "$(printf '%s' "$RELEASE_NOTES" | tr -d '[:space:]')" ]] \
	|| die "$RELEASE_NOTES_FILE is empty — write what changed before releasing"

[[ -f "$SIGNING_KEY" ]] || die "updater signing key not found: $SIGNING_KEY"
gh auth status >/dev/null 2>&1 || die "gh is not authenticated; run: gh auth login"

# Pin the identity for the whole run instead of inheriting whichever account happens to be active.
# `gh auth switch` writes global state that anything else on this machine can change, and a release
# spends 10+ minutes building and waiting on Apple: on 2026-08-27 the active account flipped to a
# read-only one *during* that window, so preflight passed as the right user and `gh release create`
# then failed as the wrong one. Exporting GH_TOKEN makes every gh call below immune to that drift —
# and the git credential helper is `gh auth git-credential`, which honours it too, so the push to
# origin is pinned to the same account rather than to whoever is active when it runs.
GH_TOKEN="$(gh auth token --user "$GH_ACCOUNT_REQUIRED" 2>/dev/null || true)"
[[ -n "$GH_TOKEN" ]] \
	|| die "no gh token for $GH_ACCOUNT_REQUIRED; run: gh auth login --user $GH_ACCOUNT_REQUIRED"
export GH_TOKEN

# Belt and braces: prove the pinned token is both who we expect and able to write here. GitHub
# answers a permission-denied write with 404 rather than 403, so without this the failure surfaces
# as a baffling "not found" at `gh release create` — after the entire build and notarization.
GH_ACCOUNT="$(gh api user -q .login 2>/dev/null || echo "unknown")"
[[ "$GH_ACCOUNT" == "$GH_ACCOUNT_REQUIRED" ]] \
	|| die "pinned gh token resolves to $GH_ACCOUNT, expected $GH_ACCOUNT_REQUIRED"
GH_PERMISSION="$(gh repo view "$GH_REPO" --json viewerPermission -q .viewerPermission 2>/dev/null || true)"
case "$GH_PERMISSION" in
ADMIN | MAINTAIN | WRITE) ;;
"") die "cannot read $GH_REPO as $GH_ACCOUNT — is that account still a collaborator?" ;;
*) die "$GH_ACCOUNT has $GH_PERMISSION on $GH_REPO and cannot publish a release" ;;
esac

# Resolve the keychain secrets up front: they can prompt, and finding out after a 10-minute
# build that notarization has no password is a bad trade.
UPDATER_KEY_PASSWORD="$(security find-generic-password -s echo-updater-key -w)" \
	|| die "keychain item 'echo-updater-key' not found"
NOTARY_PASSWORD="$(security find-generic-password -s echo-notary -w)" \
	|| die "keychain item 'echo-notary' not found"

# Updater signing is the very last thing `tauri build` does — after the compile, after Apple has
# notarized. A bad key, wrong password or misnamed env var therefore costs a full build plus a
# notarization round-trip before it surfaces. Prove the key works now, on a throwaway file.
SIGNER_PROBE="$(mktemp -d)"
echo "probe" >"$SIGNER_PROBE/probe.txt"
if ! TAURI_SIGNING_PRIVATE_KEY="$(cat "$SIGNING_KEY")" \
	TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$UPDATER_KEY_PASSWORD" \
	"$REPO_ROOT/web/node_modules/.bin/tauri" signer sign "$SIGNER_PROBE/probe.txt" \
	>"$SIGNER_PROBE/log" 2>&1; then
	cat "$SIGNER_PROBE/log" >&2
	rm -rf "${SIGNER_PROBE:?}"
	die "the updater signing key or its password did not work; see log above"
fi
rm -rf "${SIGNER_PROBE:?}"

cat <<EOF

Releasing echo $CUR_VERSION -> $VERSION
  branch: $BRANCH
  tag:    $TAG

EOF

# The release commit carries only the version files, so anything else left uncommitted is built
# into the artifacts without being part of the tagged commit — $TAG would then not reproduce this
# build from source. Only worth saying when it is actually true.
if [[ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]]; then
	cat <<EOF
NOTE: this tree has uncommitted changes. They are built into the artifacts but will NOT be part
of the tagged commit, so $TAG will not reproduce this build from source.

$(git -C "$REPO_ROOT" status --short)
EOF
fi

# --------------------------------------------------------------------------------------------
# 1. Version bump
# --------------------------------------------------------------------------------------------

# Targeted first-occurrence edits rather than jq round-trips: tauri.conf.json is 2-space and
# package.json is tab-indented, and reformatting either would bury the change in noise.
# "version" appears exactly once as a key in each JSON file (dependency keys are package names).
write_versions() {
	local to="$1"
	perl -0pi -e "s/(\"version\":\s*\")[^\"]*(\")/\${1}$to\${2}/" "$TAURI_CONF"
	perl -0pi -e "s/(\"version\":\s*\")[^\"]*(\")/\${1}$to\${2}/" "$PACKAGE_JSON"
	# Restricted to the [package] block so the dependency version constraints are left alone.
	perl -0pi -e "s/(\[package\](?:.*?\n)*?version\s*=\s*\")[^\"]*(\")/\${1}$to\${2}/" "$CARGO_TOML"
	# Anchored on the `name = "app"` entry: Cargo.lock lists every dependency in the same shape.
	perl -0pi -e "s/(name = \"app\"\nversion = \")[^\"]*(\")/\${1}$to\${2}/" "$CARGO_LOCK"
	[[ "$(read_tauri_version)" == "$to" ]] || die "failed to write version to $TAURI_CONF"
	[[ "$(read_package_version)" == "$to" ]] || die "failed to write version to $PACKAGE_JSON"
	[[ "$(read_cargo_version)" == "$to" ]] || die "failed to write version to $CARGO_TOML"
	[[ "$(read_lock_version)" == "$to" ]] || die "failed to write version to $CARGO_LOCK"
}

# The bump happens before the builds, so a failure anywhere after it would otherwise leave three
# stray version edits mixed into this branch's large pile of unrelated uncommitted work — easy to
# miss and annoying to unpick, since `git checkout` on these paths would also throw away the
# signing/updater config that lives in them. Put them back instead.
VERSIONS_BUMPED=0
restore_versions() {
	if [[ "$VERSIONS_BUMPED" == "1" ]]; then
		echo >&2
		echo "release aborted — restoring version files to $CUR_VERSION" >&2
		write_versions "$CUR_VERSION"
	fi
}
trap restore_versions EXIT

step "Bumping version to $VERSION"
write_versions "$VERSION"
VERSIONS_BUMPED=1

# --------------------------------------------------------------------------------------------
# 2-3. Frontend, then sidecar (order matters — see the header comment)
# --------------------------------------------------------------------------------------------

step "Building the frontend (tsc -b + vite build)"
# eslint is deliberately not run here: this tree has pre-existing lint errors in files this
# release doesn't touch, and failing the release on them would be noise.
(cd "$REPO_ROOT/web" && npm run build)

step "Building the gomuks sidecar"
# -tags goolm selects the pure-Go olm implementation, so no libolm/CGO flags are needed.
# sqlite_fts5 is required since gomuks v26.06 (local message search); without it the
# backend does not compile.
# The binary is gitignored, so on a fresh clone binaries/ holds only .gitkeep — and `go build -o`
# errors rather than creating a missing parent directory.
mkdir -p "$REPO_ROOT/web/src-tauri/binaries"
(cd "$REPO_ROOT" && go build -tags goolm,sqlite_fts5 \
	-o web/src-tauri/binaries/gomuks-aarch64-apple-darwin ./cmd/gomuks)

# --------------------------------------------------------------------------------------------
# 4. Bundle, sign, notarize
# --------------------------------------------------------------------------------------------

APP="$BUNDLE_DIR/macos/echo-gomuks.app"
TARBALL="$BUNDLE_DIR/macos/echo-gomuks.app.tar.gz"
SIG_FILE="$TARBALL.sig"

# Clear the artifacts we're about to verify. Otherwise a build that fails partway could leave
# the previous release's tarball in place and every check below would happily pass on it.
# Belt-and-braces before an rm -rf: refuse to delete anything outside this repo's target dir.
case "$APP" in
"$REPO_ROOT/web/src-tauri/target/release/bundle/"*) ;;
*) die "refusing to delete outside the bundle dir: $APP" ;;
esac
rm -rf "$APP" "$TARBALL" "$SIG_FILE"
rm -f "$BUNDLE_DIR"/dmg/echo-gomuks_"$VERSION"_*.dmg

step "Bundling, signing and notarizing (this waits on Apple; expect several minutes)"
# ibtoold (actool's persistent daemon) wedges unpredictably: .icon compiles crash with
# "attempt to insert nil object" regardless of package content, and a daemon reset only
# sometimes helps (observed 2026-08-26). So the bundler never runs actool: we compile
# icons/echo.icon -> icons/Assets.car ourselves here, retrying with a daemon reset until
# it works, and tauri.conf.json lists icons/Assets.car, which the bundler copies as-is.
# Assets.car is gitignored, so this step is not an optimisation — it is the only thing that puts
# the file where bundle.icon expects it. A bare `npx tauri build` on a fresh clone will fail here.
step "Compiling icon Assets.car (retrying around flaky ibtoold)"
CAR_TMP="$(mktemp -d)"
car_ok=""
for attempt in 1 2 3 4 5; do
	killall ibtoold 2>/dev/null || true
	rm -rf "${CAR_TMP:?}"/out
	mkdir -p "$CAR_TMP/out"
	if xcrun actool "$REPO_ROOT/web/src-tauri/icons/echo.icon" \
		--compile "$CAR_TMP/out" \
		--output-format human-readable-text --notices --warnings \
		--output-partial-info-plist "$CAR_TMP/out/partial.plist" \
		--app-icon Icon --include-all-app-icons --accent-color AccentColor \
		--enable-on-demand-resources NO --development-region en \
		--target-device mac --minimum-deployment-target 26.0 \
		--platform macosx >"$CAR_TMP/actool.log" 2>&1 \
		&& [[ -f "$CAR_TMP/out/Assets.car" ]]; then
		car_ok=1
		break
	fi
	echo "  actool attempt $attempt failed; resetting ibtoold and retrying" >&2
done
[[ -n "$car_ok" ]] || { cat "$CAR_TMP/actool.log" >&2; die "actool failed 5 times; see log above"; }
cp "$CAR_TMP/out/Assets.car" "$REPO_ROOT/web/src-tauri/icons/Assets.car"
rm -rf "${CAR_TMP:?}"

(
	cd "$REPO_ROOT/web"
	# Not ..._KEY_PATH: that name appears only in the CLI's changelog, is read by nothing, and
	# is silently ignored — the bundler gets all the way through notarization and then fails
	# with "a public key has been found, but no private key". The var takes the key itself.
	export TAURI_SIGNING_PRIVATE_KEY="$(cat "$SIGNING_KEY")"
	export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$UPDATER_KEY_PASSWORD"
	export APPLE_ID="$APPLE_ACCOUNT"
	export APPLE_PASSWORD="$NOTARY_PASSWORD"
	export APPLE_TEAM_ID="$APPLE_TEAM"
	npx tauri build
)

# --------------------------------------------------------------------------------------------
# 5. Locate + verify artifacts
# --------------------------------------------------------------------------------------------

step "Locating artifacts"
[[ -d "$APP" ]] || die "missing app bundle: $APP"
[[ -f "$TARBALL" ]] || die "missing updater tarball: $TARBALL (is bundle.createUpdaterArtifacts set?)"
[[ -f "$SIG_FILE" ]] || die "missing updater signature: $SIG_FILE"

shopt -s nullglob
DMG_MATCHES=("$BUNDLE_DIR"/dmg/echo-gomuks_"$VERSION"_*.dmg)
shopt -u nullglob
[[ ${#DMG_MATCHES[@]} -eq 1 ]] \
	|| die "expected exactly one DMG matching echo-gomuks_${VERSION}_*.dmg, found ${#DMG_MATCHES[@]}"
DMG="${DMG_MATCHES[0]}"

echo "  app:     $APP"
echo "  tarball: $TARBALL"
echo "  sig:     $SIG_FILE"
echo "  dmg:     $DMG"

step "Verifying notarization"
xcrun stapler validate "$APP" || die "notarization ticket is not stapled to $APP"

# The bundler notarizes and staples the .app, and only then builds the DMG around it — so the
# DMG has never been submitted in its own right. Stapling it straight away fails with
# "Record not found": a ticket exists per submitted artifact, and nothing was submitted for this
# one. The DMG is what actually gets downloaded and quarantined, so it needs its own round trip.
if ! spctl -a -t open --context context:primary-signature "$DMG"; then
	step "Notarizing the DMG (a second wait on Apple)"
	xcrun notarytool submit "$DMG" \
		--apple-id "$APPLE_ACCOUNT" \
		--password "$NOTARY_PASSWORD" \
		--team-id "$APPLE_TEAM" \
		--wait || die "notarytool rejected $DMG"
	xcrun stapler staple "$DMG" || die "failed to staple $DMG"
	spctl -a -t open --context context:primary-signature "$DMG" \
		|| die "$DMG still rejected by Gatekeeper after notarizing and stapling"
fi

# --------------------------------------------------------------------------------------------
# 6. Updater feed
# --------------------------------------------------------------------------------------------

step "Generating latest.json"
LATEST_JSON="$BUNDLE_DIR/latest.json"
TARBALL_NAME="$(basename "$TARBALL")"
# gh rewrites spaces in asset names to dots, so the feed URL has to point at the name GitHub
# will actually serve, not at the local filename.
ASSET_NAME="${TARBALL_NAME// /.}"
ASSET_NAME_ENCODED="$(jq -rn --arg n "$ASSET_NAME" '$n|@uri')"

# --rawfile keeps the signature exactly as written (it is a single base64 line) and lets jq do
# the JSON escaping. The endpoint in tauri.conf.json points at /latest/download/latest.json,
# but the artifact URL must be the *tagged* one so an old feed never points at a new binary.
jq -n \
	--arg version "$VERSION" \
	--arg pub_date "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
	--arg notes "$RELEASE_NOTES" \
	--rawfile signature "$SIG_FILE" \
	--arg url "$GH_REPO_URL/releases/download/$TAG/$ASSET_NAME_ENCODED" \
	'{
		version: $version,
		pub_date: $pub_date,
		notes: $notes,
		platforms: {
			"darwin-aarch64": {
				signature: ($signature | rtrimstr("\n")),
				url: $url,
			},
		},
	}' >"$LATEST_JSON"

echo "  wrote $LATEST_JSON"

# --------------------------------------------------------------------------------------------
# 7. Commit, tag, publish
# --------------------------------------------------------------------------------------------

# Archived so the notes file can be overwritten for the next release without losing this one.
# Written before the commit below, and committed with it, or it would never be tracked at all.
mkdir -p "$REPO_ROOT/release-notes"
printf '%s\n' "$RELEASE_NOTES" >"$REPO_ROOT/release-notes/$VERSION.md"

step "Committing the version bump"
# Explicit paths only. `git add -A` here would sweep in the large unrelated work in this tree.
git -C "$REPO_ROOT" add \
	web/src-tauri/tauri.conf.json \
	web/package.json \
	web/src-tauri/Cargo.toml \
	web/src-tauri/Cargo.lock \
	"release-notes/$VERSION.md"
git -C "$REPO_ROOT" commit -m "Release $TAG"
# The bump now lives in a commit, so there's nothing left to roll back.
VERSIONS_BUMPED=0
git -C "$REPO_ROOT" tag "$TAG"

step "Pushing $BRANCH and $TAG to origin"
# gh release create needs the tag to exist on the remote, and the tag needs its commit, so the
# branch goes first. Pushing a branch only publishes commits — nothing uncommitted travels.
git -C "$REPO_ROOT" push origin "$BRANCH"
git -C "$REPO_ROOT" push origin "refs/tags/$TAG"

step "Creating the GitHub release"
gh release create "$TAG" \
	"$DMG" "$TARBALL" "$SIG_FILE" "$LATEST_JSON" \
	--repo "$GH_REPO" \
	--title "echo $TAG" \
	--notes "$RELEASE_NOTES

---

Download the DMG below. Existing installs update themselves." \
	--latest

RELEASE_URL="$GH_REPO_URL/releases/tag/$TAG"

cat <<EOF

==> Released echo $VERSION

  version: $VERSION (was $CUR_VERSION)
  dmg:     $DMG
  release: $RELEASE_URL

The updater feed is served from $GH_REPO_URL/releases/latest/download/latest.json — confirm it
resolves before assuming installed copies can see this release.
EOF
