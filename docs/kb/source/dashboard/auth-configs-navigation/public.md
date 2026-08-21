---
type: "guide"
title: "Manage Platform auth configs"
description: "Current dashboard steps for creating and managing Platform auth configs."
category: "auth-config"
visibility: "public"
timestamp: "2026-08-17T00:00:00Z"
tags:
  - "dashboard"
  - "auth-configs"
---
# Manage Platform auth configs

## Create an auth config from the selected Platform project

Open **Platform → Auth Configs → Create Auth Config**, choose the toolkit and
supported authentication method, then select managed authentication when it is
available or enter customer-owned credentials. For custom OAuth, register the
exact callback URI shown by the current dashboard in the provider app; do not
copy a callback URI from an old example.

Auth configs belong to one Platform project. If a config or connection is
missing, verify the selected organization and project before recreating it.

## Connect Account on an auth config is a Playground test connection

Open an auth config and select **Connect Account** to authenticate the
project's Playground user for testing. This control does not ask for an
application user ID. To connect an actual application user, create a hosted
connection link through the SDK or API with that application's stable
`user_id` and the intended auth config.

## Manage Config changes future authentication behavior

Use **Manage Config** to inspect the enabled state, credentials, and available
scope or execution settings for that config type. Changing credentials or
scopes can require users to create a fresh connection before the change is
reflected in their provider grant. Review dependent connections, sessions, and
triggers before disabling or deleting a config.
