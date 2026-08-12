/**
 * Loader for the shared cross-SDK JSON Schema conversion corpus.
 *
 * The corpus is a single logical fixture with one byte-identical copy per
 * language (`ts/packages/core/test/fixtures/json-schema-conversion/` and
 * `python/tests/fixtures/json-schema-conversion/`), following the same
 * convention as the webhook fixtures. Every consumer resolves its own copy
 * module-relatively — no working-directory or repository-root assumptions.
 */
import * as z from 'zod';

import corpusDocument from './object-cases.json';

const JsonObject = z.record(z.string(), z.unknown());

const LanguageExpectation = z.object({
  output: z.unknown().optional(),
  accepted: z.boolean().optional(),
});

const CorpusInstance = z.object({
  input: JsonObject,
  accepted: z.boolean(),
  zod: LanguageExpectation.optional(),
  effect: LanguageExpectation.optional(),
  python: LanguageExpectation.optional(),
  divergence: z.object({ reason: z.string().min(1) }).optional(),
});

const CorpusCase = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  divergesFromJsonSchema: z.string().optional(),
  schema: JsonObject,
  ingress: z.object({ accepted: z.boolean(), preserved: JsonObject }).optional(),
  instances: z.array(CorpusInstance).min(1),
});

const Corpus = z.object({ cases: z.array(CorpusCase).min(1) });

export type CorpusInstance = z.infer<typeof CorpusInstance>;
export type CorpusCase = z.infer<typeof CorpusCase>;
export type CorpusLanguage = 'zod' | 'effect' | 'python';

/**
 * Enforce the invariants that keep the corpus a shared contract rather than a
 * per-language wish list: ids are unique, and a language may only disagree about
 * acceptance when the instance declares why.
 */
export const assertCorpusInvariants = (cases: ReadonlyArray<CorpusCase>): void => {
  const seen = new Set<string>();
  for (const testCase of cases) {
    if (seen.has(testCase.id)) {
      throw new Error(`Duplicate corpus case id: ${testCase.id}`);
    }
    seen.add(testCase.id);

    for (const [index, instance] of testCase.instances.entries()) {
      for (const language of ['zod', 'effect', 'python'] as const) {
        const override = instance[language]?.accepted;
        if (override !== undefined && override !== instance.accepted && !instance.divergence) {
          throw new Error(
            `Corpus case ${testCase.id} instance ${index} overrides ${language} acceptance without a divergence reason`
          );
        }
      }
    }
  }
};

let cached: ReadonlyArray<CorpusCase> | undefined;

/** Decode the shared corpus and enforce its cross-language invariants. */
export const loadObjectCases = (): ReadonlyArray<CorpusCase> => {
  if (!cached) {
    const { cases } = Corpus.parse(corpusDocument);
    assertCorpusInvariants(cases);
    cached = cases;
  }
  return cached;
};

/** Acceptance for one language: the shared flag unless a declared divergence overrides it. */
export const acceptedFor = (instance: CorpusInstance, language: CorpusLanguage): boolean =>
  instance[language]?.accepted ?? instance.accepted;
