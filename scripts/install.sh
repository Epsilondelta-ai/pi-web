#!/usr/bin/env sh
set -eu

REPO="${PI_WEB_REPO:-Epsilondelta-ai/pi-web}"
VERSION="${PI_WEB_VERSION:-latest}"
INSTALL_DIR="${PI_WEB_INSTALL_DIR:-$HOME/.local/bin}"
BIN_NAME="pi-web"

usage() {
  cat <<'USAGE'
Install pi-web from GitHub Releases.

Environment variables:
  PI_WEB_VERSION      Release tag to install. Default: latest
                      Example: PI_WEB_VERSION=v1.0.0
  PI_WEB_INSTALL_DIR  Install directory. Default: $HOME/.local/bin
  PI_WEB_REPO         GitHub repo. Default: Epsilondelta-ai/pi-web

Examples:
  curl -fsSL https://raw.githubusercontent.com/Epsilondelta-ai/pi-web/main/scripts/install.sh | sh
  PI_WEB_VERSION=v1.0.0 sh scripts/install.sh
  PI_WEB_INSTALL_DIR=/usr/local/bin sh scripts/install.sh
USAGE
}

if [ "${1:-}" = "-h" ] || [ "${1:-}" = "--help" ]; then
  usage
  exit 0
fi

need_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "error: required command not found: $1" >&2
    exit 1
  fi
}

fetch_stdout() {
  url="$1"
  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO- "$url"
  else
    echo "error: curl or wget is required" >&2
    exit 1
  fi
}

download_file() {
  url="$1"
  out="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --progress-bar -o "$out" "$url"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$out" "$url"
  else
    echo "error: curl or wget is required" >&2
    exit 1
  fi
}

resolve_latest_version() {
  api="https://api.github.com/repos/$REPO/releases/latest"
  tag="$(fetch_stdout "$api" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1)"
  if [ -z "$tag" ]; then
    echo "error: could not resolve latest release tag from $api" >&2
    exit 1
  fi
  printf '%s' "$tag"
}

os_name() {
  case "$(uname -s)" in
    Darwin) printf 'darwin' ;;
    Linux) printf 'linux' ;;
    MINGW*|MSYS*|CYGWIN*|Windows_NT) echo "error: Windows releases are not provided" >&2; exit 1 ;;
    *) echo "error: unsupported OS: $(uname -s)" >&2; exit 1 ;;
  esac
}

arch_name() {
  case "$(uname -m)" in
    x86_64|amd64) printf 'amd64' ;;
    arm64|aarch64) printf 'arm64' ;;
    *) echo "error: unsupported architecture: $(uname -m)" >&2; exit 1 ;;
  esac
}

if [ "$VERSION" = "latest" ]; then
  VERSION="$(resolve_latest_version)"
fi

OS="$(os_name)"
ARCH="$(arch_name)"
ASSET_VERSION="${VERSION#v}"
EXT="tar.gz"
BIN_FILE="$BIN_NAME"

ASSET="${BIN_NAME}_${ASSET_VERSION}_${OS}_${ARCH}.${EXT}"
URL="https://github.com/$REPO/releases/download/$VERSION/$ASSET"
TMP_DIR="$(mktemp -d)"
ARCHIVE="$TMP_DIR/$ASSET"

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT INT TERM

echo "Installing $BIN_NAME $VERSION for $OS/$ARCH"
echo "Downloading $URL"
download_file "$URL" "$ARCHIVE"

need_cmd tar
tar -xzf "$ARCHIVE" -C "$TMP_DIR"

FOUND_BIN="$(find "$TMP_DIR" -type f -name "$BIN_FILE" | head -n 1)"
if [ -z "$FOUND_BIN" ]; then
  echo "error: $BIN_FILE not found in $ASSET" >&2
  exit 1
fi

mkdir -p "$INSTALL_DIR"
TARGET="$INSTALL_DIR/$BIN_FILE"
INSTALL_TMP="$INSTALL_DIR/.${BIN_FILE}.tmp.$$"
cp "$FOUND_BIN" "$INSTALL_TMP"
chmod +x "$INSTALL_TMP"
mv -f "$INSTALL_TMP" "$TARGET"

echo "Installed: $TARGET"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Note: $INSTALL_DIR is not in PATH. Add this to your shell profile:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo "Run: $BIN_FILE"
