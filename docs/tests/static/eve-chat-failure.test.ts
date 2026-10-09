import { describe, expect, test } from 'bun:test';
import type { EveMessage, HandleMessageStreamEvent } from 'eve/client';
import { findRetryableFailedTurn, getFailedTurnIds } from '@/components/eve-chat-failure';

const userMessage = (turnId: string, text: string): EveMessage => ({
  id: `${turnId}:user`,
  metadata: { status: 'complete', turnId },
  parts: [{ type: 'text', text, state: 'done' }],
  role: 'user',
});

const assistantMessage = (turnId: string, parts: EveMessage['parts']): EveMessage => ({
  id: `${turnId}:assistant`,
  metadata: { status: 'streaming', turnId },
  parts,
  role: 'assistant',
});

const turnFailed = (turnId: string): HandleMessageStreamEvent => ({
  type: 'turn.failed',
  data: { code: 'MODEL_CALL_FAILED', message: 'Docs agent model request failed.', sequence: 1, turnId },
});

const turnCompleted = (turnId: string): HandleMessageStreamEvent => ({
  type: 'turn.completed',
  data: { sequence: 1, turnId },
});

describe('Ask AI failed-turn detection', () => {
  test('collects only turn.failed turn IDs', () => {
    expect(getFailedTurnIds([turnCompleted('t1'), turnFailed('t2')])).toEqual(new Set(['t2']));
  });

  test('returns the question when the latest turn failed before any output', () => {
    const messages = [
      userMessage('t1', 'What is a toolkit?'),
      assistantMessage('t1', [{ type: 'step-start' }]),
    ];

    expect(findRetryableFailedTurn(messages, getFailedTurnIds([turnFailed('t1')]))).toEqual({
      turnId: 't1',
      question: 'What is a toolkit?',
    });
  });

  test('ignores a completed latest turn', () => {
    const messages = [
      userMessage('t1', 'What is a toolkit?'),
      assistantMessage('t1', [{ type: 'text', text: 'A toolkit is…', state: 'done' }]),
    ];

    expect(findRetryableFailedTurn(messages, getFailedTurnIds([turnCompleted('t1')]))).toBeUndefined();
  });

  test('ignores an earlier failed turn once a later turn succeeds', () => {
    const messages = [
      userMessage('t1', 'What is a toolkit?'),
      userMessage('t2', 'How do sessions work?'),
      assistantMessage('t2', [{ type: 'text', text: 'Sessions…', state: 'done' }]),
    ];

    expect(findRetryableFailedTurn(messages, new Set(['t1']))).toBeUndefined();
  });
});
