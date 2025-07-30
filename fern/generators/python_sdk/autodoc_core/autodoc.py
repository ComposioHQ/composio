import importlib
import inspect
import json
import re

from .convert_md_to_mdx import convert_md_docstring_to_mdx
from .convert_rst_to_mdx import convert_rst_docstring_to_mdx, find_indent, is_empty_line
from .external import HUGGINFACE_LIBS, get_external_object_link


def find_object_in_package(object_name, package):
    """
    Find an object from its name inside a given package.

    Args:
    - **object_name** (`str`) -- The name of the object to retrieve.
    - **package** (`types.ModuleType`) -- The package to look into.
    """
    path_splits = object_name.split(".")
    if path_splits[0] == package.__name__:
        path_splits = path_splits[1:]

    module = package
    for idx, split in enumerate(path_splits):
        submodule = getattr(module, split, None)
        if submodule is None:
            try:
                # Try importing at this level
                full_module_path = f"{module.__name__}.{split}"
                importlib.import_module(full_module_path)
                submodule = getattr(module, split, None)
            except ImportError:
                return None  # Return None if the module cannot be found or imported
        module = submodule
        if module is None:
            return None

    return module


def remove_example_tags(text):
    tags = ["<exampletitle>", "</exampletitle>", "<example>", "</example>"]
    for tag in tags:
        text = text.replace(tag, "")
    return text


def get_shortest_path(obj, package):
    """
    Simplifies the path to `obj` to be the shortest possible, for instance if `obj` is in the main init of its
    package.
    """
    if isinstance(obj, property):
        # Properties have no __module__ or __name__ attributes, but their getter function does.
        obj = obj.fget

    if not hasattr(obj, "__module__") or obj.__module__ is None:
        return None
    long_path = obj.__module__
    # Sometimes methods are defined in another module from the class (flax.struct.dataclass)
    if not long_path.startswith(package.__name__):
        return None
    long_name = obj.__qualname__ if hasattr(obj, "__qualname__") else obj.__name__
    short_name = long_name.split(".")[0]
    path_splits = long_path.split(".")
    module = package
    idx = module.__name__.count(".")
    while idx + 1 < len(path_splits) and not hasattr(module, short_name):
        idx += 1
        module = getattr(module, path_splits[idx])
    return ".".join(path_splits[: idx + 1]) + "." + long_name


def get_type_name(typ):
    """
    Returns the name of the type passed, properly dealing with type annotations.
    """
    if isinstance(typ, type):
        # If it's a class, use its name.
        return getattr(typ, "__qualname__", None) or getattr(typ, "__name__", None) or str(typ)
    return str(typ)  # otherwise, trust its string representation


def format_signature(obj):
    """
    Retrieves the signature of a class, function or method.
    Returns `List(Dict(str, str))` (i.e. [{'do_lower_case', ' = True'}, ...])
    where `key` of `Dict` is f'{param_name}' & `value` of `Dict` is f': {annotation}  = {default}'
    """
    params = []
    if is_getset_descriptor(obj):
        return params
    try:
        signature = inspect.signature(obj)
    except ValueError:
        # TODO: This fails for ModelOutput. Check if this is normal.
        return ""

    for idx, param in enumerate(signature.parameters.values()):
        param_name = param.name
        if idx == 0 and param_name in ("self", "cls"):
            continue
        if param.kind == inspect._ParameterKind.VAR_POSITIONAL:
            param_name = f"*{param_name}"
        elif param.kind == inspect._ParameterKind.VAR_KEYWORD:
            param_name = f"**{param_name}"
        param_type_val = ""
        if param.annotation != inspect._empty:
            annotation = get_type_name(param.annotation)
            param_type_val += f": {annotation}"
        if param.default != inspect._empty:
            default = param.default
            default = repr(default)
            param_type_val += f" = {default}"
        params.append({"name": param_name, "val": param_type_val})
    return params


