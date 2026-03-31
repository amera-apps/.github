import type { DependabotAlertEvent } from '../types/github'
import type { Env } from '../types/env'
import * as slack from '../lib/slack'
import * as linear from '../lib/linear'

/**
 * Handles a `dependabot_alert` webhook with action `created`.
 * Posts a Slack message and creates a Linear ticket, both keyed by GHSA ID
 * so the PR handler can find and update them later.
 */
export async function handleAlert(event: DependabotAlertEvent, env: Env): Promise<void> {
  const { alert, repository } = event
  const severity = alert.security_vulnerability.severity
  const pkg = alert.dependency.package.name
  const ecosystem = alert.dependency.package.ecosystem
  const ghsa = alert.security_advisory.ghsa_id
  const cve = alert.security_advisory.cve_id ?? 'N/A'
  const summary = alert.security_advisory.summary
  const url = alert.html_url
  const repo = repository.full_name

  const slackText = [
    `🔒 *Dependabot alert* in \`${repo}\``,
    `*Severity:* ${severity}`,
    `*Package:* \`${pkg}\` (${ecosystem})`,
    `*CVE:* ${cve}`,
    `*GHSA:* ${ghsa}`,
    `*Summary:* ${summary}`,
    url
  ].join('\n')

  const linearDesc = [
    `A **${severity}** severity vulnerability was detected in \`${pkg}\` (${ecosystem}).`,
    '',
    `**GHSA:** ${ghsa}`,
    `**CVE:** ${cve}`,
    `**Summary:** ${summary}`,
    `**Repo:** ${repo}`,
    `**Alert:** ${url}`,
    '',
    'If Dependabot opens a fix PR it will be triaged automatically. If no PR appears, manual intervention is required.'
  ].join('\n')

  await Promise.all([
    slack.postMessage(env.SLACK_BOT_TOKEN, env.SLACK_CHANNEL_ID, slackText),
    linear.createIssue(
      env.LINEAR_API_KEY,
      env.LINEAR_TEAM_ID,
      env.LINEAR_PROJECT_ID,
      `[${severity}] ${ghsa}: Vulnerability in ${pkg}`,
      linearDesc
    )
  ])
}
