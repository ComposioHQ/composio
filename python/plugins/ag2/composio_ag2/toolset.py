from composio_autogen import ComposioToolSet as ComposioAutogenToolset


class ComposioToolSet(
    ComposioAutogenToolset,
    runtime="ag2",
    description_char_limit=1024,
    action_name_char_limit=64,
):
    """
    Composio toolset for Ag2 framework.
    """