_re_parameters = re.compile(r"<parameters>(.*)</parameters>", re.DOTALL)
_re_returns = re.compile(r"<returns>(.*)</returns>", re.DOTALL)
_re_returntype = re.compile(r"<returntype>(.*)</returntype>", re.DOTALL)
_re_yields = re.compile(r"<yields>(.*)</yields>", re.DOTALL)
_re_yieldtype = re.compile(r"<yieldtype>(.*)</yieldtype>", re.DOTALL)
_re_example_tags = re.compile(r"(<exampletitle>|<example>)")
_re_parameter_group = re.compile(r"^> (.*)$", re.MULTILINE)
_re_raises = re.compile(r"<raises>(.*)</raises>", re.DOTALL)
_re_raisederrors = re.compile(r"<raisederrors>(.*)</raisederrors>", re.DOTALL)


def get_signature_component(name, anchor, signature, object_doc, source_link=None, is_getset_desc=False):
    """
    Returns the svelte `Docstring` component string.

    Args:
    - **name** (`str`) -- The name of the function or class to document.
    - **anchor** (`str`) -- The anchor name of the function or class that will be used for hash links.
    - **signature** (`List(Dict(str,str))`) -- The signature of the object.
    - **object_doc** (`str`) -- The docstring of the the object.
    - **source_link** (Union[`str`, `None`], *optional*, defaults to `None`) -- The github source link of the the object.
    - **is_getset_desc** (`bool`, *optional*, defaults to `False`) -- Whether the type of obj is `getset_descriptor`.
    """

    def inside_example_finder_closure(match, tag):
        """
        This closure find whether parameters and/or returns sections has example code block inside it
        """
        match_str = match.group(1)
        examples_inside = _re_example_tags.search(match_str)
        if examples_inside:
            example_tag = examples_inside.group(1)
            match_str = match_str.replace(example_tag, f"</{tag}>{example_tag}", 1)
            return f"<{tag}>{match_str}"
        return f"<{tag}>{match_str}</{tag}>"

    def regex_closure(object_doc, regex):
        """
        This closure matches given regex & removes the matched group from object_doc
        """
        re_match = regex.search(object_doc)
        object_doc = regex.sub("", object_doc)
        match = None
        if re_match:
            _match = re_match.group(1).strip()
            if len(_match):
                match = _match
        return object_doc, match

    object_doc = _re_returns.sub(lambda m: inside_example_finder_closure(m, "returns"), object_doc)
    object_doc = _re_parameters.sub(lambda m: inside_example_finder_closure(m, "parameters"), object_doc)

    object_doc, parameters = regex_closure(object_doc, _re_parameters)
    object_doc, return_description = regex_closure(object_doc, _re_returns)
    object_doc, returntype = regex_closure(object_doc, _re_returntype)
    object_doc, yield_description = regex_closure(object_doc, _re_yields)
    object_doc, yieldtype = regex_closure(object_doc, _re_yieldtype)
    object_doc, raise_description = regex_closure(object_doc, _re_raises)
    object_doc, raisederrors = regex_closure(object_doc, _re_raisederrors)
    object_doc = remove_example_tags(object_doc)
    object_doc = hashlink_example_codeblock(object_doc, anchor)

    svelte_str = "<docstring>"
    svelte_str += f"<name>{name}</name>"
    svelte_str += f"<anchor>{anchor}</anchor>"
    if source_link:
        svelte_str += f"<source>{source_link}</source>"
    svelte_str += f"<parameters>{json.dumps(signature)}</parameters>"
    if is_getset_desc:
        svelte_str += "<isgetsetdescriptor>"

    if parameters is not None:
        parameters_str = ""
        groups = _re_parameter_group.split(parameters)
        group_default = groups.pop(0)
        parameters_str += f"<paramsdesc>{group_default}</paramsdesc>"
        n_groups = len(groups) // 2
        for idx in range(n_groups):
            id = idx + 1
            title, group = groups[2 * idx], groups[2 * idx + 1]
            parameters_str += f"<paramsdesc{id}title>{title}</paramsdesc{id}title>"
            parameters_str += f"<paramsdesc{id}>{group}</paramsdesc{id}>"

        svelte_str += parameters_str
        svelte_str += f"<paramgroups>{n_groups}</paramgroups>"

    if returntype is not None:
        svelte_str += f"<rettype>{returntype}</rettype>"
    if return_description is not None:
        svelte_str += f"<retdesc>{return_description}</retdesc>"

    if yieldtype is not None:
        svelte_str += f"<yieldtype>{yieldtype}</yieldtype>"
    if yield_description is not None:
        svelte_str += f"<yielddesc>{yield_description}</yielddesc>"

    if raise_description is not None:
        svelte_str += f"<raises>{raise_description}</raises>"
    if raisederrors is not None:
        svelte_str += f"<raisederrors>{raisederrors}</raisederrors>"

    svelte_str += "</docstring>"

    return svelte_str + f"\n{object_doc}\n"


