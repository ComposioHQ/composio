---
type: "reference"
title: "Pipedrive"
description: "Public support knowledge for Pipedrive."
category: "auth-config"
visibility: "public"
timestamp: "2026-06-24T00:00:00Z"
tags:
  - "pipedrive"
---
# Pipedrive

## Pipedrive supports managed OAuth, custom OAuth, and API-key authentication

Use Composio-managed OAuth for the standard connection flow. Use a customer-
owned Pipedrive OAuth app or API key when the customer needs control over app
settings, scopes, branding, or provider policy.


## Pipedrive OAuth initiation requires the workspace subdomain

When initiating a Pipedrive OAuth connection, pass the Pipedrive workspace subdomain/domain expected by the auth config. For example, if the workspace is `your-workspace.pipedrive.com`, pass `your-workspace` rather than the full hostname.

## Do not install the Pipedrive app directly from Pipedrive OAuth settings

For Pipedrive custom OAuth, enable the app in Composio and complete setup there with the customer's own developer app credentials. Do not try to install the custom app directly from Pipedrive's OAuth app settings. During the Composio connection flow, provide the Pipedrive subdomain when requested.

## Hosted auth links can collect Pipedrive required fields

Use hosted auth links when you want Composio to collect required provider-specific fields during connection initiation. You can also inspect the auth config/toolkit metadata to see the expected input fields before starting the Pipedrive connection.

## Pass `callback_url` when initiating Pipedrive auth to redirect users after authentication

When initiating a Pipedrive connection through SDK/API, pass `callback_url` or `callbackUrl` in the connection initiation call. Composio redirects the user to that URL after the provider authentication flow completes.

## Pipedrive has trigger support

Pipedrive has trigger support. Verify the current trigger list in the toolkit catalog before naming an exact count.
