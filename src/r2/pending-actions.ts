/**
 * Pending action storage for the confirmation gate
 */
import { R2_KEYS, PENDING_ACTION_TTL_MS } from '../config';

export interface PendingAction {
  id: string;
  chatId: number;
  toolName: string;
  input: Record<string, unknown>;
  createdAt: number;
  expiresAt: number;
}

export async function savePendingAction(
  bucket: R2Bucket,
  action: PendingAction,
): Promise<void> {
  const key = `${R2_KEYS.pendingActionsPrefix}${action.chatId}/${action.id}.json`;
  await bucket.put(key, JSON.stringify(action));
}

export async function loadPendingAction(
  bucket: R2Bucket,
  chatId: number,
  actionId: string,
): Promise<PendingAction | null> {
  const key = `${R2_KEYS.pendingActionsPrefix}${chatId}/${actionId}.json`;
  const obj = await bucket.get(key);
  if (!obj) return null;
  const action: PendingAction = await obj.json();
  if (Date.now() > action.expiresAt) {
    await bucket.delete(key);
    return null;
  }
  return action;
}

export async function loadPendingActions(
  bucket: R2Bucket,
  chatId: number,
): Promise<PendingAction[]> {
  const prefix = `${R2_KEYS.pendingActionsPrefix}${chatId}/`;
  const listed = await bucket.list({ prefix });
  const actions: PendingAction[] = [];
  const now = Date.now();

  for (const obj of listed.objects) {
    const data = await bucket.get(obj.key);
    if (!data) continue;
    const action: PendingAction = await data.json();
    if (now > action.expiresAt) {
      await bucket.delete(obj.key);
      continue;
    }
    actions.push(action);
  }

  return actions.sort((a, b) => b.createdAt - a.createdAt);
}

export async function deletePendingAction(
  bucket: R2Bucket,
  chatId: number,
  actionId: string,
): Promise<void> {
  const key = `${R2_KEYS.pendingActionsPrefix}${chatId}/${actionId}.json`;
  await bucket.delete(key);
}

export async function cleanExpiredActions(
  bucket: R2Bucket,
  chatId: number,
): Promise<number> {
  const prefix = `${R2_KEYS.pendingActionsPrefix}${chatId}/`;
  const listed = await bucket.list({ prefix });
  const now = Date.now();
  let cleaned = 0;

  for (const obj of listed.objects) {
    const data = await bucket.get(obj.key);
    if (!data) continue;
    const action: PendingAction = await data.json();
    if (now > action.expiresAt) {
      await bucket.delete(obj.key);
      cleaned++;
    }
  }

  return cleaned;
}
