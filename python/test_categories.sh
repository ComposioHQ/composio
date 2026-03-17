#!/bin/zsh
source ~/.zshrc
source /Users/shrey/composio/python/.venv/bin/activate
unset GOOGLE_GENAI_USE_VERTEXAI
unset GOOGLE_CLOUD_PROJECT
unset GOOGLE_CLOUD_LOCATION

TOOLS=(
  "baseline|apps/slack/actions/send_message.py"
  "param_name_too_long|apps/dialpad/actions/generated/configure_call_center_settings.py"
  "excessive_nesting|apps/databricks/actions/databricks_settings_automatic_cluster_update_update.py"
  "missing_param_description|apps/asana/actions/add_supporting_relationship.py"
  "missing_type|apps/posthog/actions/generated/create_a_notebook_in_a_project.py"
  "invalid_param_chars|apps/benzinga/actions/get_conference_calls_v2_1.py"
  "param_description_too_long|apps/ahrefs/actions/generated/explore_keywords_overview.py"
  "tool_name_too_long|apps/big_data_cloud/actions/big_data_cloud_reverse_geocoding_with_timezone_api.py"
  "tool_description_too_long|apps/composio/actions/create_plan.py"
  "excessive_properties|apps/hubspot/actions/create_contact_object_with_properties.py"
  "excessive_enum_values|apps/hubspot/actions/generated/create_a_new_marketing_email.py"
  "param_name_leading_underscore|apps/_21risk/actions/get_compliance.py"
)

for entry in "${TOOLS[@]}"; do
  category="${entry%%|*}"
  file="${entry##*|}"
  echo ""
  echo ">>> Category: $category"
  echo "============================================================"
  python /Users/shrey/composio/python/test_tool_compat.py "$file" 2>&1
  echo ""
done
