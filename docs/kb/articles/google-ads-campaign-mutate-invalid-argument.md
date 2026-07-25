`GOOGLEADS_MUTATE_CAMPAIGNS` can fail with a Google Ads `400 INVALID_ARGUMENT` such as `Unknown name "dailyBudget" at operations[0].update` or `Unknown name "targetedLocations" ... Cannot find field`. This is a request-shape problem, not an OAuth failure — the payload includes fields that are not valid inline Campaign resource fields.

Check the tool execution log for the rejected field names. Commonly sent in error: `daily_budget`, `targeted_locations`, `exclusion_locations`, and related date, budget, and location fields.

## Send those fields to the right resource

- **Budgets** belong to a CampaignBudget. Create one with `GOOGLEADS_MUTATE_CAMPAIGN_BUDGETS`, then pass the resulting resource name through the campaign's `campaign_budget` field.
- **Location targeting** belongs to campaign criteria. Use `GOOGLEADS_MUTATE_CAMPAIGN_CRITERIA` rather than inline campaign fields.

Because the connection is not at fault here, reconnecting or re-authorizing will not change the result.
