"""
Custom markdown formatter for autodoc output
"""
import json
import re
from typing import List, Dict, Optional, Tuple

def format_signature_markdown(name: str, anchor: str, signature: List[Dict[str, str]], 
                            object_doc: str, source_link: Optional[str] = None, 
                            is_getset_desc: bool = False) -> str:
    """
    Generate markdown documentation instead of XML/Svelte components.
    
    This replaces get_signature_component() to output clean Markdown.
    """
    output = []
    
    # Extract structured data from the docstring
    doc_data = parse_structured_docstring(object_doc)
    
    # Add the main heading with an invisible anchor
    # Determine heading level based on whether it's a class or method
    if name.startswith('class '):
        class_name = name.replace('class ', '')
        heading = f'<a id="{anchor}"></a>\n\n### `{class_name}`\n'
    elif '.' in anchor and not name.startswith('class'):
        # This is a method - use h4
        heading = f'<a id="{anchor}"></a>\n\n#### `{name}`\n'
    else:
        heading = f'<a id="{anchor}"></a>\n\n### `{name}`\n'
    output.append(heading)
    
    # Add source link if available
    if source_link:
        output.append(f"[View source]({source_link})\n")
    
    # Add signature
    if signature and not is_getset_desc:
        params = []
        for param in signature:
            param_str = param["name"] + param["val"]
            params.append(param_str)
        
        # Format signature in a code block
        if name.startswith("class "):
            class_name = name.replace("class ", "")
            output.append(f"```python\n{class_name}({', '.join(params)})\n```\n")
        else:
            output.append(f"```python\n{name}({', '.join(params)})\n```\n")
    
    # Add the main description
    if doc_data['description']:
        output.append(doc_data['description'] + "\n")
    
    # Add parameters section
    if doc_data['parameters']:
        # Format parameters as a table
        table = format_parameters_table(doc_data['parameters'])
        output.append(table + "\n")
    
    # Add returns section
    if doc_data['returns']:
        # Parse the return description
        return_desc = parse_return_line(doc_data['returns'])
        if not return_desc:
            # If not in :return: format, use the raw text
            return_desc = doc_data['returns']
        
        # Format the return value
        if doc_data['return_type']:
            output.append(f"**Returns:** `{doc_data['return_type']}` — {return_desc}\n")
        else:
            output.append(f"**Returns:** {return_desc}\n")
    
    # Add raises section
    if doc_data['raises']:
        output.append("**Raises:**\n")
        output.append(doc_data['raises'] + "\n")
    
    # Add examples
    if doc_data['examples']:
        for example in doc_data['examples']:
            output.append(example + "\n")
    
    return "\n".join(output)


