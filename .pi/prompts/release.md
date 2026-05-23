---
description: Release pi-web
argument-hint: "<version>"
---
Release `$1`.

Rules
- Tag → normalize to `vX.Y.Z`; absent local/remote.
- Preconditions → clean tree; on `main`; up to date with `origin/main`; `gh auth status`.
- Version → `package.json` = `${1#v}`; refresh `bun.lock` only if needed.
- Verify → `bun run check` before tag.
- Git → commit `chore: release $1`; annotated tag `$1`; push commit, then tag.
- GitHub Actions → `.github/workflows/release.yml` owns release creation and uploads on tag push.
- Do not manually build/upload release assets unless the workflow fails.
- Workflow assets → linux/darwin × amd64/arm64 archives named `pi-web_${1#v}_{os}_{arch}.tar.gz`.
- Verify → release workflow succeeds; GitHub release exists; 4 archive assets uploaded.
- Final → release URL + workflow URL + asset names.
