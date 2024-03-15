from .pydantic_utils import json_schema_to_model
from langchain_core.tools import StructuredTool 
    
def ComposioTool(action_schema: dict[str, any]) ->  StructuredTool:
    name = action_schema["name"]
    description = action_schema["description"]
    parameters = json_schema_to_model(action_schema["parameters"])
    print(parameters.schema())
    return StructuredTool.from_function(
        name=name,
        description=description,
        args_schema=parameters,
        return_schema=True,
        # TODO use execute action here
        func = lambda **kwargs: print(kwargs)
    )