import { jsonSchemaToTsType, jsonSchemaToModel, getEnvVariable, nodeExternalRequire } from './shared';
import z from 'zod';

describe('shared utilities', () => {
  describe('jsonSchemaToTsType', () => {
    it('should convert json schema types to TypeScript types', () => {
      expect(jsonSchemaToTsType({ type: 'string' })).toBe(String);
      expect(jsonSchemaToTsType({ type: 'integer' })).toBe(Number);
      expect(jsonSchemaToTsType({ type: 'number' })).toBe(Number);
      expect(jsonSchemaToTsType({ type: 'boolean' })).toBe(Boolean);
      expect(jsonSchemaToTsType({ type: 'null' })).toBe(null);
      expect(() => jsonSchemaToTsType({ type: 'unknown' })).toThrow('Unsupported JSON schema type: unknown');
    });
  });

  describe('jsonSchemaToModel', () => {
    it('should convert json schema to zod model', () => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'integer' },
        },
        required: ['name']
      };
      const model = jsonSchemaToModel(schema);
      expect(model).toBeInstanceOf(z.ZodObject);
      expect(() => model.parse({ name: 'John', age: 'not a number' })).toThrow();
      expect(model.parse({ name: 'John', age: 30 })).toEqual({ name: 'John', age: 30 });
    });
  });

  describe('getEnvVariable', () => {
    it('should return the environment variable if set', () => {
      process.env.TEST_VAR = 'test';
      expect(getEnvVariable('TEST_VAR')).toBe('test');
    });

    it('should return undefined if the environment variable is not set', () => {
      delete process.env.TEST_VAR;
      expect(getEnvVariable('TEST_VAR')).toBeUndefined();
    });

    it('should return the default value if the environment variable is not set and default is provided', () => {
      expect(getEnvVariable('TEST_VAR', 'default')).toBe('default');
    });
  });

  describe('nodeExternalRequire', () => {
    it('should require a module', () => {
      const module = nodeExternalRequire('path');
      expect(module).toBeDefined();
    });

    it('should return null if the module cannot be required', () => {
      const module = nodeExternalRequire('nonexistent-module');
      expect(module).toBeNull();
    });
  });
});
