import { describe, it, expect } from 'vitest';
import { Effect, Option } from 'effect';
import { ProjectKeys, projectKeysFromJSON, projectKeysToJSON } from 'src/models/project-keys';

describe('ProjectKeys', () => {
  describe('decode from JSON', () => {
    it('decodes valid JSON with required fields only', () => {
      const json = JSON.stringify({ org_id: 'abc', project_id: 'def' });

      const result = Effect.runSync(projectKeysFromJSON(json));

      expect(result.orgId).toBe('abc');
      expect(result.projectId).toBe('def');
      expect(Option.isNone(result.projectName)).toBe(true);
      expect(Option.isNone(result.orgName)).toBe(true);
      expect(Option.isNone(result.email)).toBe(true);
    });

    it('decodes valid JSON with all fields', () => {
      const json = JSON.stringify({
        org_id: 'abc',
        project_id: 'def',
        project_name: 'My Project',
        org_name: 'My Org',
        email: 'test@test.com',
      });

      const result = Effect.runSync(projectKeysFromJSON(json));

      expect(result.orgId).toBe('abc');
      expect(result.projectId).toBe('def');
      expect(Option.getOrUndefined(result.projectName)).toBe('My Project');
      expect(Option.getOrUndefined(result.orgName)).toBe('My Org');
      expect(Option.getOrUndefined(result.email)).toBe('test@test.com');
    });

    it('decodes null optional fields as Option.none()', () => {
      const json = JSON.stringify({
        org_id: 'abc',
        project_id: 'def',
        project_name: null,
        org_name: null,
        email: null,
      });

      const result = Effect.runSync(projectKeysFromJSON(json));

      expect(result.orgId).toBe('abc');
      expect(result.projectId).toBe('def');
      expect(Option.isNone(result.projectName)).toBe(true);
      expect(Option.isNone(result.orgName)).toBe(true);
      expect(Option.isNone(result.email)).toBe(true);
    });

    it('ignores extra keys in decoded JSON', () => {
      const json = JSON.stringify({
        org_id: 'abc',
        project_id: 'def',
        future_field: 'unknown',
      });

      // Should not throw -- onExcessProperty: 'ignore' silently drops extra keys
      const result = Effect.runSync(projectKeysFromJSON(json));
      expect(result.orgId).toBe('abc');
      expect(result.projectId).toBe('def');
    });

    it('fails on missing org_id', () => {
      const json = JSON.stringify({ project_id: 'def' });
      expect(() => Effect.runSync(projectKeysFromJSON(json))).toThrow();
    });

    it('fails on missing project_id', () => {
      const json = JSON.stringify({ org_id: 'abc' });
      expect(() => Effect.runSync(projectKeysFromJSON(json))).toThrow();
    });

    it('fails on non-string org_id', () => {
      const json = JSON.stringify({ org_id: 123, project_id: 'def' });
      expect(() => Effect.runSync(projectKeysFromJSON(json))).toThrow();
    });

    it('fails on non-string project_id', () => {
      const json = JSON.stringify({ org_id: 'abc', project_id: true });
      expect(() => Effect.runSync(projectKeysFromJSON(json))).toThrow();
    });

    it('fails on invalid JSON', () => {
      expect(() => Effect.runSync(projectKeysFromJSON('not json'))).toThrow();
    });

    it('accepts empty strings for required fields', () => {
      const json = JSON.stringify({ org_id: '', project_id: '' });
      const result = Effect.runSync(projectKeysFromJSON(json));
      expect(result.orgId).toBe('');
      expect(result.projectId).toBe('');
    });
  });

  describe('encode to JSON', () => {
    it('encodes ProjectKeys with Some values', () => {
      const keys: ProjectKeys = {
        orgId: 'abc',
        projectId: 'def',
        projectName: Option.some('My Project'),
        orgName: Option.some('My Org'),
        email: Option.some('test@test.com'),
      };

      const json = Effect.runSync(projectKeysToJSON(keys));
      const parsed = JSON.parse(json);

      expect(parsed.org_id).toBe('abc');
      expect(parsed.project_id).toBe('def');
      expect(parsed.project_name).toBe('My Project');
      expect(parsed.org_name).toBe('My Org');
      expect(parsed.email).toBe('test@test.com');
    });

    it('encodes None optional fields as null', () => {
      const keys: ProjectKeys = {
        orgId: 'abc',
        projectId: 'def',
        projectName: Option.none(),
        orgName: Option.none(),
        email: Option.none(),
      };

      const json = Effect.runSync(projectKeysToJSON(keys));
      const parsed = JSON.parse(json);

      expect(parsed.org_id).toBe('abc');
      expect(parsed.project_id).toBe('def');
      expect(parsed.project_name).toBeNull();
      expect(parsed.org_name).toBeNull();
      expect(parsed.email).toBeNull();
    });
  });

  describe('round-trip', () => {
    it('encode then decode preserves Some values', () => {
      const original: ProjectKeys = {
        orgId: 'org-123',
        projectId: 'proj-456',
        projectName: Option.some('Test Project'),
        orgName: Option.some('Test Org'),
        email: Option.some('user@example.com'),
      };

      const json = Effect.runSync(projectKeysToJSON(original));
      const decoded = Effect.runSync(projectKeysFromJSON(json));

      expect(decoded.orgId).toBe(original.orgId);
      expect(decoded.projectId).toBe(original.projectId);
      expect(Option.getOrUndefined(decoded.projectName)).toBe(
        Option.getOrUndefined(original.projectName)
      );
      expect(Option.getOrUndefined(decoded.orgName)).toBe(Option.getOrUndefined(original.orgName));
      expect(Option.getOrUndefined(decoded.email)).toBe(Option.getOrUndefined(original.email));
    });

    it('encode then decode preserves None values', () => {
      const original: ProjectKeys = {
        orgId: 'org-123',
        projectId: 'proj-456',
        projectName: Option.none(),
        orgName: Option.none(),
        email: Option.none(),
      };

      const json = Effect.runSync(projectKeysToJSON(original));
      const decoded = Effect.runSync(projectKeysFromJSON(json));

      expect(decoded.orgId).toBe(original.orgId);
      expect(decoded.projectId).toBe(original.projectId);
      expect(Option.isNone(decoded.projectName)).toBe(true);
      expect(Option.isNone(decoded.orgName)).toBe(true);
      expect(Option.isNone(decoded.email)).toBe(true);
    });
  });
});
