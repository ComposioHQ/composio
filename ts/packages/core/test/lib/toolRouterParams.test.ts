import { describe, it, expect } from 'vitest';
import { transformToolRouterTagsParams } from '../../src/lib/toolRouterParams';
import { ToolRouterConfigTags } from '../../src/types/toolRouter.types';

describe('transformToolRouterTagsParams', () => {
  describe('with undefined input', () => {
    it('should return undefined when params is undefined', () => {
      const result = transformToolRouterTagsParams(undefined);
      expect(result).toBeUndefined();
    });
  });

  describe('with array input', () => {
    it('should transform array of tags to enable format', () => {
      const params: ToolRouterConfigTags = ['readOnlyHint', 'idempotentHint'];
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint', 'idempotentHint'],
      });
    });

    it('should handle single tag in array', () => {
      const params: ToolRouterConfigTags = ['readOnlyHint'];
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint'],
      });
    });

    it('should handle all tag types', () => {
      const params: ToolRouterConfigTags = [
        'readOnlyHint',
        'destructiveHint',
        'idempotentHint',
        'openWorldHint',
      ];
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'],
      });
    });

    it('should handle empty array', () => {
      const params: ToolRouterConfigTags = [];
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: [],
      });
    });
  });

  describe('with object input', () => {
    it('should transform object with enable property', () => {
      const params: ToolRouterConfigTags = {
        enable: ['readOnlyHint', 'idempotentHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint', 'idempotentHint'],
      });
    });

    it('should transform object with disable property', () => {
      const params: ToolRouterConfigTags = {
        disable: ['destructiveHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: undefined,
        disable: ['destructiveHint'],
      });
    });

    it('should transform object with both enable and disable properties', () => {
      const params: ToolRouterConfigTags = {
        enable: ['readOnlyHint', 'idempotentHint'],
        disable: ['destructiveHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint', 'idempotentHint'],
        disable: ['destructiveHint'],
      });
    });

    it('should handle object with only enable property', () => {
      const params: ToolRouterConfigTags = {
        enable: ['readOnlyHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: ['readOnlyHint'],
      });
    });

    it('should handle object with only disable property', () => {
      const params: ToolRouterConfigTags = {
        disable: ['destructiveHint', 'openWorldHint'],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: undefined,
        disable: ['destructiveHint', 'openWorldHint'],
      });
    });

    it('should handle empty arrays in object', () => {
      const params: ToolRouterConfigTags = {
        enable: [],
        disable: [],
      };
      const result = transformToolRouterTagsParams(params);

      expect(result).toEqual({
        enable: [],
        disable: [],
      });
    });
  });
});
