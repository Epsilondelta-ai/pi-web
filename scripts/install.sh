#!/usr/bin/env sh
set -eu

REPO="${PI_WEB_REPO:-Epsilondelta-ai/pi-web}"
VERSION="${PI_WEB_VERSION:-latest}"
INSTALL_DIR="${PI_WEB_INSTALL_DIR:-$HOME/.local/bin}"
BIN_NAME="pi-web"
PI_INSTALL_URL="${PI_WEB_PI_INSTALL_URL:-https://pi.dev/install.sh}"
INSTALL_PI="${PI_WEB_INSTALL_PI:-auto}"
INSTALL_DEFAULT_PLUGINS="${PI_WEB_INSTALL_DEFAULT_PLUGINS:-auto}"
DEFAULT_PLUGIN_URLS="${PI_WEB_DEFAULT_PLUGIN_URLS:-https://github.com/Epsilondelta-ai/pi-web-toast-noti https://github.com/Epsilondelta-ai/pi-web-file-browser https://github.com/Epsilondelta-ai/pi-web-git-viewer https://github.com/Epsilondelta-ai/pi-web-sidebar https://github.com/Epsilondelta-ai/pi-web-chat}"

usage() {
  cat <<'USAGE'
Install pi-web from GitHub Releases.

Environment variables:
  PI_WEB_VERSION      Release tag to install. Default: latest
                      Example: PI_WEB_VERSION=v1.0.0
  PI_WEB_INSTALL_DIR  Install directory. Default: $HOME/.local/bin
  PI_WEB_REPO         GitHub repo. Default: Epsilondelta-ai/pi-web
  PI_WEB_INSTALL_PI   Install pi when missing: auto, always, or never. Default: auto
  PI_WEB_PI_INSTALL_URL
                      pi installer URL. Default: https://pi.dev/install.sh
  PI_WEB_INSTALL_DEFAULT_PLUGINS
                      Install default plugins: auto, always, or never. Default: auto
  PI_WEB_DEFAULT_PLUGIN_URLS
                      Space-separated plugin GitHub URLs to install.

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

install_pi_if_needed() {
  case "$INSTALL_PI" in
    auto|always|never) ;;
    *) echo "error: PI_WEB_INSTALL_PI must be auto, always, or never" >&2; exit 1 ;;
  esac

  if [ "$INSTALL_PI" = "never" ]; then
    return
  fi

  if [ "$INSTALL_PI" = "auto" ] && command -v pi >/dev/null 2>&1; then
    echo "pi already installed: $(command -v pi)"
    return
  fi

  echo "Installing pi from $PI_INSTALL_URL"
  fetch_stdout "$PI_INSTALL_URL" | sh

  if command -v pi >/dev/null 2>&1; then
    echo "Installed pi: $(command -v pi)"
    return
  fi

  echo "error: pi install finished, but pi was not found in PATH" >&2
  exit 1
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

json_string() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

plugin_id_from_manifest() {
  sed -n 's/.*"id"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' "$1" | head -n 1
}

install_default_plugins() {
  case "$INSTALL_DEFAULT_PLUGINS" in
    auto|always|never) ;;
    *) echo "error: PI_WEB_INSTALL_DEFAULT_PLUGINS must be auto, always, or never" >&2; exit 1 ;;
  esac

  if [ "$INSTALL_DEFAULT_PLUGINS" = "never" ]; then
    return
  fi

  if ! command -v git >/dev/null 2>&1; then
    if [ "$INSTALL_DEFAULT_PLUGINS" = "always" ]; then
      echo "error: git is required to install default plugins" >&2
      exit 1
    fi
    echo "Skipping default plugins: git not found"
    return
  fi

  plugin_root="$HOME/.pi-web/plugins"
  metadata_root="$plugin_root/.metadata"
  mkdir -p "$plugin_root" "$metadata_root"

  for plugin_url in $DEFAULT_PLUGIN_URLS; do
    plugin_tmp="$TMP_DIR/plugin-$(basename "$plugin_url").$$"
    echo "Installing default plugin: $plugin_url"
    if ! git clone --depth 1 "$plugin_url" "$plugin_tmp" >/dev/null 2>&1; then
      if [ "$INSTALL_DEFAULT_PLUGINS" = "always" ]; then
        echo "error: failed to clone default plugin: $plugin_url" >&2
        exit 1
      fi
      echo "Warning: failed to clone default plugin: $plugin_url" >&2
      continue
    fi

    if [ ! -f "$plugin_tmp/plugin.json" ]; then
      if [ "$INSTALL_DEFAULT_PLUGINS" = "always" ]; then
        echo "error: default plugin is missing plugin.json: $plugin_url" >&2
        exit 1
      fi
      echo "Warning: default plugin is missing plugin.json: $plugin_url" >&2
      continue
    fi

    plugin_id="$(plugin_id_from_manifest "$plugin_tmp/plugin.json")"
    case "$plugin_id" in
      ""|*/*|*\\*|*..*)
        if [ "$INSTALL_DEFAULT_PLUGINS" = "always" ]; then
          echo "error: default plugin has invalid id: $plugin_url" >&2
          exit 1
        fi
        echo "Warning: default plugin has invalid id: $plugin_url" >&2
        continue
        ;;
    esac

    plugin_target="$plugin_root/$plugin_id"
    rm -rf "$plugin_target"
    mkdir -p "$plugin_target"
    cp -R "$plugin_tmp/." "$plugin_target/"
    if [ ! -f "$metadata_root/$plugin_id.json" ]; then
      cat > "$metadata_root/$plugin_id.json" <<EOF
{
  "source": "github",
  "url": "$(json_string "$plugin_url")"
}
EOF
    fi
  done
}

install_pi_if_needed

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

install_default_plugins

echo "Installed: $TARGET"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) ;;
  *)
    echo "Note: $INSTALL_DIR is not in PATH. Add this to your shell profile:"
    echo "  export PATH=\"$INSTALL_DIR:\$PATH\""
    ;;
esac

echo "Run: $BIN_FILE"