def parse_param_line(line: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Parse a parameter line like ":param name: description" into (name, description).
    """
    match = re.match(r':param\s+(\w+):\s*(.+)', line.strip())
    if match:
        return match.group(1), match.group(2)
    return None, None


def parse_return_line(line: str) -> Optional[str]:
    """
    Parse a return line like ":return: description" into description.
    """
    match = re.match(r':return:\s*(.+)', line.strip())
    if match:
        return match.group(1)
    return None


def format_parameters_table(params_text: str) -> str:
    """
    Convert parameter text into a markdown table.
    """
    lines = params_text.strip().split('\n')
    params = []
    
    for line in lines:
        name, desc = parse_param_line(line)
        if name and desc:
            params.append((name, desc))
    
    if not params:
        return params_text  # Return original if no params found
    
    # Build markdown table
    table = ["| Parameter | Description |", "| --- | --- |"]
    for name, desc in params:
        # Clean up the description - remove trailing period if present
        desc = desc.rstrip('.')
        table.append(f"| `{name}` | {desc} |")
    
    return "\n".join(table)


def parse_structured_docstring(docstring: str) -> Dict[str, any]:
    """
    Parse the structured docstring that contains XML tags and extract the data.
    Also handles RST-style parameter documentation.
    """
    data = {
        'description': '',
        'parameters': None,
        'returns': None,
        'return_type': None,
        'raises': None,
        'examples': []
    }
    
    # First, check for XML-wrapped sections
    # Parameters
    params_match = re.search(r'<parameters>(.*?)</parameters>', docstring, re.DOTALL)
    if params_match:
        data['parameters'] = params_match.group(1).strip()
        docstring = docstring.replace(params_match.group(0), '')
    
    # Returns
    returns_match = re.search(r'<returns>(.*?)</returns>', docstring, re.DOTALL)
    if returns_match:
        data['returns'] = returns_match.group(1).strip()
        docstring = docstring.replace(returns_match.group(0), '')
    
    # Return type
    rettype_match = re.search(r'<returntype>(.*?)</returntype>', docstring, re.DOTALL)
    if rettype_match:
        data['return_type'] = rettype_match.group(1).strip()
        docstring = docstring.replace(rettype_match.group(0), '')
    
    # Raises
    raises_match = re.search(r'<raises>(.*?)</raises>', docstring, re.DOTALL)
    if raises_match:
        data['raises'] = raises_match.group(1).strip()
        docstring = docstring.replace(raises_match.group(0), '')
    
    # Examples
    example_matches = re.findall(r'<ExampleCodeBlock[^>]*>(.*?)</ExampleCodeBlock>', docstring, re.DOTALL)
    for match in example_matches:
        data['examples'].append(match.strip())
        docstring = docstring.replace(match, '')
    
    # If no XML parameters found, look for RST-style parameters
    if not data['parameters']:
        lines = docstring.split('\n')
        param_lines = []
        return_lines = []
        description_lines = []
        in_params = False
        in_return = False
        
        for line in lines:
            if line.strip().startswith(':param '):
                in_params = True
                in_return = False
                param_lines.append(line)
            elif line.strip().startswith(':return:'):
                in_params = False
                in_return = True
                return_lines.append(line)
            elif line.strip().startswith(':raises:') or line.strip().startswith(':rtype:'):
                in_params = False
                in_return = False
                # Handle other RST fields if needed
            elif in_params and line.strip():
                param_lines.append(line)
            elif in_return and line.strip():
                return_lines.append(line)
            elif not in_params and not in_return and not line.strip().startswith(':'):
                description_lines.append(line)
        
        if param_lines:
            data['parameters'] = '\n'.join(param_lines)
        if return_lines:
            data['returns'] = '\n'.join(return_lines)
        
        # Clean up description
        data['description'] = '\n'.join(description_lines).strip()
    else:
        # The remaining docstring is the description
        data['description'] = docstring.strip()
    
    return data


def create_custom_autodoc(original_autodoc):
    """
    Wrapper that modifies autodoc to use markdown formatting.
    """
    def markdown_autodoc(object_name, package, methods=None, return_anchors=False, 
                        page_info=None, version_tag_suffix="src/"):
        # Get the original result
        result = original_autodoc(object_name, package, methods=methods, 
                                 return_anchors=return_anchors, page_info=page_info,
                                 version_tag_suffix=version_tag_suffix)
        
        if return_anchors:
            doc, anchors, errors = result
            # Convert the XML documentation to markdown
            doc = convert_xml_to_markdown(doc)
            return doc, anchors, errors
        else:
            # Convert the XML documentation to markdown
            return convert_xml_to_markdown(result)
    
    return markdown_autodoc


def convert_xml_to_markdown(xml_doc: str) -> str:
    """
    Convert the XML/Svelte component output to clean Markdown.
    """
    output_parts = []
    
    # Remove all wrapping divs
    xml_doc = re.sub(r'<div class="[^"]*">\s*', '', xml_doc, flags=re.DOTALL)
    xml_doc = re.sub(r'</div>\s*', '', xml_doc, flags=re.DOTALL)
    
    # Find all docstring components (main class + methods)
    docstring_pattern = r'<docstring>(.*?)</docstring>(.*?)(?=<docstring>|$)'
    matches = re.findall(docstring_pattern, xml_doc, re.DOTALL)
    
    if not matches:
        # No docstring components found, return as-is
        return xml_doc
    
    for docstring_content, remaining_doc in matches:
        # Parse each docstring component
        name_match = re.search(r'<name>(.*?)</name>', docstring_content)
        anchor_match = re.search(r'<anchor>(.*?)</anchor>', docstring_content)
        source_match = re.search(r'<source>(.*?)</source>', docstring_content)
        params_match = re.search(r'<parameters>(.*?)</parameters>', docstring_content)
        
        name = name_match.group(1) if name_match else ""
        anchor = anchor_match.group(1) if anchor_match else ""
        source = source_match.group(1) if source_match else None
        
        # Parse parameters
        signature = []
        if params_match:
            try:
                signature = json.loads(params_match.group(1))
            except:
                pass
        
        # Format this component
        formatted = format_signature_markdown(name, anchor, signature, remaining_doc.strip(), source)
        output_parts.append(formatted)
    
    # Join all parts with appropriate spacing
    return "\n\n".join(output_parts)