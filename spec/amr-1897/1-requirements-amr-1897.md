# Requirements: AMR-1897 — Create auto-fix transitive dependency workflow

## Goal

Automate the fix for transitive dependency vulnerabilities that Dependabot can't handle on its own, eliminating the 10-15 minute manual loop per repo per alert by creating a centralized GitHub Actions workflow that the amera-dependabot Lambda dispatches when it classifies an alert as `fixable_manual`.

## Background

The `amera-dependabot` Lambda (AMR-1652) already handles the full notification/tracking lifecycle for Dependabot alerts across 50+ repos in the `amera-apps` org. It classifies alerts, creates Linear tickets, posts Slack dashboards, and handles Dependabot PRs.

However, Dependabot only opens PRs for **direct** dependencies. When a vulnerability is in a **transitive** dependency (e.g. `aiohttp` pulled in via `amera-core`), the Lambda classifies it as `fixable_manual` and creates a sub-ticket saying "run `poetry update {pkg}` manually" — but nobody automates the actual fix. The manual process (clone, branch, `poetry update`, push, open PR, link ticket) takes 10-15 minutes per repo and generates ~250 alerts/week.

The `.github` repo already has proven infrastructure for cross-repo automation:
- [`sync_dependabot_python.yml`](.github/workflows/sync_dependabot_python.yml) — opens PRs across all Python repos to sync `dependabot.yml`
- [`refresh_codeartifact_token.yml`](.github/workflows/refresh_codeartifact_token.yml) — rotates CodeArtifact tokens for Dependabot
- Both use AMERABOT GitHub App for authentication and org-level secrets

Full design reference: [`infra/aws/lambda/amera-dependabot/PLAN.md`](https://github.com/amera-apps/infra/blob/main/aws/lambda/amera-dependabot/PLAN.md) (Phase 2).

## Requirements

1. **Workflow trigger**: The workflow must accept `workflow_dispatch` with inputs for `target_repo`, `packages`, `ecosystem`, `ghsa_ids`, `severity`, `linear_ticket` (optional), and `alert_url` (optional).

2. **Python (pip) ecosystem support**: When `ecosystem == 'pip'`, the workflow must:
   - Check out the target repo using an AMERABOT app token scoped to that repo
   - Install Poetry and authenticate against the private CodeArtifact registry
   - Run `poetry update {packages}` to update the vulnerable transitive dependencies
   - Detect whether the lockfile actually changed (skip PR if no change)
   - Run `pip-audit` to verify the fix (continue on failure — the audit is informational)
   - Open a PR with security metadata (GHSA ID, severity, Linear ticket reference, advisory link)

3. **npm ecosystem support**: When `ecosystem == 'npm'`, the workflow must:
   - Check out the target repo using an AMERABOT app token scoped to that repo
   - Run `npm update {packages}`
   - Detect whether `package-lock.json` changed (skip PR if no change)
   - Run `npm audit` to verify the fix (continue on failure)
   - Open a PR with the same metadata structure as the Python job

4. **PR creation**: PRs must be created using `peter-evans/create-pull-request` with:
   - Branch name: `fix/{ghsa_ids}`
   - Commit message and title referencing the package and GHSA ID
   - Body including: severity, advisory link, Linear ticket reference (if provided), and instructions for the reviewer
   - Labels: `security`, `automated-fix`

5. **Retarget to staging**: After PR creation, check if a `staging` branch exists in the target repo. If so, retarget the PR base to `staging` (mirrors existing Lambda PR handler behavior).

6. **Concurrency**: Prevent duplicate runs for the same repo + GHSA combination using a concurrency group keyed on `{target_repo}-{ghsa_ids}` with `cancel-in-progress: false` (first run completes rather than being cancelled by retries).

7. **Idempotency**: If the branch `fix/{ghsa_id}` already exists with the same changes, `peter-evans/create-pull-request` should no-op (update existing PR rather than create a duplicate).

8. **CodeArtifact authentication**: The workflow must generate a fresh CodeArtifact token inline using the existing `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` org secrets (the `CA_TOKEN` Dependabot secret is scoped to Dependabot only and is not available to Actions workflows).

9. **Assignee resolution**: Include a placeholder step for auto-assigning a reviewer. This will be implemented as a follow-up (potentially extracted as a shared composite action from `sync_dependabot_python.yml`'s `resolveAssignee` logic).

10. **README documentation**: Update the repo README to document the new workflow, including a mermaid diagram showing the Lambda-to-workflow flow, and update the top-level overview diagram.

## Non-Requirements

- Lambda-side changes (adding `trigger_workflow`, dispatching from `_handle_alert`) — covered by AMR-1652 Phase 1
- Feedback loop changes (extending PR sender check for `amerabot[bot]`) — covered by AMR-1652 Phase 3
- AMERABOT GitHub App permission changes (`actions: write`, `contents: write`) — done in GitHub UI, not in code
- Full assignee resolution implementation — deferred to follow-up
- Support for `requirements.txt`-based repos (only Poetry is supported initially)
- Support for non-standard directory structures / `manifest_path` — deferred enhancement noted in PLAN.md

## Open Questions

- [x] Should the workflow generate its own CodeArtifact token or reuse `CA_TOKEN`? **Decision: generate inline — `CA_TOKEN` is Dependabot-scoped only.**

## Acceptance Criteria

- [ ] `.github/workflows/auto_fix_transitive_dep.yml` exists and is syntactically valid
- [ ] Workflow accepts all 7 inputs and gates jobs on ecosystem type
- [ ] Python job: installs Poetry, authenticates CodeArtifact inline, runs `poetry update`, checks for lockfile changes, runs `pip-audit`, opens PR with correct metadata, retargets to staging
- [ ] npm job: runs `npm update`, checks for lockfile changes, runs `npm audit`, opens PR with correct metadata, retargets to staging
- [ ] Concurrency group prevents duplicate runs per repo + GHSA
- [ ] PR body includes severity, advisory link, Linear ticket reference, and reviewer instructions
- [ ] README updated with new section and mermaid diagram for the auto-fix workflow
