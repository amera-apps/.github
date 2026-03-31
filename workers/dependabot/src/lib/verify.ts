/**
 * Verifies a GitHub webhook signature using HMAC-SHA256 via the Web Crypto API.
 * Returns true if the signature in the header matches the computed signature.
 */
export async function verifyWebhookSignature(
  secret: string,
  payload: string,
  signatureHeader: string | null
): Promise<boolean> {
  if (!signatureHeader) return false

  const encoder = new TextEncoder()

  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signatureBytes = await crypto.subtle.sign(
    'HMAC',
    key,
    encoder.encode(payload)
  )

  const expected = `sha256=${Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')}`

  return timingSafeEqual(expected, signatureHeader)
}

/** Constant-time string comparison to prevent timing attacks */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false

  const encoder = new TextEncoder()
  const aBuf = encoder.encode(a)
  const bBuf = encoder.encode(b)

  let result = 0
  for (let i = 0; i < aBuf.length; i++) {
    result |= aBuf[i] ^ bBuf[i]
  }

  return result === 0
}
