import { Schema } from 'effect';
import { OptionFromOptionalNullOr } from 'effect/Schema';
import { JSONTransformSchema } from './utils/json-transform-schema';

/**
 * Organization and developer-project identifiers for a CLI project profile.
 * Stored in `~/.composio/_keys/<projectId>.json` (global registry)
 * and `<cwd>/.composio/project.json` (per-directory developer config).
 */
export const ProjectKeys = Schema.Struct({
  /**
   * Organization member ID (maps to `x-org-id` header).
   */
  orgId: Schema.String,

  /**
   * Project ID (maps to `x-project-id` header).
   */
  projectId: Schema.String,

  /**
   * Human-readable project name from session/info (optional for backward compat).
   */
  projectName: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),

  /**
   * Human-readable org name from session/info (optional for backward compat).
   */
  orgName: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),

  /**
   * User email from session/info (optional for backward compat).
   */
  email: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),

  /**
   * Optional test user identifier used by CLI/e2e flows.
   */
  testUserId: OptionFromOptionalNullOr(Schema.String, { onNoneEncoding: null }),
}).pipe(
  Schema.encodeKeys({
    orgId: 'org_id',
    projectId: 'project_id',
    projectName: 'project_name',
    orgName: 'org_name',
    testUserId: 'test_user_id',
  }),
  Schema.annotate({
    identifier: 'ProjectKeys',
    description: 'Organization and project identifiers for a CLI project profile',
  })
);

export type ProjectKeys = Schema.Schema.Type<typeof ProjectKeys>;

export const ProjectKeysJSON = JSONTransformSchema(ProjectKeys);
export const projectKeysFromJSON = Schema.decodeEffect(ProjectKeysJSON, {
  propertyOrder: 'original',
  onExcessProperty: 'ignore',
});
export const projectKeysToJSON = Schema.encodeEffect(ProjectKeysJSON);
