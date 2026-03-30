# .github

Organization-level GitHub configuration for Amera, including PR templates, contribution guidelines, and reusable workflows.

## Dependabot Workflows

Two reusable workflows that together cover the full Dependabot vulnerability lifecycle. They use the **GHSA ID** (GitHub Security Advisory ID) as a shared key to maintain Slack thread continuity and update Linear tickets across events.

**Overview**
```mermaid
graph LR
    V[Vulnerability Detected] --> A[dependabot_alert]
    A -->|"Slack + Linear ticket"| Team[Team Notified]
    D[Dependabot Opens PR] --> P[dependabot_pr]
    P -->|"patch/minor"| AutoMerge["Auto-merge enabled\n(awaits human approval)"]
    P -->|"major"| ManualReview["Label + Slack + Linear ticket"]
```

**Detailed**
```mermaid
graph TD
    subgraph alert_phase [1 - Alert Created]
        A1[dependabot_alert] --> A2["Post Slack message\n(includes GHSA ID)"]
        A1 --> A3["Create Linear ticket\n(GHSA ID in title)"]
    end

    subgraph pr_opened [2 - PR Opened]
        B1["dependabot_pr\n(opened)"] --> B2["fetch-metadata\n(alert-lookup: true)"]
        B2 --> B3[Get ghsa-id]
        B3 --> B4["Find Slack thread by GHSA ID\n(retry with backoff)"]
        B4 --> B5[Reply in thread]
        B3 --> B6[Find Linear ticket by GHSA ID]
        B6 --> B7[Comment on ticket]
        B6 --> B8["Inject 'Fixes AMR-123'\ninto PR body"]
    end

    subgraph pr_merged [3 - PR Merged]
        C1["dependabot_pr\n(closed+merged)"] --> C2[Reply in Slack thread: resolved]
        C1 --> C3["Linear auto-closes ticket\n(via PR body keyword)"]
    end

    alert_phase --> pr_opened
    pr_opened --> pr_merged
```

### Prerequisites

**GitHub App** — required for `alert-lookup: true` in `fetch-metadata`, which gives us the GHSA ID to link alerts to PRs.

1. Create a GitHub App in the `amera-apps` org with **Dependabot alerts: Read-only** permission
2. Install it on all repos
3. Store as org-level secrets: `AMERABOT_APP_ID` and `AMERABOT_APP_PRIVATE_KEY`

**Slack bot scopes** — the bot needs `chat:write` (already required) plus `channels:history` (public channels) or `groups:history` (private channels) for thread lookup.

**Org secrets** — sensitive credentials, set at the org level so all repos inherit them:

| Secret | Description |
|---|---|
| `SLACK_BOT_TOKEN` | Slack bot token (`chat:write` + `channels:history` scopes) |
| `LINEAR_API_KEY` | Linear API key for ticket creation and search |
| `AMERABOT_APP_ID` | GitHub App ID |
| `AMERABOT_APP_PRIVATE_KEY` | GitHub App private key |

**Org variables** — non-sensitive defaults. All workflow inputs fall back to these when not explicitly provided by the caller, so most repos don't need to pass them.

| Variable | Description |
|---|---|
| `SLACK_PROJ_COMPLIANCE_CHANNEL_ID` | Default Slack channel for Dependabot notifications |
| `LINEAR_AMERA_TEAM_ID` | Default Linear team for vulnerability tickets |
| `LINEAR_SOC2_COMPLIANCE_PROJECT_ID` | Default Linear project for vulnerability tickets |

Repos can override any default by passing the corresponding input in the caller workflow.

### Dependabot Alert

[`.github/workflows/dependabot_alert.yml`](.github/workflows/dependabot_alert.yml)

**Phase 1:** Fires when a vulnerability alert is created. Posts a Slack message and creates a Linear ticket, both containing the GHSA ID so downstream workflows can find them.

| Input | Required | Fallback variable | Description |
|---|---|---|---|
| `slack-channel-id` | No | `SLACK_PROJ_COMPLIANCE_CHANNEL_ID` | Slack channel ID |
| `linear-team-id` | No | `LINEAR_AMERA_TEAM_ID` | Linear team ID |
| `linear-project-id` | No | `LINEAR_SOC2_COMPLIANCE_PROJECT_ID` | Linear project ID |

| Secret | Required | Description |
|---|---|---|
| `slack-bot-token` | No | Slack bot token |
| `linear-api-key` | No | Linear API key |

#### Usage

Minimal — uses org variable defaults:

```yaml
# .github/workflows/dependabot_alert.yml
name: Dependabot Alert
on:
  dependabot_alert:
    types: [created]

jobs:
  notify:
    uses: amera-apps/.github/.github/workflows/dependabot_alert.yml@main
    secrets:
      slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
      linear-api-key: ${{ secrets.LINEAR_API_KEY }}
```

With overrides:

```yaml
jobs:
  notify:
    uses: amera-apps/.github/.github/workflows/dependabot_alert.yml@main
    with:
      slack-channel-id: C9999999999
      linear-team-id: different-team-id
      linear-project-id: different-project-id
    secrets:
      slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
      linear-api-key: ${{ secrets.LINEAR_API_KEY }}
```

### Dependabot PR

[`.github/workflows/dependabot_pr.yml`](.github/workflows/dependabot_pr.yml)

**Phases 2 & 3:** Handles PR opened and PR merged events.

**On PR opened:**

- Enables auto-merge for patch/minor updates (waits for human approval + CI)
- Labels major updates with `major-update`
- Finds the Slack thread by GHSA ID (with retry + backoff) and replies in-thread
- Finds the Linear ticket by GHSA ID, adds a comment, and injects `Fixes AMR-123` into the PR body

**On PR merged:**

- Replies in the Slack thread confirming the vulnerability is resolved
- Linear auto-closes the ticket via the `Fixes AMR-123` keyword in the PR body

| Input | Required | Fallback variable | Description |
|---|---|---|---|
| `slack-channel-id` | No | `SLACK_PROJ_COMPLIANCE_CHANNEL_ID` | Slack channel ID |
| `linear-team-id` | No | `LINEAR_AMERA_TEAM_ID` | Linear team ID |

| Secret | Required | Description |
|---|---|---|
| `slack-bot-token` | No | Slack bot token |
| `linear-api-key` | No | Linear API key |
| `gh-app-id` | Yes | GitHub App ID for alert-lookup |
| `gh-app-private-key` | Yes | GitHub App private key |

#### Usage

Minimal — uses org variable defaults:

```yaml
# .github/workflows/dependabot_pr.yml
name: Dependabot PR
on:
  pull_request:
    types: [opened, closed]

jobs:
  triage:
    uses: amera-apps/.github/.github/workflows/dependabot_pr.yml@main
    permissions:
      contents: write
      pull-requests: write
    secrets:
      slack-bot-token: ${{ secrets.SLACK_BOT_TOKEN }}
      linear-api-key: ${{ secrets.LINEAR_API_KEY }}
      gh-app-id: ${{ secrets.AMERABOT_APP_ID }}
      gh-app-private-key: ${{ secrets.AMERABOT_APP_PRIVATE_KEY }}
```
