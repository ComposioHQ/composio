# Schema Violation Compatibility Report

**Date**: 2026-03-16
**Source**: `composio_schema_violations.csv` (6,722 violations across 1,162 tools)
**Test tools**: One tool per violation category with only that specific issue, plus a clean baseline tool.

## Violation Categories

| Category | Count | Description |
|---|---|---|
| param_name_too_long | 1,886 | Parameter names exceed 64 chars |
| excessive_nesting | 1,738 | Schema nesting depth >5 levels |
| missing_param_description | 1,443 | Parameters without descriptions |
| missing_type | 694 | Schema nodes without a `type` field |
| invalid_param_chars | 506 | Invalid chars in param names (`$`, `[`, `]`) |
| param_description_too_long | 187 | Descriptions >1024 chars |
| tool_name_too_long | 33 | Tool names >64 chars |
| tool_description_too_long | 12 | Tool descriptions >1024 chars |
| excessive_properties | 24 | Objects with >100 properties |
| excessive_enum_values | 3 | Enums with >500 values |

## Test Tools (one per category, with only that issue)

| Category | Test Tool |
|---|---|
| param_name_too_long | `DIALPAD_CONFIGURE_CALL_CENTER_SETTINGS` |
| excessive_nesting | `AGENCYZOOM_BATCH_CREATE_LEAD` |
| missing_param_description | `ASANA_ADD_SUPPORTING_RELATIONSHIP` |
| missing_type | `ABSTRACT_VALIDATE_EMAIL` |
| invalid_param_chars | `BENZINGA_GET_CONFERENCE_CALLS` |
| param_description_too_long | `AHREFS_EXPLORE_KEYWORDS_OVERVIEW` |
| tool_name_too_long | `BIG_DATA_CLOUD_BIG_DATA_CLOUD_REVERSE_GEOCODING_WITH_TIMEZONE_API` |
| tool_description_too_long | `COMPOSIO_CREATE_PLAN` |
| excessive_properties | `HUBSPOT_CREATE_CONTACT` |
| excessive_enum_values | `HUBSPOT_CREATE_A_NEW_MARKETING_EMAIL` |
| **(baseline -- no violations)** | `SLACK_SEND_MESSAGE` |

---

## Table 1: Direct Provider Compatibility (raw schema, no Composio wrappers)

| Category | OpenAI | Anthropic | Gemini | Agents SDK | LangChain | CrewAI |
|---|---|---|---|---|---|---|
| **baseline (clean)** | OK | OK | FAILED | OK | OK | OK |
| **param_name_too_long** | OK | FAILED | FAILED | OK | OK | OK |
| **excessive_nesting** | OK | FAILED | FAILED | OK | OK | OK |
| **missing_param_description** | FAILED | FAILED | FAILED | OK | FAILED | FAILED |
| **missing_type** | FAILED | FAILED | FAILED | OK | OK | FAILED |
| **invalid_param_chars** | OK | OK | FAILED | OK | OK | OK |
| **param_description_too_long** | OK | OK | FAILED | OK | OK | OK |
| **tool_name_too_long** | OK | FAILED | FAILED | OK | OK | OK |
| **tool_description_too_long** | OK | FAILED | FAILED | OK | OK | OK |
| **excessive_properties** | OK | OK | FAILED | OK | OK | OK |
| **excessive_enum_values** | OK | OK | FAILED | OK | OK | OK |

### Direct pass rates

| Provider | Pass | Fail | Rate |
|---|---|---|---|
| OpenAI | 9 | 2 | 82% |
| Anthropic | 4 | 7 | 36% |
| Google Gemini | 0 | 11 | 0% |
| OpenAI Agents SDK | 11 | 0 | 100% |
| LangChain | 9 | 2 | 82% |
| CrewAI | 8 | 3 | 73% |

---

## Table 2: Composio Provider Compatibility (via Composio wrappers)

