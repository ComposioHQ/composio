## Linear triggers require a valid `team_id`

`team_id` is required for Linear triggers. An invalid-input error during trigger or webhook creation usually means the supplied team ID is missing or invalid.

Use `LINEAR_LIST_LINEAR_TEAMS` to retrieve valid team IDs, then pass the selected team ID into the trigger configuration.
