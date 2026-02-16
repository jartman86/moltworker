/**
 * OAuth 1.0a request signing for Twitter API v2
 * Uses Web Crypto API (HMAC-SHA1) for Cloudflare Workers compatibility
 */

interface OAuthParams {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessSecret: string;
}

export async function signRequest(
  method: string,
  url: string,
  params: OAuthParams,
  body?: Record<string, unknown>,
): Promise<string> {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomUUID().replace(/-/g, '');

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: params.consumerKey,
    oauth_nonce: nonce,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: timestamp,
    oauth_token: params.accessToken,
    oauth_version: '1.0',
  };

  // Collect all parameters for signature base
  const allParams: Record<string, string> = { ...oauthParams };

  // Parse URL query parameters
  const parsedUrl = new URL(url);
  parsedUrl.searchParams.forEach((value, key) => {
    allParams[key] = value;
  });

  // Sort and encode parameters
  const sortedKeys = Object.keys(allParams).sort();
  const paramString = sortedKeys
    .map((k) => `${percentEncode(k)}=${percentEncode(allParams[k])}`)
    .join('&');

  // Create signature base string
  const baseUrl = `${parsedUrl.origin}${parsedUrl.pathname}`;
  const signatureBase = `${method.toUpperCase()}&${percentEncode(baseUrl)}&${percentEncode(paramString)}`;

  // Create signing key
  const signingKey = `${percentEncode(params.consumerSecret)}&${percentEncode(params.accessSecret)}`;

  // Generate HMAC-SHA1 signature
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(signingKey),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );

  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(signatureBase),
  );

  const signatureBase64 = btoa(
    String.fromCharCode(...new Uint8Array(signature)),
  );

  oauthParams.oauth_signature = signatureBase64;

  // Build Authorization header
  const authHeader = 'OAuth ' + Object.keys(oauthParams)
    .sort()
    .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
    .join(', ');

  return authHeader;
}

function percentEncode(str: string): string {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase(),
  );
}
