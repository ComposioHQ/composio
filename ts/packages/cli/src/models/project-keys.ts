import { Schema } from 'effect';
import { OptionFromNullishOr } from 'effect/Schema';
import { JSONTransformSchema } from './utils/json-transform-schema';

/**
 * Organization and project identifiers for a CLI project profile.
 * Stored in `~/.composio/_keys/<projectId>.json` (global registry)
 * and `<cwd>/.composio/project.json` (per-directory config).
 */
export const ProjectKeys = Schema.Struct({
  /**
   * Organization member ID (maps to `x-org-id` header).
   */
  orgId: Schema.propertySignature(Schema.String).pipe(Schema.fromKey('org_id')),

  /**
   * Project ID (maps to `x-project-id` header).
   */
  projectId: Schema.propertySignature(Schema.String).pipe(Schema.fromKey('project_id')),

  /**
   * Human-readable project name from session/info (optional for backward compat).
   */
  projectName: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('project_name')
  ),

  /**
   * Human-readable org name from session/info (optional for backward compat).
   */
  orgName: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('org_name')
  ),

  /**
   * User email from session/info (optional for backward compat).
   */
  email: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('email')
  ),

  /**
   * Optional test user identifier used by CLI/e2e flows.
   */
  testUserId: Schema.propertySignature(OptionFromNullishOr(Schema.String, null)).pipe(
    Schema.fromKey('test_user_id')
  ),
}).annotations({
  identifier: 'ProjectKeys',
  description: 'Organization and project identifiers for a CLI project profile',
});

export type ProjectKeys = Schema.Schema.Type<typeof ProjectKeys>;

export const ProjectKeysJSON = JSONTransformSchema(ProjectKeys);
export const projectKeysFromJSON = Schema.decode(ProjectKeysJSON, {
  propertyOrder: 'original',
  onExcessProperty: 'ignore',
  exact: false,
});
export const projectKeysToJSON = Schema.encode(ProjectKeysJSON);
