# Schema Violation Compatibility Report

**Date**: 2026-03-17
**Source**: `composio_schema_violations.csv` (6,722 violations across 1,162 tools)
**Test tools**: One tool per violation category with only that specific issue, plus a clean baseline tool.

## Violation Categories


| Category                      | Count | Description                                                            |
| ----------------------------- | ----- | ---------------------------------------------------------------------- |
| param_name_too_long           | 1,886 | Parameter names exceed 64 chars                                        |
| excessive_nesting             | 1,738 | Schema nesting depth >5 levels                                         |
| missing_param_description     | 1,443 | Parameters without descriptions                                        |
| missing_type                  | 694   | Schema nodes without a `type` field                                    |
| invalid_param_chars           | 506   | Invalid chars in param names (`$`, `[`, `]`)                           |
| param_description_too_long    | 187   | Descriptions >1024 chars                                               |
| tool_name_too_long            | 33    | Tool names >64 chars                                                   |
| tool_description_too_long     | 12    | Tool descriptions >1024 chars                                          |
| excessive_properties          | 24    | Objects with >100 properties                                           |
| excessive_enum_values         | 3     | Enums with >500 values                                                 |
| param_name_leading_underscore | N/A   | Leading `_` in param names breaks Pydantic `create_model` (not in CSV) |
| param_name_hyphen             | N/A   | Hyphenated param names (e.g. `extension-id`) via Pydantic alias (not in CSV) |
| reserved_keyword              | N/A   | Python reserved keywords (e.g. `from`) as param names via Pydantic alias (not in CSV) |


## Test Tools (one per category, with only that issue)


| Category                        | Test Tool                                                           | Action File                                                                         |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| param_name_too_long             | `DIALPAD_CONFIGURE_CALL_CENTER_SETTINGS`                            | `apps/dialpad/actions/generated/configure_call_center_settings.py`                  |
| excessive_nesting               | `DATABRICKS_SETTINGS_AUTOMATIC_CLUSTER_UPDATE_UPDATE`               | `apps/databricks/actions/databricks_settings_automatic_cluster_update_update.py`    |
| missing_param_description       | `ASANA_ADD_SUPPORTING_RELATIONSHIP`                                 | `apps/asana/actions/add_supporting_relationship.py`                                 |
| missing_type                    | `POSTHOG_CREATE_PROJECT_NOTEBOOK` (`content: t.Optional[t.Any]`)    | `apps/posthog/actions/generated/create_a_notebook_in_a_project.py`                  |
| invalid_param_chars             | `BENZINGA_GET_CONFERENCE_CALLS`                                     | `apps/benzinga/actions/get_conference_calls_v2_1.py`                                |
| param_description_too_long      | `AHREFS_EXPLORE_KEYWORDS_OVERVIEW`                                  | `apps/ahrefs/actions/generated/explore_keywords_overview.py`                        |
| tool_name_too_long              | `BIG_DATA_CLOUD_BIG_DATA_CLOUD_REVERSE_GEOCODING_WITH_TIMEZONE_API` | `apps/big_data_cloud/actions/big_data_cloud_reverse_geocoding_with_timezone_api.py` |
| tool_description_too_long       | `COMPOSIO_CREATE_PLAN`                                              | `apps/composio/actions/create_plan.py`                                              |
| excessive_properties            | `HUBSPOT_CREATE_CONTACT`                                            | `apps/hubspot/actions/create_contact_object_with_properties.py`                     |
| excessive_enum_values           | `HUBSPOT_CREATE_A_NEW_MARKETING_EMAIL`                              | `apps/hubspot/actions/generated/create_a_new_marketing_email.py`                    |
| param_name_leading_underscore   | `_21RISK_GET_COMPLIANCE` (has `_maxPageSizeInMb`)                   | `apps/_21risk/actions/get_compliance.py`                                            |
| param_name_hyphen               | `OUTLOOK_DELETE_ME_CONTACT_EXTENSION` (has `extension-id` alias)    | `apps/outlook/actions/deleteContactExtension.py`                                    |
| reserved_keyword                | `OUTLOOK_CREATE_USER_MESSAGE` (has `from` alias)                    | `apps/outlook/actions/CreateUserMessage.py`                                         |
| **(baseline -- no violations)** | `SLACK_SEND_MESSAGE`                                                | `apps/slack/actions/send_message.py`                                                |


---

## Category Details and Test Tool Justification

Each test tool was verified to have **only** its designated violation in the CSV (exclusive match). This ensures failures in the compatibility table are attributable to that specific issue.

- `**param_name_too_long`** -- Parameter names exceed 64 characters. Most providers and LLM APIs enforce a 64-char limit on function parameter names.
  - *Test tool*: `DIALPAD_CONFIGURE_CALL_CENTER_SETTINGS` -- has 3 params like `advanced__settings__auto__call__recording__allow__pause__recording` (66-68 chars). Only violation in CSV: `param_name_too_long`.
