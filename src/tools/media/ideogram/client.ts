/**
 * Ideogram API client
 */
import type { MoltbotEnv } from '../../../types';

const IDEOGRAM_API = 'https://api.ideogram.ai';

interface IdeogramResponse {
  created: string;
  data: Array<{
    prompt: string;
    url: string;
    is_image_safe: boolean;
  }>;
}

export class IdeogramClient {
  constructor(private env: MoltbotEnv) {}

  async generateImage(params: {
    prompt: string;
    aspect_ratio?: string;
    style_type?: string;
    magic_prompt_option?: string;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      image_request: {
        prompt: params.prompt,
        model: 'V_2',
        aspect_ratio: params.aspect_ratio || 'ASPECT_1_1',
        style_type: params.style_type || 'AUTO',
        magic_prompt_option: params.magic_prompt_option || 'AUTO',
      },
    };

    const resp = await fetch(`${IDEOGRAM_API}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Api-Key': this.env.IDEOGRAM_API_KEY!,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Ideogram generate failed (${resp.status}): ${error}`);
    }

    const data: IdeogramResponse = await resp.json();
    if (!data.data || data.data.length === 0) {
      throw new Error('Ideogram returned no images');
    }

    return data.data[0].url;
  }

  isConfigured(): boolean {
    return !!this.env.IDEOGRAM_API_KEY;
  }
}
