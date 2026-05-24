---
description: Open PR, wait for CI, fix until green, merge, and clean up branch
argument-hint: ""
---
Create and complete a pull request for the current branch.

Rules
- Inspect first → `git status --short --branch`, current branch, commits ahead of base, and `gh auth status`.
- Preconditions → not on `main`; working tree clean unless changes are intentionally part of this PR.
- If changes are uncommitted, verify them, commit with a clear message, and include exactly `Co-authored-by: JuunAI <juunai.ai.i@gmail.com>`.
- Push branch to origin and open a PR against `main` with concise intent, changes, and checks in the body (`--body-file`).
- Wait for GitHub CI/checks to finish; inspect failing logs when any check fails.
- If CI fails → fix the cause locally, run relevant checks, commit with exactly `Co-authored-by: JuunAI <juunai.ai.i@gmail.com>`, push, and wait again.
- Repeat fix/check/push/wait until all required CI checks pass.
- Merge only after required CI passes; use the repository's preferred merge method when detectable, otherwise squash merge.
- After merge → switch to `main`, pull latest, delete local branch, and delete remote branch if not already removed.
- Final → PR URL + merge commit/SHA + CI status + branch cleanup status.
