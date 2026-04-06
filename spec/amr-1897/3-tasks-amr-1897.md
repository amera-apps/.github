# Tasks: AMR-1897 — Create auto-fix transitive dependency workflow

## Task List

### 1. Create workflow file with inputs, concurrency, and fix-python job
- [x] Create `.github/workflows/auto_fix_transitive_dep.yml` with the full workflow skeleton (name, trigger, inputs, concurrency) and the complete `fix-python` job with all 13 steps.
- **Files:** `.github/workflows/auto_fix_transitive_dep.yml`
- **Depends on:** — (none)
- **Context:** Follow the exact patterns from the existing workflows in this repo. The file must include:
  - **Header comment** explaining the workflow's purpose (same style as `sync_dependabot_python.yml` and `refresh_codeartifact_token.yml`)
  - **`on.workflow_dispatch.inputs`** — 7 inputs as defined in the design doc: `target_repo` (required), `packages` (required), `ecosystem` (required), `ghsa_ids` (required), `severity` (required), `linear_ticket` (optional), `alert_url` (optional). All are type `string`.
  - **`concurrency`** — group `auto-fix-${{ inputs.target_repo }}-${{ inputs.ghsa_ids }}`, `cancel-in-progress: false`
  - **`fix-python` job** — gated on `if: inputs.ecosystem == 'pip'`, `runs-on: ubuntu-latest`. Steps in order:
    1. Generate AMERABOT token: `actions/create-github-app-token@v3` with `app-id: ${{ secrets.AMERABOT_APP_ID }}`, `private-key: ${{ secrets.AMERABOT_APP_PRIVATE_KEY }}`, `owner: amera-apps`, `repositories: ${{ inputs.target_repo }}`
    2. Checkout target repo: `actions/checkout@v5` with `repository: amera-apps/${{ inputs.target_repo }}`, `token: ${{ steps.app-token.outputs.token }}`
    3. Setup Python: `actions/setup-python@v5` with `python-version: '3.11'`
    4. Install Poetry: `pipx install poetry`
    5. Configure AWS credentials: `aws-actions/configure-aws-credentials@v6` with `aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}`, `aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}`, `aws-region: ${{ vars.AWS_REGION }}`
    6. Get CodeArtifact token (id: `ca`): shell script using `aws codeartifact get-authorization-token --domain amera-artifacts --domain-owner ${{ vars.AWS_OWNER_ID }} --region "${{ vars.AWS_REGION }}"`, mask token, output as `token`. Use `set -euo pipefail`. Pattern from `refresh_codeartifact_token.yml`.
    7. Authenticate Poetry: add CodeArtifact source (`--priority=supplemental codeartifact` with URL `https://amera-artifacts-371568547021.d.codeartifact.us-east-1.amazonaws.com/pypi/amera-python/simple/`) and configure http-basic using `${{ steps.ca.outputs.token }}`
    8. Install dependencies: `poetry install --no-interaction`
    9. Update vulnerable packages (id: `update`): run `poetry update ${{ inputs.packages }} --no-interaction`, then check `git diff --quiet poetry.lock` — set output `changed=true` or `changed=false`
    10. Verify with pip-audit: gated on `steps.update.outputs.changed == 'true'`, `continue-on-error: true`. Install pip-audit and run it.
    11. Create PR (id: `create-pr`): gated on `steps.update.outputs.changed == 'true'`. Use `peter-evans/create-pull-request@v7` with: `token` from app-token, `branch: fix/${{ inputs.ghsa_ids }}`, `commit-message: 'fix: update ${{ inputs.packages }} to resolve ${{ inputs.ghsa_ids }}'`, `title: 'fix: update ${{ inputs.packages }} (${{ inputs.ghsa_ids }})'`, labels `security` and `automated-fix`, and body with severity, advisory link `https://github.com/advisories/${{ inputs.ghsa_ids }}`, provenance links, reviewer instructions, and conditional `Resolves {linear_ticket}` line using `${{ inputs.linear_ticket && format('Resolves {0}', inputs.linear_ticket) || '' }}`
    12. Retarget to staging: gated on `steps.create-pr.outputs.pull-request-number`, `continue-on-error: true`. Use `gh api` to check if staging branch exists, then `gh pr edit` to retarget. Set `GH_TOKEN` env from app-token.
    13. Assignee placeholder: gated on `steps.create-pr.outputs.pull-request-number`, `continue-on-error: true`. Just `echo "TODO: assignee resolution"` — this is an explicit placeholder for future work.
