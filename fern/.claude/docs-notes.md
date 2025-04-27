# Composio Documentation Notes

## API Deprecation Patterns

- Deprecation notices in changelogs follow a standard pattern:
  - Date of deprecation in [YYYY-MM-DD] format
  - Clear title indicating what's being deprecated
  - Specific endpoints being deprecated with links to their documentation
  - Full removal date (usually 2 months for major APIs, 1 week for minor ones)
  - Alternative API endpoints to use with links
  - Resources for migration assistance
  - Migration table mapping old endpoints to their new replacements (when applicable)

## V3 API Migration

- Composio is migrating from V1/V2 APIs to V3 APIs
- V3 introduces new terminology (App → Toolkit, Action → Tool, etc.)
- V1/V2 Projects and API Keys APIs are deprecated as of April 22nd, 2025
- V3 Organization API structure replaces the Projects and API Keys APIs
- Links to V3 endpoints should use the pattern `/api-reference/v-3/[section]/`
- For the Organization API specifically, use `/api-reference/v-3/organization/`

## API Reference Paths

- V1 endpoints are referenced as: `/api-reference/v-1/[section]/[endpoint]`
- V3 endpoints are referenced as: `/api-reference/v-3/[section]/[endpoint]`
- Specific V3 Organization API endpoints follow the pattern: `/api-reference/v-3/organization/[http-method]-api-v-3-org-[resource]`
  - Example: `/api-reference/v-3/organization/post-api-v-3-org-project-new`

## Update History

- April 22, 2025: Added deprecation notice for V1/V2 Projects and API Keys APIs with migration table