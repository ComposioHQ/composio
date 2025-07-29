import { spawnSync } from 'child_process';
import { describe, it, expect } from 'vitest';

interface AssertPythonIsValidInput {
  files: {
    [filename: string]: string;
  };
}

/**
 * Asserts that the provided Python code is syntactically valid.
 */
export function assertPythonIsValid({ files }: AssertPythonIsValidInput) {
  for (const [filename, code] of Object.entries(files)) {
    try {
      // Use spawnSync to avoid shell quote escaping issues by passing code via stdin
      const {
        status: exitCode,
        stderr,
        stdout,
      } = spawnSync(
        'python3',
        ['-c', 'import sys; compile(sys.stdin.read(), "<string>", "exec")'],
        {
          input: code,
          encoding: 'utf8',
        }
      );

      if (exitCode !== 0) {
        throw new Error(stderr || stdout || 'Python compilation failed');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Invalid Python code in ${filename}:\n${error.message}`);
      }
      throw error;
    }
  }
}

if (import.meta.vitest) {
  describe('assertPythonIsValid', () => {
    it('[Given] valid Python code [Then] no errors are found', () => {
      const code = /* python */ `
def greet(name):
    return f"Hello, {name}!"

result = greet("World")
print(result)
      `;
      assertPythonIsValid({ files: { 'main.py': code } });
    });

    it('[Given] valid Python code with imports [Then] no errors are found', () => {
      const mainSource = /* python */ `
import math

def calculate_area(radius):
    return math.pi * radius ** 2

area = calculate_area(5)
print(f"Area: {area}")
      `;

      assertPythonIsValid({
        files: { 'main.py': mainSource },
      });
    });

    it('[Given] valid Python code with class definition [Then] no errors are found', () => {
      const code = /* python */ `
class Calculator:
    def __init__(self):
        self.result = 0
    
    def add(self, x, y):
        self.result = x + y
        return self.result

calc = Calculator()
calc.add(2, 3)
      `;
      assertPythonIsValid({ files: { 'calculator.py': code } });
    });

    it('[Given] valid Python code with string escaping [Then] no errors are found', () => {
      const code = /* python */ `
message = "Hello \\"World\\" with 'quotes'"
template = '''This is a multiline
string with "double" and 'single' quotes'''
formatted = f"Template: {template}"
print(formatted)
      `;
      assertPythonIsValid({ files: { 'strings.py': code } });
    });

    it('[Given] invalid Python code [Then] errors are found', () => {
      const code = /* python */ `
def broken_function(
    print("This is missing a closing parenthesis"
      `;
      expect(() => {
        assertPythonIsValid({ files: { 'broken.py': code } });
      }).toThrowError();
    });

    it('[Given] Python code with syntax error [Then] errors are found', () => {
      const code = /* python */ `
def invalid_syntax():
    if True
        print("Missing colon")
      `;
      expect(() => {
        assertPythonIsValid({ files: { 'syntax_error.py': code } });
      }).toThrowError();
    });

    it('[Given] Python code with indentation error [Then] errors are found', () => {
      const code = /* python */ `
def bad_indentation():
    x = 1
  y = 2  # Wrong indentation
    return x + y
      `;
      expect(() => {
        assertPythonIsValid({ files: { 'indentation_error.py': code } });
      }).toThrowError();
    });

    it('[Given] multiple valid Python files [Then] no errors are found', () => {
      const mainSource = /* python */ `
from math_utils import add, multiply

def main():
    result = multiply(add(2, 3), 4)
    print(f"Result: {result}")

if __name__ == "__main__":
    main()
      `;

      const mathUtilsSource = /* python */ `
def add(x, y):
    return x + y

def multiply(x, y):
    return x * y
      `;

      assertPythonIsValid({
        files: { 'main.py': mainSource, 'math_utils.py': mathUtilsSource },
      });
    });

    it('[Given] valid Python code with decorators [Then] no errors are found', () => {
      const code = /* python */ `
def my_decorator(func):
    def wrapper(*args, **kwargs):
        print(f"Calling {func.__name__}")
        return func(*args, **kwargs)
    return wrapper

@my_decorator
def greet(name):
    return f"Hello, {name}!"

result = greet("World")
print(result)
      `;
      assertPythonIsValid({ files: { 'decorators.py': code } });
    });

    it('[Given] valid Python code with async/await [Then] no errors are found', () => {
      const code = /* python */ `
import asyncio

async def fetch_data():
    await asyncio.sleep(1)
    return "data"

async def main():
    result = await fetch_data()
    print(result)

if __name__ == "__main__":
    asyncio.run(main())
      `;
      assertPythonIsValid({ files: { 'async_example.py': code } });
    });

    it('[Given] valid Python code with type hints [Then] no errors are found', () => {
      const code = /* python */ `
from typing import List, Optional, Dict

def process_items(items: List[str], config: Optional[Dict[str, bool]] = None) -> str:
    if config is None:
        config = {}
    
    processed = [item.upper() for item in items if config.get("uppercase", True)]
    return ", ".join(processed)

result: str = process_items(["hello", "world"])
print(result)
      `;
      assertPythonIsValid({ files: { 'type_hints.py': code } });
    });

    it('[Given] Python code with complex string literals [Then] no errors are found', () => {
      const code = /* python */ `
# Test various string literal formats
single_quotes = 'This is a single-quoted string'
double_quotes = "This is a double-quoted string"
triple_single = '''This is a
multi-line string
with single quotes'''
triple_double = """This is a
multi-line string
with double quotes"""

# Raw strings
raw_string = r"This is a raw string with \\n and \\t"
f_string = f"Hello, {single_quotes}"

# Mixed quotes
mixed = "She said, 'Hello there!' to him"
escaped = "This has \\"escaped\\" quotes"

print(f_string)
      `;
      assertPythonIsValid({ files: { 'string_literals.py': code } });
    });

    it('[Given] invalid Python code with undefined variable [Then] errors are found', () => {
      const code = /* python */ `
def test_function():
    return undefined_variable
      `;
      // Note: Python syntax validation won't catch undefined variables - only syntax errors
      // This should pass syntax validation but would fail at runtime
      assertPythonIsValid({ files: { 'undefined_var.py': code } });
    });

    it('[Given] Python code with syntax error in function call [Then] errors are found', () => {
      const code = /* python */ `
def test_function():
    print("Hello",)  # This trailing comma is valid
    print("Hello",,)  # This double comma is invalid
      `;
      expect(() => {
        assertPythonIsValid({ files: { 'function_call_error.py': code } });
      }).toThrowError();
    });
  });
}
