# Sessions API: imports and source map

Use `composio.sessions.create(...)` to create a Session and `composio.sessions.use(session_id)` to reopen one. `composio.create` and `composio.use` are shortcuts for the same methods.

```python
from composio import Composio

composio = Composio()  # Reads COMPOSIO_API_KEY when you run this example.
session = composio.sessions.create(user_id="user_123")
session = composio.sessions.use(session.session_id)
```

You don't need credentials, imports, or runtime introspection to read the linked source files. All local paths below are relative to this file, which ships inside the installed `composio` package.

## Create input, update input, and returned config

Python exposes create and update options as keyword arguments, not a single `ToolRouterCreateSessionConfig` or `ToolRouterUpdateSessionConfig` object. Read the method signatures for the complete accepted shapes:

- [`ToolRouter.create` and `ToolRouter.use`](core/models/tool_router.py): create keyword arguments and create-time helper types.
- [`ToolRouterSession.update` and `ToolRouterSessionConfig`](core/models/tool_router_session.py): patch keyword arguments, update-specific helper types, and the server-returned `session.config` protocol. Update inputs preserve omitted fields; the returned config is not create input.
- [`Composio.sessions`](sdk.py): canonical entrypoint and top-level shortcuts.

These existing types can be imported directly from their defining modules:

```python
from composio.core.models.tool_router import (
    ToolRouterManageConnectionsConfig,
    ToolRouterSandboxConfig,
    ToolRouterToolkitsEnableConfig,
)
from composio.core.models.tool_router_session import (
    ToolRouterSession,
    ToolRouterSessionConfig,
    ToolRouterUpdateManageConnectionsConfig,
    ToolRouterUpdateMultiAccountConfig,
    ToolRouterUpdateExperimentalConfig,
)
```

Sessions is the public API name. The existing `ToolRouter*` class names and `tool_router*.py` files implement Sessions; they aren't a separate API. Don't use the deprecated `composio.tool_router` entrypoint for new code. The types above aren't exported from the top-level `composio` module.

## Online references

- [Composio and Sessions entrypoints (plain Markdown)](https://docs.composio.dev/reference/sdk-reference/python/composio.md)
- [Session methods (plain Markdown)](https://docs.composio.dev/reference/sdk-reference/python/session.md)
- [Configuring sessions](https://docs.composio.dev/docs/configuring-sessions)

The wheel ships this navigation document and the linked Python source, not a generated SDK reference tree. Use the direct Markdown URLs for the generated online reference.
