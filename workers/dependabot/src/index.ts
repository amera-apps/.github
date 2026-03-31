import type { Env } from './types/env'
import type { DependabotAlertEvent, PullRequestEvent } from './types/github'
import { verifyWebhookSignature } from './lib/verify'
import { handleAlert } from './handlers/alert'
import { handlePROpened, handlePRMerged } from './handlers/pull-request'

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 })
    }

    const signature = request.headers.get('X-Hub-Signature-256')
    const eventType = request.headers.get('X-GitHub-Event')
    const body = await request.text()

    const valid = await verifyWebhookSignature(env.GITHUB_WEBHOOK_SECRET, body, signature)
    if (!valid) {
      return new Response('Invalid signature', { status: 401 })
    }

    const payload = JSON.parse(body)

    try {
      if (eventType === 'dependabot_alert' && payload.action === 'created') {
        await handleAlert(payload as DependabotAlertEvent, env)
        return new Response('Alert handled', { status: 200 })
      }

      if (eventType === 'pull_request' && payload.sender?.login === 'dependabot[bot]') {
        const event = payload as PullRequestEvent

        if (event.action === 'opened') {
          await handlePROpened(event, env)
          return new Response('PR opened handled', { status: 200 })
        }

        if (event.action === 'closed' && event.pull_request.merged) {
          await handlePRMerged(event, env)
          return new Response('PR merged handled', { status: 200 })
        }
      }

      return new Response('OK', { status: 200 })
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      console.error(`Handler error: ${message}`)
      return new Response(`Internal error: ${message}`, { status: 500 })
    }
  }
}
