---
description: Release pi-web with cross-platform assets
argument-hint: "<version>"
---
Release this project as `$1`.

Rules:
- `$1` must match `vX.Y.Z` and must not already exist locally or remotely.
- Stop if the working tree is dirty, `gh` is not authenticated, or `origin` is missing.
- Update `package.json` to `${1#v}` and refresh lockfiles only if needed.
- Verify with `bun run check` before tagging.
- Build embedded assets with `bun run build` and `bun run embed:assets`.
- Build `./backend/cmd/pi-web-server` for `linux/amd64`, `linux/arm64`, `darwin/amd64`, `darwin/arm64` using `-ldflags "-X main.version=$1"`.
- Archive each binary as `pi-web` under `dist/release/`:
  - `pi-web_${1#v}_linux_amd64.tar.gz`
  - `pi-web_${1#v}_linux_arm64.tar.gz`
  - `pi-web_${1#v}_darwin_amd64.tar.gz`
  - `pi-web_${1#v}_darwin_arm64.tar.gz`
- Generate `dist/release/checksums.txt` for all four archives.
- Commit `chore: release $1`, create annotated tag `$1`, push commit and tag.
- Create the GitHub release with generated notes, upload the four archives and `checksums.txt`, then verify all five assets exist.
- Return the release URL and uploaded asset names.
