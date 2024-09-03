import os
import sys
from copy import deepcopy
from typing import Dict, List, Optional, Tuple, Union

import jedi
from jedi.api.classes import Completion, Name

from composio.tools.local.codeanalysis import tree_sitter_related


# TOFIX(Shrey): Address these issues
# pylint: disable=unused-argument,unspecified-encoding,unused-variable


def clear_cache():
    jedi.cache.clear_time_caches()


def fetch_script_obj_for_file_in_repo(file_path: str, repo_path: str) -> jedi.Script:
    """
    Fetches the Jedi script object for a file in a repository.

    Args:
        file_path (str): The path of the file.
        repo_path (str): The path of the repository.

    Returns:
        jedi.Script: The script object for the file.

    Raises:
        ValueError: If the file is not within the project directory.
        RuntimeError: If there is an error creating the Jedi environment or script object.
    """
    try:
        project_obj = jedi.Project(repo_path)
        environment_obj = jedi.create_environment(sys.executable, safe=False)

        _project_obj_path = os.path.normpath(os.path.abspath(str(project_obj.path)))
        _file_path = os.path.normpath(os.path.abspath(file_path))
        if not _file_path.startswith(_project_obj_path):
            raise ValueError(
                f"The file '{file_path}' is not within the project directory '{repo_path}'"
            )

        script = jedi.Script(
            path=file_path,
            project=project_obj,
            environment=environment_obj,
        )
        return script
    except Exception as e:
        raise RuntimeError(f"Error in fetch_script_obj_for_file_in_repo: {e}") from e


def fetch_external_names(
    script_obj: jedi.Script, only_global_scope: bool = False, reference: bool = True
) -> List[Name]:
    """
    Fetches external references from the script object.

    Args:
        script_obj (jedi.Script): The script object.
        only_global_scope (bool, optional): Whether to fetch only global scope references. Defaults to False.

    Returns:
        List[Name]: List of possible external references.
    """
    try:
        # Get names from the script object, considering all scopes if only_global_scope is False
        possible_external_references = script_obj.get_names(
            all_scopes=not only_global_scope, references=reference, definitions=True
        )
        return possible_external_references
    except Exception as e:
        raise RuntimeError(f"Failed to fetch external references: {e}") from e


def check_overlap(reference: Name, spans: List[Tuple[int, int]]) -> bool:
    """
    Checks if the reference overlaps with any of the given spans.

    Args:
        reference (Name): The reference to check.
        spans (List[Tuple[int, int]]): The list of spans to check against.

    Returns:
        bool: True if there is an overlap, False otherwise.
    """
    reference_span = (
        reference.get_definition_start_position(),
        reference.get_definition_end_position(),
    )
    return any(
        tree_sitter_related.SpanRelated.has_span_overlap(span, reference_span)  # type: ignore
        for span in spans
    )


def format_lsp_node(
    reference_node: Name, final_goto_node: Name, fetch_goto_obj: bool = False
) -> dict:
    """
    Formats the LSP node information into a dictionary.

    Args:
        reference_node: The reference node.
        final_goto_node: The final goto node.
        fetch_goto_obj (bool, optional): Whether to include the goto object. Defaults to False.

    Returns:
        dict: A dictionary containing the formatted LSP node information.
    """
    obj = {
        "local_span": (
            reference_node.get_definition_start_position(),
            reference_node.get_definition_end_position(),
        ),
        "local_coordinates": (reference_node.line, reference_node.column),
        "local_type": reference_node.type,
        "local_code": reference_node.get_line_code(),
        "global_span": (
            final_goto_node.get_definition_start_position(),
            final_goto_node.get_definition_end_position(),
        ),
        "global_coordinates": (final_goto_node.line, final_goto_node.column),
        "global_type": final_goto_node.type,
        "global_fqdn": final_goto_node.full_name,
        "local_fqdn": reference_node.full_name,
        "global_module": str(final_goto_node.module_path),
    }

    if fetch_goto_obj:
        obj["goto_obj"] = final_goto_node

    return obj


