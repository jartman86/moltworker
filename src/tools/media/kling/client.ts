/**
 * Kling video generation via fal.ai
 * Uses fal.ai queue API: submit → poll → get result
 * Model: Kling 2.5 Turbo (~$0.35 per 5s clip)
 */
import type { MoltbotEnv } from '../../../types';

const FAL_QUEUE = 'https://queue.fal.run';
const MODEL_ID = 'fal-ai/kling-video/v2.5-turbo/pro/text-to-video';

interface FalSubmitResponse {
  request_id: string;
  response_url: string;
  status_url: string;
}

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED';
  queue_position?: number;
  response_url: string;
}

interface FalResultResponse {
  video: {
    url: string;
    content_type?: string;
    file_name?: string;
    file_size?: number;
  };
}

export class KlingClient {
  constructor(private env: MoltbotEnv) {}

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Authorization: `Key ${this.env.FAL_API_KEY!}`,
    };
  }

  async submitVideo(params: {
    prompt: string;
    negative_prompt?: string;
    duration?: string;
    aspect_ratio?: string;
  }): Promise<{ requestId: string; statusUrl: string; responseUrl: string }> {
    const body: Record<string, unknown> = {
      prompt: params.prompt,
      duration: params.duration || '5',
      aspect_ratio: params.aspect_ratio || '16:9',
      cfg_scale: 0.5,
    };

    if (params.negative_prompt) {
      body.negative_prompt = params.negative_prompt;
    }

    const resp = await fetch(`${FAL_QUEUE}/${MODEL_ID}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`fal.ai submit failed (${resp.status}): ${error}`);
    }

    const data: FalSubmitResponse = await resp.json();
    return {
      requestId: data.request_id,
      statusUrl: data.status_url,
      responseUrl: data.response_url,
    };
  }

  async pollStatus(requestId: string): Promise<FalStatusResponse> {
    const resp = await fetch(
      `${FAL_QUEUE}/${MODEL_ID}/requests/${requestId}/status`,
      { headers: this.headers },
    );

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`fal.ai status check failed (${resp.status}): ${error}`);
    }

    return resp.json();
  }

  async getResult(requestId: string): Promise<FalResultResponse> {
    const resp = await fetch(
      `${FAL_QUEUE}/${MODEL_ID}/requests/${requestId}`,
      { headers: this.headers },
    );

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`fal.ai result fetch failed (${resp.status}): ${error}`);
    }

    return resp.json();
  }

  async generateVideo(
    params: { prompt: string; negative_prompt?: string; duration?: string; aspect_ratio?: string },
    maxWaitMs: number = 300_000,
    pollIntervalMs: number = 10_000,
  ): Promise<{ videoUrl: string; duration: string }> {
    const { requestId } = await this.submitVideo(params);
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const status = await this.pollStatus(requestId);

      if (status.status === 'COMPLETED') {
        const result = await this.getResult(requestId);
        return {
          videoUrl: result.video.url,
          duration: params.duration || '5',
        };
      }

      await sleep(pollIntervalMs);
    }

    throw new Error('Video generation timed out (5 min limit)');
  }

  isConfigured(): boolean {
    return !!this.env.FAL_API_KEY;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
