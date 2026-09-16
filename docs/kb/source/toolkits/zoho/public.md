---
type: "reference"
title: "Zoho"
description: "Public support knowledge for Zoho."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "zoho"
---
# Zoho


## `ZOHO_MAIL_MESSAGES_SEND_EMAIL` supports attachments in newer versions

Attachment support was added to `ZOHO_MAIL_MESSAGES_SEND_EMAIL`. If a customer cannot send attachments with Zoho Mail, have them use a current toolkit version and verify the send-email tool schema includes attachment fields.

## Zoho connections require the correct region/domain extension

Zoho requires the correct region/domain extension during connection initiation. Accepted values include `com`, `eu`, `in`, `cn`, and `au`. Pass the customer's Zoho account region, not a full URL, so Composio can build the correct `accounts.zoho.<region>` URL.

## Zoho Mail uses `suffix.one` as the connection initiation domain-extension field

For Zoho Mail, the expected connection initiation field can appear as `suffix.one`, displayed as Domain Extension. Pass values such as `com`, `eu`, or `in` in `config.val["suffix.one"]` when initiating the connection.

## Zoho auth config and connection required fields can be fetched from toolkit schema APIs/SDK

Use `toolkits.get("<toolkit-slug>")` or the toolkit-by-slug API to inspect the full Zoho toolkit schema, including auth config creation fields and connected account initiation fields. This is the reliable way to discover region/domain fields and other required inputs.

## Zoho Books create-estimate moved to the `zoho_invoice` toolkit

For creating estimates, use the `zoho_invoice` toolkit action `ZOHO_INVOICE_CREATE_ESTIMATE`; the estimate action is not exposed through the Zoho Books toolkit.

## `ZOHO_BOOKS_LIST_ITEMS` has no default `rate`; optional fields can be omitted

`rate` on `ZOHO_BOOKS_LIST_ITEMS` is optional and has no default value in the schema. If an agent sends `rate: 25.5` or another value, that is coming from the model/tool-call generation, not from a Composio schema default. Prompt the model not to pass optional fields unless needed, or call the tool directly with only required arguments.

## Use `ZOHO_GET_ZOHO_RECORDS` to find a `lead_id` before converting a Zoho lead

For Zoho lead conversion, verify the `lead_id` first. Use `ZOHO_GET_ZOHO_RECORDS` to retrieve the lead record and obtain the correct `lead_id`, then pass that value into the conversion tool.

## Zoho record listing can require page tokens and is subject to Zoho rate limits

Zoho list endpoints may return around 200 records per request and require pagination with `page_token` for larger result sets. Multiple tool calls may be needed, and Zoho's own API rate limits can still apply.

## Zoho MCP setup uses OAuth2 and should initiate a new connection from the client/dashboard

Zoho uses OAuth2. For MCP setups, create an MCP config for Zoho, then initiate/connect the Zoho account through the MCP client or dashboard. If the client does not automatically start the OAuth flow, prompting it to initiate a new Zoho connection can help.

## Zoho Mail account IDs should be treated as strings to avoid JS safe-integer precision loss

Zoho Mail account IDs can exceed JavaScript's safe integer range, so they should be modeled and passed as strings. If a Zoho Mail tool truncates or changes a large account ID, treat it as a schema/serialization issue and escalate it so `account_id` stays a string.
