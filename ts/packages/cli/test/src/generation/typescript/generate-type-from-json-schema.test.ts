import { describe, expect, it } from '@effect/vitest';
import { Effect } from 'effect';
import { generateTypeFromJsonSchema } from 'src/generation/typescript/generate-type-from-json-schema';
import { assertTypeScriptIsValid } from 'test/__utils__/typescript-compiler';

// Import fixtures
import notionDeleteBlock from 'test/__fixtures__/notion-delete-block.json';
import notionArchivePage from 'test/__fixtures__/notion-archive-page.json';
import notionCreateComment from 'test/__fixtures__/notion-create-comment.json';
import notionAppendTextBlocks from 'test/__fixtures__/notion-append-text-blocks.json';

describe('generateTypeFromJsonSchema', () => {
  describe('control group - simple schemas without discriminator', () => {
    it.effect(
      'should generate type for NOTION_DELETE_BLOCK (simple single property)',
      Effect.fn(function* () {
        const result = yield* generateTypeFromJsonSchema(
          'NOTION_DELETE_BLOCK_INPUT',
          notionDeleteBlock.input_parameters
        );

        expect(result).toContain('type NOTION_DELETE_BLOCK_INPUT');
        expect(result).toContain('block_id');
        expect(result).toMatchSnapshot();
        assertTypeScriptIsValid({ files: { 'index.ts': result } });
      })
    );

    it.effect(
      'should generate type for NOTION_ARCHIVE_NOTION_PAGE (two properties)',
      Effect.fn(function* () {
        const result = yield* generateTypeFromJsonSchema(
          'NOTION_ARCHIVE_NOTION_PAGE_INPUT',
          notionArchivePage.input_parameters
        );

        expect(result).toContain('type NOTION_ARCHIVE_NOTION_PAGE_INPUT');
        expect(result).toContain('page_id');
        expect(result).toContain('archive');
        expect(result).toMatchSnapshot();
        assertTypeScriptIsValid({ files: { 'index.ts': result } });
      })
    );

    it.effect(
      'should generate type for NOTION_CREATE_COMMENT (moderate complexity with nested objects)',
      Effect.fn(function* () {
        const result = yield* generateTypeFromJsonSchema(
          'NOTION_CREATE_COMMENT_INPUT',
          notionCreateComment.input_parameters
        );

        expect(result).toContain('type NOTION_CREATE_COMMENT_INPUT');
        expect(result).toContain('comment');
        expect(result).toMatchSnapshot();
        assertTypeScriptIsValid({ files: { 'index.ts': result } });
      })
    );
  });

  describe('problematic schema - discriminator with $defs references', () => {
    it.effect(
      'should generate type for NOTION_APPEND_TEXT_BLOCKS (discriminator with oneOf)',
      Effect.fn(function* () {
        const result = yield* generateTypeFromJsonSchema(
          'NOTION_APPEND_TEXT_BLOCKS_INPUT',
          notionAppendTextBlocks.input_parameters
        );

        expect(result).toContain('type NOTION_APPEND_TEXT_BLOCKS_INPUT');
        expect(result).toContain('block_id');
        expect(result).toContain('children');
        expect(result).toMatchSnapshot();
        assertTypeScriptIsValid({ files: { 'index.ts': result } });
      })
    );
  });
});
