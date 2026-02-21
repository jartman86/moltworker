/**
 * Polymarket CLOB L2 authentication — HMAC-SHA256 via Web Crypto API
 * Generates the POLY_* headers required for authenticated endpoints.
 */

export interface L2Credentials {
  apiKey: string
  apiSecret: string
  passphrase: string
}

export interface L2Headers {
  POLY_ADDRESS: string
  POLY_SIGNATURE: string
  POLY_TIMESTAMP: string
  POLY_NONCE: string
  POLY_API_KEY: string
  POLY_PASSPHRASE: string
}

/**
 * Create L2 HMAC-SHA256 authentication headers for CLOB API.
 * Message = timestamp + method + requestPath [+ body]
 * Key = base64-decoded apiSecret
 * Signature = base64url-encoded HMAC-SHA256
 */
export async function createL2Headers(
  creds: L2Credentials,
  method: string,
  requestPath: string,
  body?: string,
): Promise<L2Headers> {
  const timestamp = Math.floor(Date.now() / 1000).toString()
  const nonce = crypto.randomUUID()

  // Build message: timestamp + METHOD + /path [+ body]
  let message = timestamp + method.toUpperCase() + requestPath
  if (body) {
    message += body
  }

  // Decode base64 secret to raw bytes
  const secretBytes = Uint8Array.from(atob(creds.apiSecret), (c) => c.charCodeAt(0))

  // Import key for HMAC-SHA256
  const key = await crypto.subtle.importKey(
    'raw',
    secretBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  // Sign the message
  const signatureBuffer = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(message),
  )

  // Base64url encode the signature
  const signature = base64urlEncode(new Uint8Array(signatureBuffer))

  return {
    POLY_ADDRESS: creds.apiKey, // L2 API key goes in address header
    POLY_SIGNATURE: signature,
    POLY_TIMESTAMP: timestamp,
    POLY_NONCE: nonce,
    POLY_API_KEY: creds.apiKey,
    POLY_PASSPHRASE: creds.passphrase,
  }
}

function base64urlEncode(bytes: Uint8Array): string {
  const base64 = btoa(String.fromCharCode(...bytes))
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
