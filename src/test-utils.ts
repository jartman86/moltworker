/**
 * Shared test utilities for mocking environment
 */
import { vi } from 'vitest';
import type { MoltbotEnv } from './types';

export function createMockEnv(overrides: Partial<MoltbotEnv> = {}): MoltbotEnv {
  return {
    ASSETS: {} as any,
    MOLTBOT_BUCKET: {} as any,
    ...overrides,
  };
}

export function suppressConsole() {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
}
