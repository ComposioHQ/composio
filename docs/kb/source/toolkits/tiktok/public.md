---
type: "reference"
title: "TikTok"
description: "Public support knowledge for TikTok."
category: "auth-config"
visibility: "public"
timestamp: "2026-07-16T00:00:00Z"
tags:
  - "tiktok"
---
# TikTok


## TikTok is supported, but customers generally need their own TikTok developer app

TikTok is available as a toolkit and currently uses customer-owned TikTok
developer app credentials.

## TikTok URL-prefix verification must be done on a customer-owned redirect domain, not Composio's shared callback domain

Do not host per-customer TikTok verification files on Composio's shared callback domain. TikTok URL-prefix verification is meant to prove ownership of the redirect domain. The customer should use a redirect URI on a domain they control, host TikTok's verification file there, register that static parameter-free URI in TikTok, and then forward/proxy the callback to Composio if needed.

## TikTok OAuth uses `client_key`; credential mismatch or old `client_id` handling causes `client_key` errors

A TikTok `client_key` error is returned by TikTok, not Composio. First re-copy the Client Key and Client Secret from the TikTok developer app, checking for swapped values or trailing spaces. Also confirm the registered redirect URI exactly matches TikTok requirements. Historically, TikTok required `client_key` in the authorize URL while older Composio handling used `client_id`; if an older flow is involved, unshorten the redirect URL and verify the parameter shape.

## TikTok app status, scopes, and sandbox/production mode determine who can complete OAuth

For TikTok OAuth failures, ask for the app type/status, sandbox vs production mode, enabled APIs/scopes, redirect URI, and screenshots of the OAuth screen. If the TikTok app is sandbox or under review, only authorized testers/users may be able to complete OAuth.

## Old TikTok-specific MCP URL patterns are deprecated; use Connect MCP

Do not use old toolkit-specific MCP URL patterns for TikTok. Use Connect MCP at `connect.composio.dev/mcp` or create the appropriate MCP/server through the current dashboard/API flow.

## Public TikTok posting requires the customer's own app to pass TikTok's content posting audit

For TikTok public content posting, the customer must go through TikTok's content posting audit with their own OAuth app. Without an audited/approved app, posting may be restricted, for example to private-only visibility or limited testing behavior.

## TikTok Ads/Marketing may require a separate approved app and test credentials

TikTok Ads/Marketing may require a separate approved TikTok app and active account credentials. Confirm whether the customer needs authentication only or specific tools, and set expectations that TikTok app approval can take time.

## TikTok custom auth must request only approved scopes

The TikTok toolkit's default set can include `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`, `video.upload`, and `video.publish`. A customer-owned app approved for only a subset can fail OAuth when the auth config falls back to the full default.

Set an explicit scope list on the custom auth config containing only permissions TikTok approved for that app, then reconnect. Existing tokens retain their original grants. Tools for profile details, statistics, or video lists remain unavailable unless the corresponding scopes are approved and requested.
