#!/bin/zsh
source ~/.zshrc
source /Users/shrey/composio/python/.venv/bin/activate
unset GOOGLE_GENAI_USE_VERTEXAI
unset GOOGLE_CLOUD_PROJECT
unset GOOGLE_CLOUD_LOCATION

TOOLS=(
  "param_name_too_long|DIALPAD_CONFIGURE_CALL_CENTER_SETTINGS"
  "excessive_nesting|AGENCYZOOM_BATCH_CREATE_LEAD"
  "missing_param_description|ASANA_ADD_SUPPORTING_RELATIONSHIP"
  "missing_type|ABSTRACT_VALIDATE_EMAIL"
  "invalid_param_chars|BENZINGA_GET_CONFERENCE_CALLS"
  "param_description_too_long|AHREFS_EXPLORE_KEYWORDS_OVERVIEW"
  "tool_name_too_long|BIG_DATA_CLOUD_BIG_DATA_CLOUD_REVERSE_GEOCODING_WITH_TIMEZONE_API"
  "tool_description_too_long|COMPOSIO_CREATE_PLAN"
  "excessive_properties|HUBSPOT_CREATE_CONTACT"
  "excessive_enum_values|HUBSPOT_CREATE_A_NEW_MARKETING_EMAIL"
)

for entry in "${TOOLS[@]}"; do
  category="${entry%%|*}"
  tool="${entry##*|}"
  echo ""
  echo ">>> Category: $category"
  echo "============================================================"
  python /Users/shrey/composio/python/test_tool_compat_by_name.py "$tool" 2>&1
  echo ""
done
