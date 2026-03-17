# Schema Violation Compatibility Report

**Date**: 2026-03-16
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


## Test Tools (one per category, with only that issue)


| Category                        | Test Tool                                                           |
| ------------------------------- | ------------------------------------------------------------------- |
| param_name_too_long             | `DIALPAD_CONFIGURE_CALL_CENTER_SETTINGS`                            |
| excessive_nesting               | `DATABRICKS_SETTINGS_AUTOMATIC_CLUSTER_UPDATE_UPDATE`               |
| missing_param_description       | `ASANA_ADD_SUPPORTING_RELATIONSHIP`                                 |
| missing_type                    | `ABSTRACT_VALIDATE_EMAIL`                                           |
| invalid_param_chars             | `BENZINGA_GET_CONFERENCE_CALLS`                                     |
| param_description_too_long      | `AHREFS_EXPLORE_KEYWORDS_OVERVIEW`                                  |
| tool_name_too_long              | `BIG_DATA_CLOUD_BIG_DATA_CLOUD_REVERSE_GEOCODING_WITH_TIMEZONE_API` |
| tool_description_too_long       | `COMPOSIO_CREATE_PLAN`                                              |
| excessive_properties            | `HUBSPOT_CREATE_CONTACT`                                            |
| excessive_enum_values           | `HUBSPOT_CREATE_A_NEW_MARKETING_EMAIL`                              |
| param_name_leading_underscore   | `_21RISK_GET_COMPLIANCE` (has `_maxPageSizeInMb`)                   |
| **(baseline -- no violations)** | `SLACK_SEND_MESSAGE`                                                |


---

## Category Details and Test Tool Justification

Each test tool was verified to have **only** its designated violation in the CSV (exclusive match). This ensures failures in the compatibility table are attributable to that specific issue.

- **`param_name_too_long`** -- Parameter names exceed 64 characters. Most providers and LLM APIs enforce a 64-char limit on function parameter names.
  - *Test tool*: `DIALPAD_CONFIGURE_CALL_CENTER_SETTINGS` -- has 3 params like `advanced__settings__auto__call__recording__allow__pause__recording` (66-68 chars). Only violation in CSV: `param_name_too_long`.

- **`excessive_nesting`** -- JSON schema has object nesting deeper than 5 levels. Deeply nested schemas can cause issues with providers that flatten or recursively validate tool parameters.
  - *Test tool*: `DATABRICKS_SETTINGS_AUTOMATIC_CLUSTER_UPDATE_UPDATE` -- path `setting.automatic_cluster_update_workspace.maintenance_window.week_day_based_schedule.window_start_time.hours` reaches nesting depth 6 via purely nested properties (no arrays). Only violation in CSV: `excessive_nesting`.

- **`missing_param_description`** -- One or more parameters have no `description` field. Without descriptions, the LLM has less context to understand what values to provide, sometimes skipping the tool call entirely.
  - *Test tool*: `ASANA_ADD_SUPPORTING_RELATIONSHIP` -- the `data` parameter has no description. Only violation in CSV: `missing_param_description`.

- **`missing_type`** -- One or more schema nodes lack a `type` field. Providers that strictly validate JSON Schema may reject the tool, and LLMs may not know what format to use for the parameter.
  - *Test tool*: `ABSTRACT_VALIDATE_EMAIL` -- the `email` parameter has no `type` field. Only violation in CSV: `missing_type`.

- **`invalid_param_chars`** -- Parameter names contain characters outside `[a-zA-Z0-9_]`, such as `$`, `[`, `]`. Some providers reject these at the API level. Note: Composio strips `$` prefixes server-side, so this primarily affects `[]` bracket characters via Composio.
  - *Test tool*: `BENZINGA_GET_CONFERENCE_CALLS` -- has params like `parameters[date]`, `parameters[tickers]` with bracket characters. Only violation in CSV: `invalid_param_chars`.

- **`param_description_too_long`** -- A parameter description exceeds 1024 characters. Some providers truncate or reject overly long descriptions.
  - *Test tool*: `AHREFS_EXPLORE_KEYWORDS_OVERVIEW` -- the `where` parameter description is 3,352 chars. Only violation in CSV: `param_description_too_long`.

- **`tool_name_too_long`** -- The tool name exceeds 64 characters. Most LLM APIs enforce a max function name length of 64.
  - *Test tool*: `BIG_DATA_CLOUD_BIG_DATA_CLOUD_REVERSE_GEOCODING_WITH_TIMEZONE_API` -- 65 chars. Only violation in CSV: `tool_name_too_long`.

- **`tool_description_too_long`** -- The tool description exceeds 1024 characters. Some providers reject or truncate overly long tool descriptions.
  - *Test tool*: `COMPOSIO_CREATE_PLAN` -- description is 1,258 chars. Only violation in CSV: `tool_description_too_long`.

- **`excessive_properties`** -- A single object in the schema has more than 100 properties. This can overwhelm LLMs and cause issues with providers that have property count limits.
  - *Test tool*: `HUBSPOT_CREATE_CONTACT` -- root object has 110 properties. Only violation in CSV: `excessive_properties`.

- **`excessive_enum_values`** -- An enum field has more than 500 allowed values. Large enums bloat the schema and may exceed token limits.
  - *Test tool*: `HUBSPOT_CREATE_A_NEW_MARKETING_EMAIL` -- the `language` field has 754 enum values. Only violation in CSV: `excessive_enum_values`.

- **`param_name_leading_underscore`** -- Parameter names starting with `_` break Pydantic's `create_model()`, which is used by LangChain and CrewAI Composio providers. This category is **not in the CSV** -- it was discovered during testing.
  - *Test tool*: `_21RISK_GET_COMPLIANCE` -- has `_maxPageSizeInMb` parameter. The tool also has `$`-prefixed violations in the raw CSV (`invalid_param_chars`, `param_name_bad_start`), but Composio strips `$` prefixes server-side, so only the underscore issue survives in the Composio API.


---

## Composio Provider Compatibility


| Category                          | OpenAI | Anthropic | Gemini | Agents SDK | LangChain | CrewAI |
| --------------------------------- | ------ | --------- | ------ | ---------- | --------- | ------ |
| **baseline (clean)**              | OK     | OK        | OK     | OK         | OK        | OK     |
| **param_name_too_long**           | OK     | OK        | OK     | OK         | OK        | OK     |
| **excessive_nesting**             | OK     | OK        | OK     | OK         | OK        | OK     |
| **missing_param_description**     | FAILED | OK        | OK     | OK         | FAILED    | OK     |
| **missing_type**                  | FAILED | OK        | OK     | OK         | OK        | OK     |
| **invalid_param_chars**           | OK     | OK        | OK     | OK         | OK        | OK     |
| **param_description_too_long**    | OK     | OK        | OK     | OK         | OK        | OK     |
| **tool_name_too_long**            | OK     | OK        | OK     | OK         | FAILED    | OK     |
| **tool_description_too_long**     | OK     | OK        | OK     | OK         | OK        | OK     |
| **excessive_properties**          | OK     | OK        | OK     | OK         | OK        | OK     |
| **excessive_enum_values**         | OK     | OK        | OK     | OK         | OK        | OK     |
| **param_name_leading_underscore** | OK     | OK        | OK     | OK         | FAILED    | FAILED |


---

## Scripts Used

- `test_tool_compat_composio_by_name.py` -- Composio provider tests (via provider wrappers)
- `test_categories_composio.sh` -- Batch runner for all categories
- `run_tests.sh` -- Environment setup wrapper

