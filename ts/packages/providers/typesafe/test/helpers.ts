import { readFileSync } from 'node:fs';
import { vi } from 'vitest';
import type { Tool } from '@composio/core';
import type {
  TypesafeClientLike,
  TypesafeQuestion,
  TypesafeSystemOneRequest,
  TypesafeToolQuestions,
} from '../src';

export interface CorpusEntry {
  name: string;
  tool: Tool;
  expected: TypesafeToolQuestions;
}

export interface Corpus {
  version: number;
  tools: CorpusEntry[];
  sets: Array<{
    name: string;
    tools: Array<string | { slug: string; routingDescription: string }>;
    expected: { question: TypesafeQuestion; keys: string[] };
  }>;
}

export const corpus: Corpus = JSON.parse(
  readFileSync(new URL('./fixtures/question-corpus.json', import.meta.url), 'utf8')
);

export const corpusTool = (name: string): Tool => {
  const entry = corpus.tools.find(candidate => candidate.name === name);
  if (entry === undefined) throw new Error(`No corpus entry named ${name}`);
  return entry.tool;
};

export const makeTool = (
  slug: string,
  properties: Record<string, unknown> = {},
  required: string[] = [],
  extra: Partial<Tool> = {}
): Tool => ({
  slug,
  name: slug.toLowerCase().replaceAll('_', ' '),
  description: `Runs ${slug}.`,
  inputParameters: { type: 'object', properties, required } as Tool['inputParameters'],
  tags: [],
  ...extra,
});

export type Answer =
  | { type: 'noul'; noul: number }
  | { type: 'choice'; choice: string; confidence: number; probabilities: Record<string, number> };

export const noul = (probability: number): Answer => ({ type: 'noul', noul: probability });

/** A Choice answer whose remaining probability mass is spread over the other options. */
export const choice = (question: TypesafeQuestion, key: string, confidence: number): Answer => {
  const keys = Object.keys(question.type === 'choice' ? question.criteria : {});
  const rest = keys.length > 1 ? (1 - confidence) / (keys.length - 1) : 0;
  return {
    type: 'choice',
    choice: key,
    confidence,
    probabilities: Object.fromEntries(keys.map(k => [k, k === key ? confidence : rest])),
  };
};

export type Responder = (
  questionId: string,
  question: TypesafeQuestion,
  request: TypesafeSystemOneRequest
) => Answer | undefined;

/**
 * A mocked client. Gate Nouls default to 0.95 and member or mentioned Nouls to 0.05;
 * a Choice the responder does not answer picks its last option (not stated or none).
 */
export function mockClient(responder: Responder, model = 'jev-1.13') {
  const systemOne = vi.fn((request: TypesafeSystemOneRequest) => {
    const answers: Record<string, Answer> = {};
    for (const [questionId, question] of Object.entries(request.questions)) {
      const answered = responder(questionId, question, request);
      if (answered !== undefined) answers[questionId] = answered;
      else if (question.type === 'noul') {
        answers[questionId] = noul(questionId.startsWith('gate') ? 0.95 : 0.05);
      } else {
        answers[questionId] = choice(question, Object.keys(question.criteria).at(-1) ?? '', 0.9);
      }
    }
    const result = Promise.resolve({
      model,
      answers,
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    return Object.assign(result, {
      withResponse: async () => ({
        data: await result,
        requestId: `req_${systemOne.mock.calls.length}`,
      }),
    });
  });
  const client: TypesafeClientLike = { systemOne };
  return { client, systemOne };
}

export const failingClient = (error: unknown) => {
  const systemOne = vi.fn(() => {
    const result = Promise.reject(error);
    result.catch(() => undefined);
    return Object.assign(result, { withResponse: () => result });
  });
  return { client: { systemOne } as TypesafeClientLike, systemOne };
};