# Re pattern to catch :obj:`xx`, :class:`xx`, :func:`xx` or :meth:`xx`.
_re_rst_special_words = re.compile(r":(?:obj|func|class|meth):`([^`]+)`")
# Re pattern to catch things between double backquotes.
_re_double_backquotes = re.compile(r"(^|[^`])``([^`]+)``([^`]|$)")
# Re pattern to catch example introduction.
_re_rst_example = re.compile(r"^\s*Example.*::\s*$", flags=re.MULTILINE)


def is_rst_docstring(docstring):
    """
    Returns `True` if `docstring` is written in rst.
    """
    if _re_rst_special_words.search(docstring) is not None:
        return True
    if _re_double_backquotes.search(docstring) is not None:
        return True
    if _re_rst_example.search(docstring) is not None:
        return True
    return False


# Re pattern to catch example introduction & example code block.
_re_example_codeblock = re.compile(r"((.*:\s+)?^```((?!```)(.|\n))*```)", re.MULTILINE)


def hashlink_example_codeblock(object_doc, object_anchor):
    """
    Returns the svelte `ExampleCodeBlock` component string.

    Args:
    - **object_doc** (`str`) -- The docstring of the the object.
    - **anchor** (`str`) -- The anchor name of the function or class that will be used for hash links.
    """

    example_id = 0

    def add_example_svelte_blocks(match):
        """
        This closure matches `_re_example_codeblock` regex & creates `ExampleCodeBlock` svelte component
        """
        nonlocal example_id

        example_id += 1
        id_str = "" if example_id == 1 else f"-{example_id}"
        example_anchor = f"{object_anchor}.example{id_str}"
        return f'<ExampleCodeBlock anchor="{example_anchor}">\n\n{match.group(1)}\n\n</ExampleCodeBlock>'

    object_doc = _re_example_codeblock.sub(add_example_svelte_blocks, object_doc)
    return object_doc


# Re pattern to numpystyle docstring (e.g Parameter -------).
_re_numpydocstring = re.compile(r"(Parameter|Raise|Return|Yield)s?\n\s*----+\n")


def is_numpy_docstring(docstring):
    """
    Returns `True` if `docstring` is written in numpystyle.
    """
    return _re_numpydocstring.search(docstring)


def is_dataclass_autodoc(obj):
    """
    Returns boolean whether object's doc was generated automatically by `dataclass`.
    """
    if is_getset_descriptor(obj):
        return False
    try:
        signature = str(inspect.signature(obj))
    except ValueError:
        # object doesn't have signature
        return False
    doc = obj.__doc__
    doc_generated = obj.__name__ + signature
    is_generated = doc in doc_generated
    return is_generated


def is_getset_descriptor(obj):
    """
    Returns boolean whether object is `getset_descriptor`.
    """
    # used by tokenizers @property bindings
    obj_repr = str(type(obj))
    return "getset_descriptor" in obj_repr


def get_source_link(obj, page_info, version_tag_suffix="src/"):
    """
    Returns the link to the source code of an object on GitHub.
    """
    # Repo name defaults to package_name, but if provided in page_info, it will be used instead.
    repo_name = page_info.get("repo_name", page_info.get("package_name"))
    version_tag = page_info.get("version_tag", "next")
    repo_owner = page_info.get("repo_owner", "composiohq")
    base_link = f"https://github.com/{repo_owner}/{repo_name}/blob/{version_tag}/{version_tag_suffix}"
    module = obj.__module__.replace(".", "/")
    line_number = inspect.getsourcelines(obj)[1]
    source_file = inspect.getsourcefile(obj)
    if source_file.endswith("__init__.py"):
        return f"{base_link}{module}/__init__.py#L{line_number}"
    return f"{base_link}{module}.py#L{line_number}"