def find_dsu_parent(ref: Name, max_retries: int = 2) -> Name:
    """
    Attempts to find the definition goto object for a given reference.

    Args:
        ref (Name): The reference for which to find the definition goto object.

    Returns:
        Name: The definition goto object.

    Raises:
        RuntimeError: If the definition goto object could not be fetched after the maximum number of retries.
    """

    def dsu_goto_parent(_elem: Name, max_times: int = 100) -> Optional[Name]:
        """
        Recursively fetches the parent element using goto.
        """
        try:
            # Try to get the goto element
            _goto_elem = _elem.goto(follow_imports=True)
        except Exception as E:
            # Log exception if any
            print(f"Returning None in dsu for elem: {_elem}: Error: {E}")
            return None

        # Return None if no goto element found
        if not _goto_elem:
            return None

        # Return the goto element if it is the same as the original element
        if _goto_elem[0] == _elem:
            return _goto_elem[0]

        # Return None if maximum recursive calls reached
        if max_times <= 0:
            print(
                f"Max times reached for dsu_goto_parent for elem: {_elem} and potential parent: {_goto_elem[0]}. Now, returning None."
            )
            return None

        # Recursively call dsu_goto_parent for the goto element
        return dsu_goto_parent(_goto_elem[0], max_times - 1)

    for _ in range(max_retries):
        defn_goto_obj = dsu_goto_parent(ref)
        if defn_goto_obj is not None:
            return defn_goto_obj

    raise RuntimeError(f"Failed to fetch definition goto object for reference: {ref}")


def fetch_global_and_nested_fqdns(
    all_references: List[Dict[str, str]], global_scope_candidate_references: List[Dict]
) -> List[Dict]:
    """
    Fetches Fully Qualified Domain Names (FQDNs) for global and nested entities.

    Args:
        all_references (List[Dict]): List of all references.
        global_scope_candidate_references (List[Dict]): List of references in the global scope.

    Returns:
        List[Dict]: List of dictionaries containing FQDN information for each entity.
    """
    fqdns_dict = {ref["global_fqdn"]: ref for ref in all_references}

    # Separate global classes and functions
    global_classes_fqdns = [
        ref["global_fqdn"]
        for ref in global_scope_candidate_references
        if ref["global_type"] == "class"
    ]
    global_functions_fqdns = [
        ref["global_fqdn"]
        for ref in global_scope_candidate_references
        if ref["global_type"] == "function"
    ]

    fqdns_list = [
        {**fqdns_dict[fqdn], "scope": "global", "parent_fqdn": None}
        for fqdn in global_classes_fqdns + global_functions_fqdns
    ]

    # Handle non-global entities
    potential_parent_fqdns = sorted(
        set(deepcopy(global_functions_fqdns + global_classes_fqdns)),
        key=lambda x: -len(x),
    )

    for ref in all_references:
        if ref["global_type"] != "function":
            continue
        if ref["global_fqdn"] in global_functions_fqdns:
            continue

        if ref["global_fqdn"] is None:
            ref["global_fqdn"] = ref["local_fqdn"]

        if ref["global_fqdn"] is None and ref["global_span"][0][1] > 4:
            continue

        # Find the parent FQDN for nested functions
        found_parent_fqdns = [
            parent_fqdn
            for parent_fqdn in potential_parent_fqdns
            if ref["global_fqdn"].startswith(f"{parent_fqdn}.")
        ]
        if len(found_parent_fqdns) != 1:
            raise ValueError("Multiple or no parent FQDNs found")
        parent_fqdn = found_parent_fqdns[0]

        remaining_dots = ref["global_fqdn"].replace(f"{parent_fqdn}.", "").count(".")

        if remaining_dots == 0:
            fqdns_list.append(
                {
                    **fqdns_dict[ref["global_fqdn"]],
                    "scope": "nested",
                    "parent_fqdn": parent_fqdn,
                }
            )

    return fqdns_list


def fetch_and_filter(
    script_obj: jedi.Script,
    clickable_nodes: List[Dict],
    file_path: str,
    allowed_types: List[str],
    reference: bool = True,
    only_global_scope: bool = False,
) -> List[Dict]:
    """
    Fetch and filter references within the script.

    Args:
        script_obj (jedi.Script): The script object.
        clickable_nodes (List[Dict]): List of clickable nodes with spans.
        file_path (str): The absolute path of the Python file to process.
        allowed_types (List[str]): List of allowed types for references.
        only_global_scope (bool): Whether to fetch only global scope references. Defaults to False.

    Returns:
        List[Dict]: List of filtered references.
    """
    # Fetch references within the script
    if reference:
        names = fetch_references_in_script(
            script_obj,
            restrict_local_spans=[node["span"] for node in clickable_nodes],
            only_global_scope=only_global_scope,
        )
    else:
        names = fetch_variables_in_script(
            script_obj,
            restrict_local_spans=[node["span"] for node in clickable_nodes],
            only_global_scope=only_global_scope,
        )

    # Ensure all references are of allowed types
    for ref in names:
        if ref["global_type"] not in allowed_types:
            raise ValueError(f"Invalid reference type found: {ref['global_type']}")

    # Retain only definitions and not references to external definitions
    filtered_references = [
        ref
        for ref in names
        if ref["global_module"] == file_path and ref["global_span"] == ref["local_span"]
    ]

    return filtered_references


