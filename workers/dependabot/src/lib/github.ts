import { getToken } from 'universal-github-app-jwt'
import type { DependabotAlert } from '../types/github'

const API = 'https://api.github.com'

/**
 * Generates a GitHub App installation access token by creating a JWT
 * from the app credentials and exchanging it for a scoped token.
 */
export async function getInstallationToken(
  appId: string,
  privateKey: string,
  installationId: string
): Promise<string> {
  const { token: jwt } = await getToken({
    id: appId,
    privateKey
  })

  const res = await fetch(
    `${API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'amera-dependabot-worker'
      }
    }
  )

  if (!res.ok) {
    throw new Error(`Failed to get installation token: ${res.status} ${await res.text()}`)
  }

  const data = await res.json<{ token: string }>()
  return data.token
}

/**
 * Enables auto-merge (squash) on a pull request via the GraphQL API.
 * Uses GraphQL because the REST API does not support enabling auto-merge.
 */
export async function enableAutoMerge(
  token: string,
  pullRequestNodeId: string
): Promise<void> {
  const res = await fetch(`${API}/graphql`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'amera-dependabot-worker'
    },
    body: JSON.stringify({
      query: `mutation($prId: ID!) {
        enablePullRequestAutoMerge(input: { pullRequestId: $prId, mergeMethod: SQUASH }) {
          pullRequest { autoMergeRequest { enabledAt } }
        }
      }`,
      variables: { prId: pullRequestNodeId }
    })
  })

  if (!res.ok) {
    throw new Error(`Failed to enable auto-merge: ${res.status} ${await res.text()}`)
  }
}

/** Adds a label to an issue or pull request */
export async function addLabel(
  token: string,
  owner: string,
  repo: string,
  issueNumber: number,
  label: string
): Promise<void> {
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/issues/${issueNumber}/labels`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'amera-dependabot-worker'
      },
      body: JSON.stringify({ labels: [label] })
    }
  )

  if (!res.ok) {
    throw new Error(`Failed to add label: ${res.status} ${await res.text()}`)
  }
}

/** Updates the body of a pull request */
export async function updatePRBody(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  body: string
): Promise<void> {
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/pulls/${prNumber}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': 'amera-dependabot-worker'
      },
      body: JSON.stringify({ body })
    }
  )

  if (!res.ok) {
    throw new Error(`Failed to update PR body: ${res.status} ${await res.text()}`)
  }
}

/**
 * Lists open Dependabot alerts for a repository.
 * Used to find the GHSA ID associated with a Dependabot PR.
 */
export async function listDependabotAlerts(
  token: string,
  owner: string,
  repo: string
): Promise<DependabotAlert[]> {
  const res = await fetch(
    `${API}/repos/${owner}/${repo}/dependabot/alerts?state=open&per_page=100`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'amera-dependabot-worker'
      }
    }
  )

  if (!res.ok) {
    throw new Error(`Failed to list alerts: ${res.status} ${await res.text()}`)
  }

  return res.json<DependabotAlert[]>()
}