def get_source_path(object_name, package):
    """
    Find a path to file in which given object was defined.

    Args:
    - object_name (`str`): The name of the object to retrieve.
    - package (`types.ModuleType`): The package to look into.
    """
    obj = obj = find_object_in_package(object_name=object_name, package=package)
    obj_path = inspect.getfile(obj)
    return obj_path


def document_object(object_name, package, page_info, full_name=True, anchor_name=None, version_tag_suffix="src/"):
    """
    Writes the document of a function, class or method.

    Args:
        object_name (`str`): The name of the object to document.
        package (`types.ModuleType`): The package of the object.
        full_name (`bool`, *optional*, defaults to `True`): Whether to write the full name of the object or not.
        anchor_name (`str`, *optional*): The name to give to the anchor for this object.
        version_tag_suffix (`str`, *optional*, defaults to `"src/"`):
            Suffix to add after the version tag (e.g. 1.3.0 or main) in the documentation links.
            For example, the default `"src/"` suffix will result in a base link as `https://github.com/{repo_owner}/{package_name}/blob/{version_tag}/src/`.
            For example, `version_tag_suffix=""` will result in a base link as `https://github.com/{repo_owner}/{package_name}/blob/{version_tag}/`.
    """
    if page_info is None:
        page_info = {}
    if "package_name" not in page_info:
        page_info["package_name"] = package.__name__
    obj = find_object_in_package(object_name=object_name, package=package)
    if obj is None:
        raise ValueError(
            f"Unable to find {object_name} in {package.__name__}. Make sure the path to that object is correct."
        )
    if isinstance(obj, property):
        # Propreties have no __module__ or __name__ attributes, but their getter function does.
        obj = obj.fget

    if anchor_name is None:
        anchor_name = get_shortest_path(obj, package)
    if full_name and anchor_name is not None:
        name = anchor_name
    else:
        name = obj.__name__

    prefix = "class " if isinstance(obj, type) else ""
    object_doc = ""
    signature_name = prefix + name
    signature = format_signature(obj)
    check = None
    if getattr(obj, "__doc__", None) is not None and len(obj.__doc__) > 0:
        object_doc = obj.__doc__
        if is_dataclass_autodoc(obj):
            object_doc = ""
        elif is_rst_docstring(object_doc):
            object_doc = convert_rst_docstring_to_mdx(obj.__doc__, page_info)
        else:
            check = quality_check_docstring(object_doc, object_name=object_name)
            object_doc = convert_md_docstring_to_mdx(obj.__doc__, page_info)

    try:
        source_link = get_source_link(obj, page_info, version_tag_suffix)
    except (AttributeError, OSError, TypeError):
        # tokenizers obj do NOT have `__module__` attribute & can NOT be used with inspect.getsourcelines
        source_link = None
    is_getset_desc = is_getset_descriptor(obj)
    component = get_signature_component(
        signature_name, anchor_name, signature, object_doc, source_link, is_getset_desc
    )
    documentation = "\n" + component + "\n"
    return documentation, check


def find_documented_methods(clas):
    """
    Find all the public methods of a given class that have a nonempty documentation, filtering the methods documented
    the exact same way in a superclass.
    """
    public_attrs = {a: getattr(clas, a) for a in dir(clas) if not a.startswith("_")}
    public_methods = {a: m for a, m in public_attrs.items() if callable(m) and not isinstance(m, type)}
    documented_methods = {
        a: m for a, m in public_methods.items() if getattr(m, "__doc__", None) is not None and len(m.__doc__) > 0
    }

    superclasses = clas.mro()[1:]
    for superclass in superclasses:
        superclass_methods = {a: getattr(superclass, a) for a in documented_methods.keys() if hasattr(superclass, a)}
        documented_methods = {
            a: m
            for a, m in documented_methods.items()
            if (
                a not in superclass_methods
                or getattr(superclass_methods[a], "__doc__", None) is None
                or m.__doc__ != superclass_methods[a].__doc__
            )
        }
    return list(documented_methods.keys())


