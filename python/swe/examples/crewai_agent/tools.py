from composio import action


@action(toolname="math")
def calculate_operation(num1: float, num2: float, operation: str) -> float:
    """
    Calculate the sum of two numbers
    """
    if operation == "add":
        return num1 + num2
    if operation == "subtract":
        return num1 - num2
    if operation == "multiply":
        return num1 * num2
    if operation == "divide":
        return num1 / num2
    raise ValueError(f"Invalid operation: {operation}")
