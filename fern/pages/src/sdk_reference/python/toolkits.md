# Toolkits

Manage toolkits.

## composio.toolkits.authorize

Authorize a user to a toolkit If auth config is not found, it will be created using composio managed auth.

**Parameters**

    - **user_id**: The ID of the user to authorize.
    - **toolkit**: The slug of the toolkit to authorize. 

**Returns**

    - The connection request.

**Examples**

```python
connection_request = composio.toolkits.authorize(
    user_id="1234567890",
    toolkit="github",
)
```

**Note**: _This method should not be used in production._

## composio.toolkits.get

Get a toolkit by slug or list toolkits by query.

**Parameters**

    - **slug**: The slug of the toolkit to get.
    - **query**: The query to filter toolkits by. 

**Returns**

    - The toolkit or list of toolkits.

**Examples**

```python
# List all toolkits
toolkits = composio.toolkits.get()
print(toolkits)

# Query by slug
toolkit = composio.toolkits.get(slug="github")
print(toolkit.name)

# Query by category
toolkits = composio.toolkits.get(query={"category": "Developer Tools"})
print(toolkits)
```

## composio.toolkits.get_auth_config_creation_fields

Get the required property for a given toolkit and auth scheme.

**Parameters**

    - **toolkit**: The slug of the toolkit to get the auth config creation fields for.
    - **auth_scheme**: The auth scheme to get the auth config creation fields for.
    - **required_only**: Whether to return only the required fields. 

**Returns**

    - The auth config creation fields.

**Raises**

    - InvalidParams: If the auth config details are not found.

**Examples**

```python
fields = composio.toolkits.get_auth_config_creation_fields(
    toolkit="github",
    auth_scheme="OAUTH2",
    required_only=True,
)
```

## composio.toolkits.get_connected_account_initiation_fields

Get the required property for a given toolkit and auth scheme.

**Parameters**

    - **toolkit**: The slug of the toolkit to get the connected account initiation fields for.
    - **auth_scheme**: The auth scheme to get the connected account initiation fields for.
    - **required_only**: Whether to return only the required fields. 

**Returns**

    - The connected account initiation fields.

**Raises**

    - InvalidParams: If the auth config details are not found.

**Examples**

```python
fields = composio.toolkits.get_connected_account_initiation_fields(
    toolkit="github",
    auth_scheme="OAUTH2",
    required_only=True,
)
```

## composio.toolkits.list_categories

List all categories of toolkits.


**Returns**

    - The list of categories.

**Examples**

```python
categories = composio.toolkits.list_categories()
print(categories)
```