| Category | OpenAI | Anthropic | Gemini | Agents SDK | LangChain | CrewAI |
|---|---|---|---|---|---|---|
| **baseline (clean)** | OK | FAILED | OK (AFC) | OK | OK | OK |
| **param_name_too_long** | OK | FAILED | OK (AFC) | OK | OK | OK |
| **excessive_nesting** | OK | FAILED | OK (AFC) | OK | OK | OK |
| **missing_param_description** | OK | FAILED | OK (AFC) | OK | FAILED | FAILED |
| **missing_type** | FAILED | FAILED | OK (AFC) | OK | FAILED | OK |
| **invalid_param_chars** | OK | OK | OK (AFC) | OK | OK | OK |
| **param_description_too_long** | OK | OK | OK (AFC) | OK | OK | OK |
| **tool_name_too_long** | OK | FAILED | OK (AFC) | OK | FAILED | OK |
| **tool_description_too_long** | OK | FAILED | OK (AFC) | OK | OK | OK |
| **excessive_properties** | OK | OK | OK (AFC) | OK | OK | OK |
| **excessive_enum_values** | OK | FAILED | OK (AFC) | OK | OK | OK |

### Composio pass rates

| Provider | Pass | Fail | Rate |
|---|---|---|---|
| OpenAI | 10 | 1 | 91% |
| Anthropic | 3 | 8 | 27% |
| Google Gemini | 11 | 0 | 100% |
| OpenAI Agents SDK | 11 | 0 | 100% |
| LangChain | 8 | 3 | 73% |
| CrewAI | 9 | 2 | 82% |

---

## Analysis

### Most resilient providers: OpenAI Agents SDK and Google Gemini Composio (100%)

- **OpenAI Agents SDK** accepts any schema in both direct and Composio modes. Uses `FunctionTool` with `strict_json_schema=False`, making it tolerant of all schema issues.
- **Google Gemini via Composio** passes all 11 tests. The Composio Gemini provider converts tools to Python callables (AFC), bypassing Gemini's strict `FunctionDeclaration` validation entirely.

### Google Gemini: 0% direct, 100% Composio

Gemini's `FunctionDeclaration` strictly validates schemas and rejects extra fields like `examples`, `title`, `human_parameter_name`, `human_parameter_description` that Composio includes in every tool schema. This means **Gemini direct fails on virtually all Composio tools** -- not just those with violations. The Composio Gemini provider fixes this by converting tools to Python callables (AFC), bypassing schema validation entirely.

### Anthropic: Worst performer via Composio (27%)

Anthropic fails on most categories in both modes. Some failures are API-level rejections (400 errors), others are the model choosing not to call the tool (returning text instead of a `tool_use` block). Composio's Anthropic provider strips `$` prefixes (fixing `invalid_param_chars`) but doesn't address other issues like long tool names, excessive nesting, or long descriptions.

### CrewAI: 73% direct, 82% Composio

CrewAI via Composio uses the proper Agent/Task/Crew framework and passes most tests. Failures are on `missing_param_description` and `missing_type` categories where the schema is too ambiguous for the LLM to make a tool call. Significantly improved from earlier testing where the wrong test harness (LangChain's `bind_tools`) was used.

### OpenAI: 82% direct, 91% Composio

Composio wrappers improve OpenAI's pass rate by handling schema sanitization. The remaining failure (`missing_type`) is because the LLM returns text instead of a tool call when the schema lacks type information.

### LangChain: 82% direct, 73% Composio

LangChain fails on `missing_param_description`, `missing_type`, and `tool_name_too_long` via Composio. The `tool_name_too_long` failure is because Composio passes the full tool name to LangChain which then sends it to the LLM -- names >64 chars cause issues with some models.

### CSV accuracy issues

- **`invalid_param_chars`** is flagged for `openai|bedrock|azure` in the CSV, but OpenAI actually handles `$` and `[]` chars fine in testing.
- **Anthropic** is not flagged in the CSV for `param_name_too_long`, `excessive_nesting`, `tool_name_too_long`, or `tool_description_too_long`, but it fails on all of these in testing.
- **Google Gemini** fails on **every** Composio tool schema when used directly (not just the ones with violations) due to extra fields like `examples` -- the CSV underreports Gemini failures.
- Some Anthropic "failures" are the model choosing not to call the tool rather than API rejections -- these may be non-deterministic.

---

## Scripts Used

- `test_tool_compat_by_name.py` -- Direct provider tests (raw schema from Composio API)
- `test_tool_compat_composio_by_name.py` -- Composio provider tests (via provider wrappers)
- `test_categories_direct.sh` -- Batch runner for direct tests
- `test_categories_composio.sh` -- Batch runner for Composio tests
- `run_tests.sh` -- Environment setup wrapper
