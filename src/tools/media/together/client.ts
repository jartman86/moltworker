/**
 * Together.ai API client — budget-friendly image generation via Flux Schnell
 */
import type { MoltbotEnv } from '../../../types';

const TOGETHER_API = 'https://api.together.xyz/v1';

interface TogetherImageResponse {
  data: Array<{
    b64_json?: string;
    url?: string;
  }>;
}

export class TogetherClient {
  constructor(private env: MoltbotEnv) {}

  async generateImage(params: {
    prompt: string;
    width?: number;
    height?: number;
    steps?: number;
  }): Promise<ArrayBuffer> {
    const body = {
      model: 'black-forest-labs/FLUX.1-schnell',
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 1024,
      steps: params.steps || 4,
      n: 1,
      response_format: 'b64_json',
    };

    const resp = await fetch(`${TOGETHER_API}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.env.TOGETHER_API_KEY!}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Together API failed (${resp.status}): ${error}`);
    }

    const data: TogetherImageResponse = await resp.json();
    if (!data.data || data.data.length === 0) {
      throw new Error('Together API returned no images');
    }

    const b64 = data.data[0].b64_json;
    if (!b64) {
      throw new Error('Together API did not return base64 image data');
    }

    // Decode base64 to ArrayBuffer
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  isConfigured(): boolean {
    return !!this.env.TOGETHER_API_KEY;
  }
}
