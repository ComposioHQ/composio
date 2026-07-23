---
type: reference
title: "Canvas"
description: "Customer-safe support knowledge for Canvas."
category: toolkits/canvas
visibility: public
timestamp: 2026-06-24T00:00:00Z
tags:
  - canvas
---
# Canvas


## Canvas triggers are available, and course selection can be driven from course IDs

Canvas triggers are available. For a course-based setup flow, first call `CANVAS_LIST_COURSES` or the relevant get-courses action, show the course IDs with their course names to the user, and then redirect the user to the trigger configuration page with the selected course context.

## Canvas does not expose webhooks for every requested trigger use case

Canvas only exposes a limited set of webhook-style events, including `quiz_submitted`, `grade_change`, `attachment_created`, `submission_created`, `submission_updated`, and `plagiarism_resubmit`. These can work with courses, assignments, and accounts. For trigger use cases outside those provider-supported events, Composio needs to build a custom trigger implementation instead of wiring a native Canvas webhook.

## Canvas triggers fire for users visible to the connected bearer-token user

Canvas trigger behavior is tied to the user represented by the bearer token on the connected account. A trigger should work for users that are visible through `CANVAS_LIST_USERS_IN_ACCOUNT` for that connection. The user field cannot be removed entirely because Composio cannot infer every logged-in Canvas user from the provider token without a configured target.

## Canvas Assignment Graded trigger is expected to work for Teacher accounts, not Student accounts

For Canvas Assignment Graded, the trigger can work for Teacher accounts but not Student accounts because of Canvas permission behavior. If the same connected account also has token-expiry symptoms, execute a Canvas action on that connected account to separate permission behavior from connection/auth issues.

## Use shorter polling intervals for Canvas triggers when longer intervals misbehave

There was a Canvas-specific trigger interval issue where longer intervals could fail or behave inconsistently. Until the underlying trigger fix is confirmed for the customer's setup, recommend shorter polling intervals, usually around 1-5 minutes, for Canvas triggers.

## Toolkit versioning does not version Canvas trigger logic

Toolkit versioning applies to tools, not trigger logic. Canvas trigger fixes or behavior changes are not selected by pinning a toolkit version in the same way tool schemas and tool implementations can be.

## Canvas trigger payloads expose Canvas user ID separately as `canvas_user_id`

Canvas trigger payloads now separate the Canvas-side user identifier from Composio's user identifier. Use `canvas_user_id` for the Canvas LMS user and `user_id` for the Composio/project user. This avoids ambiguity when both identifiers are present in the same payload.

## Canvas action 401/unauthorized errors can be caused by missing action-level scopes

Compare the auth configs and verify that the failing Canvas connection has the scope required by the action. `CANVAS_GET_USER_PROFILE` requires `url:GET|/api/v1/users/:user_id/profile`. If scopes are missing, update the auth config settings; newly created connected accounts will get the updated scopes from that point onward.

## Canvas OAuth credentials must match the configured Canvas base URL

For Canvas OAuth, the client ID and client secret must belong to the same Canvas base URL configured on the connection/auth config. A mismatch between the Canvas domain, base URL, and OAuth credentials can cause auth failures even if the credentials are otherwise valid.

## `CANVAS_GET_ACCOUNTS` and other account-level Canvas endpoints require admin permissions

Canvas account-level endpoints require account administrator permissions in Canvas. For example, `/api/v1/accounts` through `CANVAS_GET_ACCOUNTS` requires account-level admin access. If a customer gets unauthorized on these endpoints, confirm the connected Canvas account has admin permissions before treating it as a Composio-side failure.

## `CANVAS_CREATE_CALENDAR_EVENT` can use a user ID, and Canvas API field names are preserved

For `CANVAS_CREATE_CALENDAR_EVENT`, a Canvas user ID can be used where accepted by the Canvas API. Composio keeps Canvas API field names to stay consistent with the provider API, so rely on each field description for accepted values when the field name is ambiguous.

## Canvas list/fetch endpoints follow Canvas pagination behavior and may need `per_page`

Canvas list endpoints follow Canvas API pagination behavior. Where supported, pass `per_page` to control how many records are returned in a response. If a Canvas action appears capped or returns a smaller page, check whether the relevant tool version supports `per_page` and upgrade if needed.

## Canvas discussion topics and announcements require `only_announcements` selection

For Canvas discussion topics, use `only_announcements: false` or omit it when calling the discussion-topic flow. For announcements, use `only_announcements: true`. Canvas cannot return both discussion topics and announcements in one combined call for this case, so make two separate API calls and merge the results client-side if both are needed.

## Canvas 404s on course analytics usually mean the course or endpoint is unavailable

For Canvas course-level participation or analytics actions, first verify the course ID by listing courses or fetching the course by ID with `CANVAS_LIST_COURSES` or `CANVAS_GET_SINGLE_COURSE`. If the course ID is valid but the analytics endpoint still 404s, the Canvas analytics activity endpoint may simply not be available on that Canvas instance.

## Canvas quiz matching question answers use unprefixed answer field keys

For Canvas quiz matching question answers, use `comments_html`, `text`, `weight`, `match_left`, and `match_right`. Do not use `answer_comments_html`, `answer_text`, `answer_weight`, `answer_match_left`, or `answer_match_right` for this payload.

## Older Canvas toolkit versions cannot be patched in place

Composio cannot patch older toolkit versions in place. If a Canvas bug fix or schema change is released in a newer version, the path is to upgrade the toolkit version. Customers can compare differences between toolkit versions in the dashboard before upgrading.

## Canvas response schemas are being standardized gradually, not universally across every fetch tool

Canvas response schema improvements are not universal across all fetch/list tools yet. Some recently updated or newly released tools have response schemas, but older Canvas tools may still differ. Treat these response shapes as tool/version-specific and pin or upgrade versions carefully when response shape stability matters.
