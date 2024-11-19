import math
from typing import Dict

from asteval import Interpreter
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
        try:
            # Create safe interpreter
            aeval = Interpreter(
                use_numpy=False,
                minimal=True,
                no_import=True,
                no_exec=True,
                builtins_readonly=True,
            )

            # Add safe mathematical functions and constants
            safe_math = {
                "abs": abs,
                "round": round,
                "pow": pow,
                "min": min,
                "max": max,
                "pi": math.pi,
                "e": math.e,
                "sqrt": math.sqrt,
                "sin": math.sin,
                "cos": math.cos,
                "tan": math.tan,
                "log": math.log,
                "log10": math.log10,
                "exp": math.exp,
            }

            for name, func in safe_math.items():
                aeval.symtable[name] = func

            # Validate expression
            allowed_chars = set("0123456789.+-*/() abcdefghijklmnopqrstuvwxyzπ√^")
            if not all(c.lower() in allowed_chars for c in request.operation):
                raise ValueError("Invalid characters in expression")

            # Evaluate expression safely
            result = aeval.eval(request.operation)

            # Check for evaluation errors
            if aeval.error_msg:
                raise ValueError(f"Error evaluating expression: {aeval.error_msg}")

            # Validate result type
            if not isinstance(result, (int, float, complex)):
                raise ValueError("Invalid result type")

            return CalculatorResponse(result=str(result))

        except Exception as e:
            raise ValueError(f"Invalid mathematical expression: {str(e)}")