- `**excessive_nesting`** -- JSON schema has object nesting deeper than 5 levels. Deeply nested schemas can cause issues with providers that flatten or recursively validate tool parameters.
  - *Test tool*: `DATABRICKS_SETTINGS_AUTOMATIC_CLUSTER_UPDATE_UPDATE` -- path `setting.automatic_cluster_update_workspace.maintenance_window.week_day_based_schedule.window_start_time.hours` reaches nesting depth 6 via purely nested properties (no arrays). Only violation in CSV: `excessive_nesting`.
- `**missing_param_description`** -- One or more parameters have no `description` field. Without descriptions, the LLM has less context to understand what values to provide, sometimes skipping the tool call entirely.
  - *Test tool*: `ASANA_ADD_SUPPORTING_RELATIONSHIP` -- the `data` parameter has no description. Only violation in CSV: `missing_param_description`.
- `**missing_type`** -- One or more schema nodes lack a `type` field. Providers that strictly validate JSON Schema may reject the tool, and LLMs may not know what format to use for the parameter.
  - *Test tool*: `POSTHOG_CREATE_PROJECT_NOTEBOOK` -- the `content` parameter is typed `t.Optional[t.Any]` in Pydantic, which produces a schema node with no `type` field. Note: the original CSV test tool `ABSTRACT_VALIDATE_EMAIL` has been fixed (type is now present); 72% of the 464 `missing_type` tools in the CSV are fixed, with 55 still missing (mostly PostHog).
- `**invalid_param_chars`** -- Parameter names contain characters outside `[a-zA-Z0-9_]`, such as `$`, `[`, `]`. Some providers reject these at the API level. Note: Composio strips `$` prefixes server-side, so this primarily affects `[]` bracket characters via Composio.
  - *Test tool*: `BENZINGA_GET_CONFERENCE_CALLS` -- has params like `parameters[date]`, `parameters[tickers]` with bracket characters. Only violation in CSV: `invalid_param_chars`.
- `**param_description_too_long`** -- A parameter description exceeds 1024 characters. Some providers truncate or reject overly long descriptions.
  - *Test tool*: `AHREFS_EXPLORE_KEYWORDS_OVERVIEW` -- the `where` parameter description is 3,352 chars. Only violation in CSV: `param_description_too_long`.
- `**tool_name_too_long`** -- The tool name exceeds 64 characters. Most LLM APIs enforce a max function name length of 64.
  - *Test tool*: `BIG_DATA_CLOUD_BIG_DATA_CLOUD_REVERSE_GEOCODING_WITH_TIMEZONE_API` -- 65 chars. Only violation in CSV: `tool_name_too_long`.
- `**tool_description_too_long`** -- The tool description exceeds 1024 characters. Some providers reject or truncate overly long tool descriptions.
  - *Test tool*: `COMPOSIO_CREATE_PLAN` -- description is 1,258 chars. Only violation in CSV: `tool_description_too_long`.
- `**excessive_properties`** -- A single object in the schema has more than 100 properties. This can overwhelm LLMs and cause issues with providers that have property count limits.
  - *Test tool*: `HUBSPOT_CREATE_CONTACT` -- root object has 110 properties. Only violation in CSV: `excessive_properties`.
- `**excessive_enum_values`** -- An enum field has more than 500 allowed values. Large enums bloat the schema and may exceed token limits.
  - *Test tool*: `HUBSPOT_CREATE_A_NEW_MARKETING_EMAIL` -- the `language` field has 754 enum values. Only violation in CSV: `excessive_enum_values`.
- `**param_name_leading_underscore`** -- Parameter names starting with `_` break Pydantic's `create_model()`, which is used by LangChain and CrewAI Composio providers. This category is **not in the CSV** -- it was discovered during testing.
  - *Test tool*: `_21RISK_GET_COMPLIANCE` -- has `_maxPageSizeInMb` parameter. The tool also has `$`-prefixed violations in the raw CSV (`invalid_param_chars`, `param_name_bad_start`), but Composio strips `$` prefixes server-side, so only the underscore issue survives in the Composio API.
- `**param_name_hyphen`** -- Parameter names containing hyphens (e.g. `extension-id`) are not valid Python identifiers. Python's `inspect.Parameter` rejects any name where `str.isidentifier()` returns `False`. Hyphens are interpreted as the minus operator. These arise from Pydantic `alias="extension-id"` in tool code, which puts the hyphenated name into the JSON schema. **Not in the CSV** -- discovered via Outlook tool PRs ([#18319](https://github.com/ComposioHQ/mercury/pull/18319), [#18320](https://github.com/ComposioHQ/mercury/pull/18320)).
  - *Test tool*: `OUTLOOK_DELETE_ME_CONTACT_EXTENSION` -- has `extension-id` parameter (via Pydantic alias). Providers that build Python function signatures (Gemini, LangChain) reject it; others pass JSON keys through unvalidated.
