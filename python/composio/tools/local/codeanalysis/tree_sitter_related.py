import re
from typing import Dict, List, Tuple

import tree_sitter_python as tspython
from tree_sitter import Language, Node, Parser, Tree


PY_LANGUAGE = Language(tspython.language())


class SpanRelated:
    """Class containing static methods for span-related operations"""

    @staticmethod
    def convert_to_tuple_format(
        original_span: List[List[int]],
    ) -> Tuple[Tuple[int, int], Tuple[int, int]]:
        """
        Converts the span to a tuple format.

        Args:
            original_span (List[List[int]]): The original span in list format.

        Returns:
            Tuple[Tuple[int, int], Tuple[int, int]]: The span in tuple format.

        Raises:
            ValueError: If the span format is invalid.
        """
        if len(original_span) != 2 or any(len(point) != 2 for point in original_span):
            raise ValueError("Invalid span format")
        return (
            (original_span[0][0], original_span[0][1]),
            (original_span[1][0], original_span[1][1]),
        )

    @staticmethod
    def has_span_overlap(
        span1: Tuple[Tuple[int, int], Tuple[int, int]],
        span2: Tuple[Tuple[int, int], Tuple[int, int]],
    ) -> bool:
        """
        Returns True if the spans overlap, else False.

        Args:
            span1 (Tuple[Tuple[int, int], Tuple[int, int]]): The first span.
            span2 (Tuple[Tuple[int, int], Tuple[int, int]]): The second span.

        Returns:
            bool: True if the spans overlap, else False.
        """
        span1, span2 = map(SpanRelated.convert_to_tuple_format, (span1, span2))  # type: ignore
        return not (span1[1] < span2[0] or span1[0] > span2[1])

    @staticmethod
    def does_span_contain(parent_span: Tuple, child_span: Tuple) -> bool:
        """
        Returns True if parent_span contains child_span, else False.

        Args:
            parent_span (Tuple[Tuple[int, int], Tuple[int, int]]): The parent span.
            child_span (Tuple[Tuple[int, int], Tuple[int, int]]): The child span.

        Returns:
            bool: True if parent_span contains child_span, else False.
        """
        parent_span, child_span = map(
            SpanRelated.convert_to_tuple_format, (parent_span, child_span)  # type: ignore
        )
        return (parent_span[0] <= child_span[0]) and (parent_span[1] >= child_span[1])


def fetch_tree(parser: Parser, code_use: str) -> Tree:
    """Parses the given code and returns the syntax tree"""
    tree = parser.parse(bytes(code_use, "utf8"))
    return tree


def fetch_relevant_body(node: Node, test_code_str: str) -> str:
    """
    Fetches the relevant body of code for a given node.

    Args:
        node (Node): The node for which the relevant body of code is to be fetched.
        test_code_str (str): The string containing the entire code.

    Returns:
        str: The relevant body of code for the given node.
    """
    start_line, start_col = node.start_point
    end_line, end_col = node.end_point
    all_lines = test_code_str.split("\n")

    if start_line == end_line:
        return all_lines[start_line][start_col:end_col]

    relevant_body = [all_lines[start_line][start_col:]]
    relevant_body.extend(all_lines[start_line + 1 : end_line])  # noqa: E203
    relevant_body.append(all_lines[end_line][:end_col])
    return "\n".join(relevant_body)


def fetch_type_nodes(node: Node, desired_types_list: List[str]) -> List[Node]:
    """Fetches nodes of the desired types from the syntax tree"""
    relevant_nodes: List[Node] = []

    if node.type in desired_types_list:
        relevant_nodes.append(node)

    for (
        curr_child
    ) in (
        node.children
    ):  # Recursively fetch nodes of the desired types from the children
        relevant_nodes += fetch_type_nodes(curr_child, desired_types_list)

    return relevant_nodes  # Return the list of relevant nodes


def fetch_nodes_of_type(file_path: str, types_allowed: List[str]) -> List[Dict]:
    """
    Fetches the locations of type annotations in the file in the form [{"node_text", "span"}].

    Args:
        file_path (str): The path to the file to be analyzed.
        types_allowed (List[str]): A list of node types to be fetched.

    Returns:
        List[Dict]: A list of dictionaries containing node details.
    """
    parser = Parser(PY_LANGUAGE)
    with open(file_path, "r", encoding="utf-8") as file:
        test_code_str = file.read()

    root_node = fetch_tree(parser, test_code_str).root_node
    generic_type_nodes = fetch_type_nodes(root_node, types_allowed)
    node_list = format_node_list(nodes=generic_type_nodes, file_body=test_code_str)
    return node_list