docstring_css_classes = "docstring border-l-2 border-t-2 pl-4 pt-3.5 border-gray-100 rounded-tl-xl mb-6 mt-8"


def autodoc(object_name, package, methods=None, return_anchors=False, page_info=None, version_tag_suffix="python/"):
    """
    Generates the documentation of an object, with a potential filtering on the methods for a class.

    Args:
        object_name (`str`): The name of the function or class to document.
        package (`types.ModuleType`): The package of the object.
        methods (`List[str]`, *optional*):
            A list of methods to document if `obj` is a class. If nothing is passed, all public methods with a new
            docstring compared to the superclasses are documented. If a list of methods is passed and ou want to add
            all those methods, the key "all" will add them.
        return_anchors (`bool`, *optional*, defaults to `False`):
            Whether or not to return the list of anchors generated.
        page_info (`Dict[str, str]`, *optional*): Some information about the page.
        version_tag_suffix (`str`, *optional*, defaults to `"python/"`):
            Suffix to add after the version tag (e.g. 1.3.0 or main) in the documentation links.
            For example, the default `"src/"` suffix will result in a base link as `https://github.com/{repo_owner}/{package_name}/blob/{version_tag}/src/`.
            For example, `version_tag_suffix=""` will result in a base link as `https://github.com/{repo_owner}/{package_name}/blob/{version_tag}/`.
    """
    if page_info is None:
        page_info = {}
    if "package_name" not in page_info:
        page_info["package_name"] = package.__name__

    errors = []
    obj = find_object_in_package(object_name=object_name, package=package)
    documentation, check = document_object(
        object_name=object_name, package=package, page_info=page_info, version_tag_suffix=version_tag_suffix
    )
    if check is not None:
        errors.append(check)

    if return_anchors:
        anchors = [get_shortest_path(obj, package)]
    if isinstance(obj, type):
        documentation, check = document_object(
            object_name=object_name, package=package, page_info=page_info, version_tag_suffix=version_tag_suffix
        )
        if check is not None:
            errors.append(check)
        if methods is None:
            methods = find_documented_methods(obj)
        elif "all" in methods:
            methods.remove("all")
            methods_to_add = find_documented_methods(obj)
            methods.extend([m for m in methods_to_add if m not in methods])
        elif "none" in methods:
            methods = []
        for method in methods:
            anchor_name = f"{anchors[0]}.{method}"
            method_doc, check = document_object(
                object_name=f"{object_name}.{method}",
                package=package,
                page_info=page_info,
                full_name=False,
                anchor_name=anchor_name,
                version_tag_suffix=version_tag_suffix,
            )
            if check is not None:
                errors.append(check)
            documentation += f'\n<div class="{docstring_css_classes}">\n\n' + method_doc + "</div>"
            if return_anchors:
                # The anchor name of the method might be different from its
                method = find_object_in_package(f"{anchors[0]}.{method}", package=package)
                method_name = get_shortest_path(method, package=package)
                if anchor_name == method_name or method_name is None:
                    anchors.append(anchor_name)
                else:
                    anchors.append((anchor_name, method_name))
    documentation = f'<div class="{docstring_css_classes}">\n\n' + documentation + "</div>\n"

    return (documentation, anchors, errors) if return_anchors else documentation


