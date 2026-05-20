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
- Package these release assets under `dist/release/` using the updater/installer-compatible naming scheme:
  - `pi-web_${1#v}_linux_amd64.tar.gz`
  - `pi-web_${1#v}_linux_arm64.tar.gz`
  - `pi-web_${1#v}_darwin_amd64.tar.gz`
  - `pi-web_${1#v}_darwin_arm64.tar.gz`
  - `checksums.txt`
- `checksums.txt` must include checksums for all four archives.
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
8. Build all release binaries with the target version ldflag, then archive each binary as `pi-web` inside a `.tar.gz`:
   - `GOOS=linux GOARCH=amd64 go build -ldflags "-X main.version=$1" -o dist/release/pi-web ./backend/cmd/pi-web-server`
   - `tar -C dist/release -czf dist/release/pi-web_${1#v}_linux_amd64.tar.gz pi-web`
   - Repeat for `linux/arm64`, `darwin/amd64`, and `darwin/arm64`.
9. Remove the temporary `dist/release/pi-web` file after packaging.
10. Generate `dist/release/checksums.txt` from all four archives.
11. Commit, tag, push, create the release, and upload all five assets.
12. Return the release URL and the uploaded asset names.

Use native edit/write tools for file modifications. Use context-mode tools for long command output. Do not skip verification unless the user explicitly overrides it.
