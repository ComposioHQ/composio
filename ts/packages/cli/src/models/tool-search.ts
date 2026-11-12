import { Schema } from 'effect';

/**
 * The CLI's contract for a Tool Router search response (`toolRouter.session.search`): the fields
 * `composio search` reads, and nothing it does not. The client's schema for the endpoint also
 * fixes enums and requires fields the command never reads, which may change without this
 * version of the CLI noticing.
 */

const JsonObject = Schema.Record(Schema.String, Schema.Unknown);

/** A tool's schema in a search response, as `composio search` lists and caches it. */
export const SearchToolSchema = Schema.Struct({
  toolkit: Schema.String,
  tool_slug: Schema.String,
  description: Schema.optional(Schema.NullOr(Schema.String)),
  input_schema: Schema.optional(Schema.NullOr(JsonObject)),
  output_schema: Schema.optional(Schema.NullOr(JsonObject)),
}).annotate({ identifier: 'SearchToolSchema' });
export type SearchToolSchema = Schema.Schema.Type<typeof SearchToolSchema>;

export const SearchToolSchemas = Schema.Record(Schema.String, SearchToolSchema);
export type SearchToolSchemas = Schema.Schema.Type<typeof SearchToolSchemas>;

/**
 * One query's result. Its other fields are kept, since `composio search` prints the result on
 * stdout.
 */
export const SearchResult = Schema.StructWithRest(
  Schema.Struct({
    use_case: Schema.String,
    primary_tool_slugs: Schema.Array(Schema.String),
    related_tool_slugs: Schema.Array(Schema.String),
    recommended_plan_steps: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
  }),
  [JsonObject]
).annotate({ identifier: 'SearchResult' });
export type SearchResult = Schema.Schema.Type<typeof SearchResult>;

export const ToolSearchResponse = Schema.Struct({
  results: Schema.Array(SearchResult),
  tool_schemas: SearchToolSchemas,
  toolkit_connection_statuses: Schema.Array(
    Schema.Struct({ toolkit: Schema.String, has_active_connection: Schema.Boolean })
  ),
  error: Schema.optional(Schema.NullOr(Schema.String)),
  next_steps_guidance: Schema.optional(Schema.NullOr(Schema.Array(Schema.String))),
}).annotate({ identifier: 'ToolSearchResponse' });
export type ToolSearchResponse = Schema.Schema.Type<typeof ToolSearchResponse>;
