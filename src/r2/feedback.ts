/**
 * Feedback CRUD for the learning system
 */
import { R2_KEYS } from '../config';

export interface FeedbackEntry {
  chatId: number;
  messageTimestamp: number;
  userMessage: string;
  assistantResponse: string;
  rating: 'positive' | 'negative';
  feedbackText?: string;
  timestamp: number;
}

export interface FeedbackSummary {
  total: number;
  positive: number;
  negative: number;
  recentNegative: FeedbackEntry[];
}

export async function saveFeedback(
  bucket: R2Bucket,
  entry: FeedbackEntry,
): Promise<void> {
  const key = `${R2_KEYS.feedbackPrefix}${entry.chatId}/${entry.timestamp}.json`;
  await bucket.put(key, JSON.stringify(entry));
}

export async function loadFeedback(
  bucket: R2Bucket,
  chatId?: number,
): Promise<FeedbackEntry[]> {
  const prefix = chatId
    ? `${R2_KEYS.feedbackPrefix}${chatId}/`
    : R2_KEYS.feedbackPrefix;
  const listed = await bucket.list({ prefix });
  const entries: FeedbackEntry[] = [];

  for (const obj of listed.objects) {
    const data = await bucket.get(obj.key);
    if (!data) continue;
    entries.push(await data.json());
  }

  return entries.sort((a, b) => b.timestamp - a.timestamp);
}

export async function getFeedbackSummary(
  bucket: R2Bucket,
): Promise<FeedbackSummary> {
  const entries = await loadFeedback(bucket);
  const positive = entries.filter((e) => e.rating === 'positive').length;
  const negative = entries.filter((e) => e.rating === 'negative').length;
  const recentNegative = entries
    .filter((e) => e.rating === 'negative')
    .slice(0, 10);

  return {
    total: entries.length,
    positive,
    negative,
    recentNegative,
  };
}
