# Composio Python SDK Reference

This is the comprehensive SDK reference for the Composio Python SDK.

## Main SDK Class

The main entry point for the Composio SDK.

[[autodoc]] composio.Composio

## Core Models

### Tools

[[autodoc]] composio.core.models.Tools

### Toolkits

[[autodoc]] composio.core.models.Toolkits

### Connected Accounts

[[autodoc]] composio.core.models.ConnectedAccounts

### Auth Configs

[[autodoc]] composio.core.models.AuthConfigs

### Triggers

[[autodoc]] composio.core.models.Triggers

## Decorators

### before_execute

[[autodoc]] composio.before_execute

### after_execute

[[autodoc]] composio.after_execute

### schema_modifier

[[autodoc]] composio.schema_modifier

## Cross References

The [`Composio`] class is the main entry point for all SDK operations. It provides access to:
- [`Tools`] for tool management and execution
- [`Toolkits`] for toolkit operations  
- [`ConnectedAccounts`] for managing authentication
- [`Triggers`] for webhook and event handling

When you call [`Tools.execute`], it can use the [`before_execute`] and [`after_execute`] decorators to modify behavior.