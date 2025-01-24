import ast
import operator
from typing import Any, Callable, Dict, Type, Union, cast

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

    NOTE: When providing an operation, use mathematical syntax like 33*12, 90/2*6, 3+5.3/3
    """

    _tags = ["calculator"]

    # Define supported operators with more precise type hints
    operators: Dict[
        Type[Union[ast.operator, ast.unaryop]], Callable[..., Union[int, float]]
    ] = {
        ast.Add: cast(Callable[..., Union[int, float]], operator.add),
        ast.Sub: cast(Callable[..., Union[int, float]], operator.sub),
        ast.Mult: cast(Callable[..., Union[int, float]], operator.mul),
        ast.Div: cast(Callable[..., Union[int, float]], operator.truediv),
        ast.Pow: cast(Callable[..., Union[int, float]], operator.pow),
        ast.USub: cast(Callable[..., Union[int, float]], operator.neg),
        ast.UAdd: cast(Callable[..., Union[int, float]], operator.pos),
    }

    def execute(self, request: CalculatorRequest, metadata: Dict) -> CalculatorResponse:
        """
        Executes the calculator operation with proper error handling.
        """
        try:
            result = self._safe_eval(
                ast.parse(
                    request.operation,
                    mode="eval",
                ).body
            )
            return CalculatorResponse(result=str(result))
        except SyntaxError:
            return CalculatorResponse(
                result=f"Invalid mathematical expression: {request.operation}"
            )
        except (TypeError, ValueError) as e:
            return CalculatorResponse(result=f"Error: {str(e)}")
        except Exception:
            return CalculatorResponse(
                result="Error: An unexpected error occurred while calculating"
            )

    def _safe_eval(self, node: ast.AST) -> Union[int, float]:
        """
        Main evaluation method that dispatches to specific node handlers.
        """
        handlers: Dict[Type[ast.AST], Callable[[Any], Union[int, float]]] = {
            ast.Constant: self._eval_constant,
            ast.BinOp: self._eval_binary_operation,
            ast.UnaryOp: self._eval_unary_operation,
        }

        handler = handlers.get(type(node))
        if handler:
            return handler(node)
        raise TypeError(f"Unsupported type: {type(node).__name__}")

    def _eval_constant(self, node: ast.Constant) -> Union[int, float]:
        """
        Evaluates constant nodes (numbers).
        """
        if isinstance(node.value, (int, float)):
            return node.value
        raise TypeError(f"Unsupported constant type: {type(node.value).__name__}")

    def _eval_binary_operation(self, node: ast.BinOp) -> Union[int, float]:
        """
        Evaluates binary operations (e.g., addition, multiplication).
        """
        left = self._safe_eval(node.left)
        right = self._safe_eval(node.right)
        op_type = type(node.op)

        if op_type not in self.operators:
            raise TypeError(f"Unsupported binary operator: {op_type.__name__}")

        # Check for division by zero before operation
        if op_type == ast.Div and right == 0:
            raise ValueError("Division by zero is not allowed")

        return self.operators[op_type](left, right)

    def _eval_unary_operation(self, node: ast.UnaryOp) -> Union[int, float]:
        """
        Evaluates unary operations (e.g., negation).
        """
        operand = self._safe_eval(node.operand)
        op_type = type(node.op)

        if op_type not in self.operators:
            raise TypeError(f"Unsupported unary operator: {op_type.__name__}")

        return self.operators[op_type](operand)
