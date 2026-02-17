import { MODELS } from '../config';

const COMPLEX_KEYWORDS = [
  'strategy', 'create', 'generate', 'analyze', 'plan', 'write', 'build',
  'research', 'post', 'tweet', 'search', 'video', 'image', 'moltbook',
  'content', 'schedule', 'campaign', 'draft', 'compose', 'summarize',
  'compare', 'review', 'explain', 'describe', 'help me', 'how to',
  'make', 'design', 'find', 'look up', 'what is', 'what are',
];

const SIMPLE_PATTERNS = [
  /^(hi|hey|hello|yo|sup|howdy|hola|greetings)\b/i,
  /^(ok|okay|k|yep|yup|yes|no|nah|nope|sure|fine|cool|nice|great|thanks|thank you|ty|thx|bye|goodbye|gn|gm|lol|haha|wow|omg)$/i,
  /^(good morning|good night|good evening|good afternoon)$/i,
];

/**
 * Select the appropriate model based on message complexity.
 * Default is Sonnet (standard) — only simple greetings/short messages get Haiku.
 */
export function selectModel(message: string): string {
  const trimmed = message.trim();

  // Long messages always get Sonnet
  if (trimmed.length >= 40) return MODELS.standard;

  // Check for complex keywords
  const lower = trimmed.toLowerCase();
  for (const keyword of COMPLEX_KEYWORDS) {
    if (lower.includes(keyword)) return MODELS.standard;
  }

  // Check if it matches a simple pattern
  for (const pattern of SIMPLE_PATTERNS) {
    if (pattern.test(trimmed)) return MODELS.light;
  }

  // Default to Sonnet — better to over-deliver
  return MODELS.standard;
}
