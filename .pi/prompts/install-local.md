---
description: Build and install pi-web locally
argument-hint: ""
---
Build current pi-web and install it to the local user binary.

Rules
- Verify tree state first: `git status --short --branch`.
- Build → `bun run build:single`.
- Install atomically → copy `dist/pi-web` to `/home/pi/.local/bin/pi-web.new`, `chmod +x`, then `mv` to `/home/pi/.local/bin/pi-web`.
- Do not overwrite `/home/pi/.local/bin/pi-web` directly; it may be running and return `Text file busy`.
- Verify → `command -v pi-web`, `pi-web --version`, and `sha256sum dist/pi-web /home/pi/.local/bin/pi-web` must match.
- If `static/` assets changed after `build:single`, commit them with message `Update embedded assets for local install` and include exactly `Co-authored-by: JuunAI <juunai.ai.i@gmail.com>`.
- Final → build/install/verify status + commit hash if committed.
