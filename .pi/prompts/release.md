---
description: Bump version, push, create a GitHub release, and upload cross-platform assets
argument-hint: "<version>"
---
Release this project as `$1` end-to-end.

Requirements:

- Treat `$1` as the target git tag. It must match `vX.Y.Z`.
- Update `package.json` version to the tag without the leading `v`.
- If lockfiles need refresh after the version bump, refresh them with the project's package manager.
- Run the full project verification command before tagging: `bun run check`.
- Build frontend/static assets once, then build release binaries for all required OS/architecture targets.
- Package these release assets under `dist/release/`:
  - `pi-web-$1-linux-amd64`
  - `pi-web-$1-linux-arm64`
  - `pi-web-$1-macos-amd64`
  - `pi-web-$1-macos-arm64`
  - `SHA256SUMS`
- `SHA256SUMS` must include checksums for all four binaries.
- Commit the version bump with message `chore: release $1`.
- Create annotated tag `$1`.
- Push the commit and tag to `origin`.
- Create the GitHub release with generated notes using `gh release create`.
- Upload all four binaries and `SHA256SUMS` to the GitHub release using `gh release upload`.
- Verify the release exists and all five assets are attached with `gh release view`.

Execution checklist:

1. Confirm the working tree is clean before making release changes. Stop and report if it is not clean.
2. Confirm `gh` is authenticated and the repo has an `origin` remote.
3. Confirm tag `$1` does not already exist locally or remotely.
4. Update the version in `package.json`.
5. Run formatter/lockfile refresh only if the version update changes files that require it.
6. Run `bun run check`.
7. Prepare embedded frontend assets with:
   - `bun run build`
   - `bun run embed:assets`
8. Build all release binaries with the target version ldflag:
   - `GOOS=linux GOARCH=amd64 go build -ldflags "-X main.version=$1" -o dist/release/pi-web-$1-linux-amd64 ./backend/cmd/pi-web-server`
   - `GOOS=linux GOARCH=arm64 go build -ldflags "-X main.version=$1" -o dist/release/pi-web-$1-linux-arm64 ./backend/cmd/pi-web-server`
   - `GOOS=darwin GOARCH=amd64 go build -ldflags "-X main.version=$1" -o dist/release/pi-web-$1-macos-amd64 ./backend/cmd/pi-web-server`
   - `GOOS=darwin GOARCH=arm64 go build -ldflags "-X main.version=$1" -o dist/release/pi-web-$1-macos-arm64 ./backend/cmd/pi-web-server`
9. Make binaries executable.
10. Generate `dist/release/SHA256SUMS` from all four binaries.
11. Commit, tag, push, create the release, and upload all five assets.
12. Return the release URL and the uploaded asset names.

Use native edit/write tools for file modifications. Use context-mode tools for long command output. Do not skip verification unless the user explicitly overrides it.
