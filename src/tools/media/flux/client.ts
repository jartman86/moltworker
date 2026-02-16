/**
 * Flux Pro 1.1 API client (Black Forest Labs)
 */
import type { MoltbotEnv } from '../../../types';

const FLUX_API = 'https://api.bfl.ml/v1';

interface FluxSubmitResponse {
  id: string;
}

interface FluxResultResponse {
  id: string;
  status: 'Ready' | 'Pending' | 'Error' | 'Task not found' | 'Content Moderated' | 'Request Moderated';
  result?: {
    sample: string;
  };
}

export class FluxClient {
  constructor(private env: MoltbotEnv) {}

  async submitImage(params: {
    prompt: string;
    width?: number;
    height?: number;
  }): Promise<string> {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      width: params.width || 1024,
      height: params.height || 1024,
    };

    const resp = await fetch(`${FLUX_API}/flux-pro-1.1`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-key': this.env.FLUX_API_KEY!,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Flux submit failed (${resp.status}): ${error}`);
    }

    const data: FluxSubmitResponse = await resp.json();
    return data.id;
  }

  async pollImage(id: string): Promise<{ status: string; imageUrl?: string }> {
    const resp = await fetch(`${FLUX_API}/get_result?id=${id}`, {
      headers: {
        'x-key': this.env.FLUX_API_KEY!,
      },
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Flux poll failed (${resp.status}): ${error}`);
    }

    const data: FluxResultResponse = await resp.json();

    if (data.status === 'Ready' && data.result?.sample) {
      return { status: 'Ready', imageUrl: data.result.sample };
    }
    if (data.status === 'Error' || data.status === 'Content Moderated' || data.status === 'Request Moderated') {
      throw new Error(`Flux generation failed: ${data.status}`);
    }

    return { status: data.status };
  }

  async generateImage(
    params: { prompt: string; width?: number; height?: number },
    maxWaitMs: number = 60_000,
    pollIntervalMs: number = 3_000,
  ): Promise<string> {
    const id = await this.submitImage(params);
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const result = await this.pollImage(id);
      if (result.imageUrl) return result.imageUrl;
      await sleep(pollIntervalMs);
    }

    throw new Error('Flux image generation timed out');
  }

  isConfigured(): boolean {
    return !!this.env.FLUX_API_KEY;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
