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
| param_name_leading_underscore | N/A | Leading `_` in param names breaks Pydantic `create_model` (not in CSV) |

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
| param_name_leading_underscore | `_21RISK_GET_COMPLIANCE` (has `_maxPageSizeInMb`) |
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
| **param_name_leading_underscore** | OK | OK | FAILED | OK | OK | OK |

---

## Table 2: Composio Provider Compatibility (via Composio wrappers)

| Category | OpenAI | Anthropic | Gemini | Agents SDK | LangChain | CrewAI |
|---|---|---|---|---|---|---|
| **baseline (clean)** | OK | FAILED | OK | OK | OK | OK |
| **param_name_too_long** | OK | FAILED | OK | OK | OK | OK |
| **excessive_nesting** | OK | FAILED | OK | OK | OK | OK |
| **missing_param_description** | OK | FAILED | OK | OK | FAILED | FAILED |
| **missing_type** | FAILED | FAILED | OK | OK | FAILED | OK |
| **invalid_param_chars** | OK | OK | OK | OK | OK | OK |
| **param_description_too_long** | OK | OK | OK | OK | OK | OK |
| **tool_name_too_long** | OK | FAILED | OK | OK | FAILED | OK |
| **tool_description_too_long** | OK | FAILED | OK | OK | OK | OK |
| **excessive_properties** | OK | OK | OK | OK | OK | OK |
| **excessive_enum_values** | OK | FAILED | OK | OK | OK | OK |
| **param_name_leading_underscore** | OK | OK | OK | OK | FAILED | FAILED |

---

## Scripts Used

- `test_tool_compat_by_name.py` -- Direct provider tests (raw schema from Composio API)
- `test_tool_compat_composio_by_name.py` -- Composio provider tests (via provider wrappers)
- `test_categories_direct.sh` -- Batch runner for direct tests
- `test_categories_composio.sh` -- Batch runner for Composio tests
- `run_tests.sh` -- Environment setup wrapper
