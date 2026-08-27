# DEPRECATED: use `composio`

`composio-core` is the legacy Composio Python SDK and no longer receives updates.
The current SDK requires Python 3.10 or newer.

Remove the legacy package before installing the current SDK. Both packages use
the `composio` import name and must not be installed together.

```bash
python -m pip uninstall -y composio-core
python -m pip install composio
```

See the [migration guide](https://docs.composio.dev/docs/migration-guide/new-sdk)
to update an existing integration.
