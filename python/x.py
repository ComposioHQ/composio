import ast
import sys

# The following will get unparsed to get the nodes to put in the
# OpenAI function calls
OS_IMPORT = "import os"
BASE_URL = "'https://oai.helicone.ai/v1'"
DEFAULT_HEADERS_DICT = """
{
    "Helicone-Auth": f"Bearer {os.environ['HELICONE_API_KEY']}",
    "Helicone-Cache-Enabled": "true",
    "Helicone-User-Id": "GitHub-CI-Example-Tests",
}
"""
OS_IMPORT_STMT = ast.parse(OS_IMPORT).body[0]
BASE_URL_EXPR = ast.parse(BASE_URL, mode="eval").body
DEFAULT_HEADERS_EXPR = ast.parse(DEFAULT_HEADERS_DICT, mode="eval").body


class HeliconeAdder(ast.NodeTransformer):
    def __init__(self) -> None:
        self.has_os_import = False
        self.openai_patched_successfully = False

    def visit_Import(self, node: ast.Import) -> ast.Import:
        self.generic_visit(node)

        # If the module already imports `os`, then set the flag
        # to indicate that it has been imported.
        for alias in node.names:
            if alias.name == "os":
                self.has_os_import = True

        return node

    def visit_Call(self, node: ast.Call) -> ast.Call:
        self.generic_visit(node)

        # If it is a call to the function `OpenAI` or `ChatOpenAI`,
        # then preserve the original arguments, and add two new
        # keyword arguments, `base_url` and `default_headers`.
        if isinstance(node.func, ast.Name) and node.func.id in ("OpenAI", "ChatOpenAI"):
            new_keywords = [
                ast.keyword(arg="base_url", value=BASE_URL_EXPR),
                ast.keyword(arg="default_headers", value=DEFAULT_HEADERS_EXPR),
            ]
            node.keywords.extend(new_keywords)
            self.openai_patched_successfully = True

        return node

    def visit_Dict(self, node: ast.Dict) -> ast.Dict:
        self.generic_visit(node)

        # If the dictionary has a 'config_list' string key, and its
        # value is a list, then add the `base_url` and `default_headers`
        # keys to the dictionary.
        if any(
            isinstance(key, ast.Constant)
            and key.value == "config_list"
            and isinstance(value, ast.List)
            for key, value in zip(node.keys, node.values, strict=True)
        ):
            node.keys.extend(
                [ast.Constant("base_url"), ast.Constant("default_headers")]
            )
            node.values.extend([BASE_URL_EXPR, DEFAULT_HEADERS_EXPR])
            self.openai_patched_successfully = True

        return node


def add_helicone_headers(source: str) -> str:
    tree = ast.parse(source)
    helicone_adder = HeliconeAdder()
    tree: ast.Module = helicone_adder.visit(tree)
    assert helicone_adder.openai_patched_successfully

    # If the module does not import `os`, then add the import statement
    if not helicone_adder.has_os_import:
        tree.body.insert(0, OS_IMPORT_STMT)

    return ast.unparse(tree)


def main() -> None:
    with open(sys.argv[1], "r") as f:
        source = f.read()

    modified_source = add_helicone_headers(source)

    with open(sys.argv[1], "w") as f:
        f.write(modified_source)


if __name__ == "__main__":
    main()
