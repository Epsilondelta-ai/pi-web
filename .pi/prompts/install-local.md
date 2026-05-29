---
description: Build and install pi-web locally
argument-hint: "install local"
---
Build current pi-web and install it to the local user binary.

Rules
- Verify tree state first: `git status --short --branch`.
- Build → `bun run build:single`.
- Resolve install path first: `PI_WEB_INSTALL_BIN="${PI_WEB_INSTALL_BIN:-$HOME/.local/bin/pi-web}"`.
- Ensure parent dir exists: `mkdir -p "$(dirname "$PI_WEB_INSTALL_BIN")"`.
- Install atomically → copy `dist/pi-web` to `${PI_WEB_INSTALL_BIN}.new`, `chmod +x`, then `mv` to `${PI_WEB_INSTALL_BIN}`.
- Do not overwrite `${PI_WEB_INSTALL_BIN}` directly; it may be running and return `Text file busy`.
- Verify → `command -v pi-web`, `"$PI_WEB_INSTALL_BIN" --version`, and SHA256 for `dist/pi-web` + `${PI_WEB_INSTALL_BIN}` must match (`sha256sum` on Linux, `shasum -a 256` on macOS).
- If `cmd/pi-web/static/` assets changed after `build:single`, commit them with message `Update embedded assets for local install` and include exactly `Co-authored-by: JuunAI <juunai.ai.i@gmail.com>`.
- Last action after successful install/verify/optional commit → `sudo systemctl restart pi-web`.
- Final → build/install/verify/restart status + commit hash if committed.