def format_node_list(nodes: List[Node], file_body: str) -> List[Dict]:
    """
    Formats the list of nodes with their details.

    Args:
        nodes (List[Node]): A list of nodes to be formatted.
        file_body (str): The content of the file as a string.

    Returns:
        list: A list of dictionaries containing formatted node details.
    """
    formatted_identifier_nodes = []
    for node in nodes:
        formatted_identifier_nodes.append(
            {
                "node_obj": node,
                "node_txt": fetch_relevant_body(node, file_body),
                "start_point": node.start_point,
                "end_point": node.end_point,
            }
        )

    for node in formatted_identifier_nodes:
        node["start_point"] = (
            node["start_point"][0] + 1,
            node["start_point"][1],
        )
        node["end_point"] = (
            node["end_point"][0] + 1,
            node["end_point"][1],
        )
        node["span"] = SpanRelated.convert_to_tuple_format(
            (node["start_point"], node["end_point"])  # type: ignore
        )
        del node["start_point"]
        del node["end_point"]

    formatted_identifier_nodes.sort(key=lambda x: x["span"])
    return formatted_identifier_nodes


def fetch_class_and_function_nodes_defn_identifiers(file_path: str) -> List[Dict]:
    """
    Fetches the class and function definition identifiers from the file.

    Args:
        file_path (str): The path to the file.

    Returns:
        List[Dict]: A list of dictionaries containing formatted node details.
    """
    # Fetch function and class definition nodes
    wanted_definition_nodes = fetch_nodes_of_type(
        file_path, ["function_definition", "class_definition"]
    )

    # Read the code from the file
    with open(file_path, "r", encoding="utf-8") as file:
        file_body = file.read()

    # Find the identifier nodes in the children of the definition nodes
    identifier_nodes = []
    for node in wanted_definition_nodes:
        curr_identifier_nodes = [
            x for x in node["node_obj"].children if x.type == "identifier"
        ]
        if len(curr_identifier_nodes) != 1:
            raise ValueError(
                f"Expected exactly one identifier node, found: {len(curr_identifier_nodes)}"
            )
        identifier_nodes.append(curr_identifier_nodes[0])

    # Format the list of identifier nodes
    formatted_identifier_nodes = format_node_list(identifier_nodes, file_body)

    return formatted_identifier_nodes


def find_left_side_identifiers_of_assignments(file_path: str) -> List[Dict]:
    """
    Fetches the left side identifiers of assignments from the file.

    Args:
        file_path (str): The path to the file.

    Returns:
        List[Dict]: A list of dictionaries containing formatted node details.
    """
    # Fetch assignment nodes
    wanted_definition_nodes = fetch_nodes_of_type(file_path, ["assignment"])

    # Read the code from the file
    with open(file_path, "r", encoding="utf-8") as file:
        file_body = file.read()

    identifier_nodes = []
    # Find the identifier nodes in the children of the assignment nodes
    for node in wanted_definition_nodes:
        node_obj = node["node_obj"]
        if len(node_obj.children) == 0:
            continue
        if node_obj.children[0].type == "identifier":
            identifier_nodes.append(node_obj.children[0])

    # Format the list of identifier nodes
    formatted_identifier_nodes = format_node_list(identifier_nodes, file_body)

    return formatted_identifier_nodes


def fetch_entity_artifacts(entity_body: str, entity_type: str) -> Dict[str, str]:
    """
    Fetches artifacts (signature, block, docstring) for a given entity (class or function).

    Args:
        entity_body (str): The body of the entity to analyze.
        entity_type (str): The type of the entity ("class" or "function").

    Returns:
        Dict[str, str]: A dictionary containing the entity's signature, block, and docstring.

    Raises:
        ValueError: If the entity_type is invalid or if the expected nodes are not found.
    """
    if entity_type not in ["class", "function"]:
        raise ValueError("Invalid entity_type. Must be 'class' or 'function'.")

    parser = Parser(PY_LANGUAGE)
    tree = fetch_tree(parser, entity_body)
    entity_node = tree.root_node

    entity_defn_nodes = fetch_type_nodes(entity_node, [f"{entity_type}_definition"])
    if not entity_defn_nodes:
        raise ValueError(f"No {entity_type} definition found in the given body.")

    entity_root_node = min(entity_defn_nodes, key=lambda x: x.start_point)
    block_nodes = fetch_type_nodes(entity_root_node, ["block"])

    if not block_nodes:
        raise ValueError(f"No block found in the {entity_type} definition.")

    entity_block_node = min(block_nodes, key=lambda x: x.start_point)

    entity_root_node_txt = fetch_relevant_body(entity_root_node, entity_body)
    entity_block_node_txt = fetch_relevant_body(entity_block_node, entity_body)

    signature = entity_root_node_txt.split(entity_block_node_txt)[0]
    docstring = ""

    if entity_block_node.children:
        first_child = entity_block_node.children[0]
        if first_child.type == "expression_statement" and first_child.children:
            first_child_child = first_child.children[0]
            if first_child_child.type == "string":
                docstring = fetch_relevant_body(first_child_child, entity_body)

    return {
        "signature": re.sub(r"\s+", " ", signature).strip(),
        "block": entity_block_node_txt.strip(),
        "docstring": docstring.strip(),
    }
