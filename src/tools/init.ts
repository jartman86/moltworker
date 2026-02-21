/**
 * Tool initialization — registers all tools
 * Import this module for its side effects to populate the registry.
 */
import { registerSkillTools } from './skills';
import { registerWebTools } from './web';
import { registerLearningTools } from './learning';
import { registerTwitterTools } from './social/twitter/tools';
import { registerYouTubeTools } from './social/youtube/tools';
import { registerInstagramTools } from './social/instagram/tools';
import { registerLinkedInTools } from './social/linkedin/tools';
import { registerKlingTools } from './media/kling/tools';
import { registerFluxTools } from './media/flux/tools';
import { registerIdeogramTools } from './media/ideogram/tools';
import { registerTogetherTools } from './media/together/tools';
import { registerMediaSendTools } from './media/telegram-send';
import { registerMoltbookTools } from './social/moltbook/tools';
import { registerPolymarketTools } from './trading/polymarket/tools';

let initialized = false;

export function initializeTools(): void {
  if (initialized) return;
  initialized = true;

  registerSkillTools();
  registerWebTools();
  registerLearningTools();
  registerTwitterTools();
  registerYouTubeTools();
  registerInstagramTools();
  registerLinkedInTools();
  registerKlingTools();
  registerFluxTools();
  registerIdeogramTools();
  registerTogetherTools();
  registerMediaSendTools();
  registerMoltbookTools();
  registerPolymarketTools();
}
