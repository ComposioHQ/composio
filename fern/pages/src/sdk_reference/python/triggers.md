# Triggers

Triggers resource.

## composio.triggers.create

Create a trigger instance

**Parameters**

    - **slug**: The slug of the trigger
    - **user_id**: The ID of the user
    - **connected_account_id**: The ID of the connected account
    - **trigger_config**: The configuration of the trigger 

**Returns**

    - The trigger instance

**Examples**

```python
# Create a trigger using a user ID
    trigger = composio.triggers.create(
        slug="GITHUB_COMMIT_EVENT",
        user_id="1234567890",
        trigger_config={
            "owner": "composiohq",
            "repo": "composio",
        },
    )
    print(trigger)

    # Create a trigger using a connected account ID
    trigger = composio.triggers.create(
        slug="GITHUB_COMMIT_EVENT",
        connected_account_id="1234567890",
        trigger_config={
            "owner": "composiohq",
            "repo": "composio",
        },
    )
    print(trigger)
```

## composio.triggers.delete

Delete a trigger instance.

**Parameters**

    - **trigger_id**: The ID of the trigger to delete. 

**Returns**

    - 

**Examples**

```python
# Delete a trigger
    composio.triggers.delete(trigger_id="1234567890")
```

## composio.triggers.disable

Disable a trigger instance.

**Parameters**

    - **trigger_id**: The ID of the trigger to disable. 

**Returns**

    - 

**Examples**

```python
# Disable a trigger
    composio.triggers.disable(trigger_id="1234567890")
```

## composio.triggers.enable

Enable a trigger instance.

**Parameters**

    - **trigger_id**: The ID of the trigger to enable. 

**Returns**

    - 

**Examples**

```python
# Enable a trigger
    composio.triggers.enable(trigger_id="1234567890")
```

## composio.triggers.get_type

Get a trigger type by slug.

**Parameters**

    - **slug**: The slug of the trigger type to get. 

**Returns**

    - The trigger type.

**Examples**

```python
# Get a trigger type by slug
    trigger_type = composio.triggers.get_type(slug="GITHUB_COMMIT_EVENT")
    print(trigger_type)
```

## composio.triggers.list

List all trigger types.

**Parameters**

    - **cursor**: Cursor to start from
    - **limit**: Limit the number of triggers to return
    - **toolkit_slugs**: List of toolkit slugs to filter by 

**Returns**

    - List of trigger types

**Examples**

```python
# List all trigger types
    triggers = composio.triggers.list()
    print(triggers)
```

## composio.triggers.list_active

List all active triggers

**Parameters**

    - **trigger_ids**: List of trigger IDs to filter by
    - **trigger_names**: List of trigger names to filter by
    - **auth_config_ids**: List of auth config IDs to filter by
    - **connected_account_ids**: List of connected account IDs to filter by
    - **show_disabled**: Whether to show disabled triggers
    - **limit**: Limit the number of triggers to return
    - **page**: Page number to return 

**Returns**

    - List of active triggers

**Examples**

```python
# List all active triggers
    triggers = composio.triggers.list_active()
    print(triggers)

    # List all active triggers for a connected account
    triggers = composio.triggers.list_active(
        connected_account_ids=["1234567890"],
    )
    print(triggers)
```

## composio.triggers.list_enum

List all trigger enums.


**Returns**

    - 

**Examples**

```python
# List all trigger enums
    enums = composio.triggers.list_enum()
    print(enums)
```

## composio.triggers.subscribe

Subscribe to a trigger and receive trigger events.

**Parameters**

    - **timeout**: The timeout to wait for the subscription to be established. 

**Returns**

    - The trigger subscription handler.

**Examples**

```python
# Subscribe to a trigger
    subscription = composio.triggers.subscribe()
    @subscription.handle(toolkit="GITHUB")
    def handle_github_event(data):
        print(data)

    # Wait for the subscription to be closed
    subscription.wait_forever()
```

