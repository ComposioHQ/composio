# ConnectedAccounts

Manage connected accounts.

## composio.connected_accounts.delete

Delete a connected account by ID.

**Parameters**

    - **id**: The ID of the connected account to delete. 

**Returns**

    - True if the connected account was deleted, False otherwise.

**Examples**

```python
composio.connected_accounts.delete(id="<CONNECTED_ACCOUNT_ID>")
```

## composio.connected_accounts.disable

Disable a connected account by ID.

**Parameters**

    - **id**: The ID of the connected account to disable. 

**Returns**

    - True if the connected account was disabled, False otherwise.

**Examples**

```python
composio.connected_accounts.disable(id="<CONNECTED_ACCOUNT_ID>")
```

## composio.connected_accounts.enable

Enable a connected account by ID.

**Parameters**

    - **id**: The ID of the connected account to enable. 

**Returns**

    - True if the connected account was enabled, False otherwise.

**Examples**

```python
composio.connected_accounts.enable(id="<CONNECTED_ACCOUNT_ID>")
```

## composio.connected_accounts.get

Get a connected account by ID.

**Parameters**

    - **id**: The nanoid of the connected account to get. 

**Returns**

    - The connected account object.

**Examples**

```python
connected_account = composio.connected_accounts.get(id="1234567890")
print(connected_account.status)
```

## composio.connected_accounts.initiate

Compound function to create a new coneected account. This function creates a new connected account and returns a connection request.  Users can then wait for the connection to be established using the `wait_for_connection` method.

**Parameters**

    - **user_id**: The user ID to create the connected account for.
    - **auth_config_id**: The auth config ID to create the connected account for.
    - **callback_url**: Callback URL to use for OAuth apps.
    - **config**: The options to create the connected account with. 

**Returns**

    - The connection request.

**Examples**

```python
connection_request = composio.connected_accounts.initiate(
    user_id="1234567890",
    auth_config_id="1234567890",
)
connection_request.wait_for_connection()
print(connection_request.status)
```

## composio.connected_accounts.list

List all connected accounts.

**Parameters**

    - **auth_config_ids**: The auth config ids of the connected accounts
    - **connected_account_ids**: The connected account ids to filter by
    - **cursor**: The cursor to paginate through the connected accounts
    - **labels**: The labels of the connected accounts
    - **limit**: The limit of the connected accounts to return
    - **order_by**: The order by of the connected accounts
    - **order_direction**: The order direction of the connected accounts
    - **statuses**: The status of the connected account
    - **toolkit_slugs**: The toolkit slugs of the connected accounts
    - **user_ids**: The user ids of the connected accounts 

**Returns**

    - The connected accounts object.

**Examples**

```python
# List all connected accounts
connected_accounts = composio.connected_accounts.list()
print(connected_accounts.items)

# List all connected accounts for given users
connected_accounts = composio.connected_accounts.list(
    user_ids=["<USER_ID>"],
)
print(connected_accounts.items)

# List all connected accounts for given toolkits
connected_accounts = composio.connected_accounts.list(
    toolkit_slugs=["<TOOLKIT_SLUG>"],
)
print(connected_accounts.items)

# List all connected accounts for given auth config
connected_accounts = composio.connected_accounts.list(
    auth_config_ids=["<AUTH_CONFIG_ID>"],
)
print(connected_accounts.items)
```

## composio.connected_accounts.update_status

Update the status of a connected account by ID.

**Parameters**

    - **id**: The ID of the connected account to update the status of.
    - **enabled**: Whether the connected account should be enabled. 

**Returns**

    - True if the connected account was updated, False otherwise.

**Examples**

```python
# Enable a connected account
composio.connected_accounts.update_status(id="<CONNECTED_ACCOUNT_ID>", enabled=True)

# Disable a connected account
composio.connected_accounts.update_status(id="<CONNECTED_ACCOUNT_ID>", enabled=False)
```

## composio.connected_accounts.wait_for_connection

Wait for connected account with given ID to be active

**Parameters**

    - **id**: The ID of the connected account to wait for.
    - **timeout**: The timeout to wait for the connected account to be active. 

**Returns**

    - The connected account object.

**Examples**

```python
connection_request = composio.connected_accounts.wait_for_connection(
    id="1234567890",
    timeout=10,
)
print(connection_request.status)
```

