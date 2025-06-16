from composio_openai import ComposioToolSet, Action

toolset = ComposioToolSet()


def my_schema_processor(schema: dict) -> dict: ...
def my_preprocessor(inputs: dict) -> dict: ...
def my_postprocessor(result: dict) -> dict: ...


# Get tools with the modified schema
processed_tools = toolset.get_tools(
    actions=[Action.GMAIL_SEND_EMAIL],
    processors={
        # Applied BEFORE the LLM sees the schema
        "schema": {Action.SOME_ACTION: my_schema_processor},
        # Applied BEFORE the tool executes
        "pre": {Action.SOME_ACTION: my_preprocessor},
        # Applied AFTER the tool executes, BEFORE the result is returned
        "post": {Action.SOME_ACTION: my_postprocessor},
    },
)