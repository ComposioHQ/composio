from github import Github

from tree_sitter import Language, Parser

Language.build_library(
    "build/my-languages.so",
    ["tree-sitter-python"],  # URL to the tree-sitter Python grammar
)

PY_LANGUAGE = Language("build/my-languages.so", "python")
parser = Parser()
parser.set_language(PY_LANGUAGE)


def fetch_repository_contents(access_token, repo_name):
    g = Github(access_token)
    repo = g.get_repo(repo_name)
    contents = repo.get_contents("")  # Get root directory contents
    all_files = {}
    while contents:
        file_content = contents.pop(0)
        if file_content.type == "dir":
            contents.extend(repo.get_contents(file_content.path))
        else:
            all_files[file_content.path] = file_content.decoded_content.decode("utf-8")
    return all_files


def parse_code(code):
    tree = parser.parse(bytes(code, "utf8"))
    return tree


import networkx as nx


def build_graph(parsed_trees):
    graph = nx.DiGraph()
    for filename, tree in parsed_trees.items():
        # Assuming a function to extract nodes and edges exists
        nodes, edges = extract_nodes_and_edges(tree, filename)
        graph.add_nodes_from(nodes)
        graph.add_edges_from(edges)
    return graph


# This function would need to be implemented based on the parsed tree structure
def extract_nodes_and_edges(tree, filename):
    cursor = tree.walk()

    def traverse(node):
        """Recursively traverse the parse tree to extract nodes and edges."""
        nodes = []
        edges = []

        if node.type == "function_definition" or node.type == "class_definition":
            # The name of the function or class is typically the first child node of type 'identifier'
            identifier = next(
                (child for child in node.children if child.type == "identifier"), None
            )
            if identifier:
                node_name = identifier.text.decode("utf-8")
                nodes.append((node_name, {"type": node.type, "filename": filename}))

                # For functions, look for function calls within to build edges
                if node.type == "function_definition":
                    for child in node.children:
                        if child.type == "block":
                            func_calls = [
                                n
                                for n in child.children
                                if n.type == "expression_statement"
                            ]
                            for call in func_calls:
                                call_identifier = next(
                                    (c for c in call.children if c.type == "call"), None
                                )
                                if call_identifier:
                                    called_func_name = call_identifier.text.decode(
                                        "utf-8"
                                    )
                                    edges.append(
                                        (
                                            node_name,
                                            called_func_name,
                                            {"type": "function_call"},
                                        )
                                    )

        for child in node.children:
            child_nodes, child_edges = traverse(child)
            nodes.extend(child_nodes)
            edges.extend(child_edges)

        return nodes, edges

    nodes, edges = traverse(cursor.node)
    return nodes, edges


def find_related_files(graph, starting_point):
    # Find all nodes reachable from the starting point within 1 edge distance
    related_files = nx.single_source_shortest_path_length(
        graph, starting_point, cutoff=1
    )
    return related_files


if __name__ == "__main__":
    # clone git repo
    access_token = "your_github_access_token"
    repo_name = "username/repository"
    repository_files = fetch_repository_contents(access_token, repo_name)
    print(repository_files)

    # Example usage
    code = repository_files[
        "some_file.py"
    ]  # assuming 'some_file.py' is in your repository_files
    parsed_tree = parse_code(code)
    print(parsed_tree.root_node.sexp())

    # Assuming we have parsed_trees for each file
    parsed_trees = {
        filename: parse_code(code) for filename, code in repository_files.items()
    }
    graph = build_graph(parsed_trees)

    # Example usage
    starting_point = "function_name_or_file"
    related_files = find_related_files(graph, starting_point)
    print(related_files)
