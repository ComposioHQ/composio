import { describe, it, expect } from '@effect/vitest';
import { Effect, Option, ParseResult } from 'effect';
import { ProjectKeys, projectKeysFromJSON, projectKeysToJSON } from 'src/models/project-keys';

describe('ProjectKeys', () => {
  describe('decode from JSON', () => {
    it.effect('decodes valid JSON with required fields only', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({ org_id: 'abc', project_id: 'def' });

        const result = yield* projectKeysFromJSON(json);

        expect(result.orgId).toBe('abc');
        expect(result.projectId).toBe('def');
        expect(Option.isNone(result.projectName)).toBe(true);
        expect(Option.isNone(result.orgName)).toBe(true);
        expect(Option.isNone(result.email)).toBe(true);
        expect(Option.isNone(result.testUserId)).toBe(true);
      })
    );

    it.effect('decodes valid JSON with all fields', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({
          org_id: 'abc',
          project_id: 'def',
          project_name: 'My Project',
          org_name: 'My Org',
          email: 'test@test.com',
          test_user_id: 'pg-test-user-123',
        });

        const result = yield* projectKeysFromJSON(json);

        expect(result.orgId).toBe('abc');
        expect(result.projectId).toBe('def');
        expect(Option.getOrUndefined(result.projectName)).toBe('My Project');
        expect(Option.getOrUndefined(result.orgName)).toBe('My Org');
        expect(Option.getOrUndefined(result.email)).toBe('test@test.com');
        expect(Option.getOrUndefined(result.testUserId)).toBe('pg-test-user-123');
      })
    );

    it.effect('decodes null optional fields as Option.none()', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({
          org_id: 'abc',
          project_id: 'def',
          project_name: null,
          org_name: null,
          email: null,
          test_user_id: null,
        });

        const result = yield* projectKeysFromJSON(json);

        expect(result.orgId).toBe('abc');
        expect(result.projectId).toBe('def');
        expect(Option.isNone(result.projectName)).toBe(true);
        expect(Option.isNone(result.orgName)).toBe(true);
        expect(Option.isNone(result.email)).toBe(true);
        expect(Option.isNone(result.testUserId)).toBe(true);
      })
    );

    it.effect('ignores extra keys in decoded JSON', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({
          org_id: 'abc',
          project_id: 'def',
          future_field: 'unknown',
        });

        // Should not fail -- onExcessProperty: 'ignore' silently drops extra keys
        const result = yield* projectKeysFromJSON(json);
        expect(result.orgId).toBe('abc');
        expect(result.projectId).toBe('def');
      })
    );

    it.effect('fails on missing org_id', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({ project_id: 'def' });
        const error = yield* Effect.flip(projectKeysFromJSON(json));
        expect(error).toBeInstanceOf(ParseResult.ParseError);
      })
    );

    it.effect('fails on missing project_id', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({ org_id: 'abc' });
        const error = yield* Effect.flip(projectKeysFromJSON(json));
        expect(error).toBeInstanceOf(ParseResult.ParseError);
      })
    );

    it.effect('fails on non-string org_id', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({ org_id: 123, project_id: 'def' });
        const error = yield* Effect.flip(projectKeysFromJSON(json));
        expect(error).toBeInstanceOf(ParseResult.ParseError);
      })
    );

    it.effect('fails on non-string project_id', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({ org_id: 'abc', project_id: true });
        const error = yield* Effect.flip(projectKeysFromJSON(json));
        expect(error).toBeInstanceOf(ParseResult.ParseError);
      })
    );

    it.effect('fails on invalid JSON', () =>
      Effect.gen(function* () {
        const error = yield* Effect.flip(projectKeysFromJSON('not json'));
        expect(error).toBeInstanceOf(ParseResult.ParseError);
      })
    );

    it.effect('accepts empty strings for required fields', () =>
      Effect.gen(function* () {
        const json = JSON.stringify({ org_id: '', project_id: '' });
        const result = yield* projectKeysFromJSON(json);
        expect(result.orgId).toBe('');
        expect(result.projectId).toBe('');
      })
    );
  });

  describe('encode to JSON', () => {
    it.effect('encodes ProjectKeys with Some values', () =>
      Effect.gen(function* () {
        const keys: ProjectKeys = {
          orgId: 'abc',
          projectId: 'def',
          projectName: Option.some('My Project'),
          orgName: Option.some('My Org'),
          email: Option.some('test@test.com'),
          testUserId: Option.some('pg-test-user-123'),
        };

        const json = yield* projectKeysToJSON(keys);
        const parsed = JSON.parse(json);

        expect(parsed.org_id).toBe('abc');
        expect(parsed.project_id).toBe('def');
        expect(parsed.project_name).toBe('My Project');
        expect(parsed.org_name).toBe('My Org');
        expect(parsed.email).toBe('test@test.com');
        expect(parsed.test_user_id).toBe('pg-test-user-123');
      })
    );

    it.effect('encodes None optional fields as null', () =>
      Effect.gen(function* () {
        const keys: ProjectKeys = {
          orgId: 'abc',
          projectId: 'def',
          projectName: Option.none(),
          orgName: Option.none(),
          email: Option.none(),
          testUserId: Option.none(),
        };

        const json = yield* projectKeysToJSON(keys);
        const parsed = JSON.parse(json);

        expect(parsed.org_id).toBe('abc');
        expect(parsed.project_id).toBe('def');
        expect(parsed.project_name).toBeNull();
        expect(parsed.org_name).toBeNull();
        expect(parsed.email).toBeNull();
        expect(parsed.test_user_id).toBeNull();
      })
    );
  });

  describe('round-trip', () => {
    it.effect('encode then decode preserves Some values', () =>
      Effect.gen(function* () {
        const original: ProjectKeys = {
          orgId: 'org-123',
          projectId: 'proj-456',
          projectName: Option.some('Test Project'),
          orgName: Option.some('Test Org'),
          email: Option.some('user@example.com'),
          testUserId: Option.some('pg-test-user-123'),
        };

        const json = yield* projectKeysToJSON(original);
        const decoded = yield* projectKeysFromJSON(json);

        expect(decoded.orgId).toBe(original.orgId);
        expect(decoded.projectId).toBe(original.projectId);
        expect(Option.getOrUndefined(decoded.projectName)).toBe(
          Option.getOrUndefined(original.projectName)
        );
        expect(Option.getOrUndefined(decoded.orgName)).toBe(
          Option.getOrUndefined(original.orgName)
        );
        expect(Option.getOrUndefined(decoded.email)).toBe(Option.getOrUndefined(original.email));
        expect(Option.getOrUndefined(decoded.testUserId)).toBe(
          Option.getOrUndefined(original.testUserId)
        );
      })
    );

    it.effect('encode then decode preserves None values', () =>
      Effect.gen(function* () {
        const original: ProjectKeys = {
          orgId: 'org-123',
          projectId: 'proj-456',
          projectName: Option.none(),
          orgName: Option.none(),
          email: Option.none(),
          testUserId: Option.none(),
        };

        const json = yield* projectKeysToJSON(original);
        const decoded = yield* projectKeysFromJSON(json);

        expect(decoded.orgId).toBe(original.orgId);
        expect(decoded.projectId).toBe(original.projectId);
        expect(Option.isNone(decoded.projectName)).toBe(true);
        expect(Option.isNone(decoded.orgName)).toBe(true);
        expect(Option.isNone(decoded.email)).toBe(true);
        expect(Option.isNone(decoded.testUserId)).toBe(true);
      })
    );
  });
});
