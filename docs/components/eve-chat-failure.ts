import type { EveMessage, HandleMessageStreamEvent } from 'eve/client';

/**
 * Turn IDs eve reported as `turn.failed`. A recoverable model-call failure
 * (rate limit, timeout, provider outage) parks the session with `turn.failed`
 * + `session.waiting` instead of `session.failed`, so the store returns to
 * `ready` without an error and the default reducer drops the event.
 */
export function getFailedTurnIds(events: readonly HandleMessageStreamEvent[]): Set<string> {
  const ids = new Set<string>();
  for (const event of events) {
    if (event.type === 'turn.failed') ids.add(event.data.turnId);
  }
  return ids;
}

/**
 * The latest visible turn, if it failed: its turn ID and the user's question,
 * so the chat can offer a retry that resends it.
 */
export function findRetryableFailedTurn(
  messages: readonly EveMessage[],
  failedTurnIds: ReadonlySet<string>
): { turnId: string; question: string } | undefined {
  const turnId = messages[messages.length - 1]?.metadata?.turnId;
  if (!turnId || !failedTurnIds.has(turnId)) return undefined;

  const userMessage = messages.find(
    (message) => message.role === 'user' && message.metadata?.turnId === turnId
  );
  const question = (userMessage?.parts ?? [])
    .map((part) => (part.type === 'text' ? part.text : ''))
    .join('');

  return { turnId, question };
}