def fetch_variables_in_script(
    script_obj: jedi.Script,
    only_global_scope: bool = True,
    restrict_local_spans: Optional[List[Tuple[int, int]]] = None,
) -> List[Dict]:
    """
    Fetches variables in the script.

    Args:
        script_obj (jedi.Script): The script object.
        only_global_scope (bool): Whether to fetch only global scope variables. Defaults to True.
        restrict_local_spans (List[Tuple[int, int]], optional): List of local spans to restrict variables. Defaults to None.

    Returns:
        List[Dict]: List of global variable FQDNs.
    """
    try:
        possible_external_variables = fetch_external_names(
            script_obj, only_global_scope=only_global_scope, reference=True
        )
        possible_external_variables = [
            var
            for var in possible_external_variables
            if var.full_name is not None and var.type == "statement"
        ]
        if restrict_local_spans is not None:
            possible_external_variables = [
                var
                for var in possible_external_variables
                if check_overlap(var, restrict_local_spans)
            ]
        global_variables_fqdns = []
        for var in possible_external_variables:
            obj = format_lsp_node(var, var, fetch_goto_obj=False)
            obj.update(
                {
                    "scope": "global",
                    "parent_fqdn": None,
                    "local_type": "variable",
                    "global_type": "variable",
                }
            )
            global_variables_fqdns.append(obj)
        return global_variables_fqdns
    except Exception as e:
        raise RuntimeError(f"Error in fetch_variables_in_script: {e}") from e


def fetch_references_in_script(
    script_obj: jedi.Script,
    fetch_goto_obj: bool = False,
    only_global_scope: bool = False,
    restrict_local_spans: Optional[List[Tuple[int, int]]] = None,
) -> List[Dict]:
    """
    Takes a script object and fetches symbols in the file.
    * Can contain duplicate references
    * Can contain references which are not definitions

    Args:
        script_obj (jedi.Script): The script object.
        fetch_goto_obj (bool): Whether to fetch the goto object.
        only_global_scope (bool): Whether to fetch only global scope references.
        restrict_local_spans (List[Tuple[int, int]]): List of local spans to restrict references.

    Returns:
        List[Dict]: List of candidate references.
    """
    try:
        # Fetch external references from the script object
        possible_external_references = fetch_external_names(
            script_obj, only_global_scope=only_global_scope, reference=True
        )

        # Sort references by line and column where reference has been made
        possible_external_references = sorted(
            possible_external_references, key=lambda x: (x.line, x.column)
        )

        # Restrict references to specified local spans if provided
        if restrict_local_spans is not None:
            possible_external_references = [
                ref
                for ref in possible_external_references
                if check_overlap(ref, restrict_local_spans)
            ]

        # Initialize list for candidate references
        candidate_references = []

        # Iterate over possible external references
        for ref in possible_external_references:
            defn_goto_obj = find_dsu_parent(ref)
            # Only deal with classes and functions
            if defn_goto_obj.type not in ["class", "function"]:
                continue

            # Filter out builtin modules
            if defn_goto_obj.in_builtin_module():
                continue

            # Create a dictionary for the reference
            obj = format_lsp_node(ref, defn_goto_obj, fetch_goto_obj)

            # Add reference to candidate references list
            candidate_references.append(obj)

        # Add reference ID to each candidate reference
        candidate_references = [
            {"ref_id_in_file": i, **x} for i, x in enumerate(candidate_references)
        ]
        return candidate_references

    except Exception as e:
        raise RuntimeError(f"Error in fetch_references_in_script: {e}") from e


