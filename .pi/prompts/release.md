---
description: Release pi-web
argument-hint: ""
---
Release pi-web. Do not ask for or require a version/tag argument.

Rules
- Inspect first → `git status --short --branch`, existing GitHub tags/releases, and current work since the latest release tag.
- Preconditions → clean tree; on `main`; up to date with `origin/main`; `gh auth status`.
- Decide version automatically from current version, GitHub tags/releases, and unreleased changes; use semver (`patch`/`minor`/`major`) and normalize tag to `vX.Y.Z`.
- Version → update `package.json` to `${TAG#v}` and `cmd/pi-web/cli.go` `version` to `${TAG}`; refresh `bun.lock` only if needed.
- Release notes → write from git history/current changes since latest release; include user-facing changes, fixes, breaking changes, and verification summary when applicable.
- Verify → `bun run check` before tag.
- Git → commit `chore: release ${TAG}` with exactly `Co-authored-by: JuunAI <juunai.ai.i@gmail.com>`; annotated tag `${TAG}`; push commit, then tag.
- GitHub Actions → `.github/workflows/release.yml` owns release creation and uploads on tag push.
- Do not manually build/upload release assets unless the workflow fails.
- Workflow assets → linux/darwin × amd64/arm64 archives named `pi-web_${TAG#v}_{os}_{arch}.tar.gz`.
- Verify → release workflow succeeds; GitHub release exists; release notes are present; 4 archive assets uploaded.
- Final → chosen version + release URL + workflow URL + asset names.
