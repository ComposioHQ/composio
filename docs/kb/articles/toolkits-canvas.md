Use this guide to configure Canvas authentication and permissions, set up triggers, run Canvas actions, and troubleshoot course or toolkit-version issues.

## Configure Canvas authentication and permissions

**Check action-level scopes when Canvas returns 401 or unauthorized.** Compare the auth configs and verify that the failing Canvas connection has the scope required by the action. `CANVAS_GET_USER_PROFILE` requires `url:GET|/api/v1/users/:user_id/profile`. If scopes are missing, update the auth config settings; newly created connected accounts will get the updated scopes from that point onward.

**Match OAuth credentials to the configured Canvas base URL.** For Canvas OAuth, the client ID and client secret must belong to the same Canvas base URL configured on the connection/auth config. A mismatch between the Canvas domain, base URL, and OAuth credentials can cause auth failures even if the credentials are otherwise valid.

**Use an administrator for account-level endpoints.** Canvas account-level endpoints require account administrator permissions in Canvas. Use `CANVAS_LIST_MANAGEABLE_ACCOUNTS` to list accounts the connected user can manage, and `CANVAS_GET_SINGLE_ACCOUNT` when the account ID is already known. If you get an authorization error, confirm that the connected Canvas user has account-level admin permissions before treating it as a Composio-side failure.

## Set up Canvas triggers

**Select courses by their Canvas IDs.** Canvas triggers are available. For a course-based setup flow, first call `CANVAS_LIST_COURSES` or the relevant get-courses action, show the course IDs with their course names to the user, and then redirect the user to the trigger configuration page with the selected course context.

**Target users visible to the connected bearer-token user.** Canvas trigger behavior is tied to the user represented by the bearer token on the connected account. A trigger should work for users visible through `CANVAS_GET_ALL_USERS` for the relevant account. The user field cannot be removed entirely because Composio cannot infer every logged-in Canvas user from the provider token without a configured target.

**Use a Teacher account for Assignment Graded.** For Canvas Assignment Graded, the trigger can work for Teacher accounts but not Student accounts because of Canvas permission behavior. If the same connected account also has token-expiry symptoms, execute a Canvas action on that connected account to separate permission behavior from connection/auth issues.

**Distinguish Canvas and Composio user IDs in payloads.** Canvas trigger payloads now separate the Canvas-side user identifier from Composio's user identifier. Use `canvas_user_id` for the Canvas LMS user and `user_id` for the Composio/project user. This avoids ambiguity when both identifiers are present in the same payload.

## Execute Canvas actions and handle provider behavior

**Follow Canvas field descriptions for calendar events.** For `CANVAS_CREATE_CALENDAR_EVENT`, a Canvas user ID can be used where accepted by the Canvas API. Composio keeps Canvas API field names to stay consistent with the provider API, so rely on each field description for accepted values when the field name is ambiguous.

**Paginate list and fetch endpoints with `per_page`.** Canvas list endpoints follow Canvas API pagination behavior. Where supported, pass `per_page` to control how many records are returned in a response. If a Canvas action appears capped or returns a smaller page, check whether the relevant tool version supports `per_page` and upgrade if needed.

**Use `only_announcements` to request discussion topics and announcements separately.** For Canvas discussion topics, use `only_announcements: false` or omit it when calling the discussion-topic flow. For announcements, use `only_announcements: true`. Canvas cannot return both discussion topics and announcements in one combined call for this case, so make two separate API calls and merge the results client-side if both are needed.

**Use unprefixed keys for quiz matching answers.** For Canvas quiz matching question answers, use `comments_html`, `text`, `weight`, `match_left`, and `match_right`. Do not use `answer_comments_html`, `answer_text`, `answer_weight`, `answer_match_left`, or `answer_match_right` for this payload.

## Troubleshoot Canvas courses and toolkit versions

**Verify the course before diagnosing analytics 404s.** For Canvas course-level participation or analytics actions, first verify the course ID by listing courses or fetching the course by ID with `CANVAS_LIST_COURSES` or `CANVAS_GET_SINGLE_COURSE`. If the course ID is valid but the analytics endpoint still 404s, the Canvas analytics activity endpoint may simply not be available on that Canvas instance.

**Upgrade instead of patching older toolkit versions.** Composio cannot patch older toolkit versions in place. If a Canvas behavior or schema fix is released in a newer version, the path is to upgrade the toolkit version. Customers can compare differences between toolkit versions in the dashboard before upgrading.
