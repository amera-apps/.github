import type { PullRequestEvent } from '../types/github'
import type { Env } from '../types/env'
import * as github from '../lib/github'
import * as slack from '../lib/slack'
import * as linear from '../lib/linear'

/**
 * Handles a Dependabot pull request that was just opened.
 * Enables auto-merge (or labels as major), notifies Slack in the existing
 * alert thread, comments on the Linear ticket, and injects the Linear
 * identifier into the PR body for auto-close on merge.
 */
export async function handlePROpened(event: PullRequestEvent, env: Env): Promise<void> {
  const { pull_request: pr, repository } = event
  const owner = repository.owner.login
  const repo = repository.name
  const { dependencyName, updateType, prevVersion, newVersion } = parsePRBody(pr.title, pr.body)

  const token = await github.getInstallationToken(
    env.GITHUB_APP_ID,
    env.GITHUB_APP_PRIVATE_KEY,
    env.GITHUB_INSTALLATION_ID
  )

  const ghsaId = await findGhsaForDependency(token, owner, repo, dependencyName)

  if (updateType === 'major') {
    await github.addLabel(token, owner, repo, pr.number, 'major-update')
  } else {
    await github.enableAutoMerge(token, pr.node_id)
  }

  let threadTs: string | undefined
  if (ghsaId) {
    threadTs = await slack.findThread(env.SLACK_BOT_TOKEN, env.SLACK_CHANNEL_ID, ghsaId)
  }

  const slackText = [
    `📦 Dependabot opened a fix PR: ${pr.html_url}`,
    `\`${dependencyName}\` ${prevVersion} → ${newVersion} (${updateType})`
  ].join('\n')

  await slack.postMessage(env.SLACK_BOT_TOKEN, env.SLACK_CHANNEL_ID, slackText, threadTs)

  if (ghsaId) {
    const issue = await linear.findIssue(env.LINEAR_API_KEY, env.LINEAR_TEAM_ID, ghsaId)

    if (issue) {
      await linear.addComment(
        env.LINEAR_API_KEY,
        issue.id,
        [
          `Dependabot opened a fix PR: ${pr.html_url}`,
          '',
          `**Update type:** ${updateType}`,
          `**Version:** ${prevVersion} → ${newVersion}`
        ].join('\n')
      )

      const currentBody = pr.body ?? ''
      await github.updatePRBody(
        token,
        owner,
        repo,
        pr.number,
        `${currentBody}\n\nFixes ${issue.identifier}`
      )
    }
  }
}

/**
 * Handles a Dependabot pull request that was merged.
 * Posts a resolution message in the Slack thread.
 */
export async function handlePRMerged(event: PullRequestEvent, env: Env): Promise<void> {
  const { pull_request: pr, repository } = event
  const owner = repository.owner.login
  const repo = repository.name
  const { dependencyName, prevVersion, newVersion } = parsePRBody(pr.title, pr.body)

  const token = await github.getInstallationToken(
    env.GITHUB_APP_ID,
    env.GITHUB_APP_PRIVATE_KEY,
    env.GITHUB_INSTALLATION_ID
  )

  const ghsaId = await findGhsaForDependency(token, owner, repo, dependencyName)

  let threadTs: string | undefined
  if (ghsaId) {
    threadTs = await slack.findThread(env.SLACK_BOT_TOKEN, env.SLACK_CHANNEL_ID, ghsaId)
  }

  const slackText = [
    `✅ Vulnerability resolved. PR merged: ${pr.html_url}`,
    `\`${dependencyName}\` updated from ${prevVersion} → ${newVersion}`
  ].join('\n')

  await slack.postMessage(env.SLACK_BOT_TOKEN, env.SLACK_CHANNEL_ID, slackText, threadTs)
}

interface PRMetadata {
  dependencyName: string
  updateType: string
  prevVersion: string
  newVersion: string
}

/**
 * Extracts dependency metadata from the Dependabot PR title and body.
 * Dependabot titles follow: "Bump <pkg> from <old> to <new>"
 */
function parsePRBody(title: string, body: string | null): PRMetadata {
  const bumpMatch = title.match(/^Bump (.+) from (\S+) to (\S+)/)
  if (bumpMatch) {
    const isMajor = isMajorBump(bumpMatch[2], bumpMatch[3])
    return {
      dependencyName: bumpMatch[1],
      prevVersion: bumpMatch[2],
      newVersion: bumpMatch[3],
      updateType: isMajor ? 'major' : 'minor/patch'
    }
  }

  const updateMatch = title.match(/^Update (.+) requirement from .* to (.*)/)
  if (updateMatch) {
    return {
      dependencyName: updateMatch[1],
      prevVersion: '',
      newVersion: updateMatch[2],
      updateType: 'minor/patch'
    }
  }

  return {
    dependencyName: title,
    prevVersion: '',
    newVersion: '',
    updateType: 'unknown'
  }
}

/** Determines if a version bump is a semver major change */
function isMajorBump(from: string, to: string): boolean {
  const fromMajor = from.replace(/^v/, '').split('.')[0]
  const toMajor = to.replace(/^v/, '').split('.')[0]
  return fromMajor !== toMajor
}

/**
 * Finds the GHSA ID associated with a dependency by looking up
 * open Dependabot alerts for the repository.
 */
async function findGhsaForDependency(
  token: string,
  owner: string,
  repo: string,
  dependencyName: string
): Promise<string | undefined> {
  try {
    const alerts = await github.listDependabotAlerts(token, owner, repo)
    const match = alerts.find(
      (a) => a.dependency.package.name === dependencyName
    )
    return match?.security_advisory.ghsa_id
  } catch {
    console.error(`Failed to look up alerts for ${owner}/${repo}`)
    return undefined
  }
}
