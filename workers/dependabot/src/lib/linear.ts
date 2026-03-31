const API = 'https://api.linear.app/graphql'

interface LinearIssue {
  id: string
  identifier: string
  url: string
}

/** Creates a Linear issue and returns its ID, identifier (e.g. AMR-123), and URL */
export async function createIssue(
  apiKey: string,
  teamId: string,
  projectId: string,
  title: string,
  description: string
): Promise<LinearIssue | undefined> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey
    },
    body: JSON.stringify({
      query: `mutation($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id identifier url }
        }
      }`,
      variables: {
        input: { title, description, teamId, projectId }
      }
    })
  })

  const data = await res.json<{
    data?: { issueCreate?: { success: boolean; issue: LinearIssue } }
  }>()

  return data.data?.issueCreate?.issue
}

/**
 * Finds an open Linear issue whose title contains the given GHSA ID.
 * Scoped to a specific team.
 */
export async function findIssue(
  apiKey: string,
  teamId: string,
  ghsaId: string
): Promise<LinearIssue | undefined> {
  const res = await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey
    },
    body: JSON.stringify({
      query: `query($filter: IssueFilterInput) {
        issues(filter: $filter) {
          nodes { id identifier url }
        }
      }`,
      variables: {
        filter: {
          team: { id: { eq: teamId } },
          title: { contains: ghsaId },
          state: { type: { neq: 'completed' } }
        }
      }
    })
  })

  const data = await res.json<{
    data?: { issues?: { nodes: LinearIssue[] } }
  }>()

  return data.data?.issues?.nodes?.[0]
}

/** Adds a comment to a Linear issue */
export async function addComment(
  apiKey: string,
  issueId: string,
  body: string
): Promise<void> {
  await fetch(API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey
    },
    body: JSON.stringify({
      query: `mutation($input: CommentCreateInput!) {
        commentCreate(input: $input) { success }
      }`,
      variables: {
        input: { issueId, body }
      }
    })
  })
}