def fetch_relevant_elem(
    file_name: str, repo_dir: str, fqdn_use: str, expected_type: str
) -> List["EntityObj"]:
    """
    Initializes the relevant element with the appropriate class.

    Args:
        file_name (str): The name of the file.
        repo_dir (str): The directory of the repository.
        fqdn_use (str): The fully qualified domain name to use.
        expected_type (str): The expected type of the element ('class' or 'function').

    Returns:
        list[EntityObj]: A list of initialized entity objects.

    Raises:
        ValueError: If no elements are found for the given FQDN and expected type,
                    if multiple types are found for the given FQDN, or if the expected type is unsupported.
    """
    _script_obj = fetch_script_obj_for_file_in_repo(file_name, repo_dir)

    # Find all names in the file
    all_names = _script_obj.get_names(
        all_scopes=True, references=False, definitions=True
    )
    all_names = [name for name in all_names if name.full_name == fqdn_use]
    all_names = [find_dsu_parent(name) for name in all_names]
    all_names = [name for name in all_names if name is not None]
    all_names = [name for name in all_names if name.type == expected_type]

    if not all_names:
        raise ValueError(
            f"No elements found for FQDN '{fqdn_use}' with expected type '{expected_type}'"
        )

    if len(set(name.type for name in all_names)) != 1:
        raise ValueError(f"Multiple types found for FQDN '{fqdn_use}'")

    entity_class_map = {"class": ClassObj, "function": FunctionObj}

    if expected_type not in entity_class_map:
        raise ValueError(f"Unsupported expected type '{expected_type}'")

    original_contents = {}
    for name in all_names:
        file_path = os.path.normpath(os.path.abspath(name.module_path))
        with open(file_path, "r", encoding="utf-8") as fp:
            original_contents[file_path] = fp.read()

    entity_objs = [
        entity_class_map[expected_type](name, file_name, repo_dir) for name in all_names
    ]

    for file_path, original_content in original_contents.items():
        with open(file_path, "w", encoding="utf-8") as fd:
            fd.write(original_content)

    return entity_objs


class EntityObj:
    entity_type: str

    def __init__(
        self,
        fqdn_goto_elem: Name,
        file_path: str,
        repo_dir_where_used: str,
    ):
        """
        Initializes the EntityObj object.

        Args:
            fqdn_goto_elem (Name): The goto object from jedi.
            file_path (str): The path of the file.
            repo_dir_where_used (str): The repository directory where the entity is used.
        """
        if not fqdn_goto_elem.is_definition() or fqdn_goto_elem.type not in [
            "function",
            "class",
        ]:
            raise ValueError(
                "fqdn_goto_elem must be a definition of type 'function' or 'class'"
            )

        self.goto_obj = fqdn_goto_elem
        self.name = self.goto_obj.name
        self.description = self.goto_obj.description
        self.full_name = self.goto_obj.full_name
        self.global_span = (
            self.goto_obj.get_definition_start_position(),
            self.goto_obj.get_definition_end_position(),
        )
        self.repo_dir_where_used = os.path.normpath(
            os.path.abspath(repo_dir_where_used)
        )
        self.global_path = os.path.normpath(os.path.abspath(self.goto_obj.module_path))  # type: ignore
        self.definition_body, self.start_line = fetch_node_definition_body(
            self.goto_obj  # type: ignore
        )
        entity_breakup = tree_sitter_related.fetch_entity_artifacts(
            entity_body=self.definition_body,
            entity_type=self.entity_type,
        )
        self.comprehensive_str = entity_breakup["signature"]
        self.pure_docstring = entity_breakup["docstring"]


