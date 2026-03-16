#!/bin/zsh
source ~/.zshrc
source /Users/shrey/composio/python/.venv/bin/activate
unset GOOGLE_GENAI_USE_VERTEXAI
unset GOOGLE_CLOUD_PROJECT
unset GOOGLE_CLOUD_LOCATION

TOOLS=(
  "apps/better_stack/actions/list_grafana_integrations.py"
  "apps/bidsketch/actions/post_proposal_section.py"
  "apps/box/actions/generated/get_file_version_legal_hold.py"
  "apps/bunnycdn/actions/check_pull_zone_availability.py"
  "apps/callingly/actions/list_clients.py"
  "apps/college_football_data/actions/get_win_probability.py"
  "apps/coupa/actions/accounts_update.py"
  "apps/fireberry/actions/fireberry_update_a_ticket.py"
  "apps/freshdesk/actions/reply_to_ticket.py"
  "apps/gleap/actions/delete_engagement_modal.py"
  "apps/jira/actions/bulk_fetch_issues.py"
  "apps/jira/actions/get_all_projects_custom.py"
  "apps/mailchimp/actions/generated/list_api_root_resources.py"
  "apps/neon/actions/generated/disable_branches_auth.py"
  "apps/new_relic/actions/fetch_your_org_id.py"
  "apps/omnisend/actions/get_cart.py"
  "apps/recallai/actions/destroy_google_login_group.py"
  "apps/snapchat/actions/create_catalog_role.py"
  "apps/snapchat/actions/get_media.py"
  "apps/statuscake/actions/list_uptime_test_periods.py"
)

for tool in "${TOOLS[@]}"; do
  echo "================================================================"
  python /Users/shrey/composio/python/test_tool_compat.py "$tool" 2>&1
  echo
done
