from typing import Dict

from pydantic import BaseModel, Field

from composio.tools.base.local import LocalAction


class CalculatorRequest(BaseModel):
    operation: str = Field(
        ...,
        description="A mathematical expression, a couple examples are `200*7` or `5000/2*10`",
        json_schema_extra={"file_readable": True},
    )


class CalculatorResponse(BaseModel):
    result: str = Field(..., description="Result of the calculation")


class Calculator(LocalAction[CalculatorRequest, CalculatorResponse]):
    """
    Useful to perform any mathematical calculations, like sum, minus, multiplication, division, etc.
    """

    _tags = ["calculator"]

    def execute(self, request: CalculatorRequest, metadata: Dict) -> CalculatorResponse:
        return CalculatorResponse(
            result=str(eval(request.operation))  # pylint: disable=eval-used
        )