- **Verifies requirements:** 1, 2, 4, 5, 6, 7, 8, 9

### 2. Add fix-npm job to the workflow file
- [x] Add the `fix-npm` job to `.github/workflows/auto_fix_transitive_dep.yml`, following the same structure as `fix-python` but with npm tooling and without the CodeArtifact/Poetry steps.
- **Files:** `.github/workflows/auto_fix_transitive_dep.yml`
- **Depends on:** 1
- **Context:** The `fix-npm` job is structurally similar to `fix-python` but simpler (no CodeArtifact auth). Add it after the `fix-python` job in the same file. Steps:
    1. Generate AMERABOT token — identical to fix-python step 1
    2. Checkout target repo — identical to fix-python step 2
    3. Setup Node: `actions/setup-node@v4` with `node-version: '20'`
    4. Update vulnerable packages (id: `update`): `npm update ${{ inputs.packages }}`, check `git diff --quiet package-lock.json` for changed output
    5. Verify with npm audit: gated on `changed == 'true'`, `continue-on-error: true`. Run `npm audit`.
    6. Create PR (id: `create-pr`): identical config to fix-python step 11 (same branch, title, body, labels)
    7. Retarget to staging: identical to fix-python step 12
    8. Assignee placeholder: identical to fix-python step 13
  - Gate the job on `if: inputs.ecosystem == 'npm'`, `runs-on: ubuntu-latest`
- **Verifies requirements:** 3, 4, 5, 9

### 3. Update README documentation
- [x] Update `README.md` with three changes: (a) add a new `### Auto-fix Transitive Dependencies` section, (b) update the top-level Overview mermaid diagram, and (c) update the Prerequisites section.
- **Files:** `README.md`
- **Depends on:** — (none)
- **Context:** The README follows a specific structure documented in the existing file. Make these three edits:
  1. **Add new section** after the existing "Dependabot Config Sync (Python)" section (after line 192). Include:
     - Link to `.github/workflows/auto_fix_transitive_dep.yml`
     - One paragraph explaining: triggered by amera-dependabot Lambda via `workflow_dispatch` when a Dependabot alert is classified as `fixable_manual`, checks out the target repo, updates the vulnerable package via `poetry update` (pip) or `npm update` (npm), verifies the fix, and opens a PR
     - Mermaid diagram showing the flow: Lambda dispatches workflow -> workflow checks out target repo -> runs package update -> opens PR -> retargets to staging
     - Table of the 7 workflow inputs (target_repo, packages, ecosystem, ghsa_ids, severity, linear_ticket, alert_url)
     - Note that CodeArtifact auth is handled inline (not using the Dependabot-scoped CA_TOKEN)
  2. **Update Overview mermaid diagram** (lines 10-32): Add the auto-fix workflow to the "Infrastructure Workflows" subgraph as a third node. Add an edge from `AlertHandler` to it with label `"workflow_dispatch (fixable_manual)"`.
  3. **Update Prerequisites section** (lines 63-73): Add `**Actions:** Read and write (for `auto_fix_transitive_dep`)` to the AMERABOT GitHub App permissions list.
- **Verifies requirements:** 10

## Infrastructure Changes (infra repo)

### I1. Update AMERABOT GitHub App permissions
- [ ] In the GitHub UI at `https://github.com/organizations/amera-apps/settings/apps/amerabot`, add `Actions: Read and write` permission. Verify `Contents: Read and write` is already granted org-wide.
- **Files:** — (GitHub UI, not code)
- **Depends on:** — (none, but must be done before AMR-1652 Phase 1 enables Lambda dispatch)
- **Timing:** Before Lambda-side dispatch is enabled
- **Context:** The Lambda needs `actions: write` to call the `workflow_dispatch` API on `.github`. The workflow needs `contents: write` to push branches to target repos — this should already be granted since `sync_dependabot_python.yml` uses it. After updating permissions, accept the new installation permissions prompt.
