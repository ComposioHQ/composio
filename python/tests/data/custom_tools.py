from composio.tools.base.runtime import action


@action(toolname="cow", requires=["pytest"])
def say(message: str) -> str:
    """
    Make cow say.

    :param message: Message string
    :return output: Output string
    """
    return f"Cow says: {message}"