class ClassObj(EntityObj):
    def __init__(self, goto_obj: Name, file_path: str, repo_dir_where_used: str):
        """
        Initializes a ClassObj instance.

        :param goto_obj: The goto object representing the class.
        :param file_path: The path of the file where the class is defined.
        :param repo_dir_where_used: The repository directory where the class is used.
        """
        self.entity_type = "class"
        if not goto_obj.is_definition() or goto_obj.type != "class":
            raise ValueError("goto_obj must be a class definition")

        super().__init__(goto_obj, file_path, repo_dir_where_used)

        self.class_nl_summary: str = "<PENDING>"

        (
            self.class_variables,
            self.instance_variables,
            self.member_functions,
            self.property_variables,
        ) = self.fetch_class_children(self)

        self.res_fetch_class_stuff = self.fetch_class_stuff(self)

        self.res_fetch_class_prompt = {
            mode: self.fetch_class_prompt(self, mode=mode)
            for mode in ["fully_specified", "half_specified", "embedding_related"]
        }

        self.member_functions = [x.full_name for x in self.member_functions]
        del self.goto_obj

    @staticmethod
    def fetch_class_completion_req_str(_class_go_obj: Name) -> str:
        """
        Generates a string for class completion request.

        :param _class_go_obj: The class goto object.
        :return: A string for class completion request.
        """

        class_name = _class_go_obj.name
        return f"\n{class_name}."

    @staticmethod
    def fetch_obj_completion_req_str(_class_go_obj: Name) -> str:
        """
        Generates a string for object completion request.

        :param _class_go_obj: The class goto object.
        :return: A string for object completion request.
        """
        class_obj_name = "class_obj"

        # Generate the object creation and access string
        obj_creation_str = (
            f"\n\n{class_obj_name}:{_class_go_obj.name} = cal()\n{class_obj_name}."
        )
        return obj_creation_str

    @staticmethod
    def is_in_class_body(completion_obj: Completion, class_obj: "ClassObj") -> bool:
        """
        Checks if a completion object is within the body of a given class.

        Args:
            completion_obj (Completion): The completion object to check.
            class_obj (ClassObj): The class object to compare against.

        Returns:
            bool: True if the completion object is within the class body, False otherwise.
        """
        if str(completion_obj.module_path) != class_obj.global_path:
            return False

        class_start_pos = class_obj.goto_obj.get_definition_start_position()
        class_end_pos = class_obj.goto_obj.get_definition_end_position()
        var_start_pos = completion_obj.get_definition_start_position()
        var_end_pos = completion_obj.get_definition_end_position()

        return var_start_pos >= class_start_pos and var_end_pos <= class_end_pos

    @staticmethod
    def find_functions_and_variables(
        global_path: str, repo_dir: str
    ) -> Tuple[List[Completion], List[Completion]]:
        """
        Finds and returns the functions and variables in the given file.

        :param global_path: The path to the file.
        :param repo_dir: The repository directory.
        :return: A tuple containing lists of statement completions and function completions.
        """
        new_script_obj = fetch_script_obj_for_file_in_repo(global_path, repo_dir)

        with open(global_path, "r") as fd:
            all_lines = fd.readlines()

        line_id = len(all_lines)
        column_id = len(all_lines[-1]) if all_lines else 0

        try:
            initial_completions = new_script_obj.complete(line_id, column_id)
        except Exception as e:
            raise RuntimeError(
                f"Failed to get completions for file {global_path}"
            ) from e

        all_types = list({x.type for x in initial_completions})
        valid_types = ["statement", "function", "property", "class", "instance"]
        if any(y not in valid_types for y in all_types):
            raise ValueError(f"Unexpected completion types found: {all_types}")

        statement_completions = [
            x for x in initial_completions if x.type in ["statement", "property"]
        ]
        function_completions = [x for x in initial_completions if x.type == "function"]

        return statement_completions, function_completions

    @staticmethod
    def fetch_class_children(_class_obj: "ClassObj") -> Tuple:
        """
        Fetches the children of a class, including class variables, instance variables, member functions, and property variables.

        Args:
            _class_obj (ClassObj): The class object.

        Returns:
            Tuple: A tuple containing class variables, instance variables, member functions, and property variables.
        """
        obj_completion_str = _class_obj.fetch_obj_completion_req_str(
            _class_obj.goto_obj
        )
        class_completion_str = _class_obj.fetch_class_completion_req_str(
            _class_obj.goto_obj
        )

        with open(_class_obj.global_path, "r", encoding="utf-8") as fp:
            _original_file_content = fp.read()

        _class_completion_file_new_content = (
            _original_file_content + class_completion_str
        )
        _object_completion_file_new_content = (
            _original_file_content + obj_completion_str
        )

        def write_to_file(file_path: str, content: str) -> None:
            with open(file_path, "w") as fd:
                fd.write(content)

        def filter_completions(
            completions: List[Completion], condition
        ) -> List[Completion]:
            return list(filter(condition, completions))

        def sort_completions(
            completions: List[Completion], class_obj: "ClassObj"
        ) -> List[Completion]:
            return sorted(
                completions,
                key=lambda x: (not ClassObj.is_in_class_body(x, class_obj), x.line),
            )

        def get_variables(
            completions: List[Completion], fetch_node_body: bool = True
        ) -> List[Tuple[str, str, str, List[str], Optional[str]]]:
            variables = []
            for x in completions:
                name = x.name
                parent_full_name = x.parent().full_name
                parent_module_path = str(x.parent().module_path)
                inferred_names = [y.name for y in x.infer()]
                node_body = (
                    fetch_node_definition_body(x, one_liner=True)[0]
                    if fetch_node_body
                    else None
                )
                variables.append(
                    (
                        name,
                        parent_full_name,
                        parent_module_path,
                        inferred_names,
                        node_body,
                    )
                )
            return variables

        write_to_file(_class_obj.global_path, _class_completion_file_new_content)

        (
            class_statement_completions,
            class_function_completions,
        ) = _class_obj.find_functions_and_variables(
            _class_obj.global_path, _class_obj.repo_dir_where_used
        )

        class_statement_completions = filter_completions(
            class_statement_completions, lambda x: not x.in_builtin_module()
        )

        property_statement_completions = filter_completions(
            class_statement_completions,
            lambda x: x.parent().type == "class" and x.type == "property",
        )

        class_statement_completions = filter_completions(
            class_statement_completions,
            lambda x: x.parent().type == "class"
            and x.type in ["statement", "instance"],
        )

        class_statement_completions = filter_completions(
            class_statement_completions, lambda x: x.module_path is not None
        )

        class_statement_completions = sort_completions(
            class_statement_completions, _class_obj
        )

        class_variables = get_variables(class_statement_completions)

        property_variables = get_variables(
            property_statement_completions, fetch_node_body=False
        )

        # Finding instance variables and all types of methods
        write_to_file(_class_obj.global_path, _object_completion_file_new_content)

        (
            object_statement_completions,
            object_function_completions,
        ) = _class_obj.find_functions_and_variables(
            _class_obj.global_path, _class_obj.repo_dir_where_used
        )

        object_statement_completions = filter_completions(
            object_statement_completions, lambda x: not x.in_builtin_module()
        )

        object_statement_completions = filter_completions(
            object_statement_completions, lambda x: x.parent().type == "function"
        )

        object_statement_completions = sort_completions(
            object_statement_completions, _class_obj
        )

        object_variables = get_variables(
            object_statement_completions, fetch_node_body=False
        )

        # Finding member functions
        object_function_completions = filter_completions(
            object_function_completions, lambda x: not x.in_builtin_module()
        )

        object_function_completions = [
            _x.goto()[0] for _x in object_function_completions
        ]
        object_function_completions = filter_completions(
            object_function_completions,
            lambda x: x.type == "function" and x.module_path is not None,
        )

        object_function_completions = [
            FunctionObj(_x, _class_obj.global_path, _class_obj.repo_dir_where_used)
            for _x in object_function_completions
        ]

        # Restore the file with the original content
        write_to_file(_class_obj.global_path, _original_file_content)

        return (
            class_variables,
            object_variables,
            object_function_completions,
            property_variables,
        )

    @staticmethod
    def fetch_class_stuff(_class_obj: "ClassObj") -> str:
        """
        Fetches detailed information about a class object.

        Args:
            _class_obj: The class object to fetch information for.

        Returns:
            str: A formatted string containing detailed information about the class.
        """
        class_str = f"Class signature: {_class_obj.comprehensive_str}\n"

        # Determine the file where the class is defined
        _file_where_defined = _class_obj.global_path.replace(
            _class_obj.repo_dir_where_used, ""
        )
        if _file_where_defined.startswith("/"):
            _file_where_defined = _file_where_defined[1:]
        class_str += f"File where defined: {_file_where_defined}\n"
        class_str += f"Class full name: {_class_obj.full_name}\n"

        # Sort and format functions
        functions = sorted(
            _class_obj.member_functions,
            key=lambda x: (
                x.name != "__init__",
                "__" in x.name,
                x.parent_class != _class_obj.name,
            ),
        )
        functions_string_arr = [
            f"* {FunctionObj.fetch_brief_function_stuff(x)}" for x in functions
        ]
        functions_string = (
            "\n".join(functions_string_arr)
            if functions_string_arr
            else "None of them are accessible"
        )
        class_str += f"Functions accessible:\n{functions_string}\n"

        # Add variables
        variables_str = "\nClass variables accessible:\n"
        class_var_arr = [
            f"* {x[0]} | defined in class `{x[1]}`" for x in _class_obj.class_variables
        ]
        variables_str += "\n".join(class_var_arr) if class_var_arr else "None"

        variables_str += "\nInstance variables accessible:\n"
        instance_var_arr = [f"* {x[0]}" for x in _class_obj.instance_variables]
        variables_str += "\n".join(instance_var_arr) if instance_var_arr else "None"

        variables_str += "\nProperties accessible:\n"
        property_var_arr = [f"* {x[0]}" for x in _class_obj.property_variables]
        variables_str += "\n".join(property_var_arr) if property_var_arr else "None"

        class_str += variables_str

        return class_str

    @staticmethod
    def fetch_class_prompt(_class_obj: "ClassObj", mode: str) -> str:
        """
        Fetches a prompt string for a class object based on the specified mode.

        Args:
            _class_obj (ClassObj): The class object to fetch the prompt for.
            mode (str): The mode for fetching the prompt. Must be one of 'fully_specified', 'half_specified', or 'embedding_related'.

        Returns:
            str: A formatted string containing the class prompt.
        """
        assert mode in [
            "fully_specified",
            "half_specified",
            "embedding_related",
        ], "Invalid mode specified"

        class_str = f"Class signature: {_class_obj.comprehensive_str}\n"

        # Determine the file where the class is defined
        _file_where_defined = _class_obj.global_path.replace(
            _class_obj.repo_dir_where_used, ""
        )
        if _file_where_defined.startswith("/"):
            _file_where_defined = _file_where_defined[1:]
        class_str += f"File where defined: {_file_where_defined}\n"
        class_str += f"\nDocstring: {_class_obj.pure_docstring}\n"

        # Add class variables
        variables_str = "\nClass variables accessible:\n"
        class_var_arr = [
            f"* {x[-1]}"
            for x in _class_obj.class_variables
            if x[1] == _class_obj.full_name
        ]
        variables_str += "\n".join(class_var_arr) if class_var_arr else "None"
        class_str += variables_str + "\n"

        # Add functions
        class_str += "# Functions involved\n"
        functions = sorted(
            _class_obj.member_functions,
            key=lambda x: (
                x.name != "__init__",
                "__" in x.name,
                x.parent_class != _class_obj.name,
            ),
        )

        # Filter functions based on mode
        if mode == "embedding_related":
            functions = [
                x
                for x in functions
                if x.name == "__init__" or not x.name.startswith("_")
            ]
        else:
            functions = [x for x in functions if x.parent_class == _class_obj.name]

        _open_str, _close_str = (
            ("<Start of new function details>\n", "\n<End of new function details>")
            if mode != "embedding_related"
            else ("", "")
        )
        functions_string_arr = [
            _open_str + FunctionObj.fetch_function_for_prompt(x, mode) + _close_str
            for x in functions
        ]
        functions_string = (
            "\n".join(functions_string_arr) if functions_string_arr else ""
        )

        class_str += "\n" + functions_string
        return class_str


