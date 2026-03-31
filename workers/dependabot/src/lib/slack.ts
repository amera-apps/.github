const API = 'https://slack.com/api'

interface SlackMessage {
  ts: string
  text: string
}

/** Posts a message to a Slack channel, optionally as a thread reply */
export async function postMessage(
  token: string,
  channel: string,
  text: string,
  threadTs?: string
): Promise<string | undefined> {
  const body: Record<string, string> = { channel, text }
  if (threadTs) body.thread_ts = threadTs

  const res = await fetch(`${API}/chat.postMessage`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  })

  const data = await res.json<{ ok: boolean; ts?: string; error?: string }>()
  if (!data.ok) {
    console.error(`Slack postMessage failed: ${data.error}`)
    return undefined
  }

  return data.ts
}

/**
 * Searches recent channel messages for one containing the given text.
 * Returns the message `ts` (thread ID) if found, undefined otherwise.
 */
export async function findThread(
  token: string,
  channel: string,
  searchText: string
): Promise<string | undefined> {
  const res = await fetch(
    `${API}/conversations.history?channel=${channel}&limit=200`,
    {
      headers: { Authorization: `Bearer ${token}` }
    }
  )

  const data = await res.json<{ ok: boolean; messages?: SlackMessage[] }>()
  if (!data.ok || !data.messages) return undefined

  const match = data.messages.find((m) => m.text.includes(searchText))
  return match?.ts
}
