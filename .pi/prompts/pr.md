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
- After the PR is opened, request code review from a clean-context subagent (fresh context; no inherited conversation context). Provide the PR URL, base/head branches, and review scope only.
- If the subagent review finds issues → fix them locally, run relevant checks, commit with exactly `Co-authored-by: JuunAI <juunai.ai.i@gmail.com>`, push, and request another clean-context subagent review.
- Repeat review/fix/check/commit/push/re-review until the clean-context subagent review passes with no blocking issues.
- Wait for GitHub CI/checks to finish; inspect failing logs when any check fails.
- If CI fails → fix the cause locally, run relevant checks, commit with exactly `Co-authored-by: JuunAI <juunai.ai.i@gmail.com>`, push, request a fresh clean-context subagent review again, and wait for CI again.
- Repeat review/fix/check/push/wait until the clean-context code review passes and all required CI checks pass.
- Merge only after both the clean-context code review passes and required CI passes; use the repository's preferred merge method when detectable, otherwise squash merge.
- After merge → switch to `main`, pull latest, delete local branch, and delete remote branch if not already removed.
- Final → PR URL + merge commit/SHA + CI status + branch cleanup status.
