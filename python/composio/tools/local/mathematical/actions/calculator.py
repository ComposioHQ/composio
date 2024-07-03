from pydantic import BaseModel, Field

from composio.tools.local.base import Action


class CalculatorRequest(BaseModel):
    operation: str = Field(
        ...,
        description="A mathematical expression, a couple examples are `200*7` or `5000/2*10`",
        json_schema_extra={"file_readable": True},
    )


class CalculatorResponse(BaseModel):
    result: str = Field(..., description="Result of the calculation")


class Calculator(Action[CalculatorRequest, CalculatorResponse]):
    """
    Useful to perform any mathematical calculations, like sum, minus, multiplication, division, etc.
    """

    _display_name = "Make a calculation"
    _request_schema = CalculatorRequest
    _response_schema = CalculatorResponse
    _tags = ["calculation"]
    _tool_name = "mathematical"

    def execute(
        self, request_data: CalculatorRequest, authorisation_data: dict
    ) -> dict:
        if authorisation_data is None:
            authorisation_data = {}
        operation_str = request_data.dict()["operation"]
        try:
            # pylint: disable=eval-used
            result = eval(operation_str)
            # pylint: enable=eval-used
            execution_details = {"executed": True}
            response_data = result
        except Exception as e:
            execution_details = {"executed": False}
            response_data = {"error": e}

        return {"execution_details": execution_details, "response_data": response_data}
