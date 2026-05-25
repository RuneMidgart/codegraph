#!/bin/sh
#
# CodeGraph standalone installer.
#
# Downloads a self-contained bundle (a vendored Node runtime + the app) from
# GitHub Releases. No Node.js, no build tools, no npm required — ideal for a
# fresh Linux VPS over SSH.
#
#   curl -fsSL https://raw.githubusercontent.com/RuneMidgart/codegraph/copilot-skill-version/install.sh | sh
#
# Upgrade:   re-run the same command.
# Uninstall: curl -fsSL .../install.sh | sh -s -- --uninstall
# Configure: curl -fsSL .../install.sh | sh -s -- --copilot
#
# Environment:
#   CODEGRAPH_VERSION      release tag to install (default: latest)
#   CODEGRAPH_INSTALL_DIR  bundle location   (default: ~/.codegraph)
#   CODEGRAPH_BIN_DIR      symlink location  (default: ~/.local/bin)
#   CODEGRAPH_INSTALL_TARGET  optional installer target(s), e.g. copilot
set -eu

REPO="RuneMidgart/codegraph"
INSTALL_DIR="${CODEGRAPH_INSTALL_DIR:-$HOME/.codegraph}"
BIN_DIR="${CODEGRAPH_BIN_DIR:-$HOME/.local/bin}"
CONFIGURE_TARGET="${CODEGRAPH_INSTALL_TARGET:-}"

while [ "$#" -gt 0 ]; do
  case "$1" in
    --uninstall)
      rm -f "$BIN_DIR/codegraph"
      rm -rf "$INSTALL_DIR"
      echo "CodeGraph uninstalled (removed $INSTALL_DIR and $BIN_DIR/codegraph)."
      exit 0
      ;;
    --copilot|--github-copilot)
      CONFIGURE_TARGET="copilot"
      shift
      ;;
    --target)
      [ "$#" -ge 2 ] || { echo "codegraph: --target requires a value." >&2; exit 1; }
      CONFIGURE_TARGET="$2"
      shift 2
      ;;
    --target=*)
      CONFIGURE_TARGET="${1#--target=}"
      shift
      ;;
    *)
      echo "codegraph: unknown installer option '$1'." >&2
      echo "usage: install.sh [--uninstall] [--copilot|--target <ids>]" >&2
      exit 1
      ;;
  esac
done

# 1. Detect platform → target triple matching the release archives.
os="$(uname -s)"
arch="$(uname -m)"
case "$os" in
  Darwin) os="darwin" ;;
  Linux)  os="linux" ;;
  *) echo "codegraph: unsupported OS '$os'." >&2; exit 1 ;;
esac
case "$arch" in
  arm64|aarch64) arch="arm64" ;;
  x86_64|amd64)  arch="x64" ;;
  *) echo "codegraph: unsupported architecture '$arch'." >&2; exit 1 ;;
esac
download_target="${os}-${arch}"

# 2. Resolve the version (latest release unless pinned).
#
# Resolve "latest" from the releases/latest *web* redirect, not the GitHub API:
# the unauthenticated API is rate-limited to 60 requests/hour per IP and returns
# 403 once exhausted — routine on shared/cloud hosts and CI (issue #325). The
# redirect (github.com/<repo>/releases/latest -> .../releases/tag/vX.Y.Z) has no
# such limit. Fall back to the API if the redirect can't be read.
version="${CODEGRAPH_VERSION:-}"
if [ -z "$version" ]; then
  version="$(curl -fsSLI -o /dev/null -w '%{url_effective}' "https://github.com/$REPO/releases/latest" \
    | sed -n 's#.*/releases/tag/##p')"
fi
if [ -z "$version" ]; then
  version="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n1)"
fi
[ -n "$version" ] || { echo "codegraph: could not resolve latest version; set CODEGRAPH_VERSION (e.g. CODEGRAPH_VERSION=v0.9.4)." >&2; exit 1; }
# Release tags are vX.Y.Z; accept a bare X.Y.Z in CODEGRAPH_VERSION too.
case "$version" in v*) ;; *) version="v$version" ;; esac

# 3. Download + extract the bundle.
url="https://github.com/$REPO/releases/download/$version/codegraph-${download_target}.tar.gz"
echo "Installing CodeGraph $version ($download_target)..."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL "$url" -o "$tmp/cg.tar.gz" || { echo "codegraph: download failed: $url" >&2; exit 1; }

dest="$INSTALL_DIR/versions/$version"
rm -rf "$dest"
mkdir -p "$dest"
# Archives contain a top-level codegraph-<target>/ dir; strip it.
tar -xzf "$tmp/cg.tar.gz" -C "$dest" --strip-components=1

# 4. Symlink the launcher onto PATH and mark the current version.
mkdir -p "$BIN_DIR"
ln -sf "$dest/bin/codegraph" "$BIN_DIR/codegraph"
ln -sfn "$dest" "$INSTALL_DIR/current"

echo "Installed to $dest"
echo "Linked     $BIN_DIR/codegraph"
case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    echo ""
    echo "$BIN_DIR is not on your PATH. Add it:"
    echo "  export PATH=\"$BIN_DIR:\$PATH\""
    ;;
esac
if [ -n "$CONFIGURE_TARGET" ]; then
  echo ""
  echo "Configuring CodeGraph for target(s): $CONFIGURE_TARGET"
  "$BIN_DIR/codegraph" install --target="$CONFIGURE_TARGET" --location=global --yes
fi
echo ""
echo "Done. Run: codegraph --help"
