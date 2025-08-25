# AuthConfigs

Manage authentication configurations.

## composio.auth_configs.create

Create a new auth config

**Parameters**

    - **toolkit**: The toolkit to create the auth config for.
    - **options**: The options to create the auth config with. 

**Returns**

    - The created auth config.

**Examples**

```python
# Use composio managed auth
auth_config = composio.auth_configs.create(
    toolkit="github",
    options={
        "type": "use_composio_managed_auth",
    },
)
print(auth_config)

# Use custom auth
auth_config = composio.auth_configs.create(
    toolkit="gmail",
    options={
        "name": "Gmail Auth",
        "type": "use_custom_auth",
        "auth_scheme": "OAUTH2",
        "credentials": {
            "client_id": "<AUTH_CONFIG_ID>",
            "client_secret": "<AUTH_CONFIG_ID>",
        },
    },
)
print(auth_config)

# Restrict tool access
auth_config = composio.auth_configs.create(
    toolkit="github",
    options={
        "type": "use_composio_managed_auth",
        "tool_access_config": {
            "tools_for_connected_account_creation": [
                "GITHUB_STAR_A_REPOSITORY_FOR_THE_AUTHENTICATED_USER"
            ],
        },
    },
)
print(auth_config)
```

## composio.auth_configs.delete

Deletes an existing authentication configuration.

**Parameters**

    - **nanoid**: The ID of the auth config to delete. 

**Returns**

    - The deleted auth config.

**Examples**

```python
composio.auth_configs.delete("<AUTH_CONFIG_ID>")
```

## composio.auth_configs.disable

Disables an existing authentication configuration.

**Parameters**

    - **nanoid**: The ID of the auth config to disable. 

**Returns**

    - The disabled auth config.

**Examples**

```python
composio.auth_configs.disable("<AUTH_CONFIG_ID>")
```

## composio.auth_configs.enable

Enables an existing authentication configuration.

**Parameters**

    - **nanoid**: The ID of the auth config to enable. 

**Returns**

    - The enabled auth config.

**Examples**

```python
composio.auth_configs.enable("<AUTH_CONFIG_ID>")
```

## composio.auth_configs.get

Retrieves a specific authentication configuration by its ID

**Parameters**

    - **nanoid**: The ID of the auth config to retrieve. 

**Returns**

    - The retrieved auth config.

**Examples**

```python
# Retrieve a specific auth config
composio.auth_configs.get("<AUTH_CONFIG_ID>")
```

## composio.auth_configs.list

Lists authentication configurations based on provided filter criteria.

**Parameters**

    - **deprecated_app_id**: The app id to filter by
    - **deprecated_status**: The status to filter by
    - **is_composio_managed**: Whether to filter by composio managed auth configs
    - **limit**: Number of items per page
    - **search**: Search auth configs by name
    - **show_disabled**: Show disabled auth configs
    - **toolkit_slug**: Comma-separated list of toolkit slugs to filter auth configs by 

**Returns**

    - The list of auth configs.

**Examples**

```python
# List all auth configs
auth_configs = composio.auth_configs.list()
print(auth_configs)

# List composio managed auth configs
auth_configs = composio.auth_configs.list(is_composio_managed=True)
print(auth_configs)

# List auth configs for a specific toolkit
auth_configs = composio.auth_configs.list(toolkit_slug="<TOOLKIT_SLUG>")
print(auth_configs)
```

## composio.auth_configs.update

Updates an existing authentication configuration.  This method allows you to modify properties of an auth config such as credentials, scopes, or tool restrictions. The update type (custom or default) determines which fields can be updated.

**Parameters**

    - **nanoid**: The ID of the auth config to update.
    - **options**: The options to update the auth config with. 

**Returns**

    - The updated auth config.

**Examples**

```python
composio.auth_configs.update("<AUTH_CONFIG_ID>", options={
    "type": "default",
    "credentials": {
        "api_key": "sk-1234567890",
    },
})
```

