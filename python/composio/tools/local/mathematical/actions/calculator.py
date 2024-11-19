from typing import Dict
import ast
import operator
from pydantic import BaseModel, Field
from composio.tools.base.local import LocalAction

class CalculatorRequest(BaseModel):
    operation: str = Field(
        ...,
        description="A mathematical expression, examples: 200*7 or 5000/2*10",
        json_schema_extra={"file_readable": True},
    )

class CalculatorResponse(BaseModel):
    result: str = Field(..., description="Result of the calculation")

class Calculator(LocalAction[CalculatorRequest, CalculatorResponse]):
    """
    Performs mathematical calculations such as addition, subtraction, multiplication, and division.
    """

    _tags = ["calculator"]

    # Define supported operators
    operators = {
        ast.Add: operator.add,
        ast.Sub: operator.sub,
        ast.Mult: operator.mul,
        ast.Div: operator.truediv,
        ast.Pow: operator.pow,
        ast.USub: operator.neg,
        ast.UAdd: operator.pos,
    }

    def execute(self, request: CalculatorRequest, metadata: Dict) -> CalculatorResponse:
        try:
            # Parse the expression into an AST
            node = ast.parse(request.operation, mode='eval').body
            result = self._safe_eval(node)
            return CalculatorResponse(result=str(result))
        except Exception as e:
            # Handle exceptions and return error messages
            return CalculatorResponse(result=f"Error: {str(e)}")

    def _safe_eval(self, node):
        if isinstance(node, ast.Constant):  # <number>
            if isinstance(node.value, (int, float)):
                return node.value
            else:
                raise TypeError(f"Unsupported constant type: {type(node.value).__name__}")
        elif isinstance(node, ast.BinOp):  # <left> <operator> <right>
            left = self._safe_eval(node.left)
            right = self._safe_eval(node.right)
            op_type = type(node.op)
            if op_type in self.operators:
                return self.operators[op_type](left, right)
            else:
                raise TypeError(f"Unsupported binary operator: {op_type.__name__}")
        elif isinstance(node, ast.UnaryOp):  # <operator> <operand> e.g., -1
            operand = self._safe_eval(node.operand)
            op_type = type(node.op)
            if op_type in self.operators:
                return self.operators[op_type](operand)
            else:
                raise TypeError(f"Unsupported unary operator: {op_type.__name__}")
        else:
            raise TypeError(f"Unsupported type: {type(node).__name__}")
