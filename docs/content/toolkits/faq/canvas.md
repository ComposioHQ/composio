## What should I know about Canvas triggers?

Canvas triggers are available. For a course-based setup flow, first call `CANVAS_LIST_COURSES` or the relevant get-courses action, show the course IDs with their course names to the user, and then redirect the user to the trigger configuration page with the selected course context.

## Canvas does not expose webhooks for every requested trigger use case

Canvas only exposes a limited set of webhook-style events, including `quiz_submitted`, `grade_change`, `attachment_created`, `submission_created`, `submission_updated`, and `plagiarism_resubmit`. These can work with courses, assignments, and accounts. For trigger use cases outside those provider-supported events, submit the exact event and workflow through the tool request flow.

## Canvas triggers fire for users visible to the connected bearer-token user

Canvas trigger behavior is tied to the user represented by the bearer token on the connected account. A trigger should work for users that are visible through `CANVAS_LIST_USERS_IN_ACCOUNT` for that connection. The user field cannot be removed entirely because Composio cannot infer every logged-in Canvas user from the provider token without a configured target.

## Why does the Canvas Assignment Graded trigger work for teachers but not students?

For Canvas Assignment Graded, that the trigger working for Teacher accounts and not Student accounts is expected based on Canvas permission behavior. If the same connected account also has token-expiry symptoms, verify by executing a Canvas action on that connected account to separate permission behavior from connection/auth issues.

## Toolkit versioning does not version Canvas trigger logic

Toolkit versioning applies to tools, not trigger logic. Canvas trigger fixes or behavior changes are not selected by pinning a toolkit version in the same way tool schemas and tool implementations can be.

## Why can Canvas actions return 401 or unauthorized errors?

Compare the auth configs and verify that the failing Canvas connection has the scope required by the action. For `CANVAS_GET_USER_PROFILE`, the required scope is `url:GET|/api/v1/users/:user_id/profile`. If scopes are missing, update the auth config settings; newly created connected accounts will get the updated scopes from that point onward.

## What must Canvas OAuth credentials do?

For Canvas OAuth, the client ID and client secret must belong to the same Canvas base URL configured on the connection/auth config. A mismatch between the Canvas domain, base URL, and OAuth credentials can cause auth failures even if the credentials are otherwise valid.

## `CANVAS_GET_ACCOUNTS` and other account-level Canvas endpoints require admin permissions

Canvas account-level endpoints require account administrator permissions in Canvas. For example, `/api/v1/accounts` through `CANVAS_GET_ACCOUNTS` requires account-level admin access. If a user gets unauthorized on these endpoints, confirm the connected Canvas account has admin permissions before treating it as a connection or tool failure.

## Why do Canvas course-analytics calls return 404?

For Canvas course-level participation or analytics actions, first verify the course ID by listing courses or fetching the course by ID with `CANVAS_LIST_COURSES` or `CANVAS_GET_SINGLE_COURSE`. If the course ID is valid but the analytics endpoint still 404s, the Canvas analytics activity endpoint may simply not be available on that Canvas instance.