def resolve_links_in_text(text, package, mapping, page_info):
    """
    Resolve links of the form [`SomeClass`] to the link in the documentation to `SomeClass`.

    Args:
        text (`str`): The text in which to convert the links.
        package (`types.ModuleType`): The package in which to search objects for.
        mapping (`Dict[str, str]`): The map from anchor names of objects to their page in the documentation.
        page_info (`Dict[str, str]`): Some information about the page.
    """
    package_name = page_info.get("package_name", package.__name__)
    version = page_info.get("version", "main")
    language = page_info.get("language", "en")

    prefix = f"/docs/{package_name}/{version}/{language}/"

    def _resolve_link(search):
        object_or_param_name, last_char = search.groups()
        # Deal with external libs first.
        lib_name = object_or_param_name.split(".")[0]
        if lib_name.startswith("~"):
            lib_name = lib_name[1:]
        if lib_name in HUGGINFACE_LIBS and lib_name != package_name:
            link = get_external_object_link(object_or_param_name, page_info)
            return f"{link}{last_char}"
        object_name, param_name = None, None
        # If `#` is in the name, assume it's a link to the function/method parameter.
        if "#" in object_or_param_name:
            object_name_for_param = object_or_param_name.split("#", 1)[0]
            # Strip preceding `~` if it's there.
            object_name_for_param = (
                object_name_for_param[1:] if object_name_for_param.startswith("~") else object_name_for_param
            )
            obj = find_object_in_package(object_name_for_param, package)
            param_name = object_or_param_name.split("#", 1)[-1]
        # If the name begins with `~`, we shortcut to the last part.
        elif object_or_param_name.startswith("~"):
            obj = find_object_in_package(object_or_param_name[1:], package)
            object_name = object_or_param_name.split(".")[-1]
        else:
            obj = find_object_in_package(object_or_param_name, package)
            object_name = object_or_param_name
        # Object not found, return the original link text.
        if obj is None:
            return f"`{object_or_param_name}`{last_char}"

        link_name = object_name if param_name is None else param_name

        # If the link points to an object and the object is not a class, we add ()
        if param_name is None and not isinstance(obj, (type, property)):
            link_name = f"{link_name}()"

        # Link to the anchor
        anchor = get_shortest_path(obj, package)
        if anchor not in mapping:
            return f"`{link_name}`{last_char}"
        page = f"{prefix}{mapping[anchor]}"
        if param_name:
            anchor = f"{anchor}.{param_name}"
        if "#" in page:
            return f"[{link_name}]({page}){last_char}"
        else:
            return f"[{link_name}]({page}#{anchor}){last_char}"

    return re.sub(r"\[`([^`]+)`\]([^\(])", _resolve_link, text)


# Re pattern that catches the start of a block code with potential indent.
_re_start_code_block = re.compile(r"^\s*```.*$", flags=re.MULTILINE)
# Re pattern that catches return blocks of the form `Return:`.
_re_returns_block = re.compile(r"^\s*Returns?:\s*$")


def quality_check_docstring(docstring, object_name=None):
    """
    Check if a docstring is not going to generate a common error on moon-landing, by asserting it does not have:

    - an empty Return block
    - two (or more) Return blocks
    - a code sample not properly closed.

    This function only returns an error message and does not raise an exception, as we will raise one single exception
    with all the problems at the end.

    Args:
        docstring (`str`): The docstring to check.
        obejct_name (`str`, *optional*): The name of the object being documented.
            Will be added to the error message if passed.

    Returns:
        Optional `str`: Returns `None` if the docstring is correct and an error message otherwise.
    """

    lines = docstring.split("\n")
    in_code = False
    code_indent = 0
    return_blocks = 0
    error_message = ""

    for idx, line in enumerate(lines):
        if not in_code and _re_start_code_block.search(line) is not None:
            in_code = True
            code_indent = find_indent(line)
        elif in_code and line.rstrip() == " " * code_indent + "```":
            in_code = False
        elif _re_returns_block.search(line) is not None:
            next_line_idx = idx + 1
            while next_line_idx < len(lines) and is_empty_line(lines[next_line_idx]):
                next_line_idx += 1
            if next_line_idx >= len(lines) or find_indent(lines[next_line_idx]) <= find_indent(line):
                error_message += "- The return block is empty.\n"
            else:
                return_blocks += 1

    if in_code:
        error_message += "- A code block has been opened but is not closed.\n"
    if return_blocks >= 2:
        error_message += f"- There are {return_blocks} Returns block. Only one max is supported.\n"

    if len(error_message) == 0:
        return

    if object_name is not None:
        error_message = (
            f"The docstring of {object_name} comports the following issue(s) and needs fixing:\n" + error_message
        )

    return error_message
