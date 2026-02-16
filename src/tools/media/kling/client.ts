/**
 * Kling AI API client (video generation)
 * Uses JWT auth signed with HMAC-SHA256 via Web Crypto API
 */
import type { MoltbotEnv } from '../../../types';

const KLING_API = 'https://api.klingai.com/v1';

interface KlingTaskResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_status: string;
  };
}

interface KlingResultResponse {
  code: number;
  message: string;
  request_id: string;
  data: {
    task_id: string;
    task_status: 'submitted' | 'processing' | 'succeed' | 'failed';
    task_status_msg?: string;
    task_result?: {
      videos: Array<{
        id: string;
        url: string;
        duration: string;
      }>;
    };
  };
}

export class KlingClient {
  constructor(private env: MoltbotEnv) {}

  private async createJWT(): Promise<string> {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const payload = {
      iss: this.env.KLING_ACCESS_KEY!,
      exp: now + 1800, // 30 minutes
      nbf: now - 5,
      iat: now,
    };

    const encoder = new TextEncoder();
    const headerB64 = base64url(JSON.stringify(header));
    const payloadB64 = base64url(JSON.stringify(payload));
    const signingInput = `${headerB64}.${payloadB64}`;

    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(this.env.KLING_SECRET_KEY!),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );

    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
    const signatureB64 = base64url(signature);

    return `${signingInput}.${signatureB64}`;
  }

  async submitVideo(params: {
    prompt: string;
    negative_prompt?: string;
    duration?: string;
    aspect_ratio?: string;
  }): Promise<string> {
    const jwt = await this.createJWT();

    const body: Record<string, unknown> = {
      model_name: 'kling-v1',
      prompt: params.prompt,
      cfg_scale: 0.5,
      mode: 'std',
      duration: params.duration || '5',
      aspect_ratio: params.aspect_ratio || '16:9',
    };

    if (params.negative_prompt) {
      body.negative_prompt = params.negative_prompt;
    }

    const resp = await fetch(`${KLING_API}/videos/text2video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Kling submit failed (${resp.status}): ${error}`);
    }

    const data: KlingTaskResponse = await resp.json();
    if (data.code !== 0) {
      throw new Error(`Kling submit error: ${data.message}`);
    }

    return data.data.task_id;
  }

  async pollVideo(taskId: string): Promise<{ status: string; videoUrl?: string; duration?: string }> {
    const jwt = await this.createJWT();

    const resp = await fetch(`${KLING_API}/videos/text2video/${taskId}`, {
      headers: {
        Authorization: `Bearer ${jwt}`,
      },
    });

    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(`Kling poll failed (${resp.status}): ${error}`);
    }

    const data: KlingResultResponse = await resp.json();
    if (data.code !== 0) {
      throw new Error(`Kling poll error: ${data.message}`);
    }

    const task = data.data;

    if (task.task_status === 'succeed' && task.task_result?.videos?.length) {
      const video = task.task_result.videos[0];
      return { status: 'succeed', videoUrl: video.url, duration: video.duration };
    }
    if (task.task_status === 'failed') {
      throw new Error(`Kling generation failed: ${task.task_status_msg || 'Unknown error'}`);
    }

    return { status: task.task_status };
  }

  async generateVideo(
    params: { prompt: string; negative_prompt?: string; duration?: string; aspect_ratio?: string },
    maxWaitMs: number = 300_000,
    pollIntervalMs: number = 10_000,
  ): Promise<{ videoUrl: string; duration?: string }> {
    const taskId = await this.submitVideo(params);
    const deadline = Date.now() + maxWaitMs;

    while (Date.now() < deadline) {
      const result = await this.pollVideo(taskId);
      if (result.videoUrl) return { videoUrl: result.videoUrl, duration: result.duration };
      await sleep(pollIntervalMs);
    }

    throw new Error('Kling video generation timed out (5 min limit)');
  }

  isConfigured(): boolean {
    return !!(this.env.KLING_ACCESS_KEY && this.env.KLING_SECRET_KEY);
  }
}

function base64url(input: string | ArrayBuffer): string {
  let bytes: Uint8Array;
  if (typeof input === 'string') {
    bytes = new TextEncoder().encode(input);
  } else {
    bytes = new Uint8Array(input);
  }

  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
