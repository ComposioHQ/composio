---
type: "reference"
title: "Zendesk"
description: "Public support knowledge for Zendesk."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "zendesk"
---
# Zendesk


## Zendesk OAuth setup does not require manually entering an access token

For Zendesk OAuth, the access token is injected automatically after the OAuth flow completes; customers do not need to manually enter it. Redirect URI can be optional depending on the auth-config setup, but if Zendesk requires one, configure the Composio auth redirect URL in the Zendesk OAuth app.

## Zendesk connections require the account subdomain

Zendesk requires the account subdomain during connection initiation. Pass the Zendesk site prefix, not the full URL, as `subdomain`. Composio uses that field to construct Zendesk URLs.

## Initiate Zendesk OAuth connections by passing `subdomain` in config values

When initiating a Zendesk OAuth connected account, pass `subdomain` in the connection config values. For the current SDK shape, use `config={"auth_scheme":"OAUTH2","val":{"subdomain":"<site-name>"}}`; older examples used `connected_account_params={"subdomain":"<site-name>"}`.

## Zendesk API-key/basic auth initiation passes `subdomain` and base64 encoded credentials

For Zendesk API-key/basic auth connection initiation, pass the Zendesk `subdomain` and `basic_encoded` credential value in the connection data. The `basic_encoded` value should be the base64 encoding of the Zendesk email/token credential form requested by the auth config.

## Include `toolkit_versions` when listing Zendesk tools through the API

When listing Zendesk tools through the API, include the toolkit version query parameter. For example, use `toolkit_versions=latest&toolkit_slug=zendesk&limit=1000`. Without the toolkit version query, the API response may not show the expected tool set.

## `ZENDESK_SEARCH_ZENDESK` was added for Zendesk search use cases

Use `ZENDESK_SEARCH_ZENDESK` for Zendesk search use cases.

## `ZENDESK_UPDATE_ZENDESK_TICKET` is available for updating Zendesk tickets

Use `ZENDESK_UPDATE_ZENDESK_TICKET` for Zendesk ticket updates. For endpoint-level context, the corresponding Zendesk API is the Update Ticket endpoint in Zendesk's ticketing API.

## Zendesk get-ticket-by-id returns ticket details in one tool call

The Zendesk get-ticket-by-id action is available and returns the ticket details in a single tool call. Use it when the customer has a Zendesk ticket ID and needs the ticket's metadata/details rather than searching first.

## Zendesk supports triggers in Composio

Zendesk has trigger support in Composio. Verify the current trigger catalog before naming an exact count.
