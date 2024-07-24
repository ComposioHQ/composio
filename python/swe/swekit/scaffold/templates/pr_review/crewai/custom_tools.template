from composio import action

# Use following example to add your own custom tools

@action(toolname="cow", requires=["cowsay"])
def say(message: str) -> str:
    """
    Cow will say whatever you want it to say.

    :param message: Message string
    :return greeting: Formatted message.
    """
    import cowsay

    return cowsay.get_output_string("cow", message)