- `**reserved_keyword`** -- Python reserved keywords (e.g. `from`, `for`, `async`) as parameter names. These are valid identifiers (`str.isidentifier()` returns `True`) but `keyword.iskeyword()` returns `True`, so `inspect.Parameter` rejects them. However, the Composio SDK already handles this via `substitute_reserved_python_keywords()` in `composio/utils/shared.py`, which renames e.g. `from` → `from_rs` before creating Parameter objects, then `reinstate_reserved_python_keywords()` converts back when making API calls. **Not in the CSV** -- discovered via Outlook tool PRs ([#18322](https://github.com/ComposioHQ/mercury/pull/18322), [#18324](https://github.com/ComposioHQ/mercury/pull/18324), [#18326](https://github.com/ComposioHQ/mercury/pull/18326)).
  - *Test tool*: `OUTLOOK_CREATE_USER_MESSAGE` -- has `from` parameter (via Pydantic `alias="from"`). All providers pass because the SDK's keyword substitution handles it transparently. The PRs fixing this are unnecessary given the SDK-side workaround.

---

## Composio Provider Compatibility

Schemas loaded from Composio API, tested via each Composio provider wrapper (SDK calls).


| Category                          | OpenAI | Anthropic | Gemini | Agents SDK | LangChain | CrewAI |
| --------------------------------- | ------ | --------- | ------ | ---------- | --------- | ------ |
| **baseline (clean)**              | OK     | OK        | OK     | OK         | OK        | OK     |
| **param_name_too_long**           | OK     | OK        | OK     | OK         | OK        | OK     |
| **excessive_nesting**             | OK     | OK        | OK     | OK         | OK        | OK     |
| **missing_param_description**     | OK     | OK        | OK     | OK         | OK        | OK     |
| **missing_type**                  | OK     | OK        | OK     | OK         | OK        | OK     |
| **invalid_param_chars**           | OK     | OK        | OK     | OK         | OK        | OK     |
| **param_description_too_long**    | OK     | OK        | OK     | OK         | OK        | OK     |
| **tool_name_too_long**            | OK     | OK        | OK     | OK         | OK        | OK     |
| **tool_description_too_long**     | OK     | OK        | OK     | OK         | OK        | OK     |
| **excessive_properties**          | OK     | OK        | OK     | OK         | OK        | OK     |
| **excessive_enum_values**         | OK     | OK        | OK     | OK         | OK        | OK     |
| **param_name_leading_underscore** | OK     | OK        | OK     | OK         | FAILED    | FAILED |
| **param_name_hyphen**             | OK     | OK        | FAILED | OK         | FAILED    | OK     |
| **reserved_keyword**              | OK     | OK        | OK     | OK         | OK        | OK     |


---

## Direct API Compatibility

Schemas loaded locally from action files via `Action.from_file()`, tested via raw HTTP API calls (no SDK, no Composio wrappers). The local Pydantic-generated schema includes fields like `examples` and `title` that are not present in the Composio API schema.

**Gemini (Stripped)** = raw schema with Gemini-incompatible fields (`examples`, `title`, `human_parameter_description`, `human_parameter_name`, `const`, `additionalProperties`) recursively stripped, and `tool_config.function_calling_config.mode: "ANY"` to force tool calling. Raw Gemini Direct (without stripping) fails on nearly every tool due to these unsupported fields.


| Category                          | OpenAI | Anthropic | Gemini |
| --------------------------------- | ------ | --------- | ------ |
| **baseline (clean)**              | OK     | OK        | OK     |
| **param_name_too_long**           | OK     | OK        | OK     |
| **excessive_nesting**             | OK     | OK        | OK     |
| **missing_param_description**     | OK     | OK        | OK     |
| **missing_type**                  | OK     | OK        | OK     |
| **invalid_param_chars**           | OK     | OK        | OK     |
| **param_description_too_long**    | OK     | OK        | OK     |
| **tool_name_too_long**            | OK     | OK        | OK     |
| **tool_description_too_long**     | OK     | OK        | OK     |
| **excessive_properties**          | OK     | OK        | FAILED |
| **excessive_enum_values**         | OK     | OK        | OK     |
| **param_name_leading_underscore** | OK     | OK        | OK     |
| **param_name_hyphen**             | OK     | OK        | OK     |
| **reserved_keyword**              | OK     | OK        | OK     |


---

---

## Scripts Used

- `test_tool_compat.py` -- Unified test script: Composio provider tests + direct raw HTTP API tests. Takes an action file path, derives tool enum automatically.
- `test_categories.sh` -- Batch runner for all categories

