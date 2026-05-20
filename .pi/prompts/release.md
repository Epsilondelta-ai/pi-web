---
description: Release pi-web
argument-hint: "<version>"
---
Release `$1`.

Rules
- Tag → `vX.Y.Z`; absent local/remote.
- Preconditions → clean tree; `origin`; `gh auth status`.
- Version → `package.json` = `${1#v}`; lock refresh only if needed.
- Verify → `bun run check` before tag.
- Assets → `bun run build` → `bun run embed:assets`.
- Build → `./backend/cmd/pi-web-server`; targets: linux/darwin × amd64/arm64; ldflag `-X main.version=$1`.
- Archive → `dist/release/pi-web_${1#v}_{os}_{arch}.tar.gz`; binary inside = `pi-web`.
- Checksums → `dist/release/checksums.txt` for 4 archives.
- Git → commit `chore: release $1`; annotated tag `$1`; push commit+tag.
- GitHub → create release generated notes; upload 4 archives + checksums; verify 5 assets.
- Final → release URL + asset names.
