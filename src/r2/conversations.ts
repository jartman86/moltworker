import { R2_KEYS, MAX_HISTORY_MESSAGES, MAX_CONTEXT_CHARS } from '../config';

export interface ConversationMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Conversation {
  chatId: number;
  messages: ConversationMessage[];
  updatedAt: number;
}

function conversationKey(chatId: number): string {
  return `${R2_KEYS.conversationsPrefix}${chatId}.json`;
}

export async function loadConversation(bucket: R2Bucket, chatId: number): Promise<Conversation> {
  const obj = await bucket.get(conversationKey(chatId));
  if (!obj) {
    return { chatId, messages: [], updatedAt: Date.now() };
  }

  try {
    return await obj.json();
  } catch {
    return { chatId, messages: [], updatedAt: Date.now() };
  }
}

export async function saveConversation(
  bucket: R2Bucket,
  conversation: Conversation,
): Promise<void> {
  conversation.updatedAt = Date.now();
  await bucket.put(conversationKey(conversation.chatId), JSON.stringify(conversation));
}

export async function deleteConversation(bucket: R2Bucket, chatId: number): Promise<void> {
  await bucket.delete(conversationKey(chatId));
}

export interface ConversationSummary {
  chatId: number;
  messageCount: number;
  updatedAt: number;
}

export async function listConversations(bucket: R2Bucket): Promise<ConversationSummary[]> {
  const listed = await bucket.list({ prefix: R2_KEYS.conversationsPrefix });
  const summaries: ConversationSummary[] = [];

  for (const obj of listed.objects) {
    const key = obj.key;
    if (!key.endsWith('.json')) continue;

    const chatIdStr = key.slice(R2_KEYS.conversationsPrefix.length, -5);
    const chatId = parseInt(chatIdStr, 10);
    if (isNaN(chatId)) continue;

    const content = await bucket.get(key);
    if (!content) continue;

    try {
      const conv: Conversation = await content.json();
      summaries.push({
        chatId,
        messageCount: conv.messages.length,
        updatedAt: conv.updatedAt,
      });
    } catch {
      summaries.push({ chatId, messageCount: 0, updatedAt: 0 });
    }
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

/** Get trimmed context messages - sliding window that fits within limits */
export function getContextMessages(
  messages: ConversationMessage[],
): Array<{ role: 'user' | 'assistant'; content: string }> {
  // Take most recent messages up to MAX_HISTORY_MESSAGES
  const recent = messages.slice(-MAX_HISTORY_MESSAGES);

  // Trim to fit within MAX_CONTEXT_CHARS
  let totalChars = 0;
  const result: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  for (let i = recent.length - 1; i >= 0; i--) {
    const msg = recent[i];
    totalChars += msg.content.length;
    if (totalChars > MAX_CONTEXT_CHARS) break;
    result.unshift({ role: msg.role, content: msg.content });
  }

  return result;
}