class FunctionObj(EntityObj):
    def __init__(self, goto_obj: Name, file_path: str, repo_dir_where_used: str):
        """
        Initializes a FunctionObj instance.

        Args:
            goto_obj (Name): The goto object.
            file_path (str): The path of the file where the function is defined.
            repo_dir_where_used (str): The repository directory where the function is used.
        """
        self.entity_type = "function"
        if not (goto_obj.is_definition() and goto_obj.type == "function"):
            raise ValueError("goto_obj must be a function definition")
        super().__init__(goto_obj, file_path, repo_dir_where_used)

        (
            self.parent_class,
            self.parent_class_defined_location,
        ) = self.find_parent_details(self.goto_obj)

        with open(self.global_path, "r") as file:
            source_lines = file.readlines()
        func_body_starting_line = self.goto_obj.get_definition_start_position()[0]
        self.func_decorators = self.get_decorators(
            source_lines, func_body_starting_line
        )

        self.res_fetch_function_stuff = self.fetch_function_stuff(self)
        self.res_fetch_brief_function_stuff = self.fetch_brief_function_stuff(self)
        self.res_fetch_function_for_prompt = {
            mode: self.fetch_function_for_prompt(self, mode=mode)
            for mode in ["fully_specified", "half_specified", "embedding_related"]
        }

        del self.goto_obj

    @staticmethod
    def get_decorators(
        source_lines: List[str], function_starting_line: int
    ) -> List[str]:
        """
        Gets the decorators of the function.

        :param source_lines: The source lines of the file where the function is defined.
        :param function_starting_line: The starting line of the function.
        :return: A list of decorators.
        """
        decorators = []
        lines = source_lines
        line = function_starting_line
        while line > 0:
            line -= 1
            current_line = lines[line - 1].strip()
            if current_line.startswith("@"):
                # print("Found decorator: ", current_line)
                decorators.append(current_line)
            else:
                break
        return decorators

    def __str__(self) -> str:
        """
        Returns the string representation of the FunctionObj instance.

        :return: The string representation of the FunctionObj instance.
        """
        return self.fetch_function_stuff(self)

    @staticmethod
    def fetch_function_stuff(_func: "FunctionObj") -> str:
        """
        Fetches detailed information about a function.

        :param _func: The function object.
        :return: A formatted string containing detailed information about the function.
        """
        class_ownership_str = (
            "Not a member of any class"
            if _func.parent_class is None
            else f"Member of `{_func.parent_class}` class"
        )
        func_str = (
            f"Signature: {_func.comprehensive_str} | "
            f"Defined in `{_func.global_path.replace(_func.repo_dir_where_used, '').lstrip('/')}` | "
            f"{class_ownership_str}"
        )
        if _func.func_decorators:
            func_str += f" | Decorators: {', '.join(_func.func_decorators)}"
        return func_str

    @staticmethod
    def fetch_brief_function_stuff(_func: "FunctionObj") -> str:
        """
        Fetches the brief function stuff.

        :param _func: The function object.
        :return: The brief function stuff.
        """
        class_ownership_str = (
            "Not a member of any class"
            if _func.parent_class is None
            else f"Member of `{_func.parent_class}` class"
        )
        func_str = f"Signature: {_func.comprehensive_str} | {class_ownership_str}"
        if len(_func.func_decorators) != 0:
            func_str += f" | Decorators: {', '.join(_func.func_decorators)}"
        return func_str

    @staticmethod
    def fetch_function_for_prompt(_func: "FunctionObj", mode: str) -> str:
        """
        Fetches the function details for a prompt based on the specified mode.

        Args:
            _func (FunctionObj): The function object.
            mode (str): The mode for fetching the prompt. Must be one of 'fully_specified', 'half_specified', or 'embedding_related'.

        Returns:
            str: A formatted string containing the function details for the prompt.

        Raises:
            ValueError: If an invalid mode is specified.
        """
        valid_modes = ["fully_specified", "half_specified", "embedding_related"]
        if mode not in valid_modes:
            raise ValueError(
                f"Invalid mode specified: {mode}. Must be one of {valid_modes}"
            )

        ans_str = f"Signature: {_func.comprehensive_str}"
        if _func.func_decorators:
            ans_str += f"\nDecorators: {', '.join(_func.func_decorators)}"

        if mode == "fully_specified":
            ans_str += f"\nBody: {_func.definition_body}"
        elif mode == "half_specified":
            ans_str += f"\nDocstring: {_func.pure_docstring}"

        return ans_str

    @staticmethod
    def find_parent_details(
        _function_go_obj: Name,
    ) -> Tuple[Union[str, None], Union[str, None]]:
        """
        Finds the parent details of the function.

        Args:
            _function_go_obj (Name): The function goto object.

        Returns:
            Tuple[Optional[str], Optional[str]]: A tuple containing the parent class name and the parent class defined location.
        """
        parent = _function_go_obj.parent()

        if parent is None or parent.type != "class":
            return None, None

        parent_class = parent.name
        parent_class_defined_location = str(parent.module_path)

        return parent_class, parent_class_defined_location


def fetch_node_definition_body(
    node_get_obj: Completion, file_path: Optional[str] = None, one_liner: bool = False
) -> tuple[str, str]:
    """
    Fetches the body of the node.

    :param node_get_obj: The completion object representing the node.
    :param file_path: The path to the file containing the node. If None, it will be derived from the node.
    :param one_liner: If True, the body will be returned as a single line.
    :return: The body of the node as a string.
    """
    try:
        start_line, start_col = node_get_obj.get_definition_start_position()
        end_line, end_col = node_get_obj.get_definition_end_position()

        start_line -= 1
        end_line -= 1

        if file_path is None:
            file_path = str(node_get_obj.module_path)

        with open(file_path, "r") as file:
            lines = file.readlines()

        extracted_content_lines = lines[start_line : end_line + 1]  # noqa: E203
        # extracted_content_lines[0] = extracted_content_lines[0][start_col:]
        # extracted_content_lines[-1] = extracted_content_lines[-1][:end_col]

        extracted_content = "".join(extracted_content_lines)

        if one_liner:
            extracted_content = " ".join(
                line.strip() for line in extracted_content_lines
            )

        return extracted_content, start_line

    except Exception as e:
        raise RuntimeError(f"Error in fetch_node_definition_body: {e}") from e
