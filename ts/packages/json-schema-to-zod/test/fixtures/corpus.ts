/**
 * Re-export of the shared cross-SDK JSON Schema conversion corpus.
 *
 * The corpus and its loader are owned by `@composio/core`
 * (`ts/packages/core/test/fixtures/json-schema-conversion/`) and mirrored
 * byte-identically for Python in `python/tests/fixtures/json-schema-conversion/`.
 * Consumers re-export rather than re-implement so the decoding rules and
 * cross-language invariants have exactly one definition.
 */
export {
  acceptedFor,
  assertCorpusInvariants,
  loadObjectCases,
  type CorpusCase,
  type CorpusInstance,
  type CorpusLanguage,
} from '../../../core/test/fixtures/json-schema-conversion/corpus';
