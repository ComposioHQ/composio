"""
MDX Formatter for Composio tool documentation.

This module provides utilities for formatting MDX content for Composio tool documentation.
"""

import re
import typing as t
from dataclasses import dataclass


class MDX:
    """
    Utilities for generating MDX components and formatting.
    
    This class provides static methods to format content as different MDX components
    used in documentation, including frontmatter, accordions, parameter fields, etc.
    """

    @staticmethod
    def as_frontmatter(app_name: str | None = None) -> str:
        """
        Generate MDX frontmatter.
        
        Args:
            app_name: The name of the application
            
        Returns:
            Formatted MDX frontmatter string
        """
        frontmatter = f'title: "{app_name}"'
        if app_name is not None:
            frontmatter += f'\nsubtitle: "Learn how to use {app_name} with Composio"'
        return "---\n" + frontmatter + "\n---\n"

    @staticmethod
    def as_card(content: str) -> str:
        """
        Format content as a Card component.
        
        Args:
            content: The content to be wrapped in a Card
            
        Returns:
            Formatted MDX Card string
        """
        return f"<Card>\n{content}\n</Card>\n"

    @staticmethod
    def escape_mdx_content(content: str) -> str:
        """
        Escape content for safe use inside MDX components.
        
        Args:
            content: The content to escape
            
        Returns:
            Escaped content safe for MDX components
        """
        if not content:
            return ""
            
        # Convert to string if it's not already
        content = str(content)
        
        # Handle very complex patterns that break MDX parsing
        # Example: `value`: `slug`
        if re.search(r'`[^`]+`\s*:\s*`[^`]+`', content):
            # Replace patterns like `key`: `value` with "key": "value"
            content = re.sub(r'`([^`]+)`\s*:\s*`([^`]+)`', r'"\1": "\2"', content)
        
        # Escape comparison operators with numbers (which cause common MDX parsing errors)
        # Handle both with and without spaces
        content = re.sub(r'<(\d+)', r'less than \1', content)  # <4mb -> less than 4mb
        content = re.sub(r'>(\d+)', r'greater than \1', content)  # >10 -> greater than 10
        content = re.sub(r'<=(\d+)', r'less than or equal to \1', content)
        content = re.sub(r'>=(\d+)', r'greater than or equal to \1', content)
        
        # Replace standalone < and > characters with HTML entities 
        content = re.sub(r'(?<!\w)<(?!\w)', '&lt;', content)
        content = re.sub(r'(?<!\w)>(?!\w)', '&gt;', content)
        
        # Fix pipes in tables (these break MDX table formatting)
        content = content.replace("|", "\\|")
        
        # Replace variable placeholders like {journey id} with [journey id]
        # These often cause MDX parsing issues
        content = re.sub(r'\{([^{}]*?)\}', r'[\1]', content)
        
        # Handle JSON-like examples that contain quotes and objects
        if '{' in content and '}' in content:
            # First, escape all quotes in JSON examples with double quotes
            # Use double quotes instead of backticks for nested JSON
            content = re.sub(r"(\{[^}]*)'([^']*)'([^}]*\})", r'\1"\2"\3', content)
            content = re.sub(r'(\{[^}]*)"([^"]*)"([^}]*\})', r'\1"\2"\3', content)
            
            # If we still have {, } in content, wrap the whole thing in quotes
            content = re.sub(r'(\{[^{}]*?\})', r'"\1"', content)
        
        # Handle special case of "repo | slug" pattern that causes errors
        content = re.sub(r'\|\s*slug', r'or slug', content)
        
        # Escape special format characters used in MDX
        content = content.replace("$", "\\$")
        content = content.replace("==", "\\=\\=")
        
        # Handle HTML-like tags that might appear in documentation
        content = re.sub(r'<([a-zA-Z][^>]*?)>', r'&lt;\1&gt;', content)
        
        # Fix malformed HTML tags
        content = re.sub(r'<ul\s*-', r'<ul><li>', content)
        
        # Fix nested backticks that may be causing issues
        if content.count('`') > 2:
            # Replace complex nested backticks with quoted text
            content = re.sub(r'`([^`]*)`([^`]*)`([^`]*)`', r'"\1\2\3"', content)
        
        return content
    
    @staticmethod
    def as_param(
        name: str, 
        typ: str, 
        doc: str = "", 
        required: bool = False, 
        default: t.Optional[str] = None
    ) -> str:
        """
        Format a parameter field.
        
        Args:
            name: Parameter name
            typ: Parameter type
            doc: Parameter description
            required: Whether the parameter is required
            default: Default value for the parameter
            
        Returns:
            Formatted ParamField component string
        """
        # Make sure name and type are properly escaped
        safe_name = name.replace('"', '\\"')
        safe_type = typ.replace('"', '\\"')
        
        # Handle required and default attributes
        attributes = ""
        if required:
            attributes += ' required={true}'
        if default and default != "None" and default != "":
            safe_default = str(default).replace('"', '\\"')
            attributes += f' default="{safe_default}"'

        return (
            f'<ParamField path="{safe_name}" type="{safe_type}"{attributes}>\n'
            "</ParamField>\n"
        )

    @staticmethod
    def as_accordion(title: str, content: str) -> str:
        """
        Format content as an accordion component.
        
        Args:
            title: The title/header for the accordion
            content: The content inside the accordion
            
        Returns:
            Formatted accordion MDX string
        """
        # Escape characters in title that might break MDX
        # First, escape quotes to avoid breaking the title attribute
        safe_title = title.replace('"', '\\"')
        
        # Handle comparison operators that caused issues in the check
        # For example: files <384kb or limited to <4mb
        safe_title = re.sub(r'<(\d+)', r'less than \1', safe_title)
        safe_title = re.sub(r'>(\d+)', r'greater than \1', safe_title)
        safe_title = re.sub(r'<=(\d+)', r'less than or equal to \1', safe_title)
        safe_title = re.sub(r'>=(\d+)', r'greater than or equal to \1', safe_title)
        
        # Escape standalone < and > characters
        safe_title = re.sub(r'(?<!\w)<(?!\w)', '&lt;', safe_title)
        safe_title = re.sub(r'(?<!\w)>(?!\w)', '&gt;', safe_title)
        
        return f'<Accordion title="{safe_title}">\n{content}\n</Accordion>\n'

    @staticmethod
    def as_accordion_group(content: str) -> str:
        """
        Format content as an accordion group.
        
        Args:
            content: The content inside the accordion group
            
        Returns:
            Formatted accordion group MDX string
        """
        return f'<AccordionGroup>\n{content}\n</AccordionGroup>\n'

    @staticmethod
    def as_code_block(content: str, language: str = "python") -> str:
        """
        Format content as a code block using backticks.
        
        Args:
            content: The code to be displayed
            language: The programming language for syntax highlighting
            
        Returns:
            Formatted code block MDX string
        """
        return f"```{language} wordWrap\n{content}\n```\n"
    
    @staticmethod
    def as_markdown_table(headers: list, rows: list) -> str:
        """
        Create a markdown table with headers and rows.
        
        Args:
            headers: List of header strings
            rows: List of row lists where each inner list contains values for each column
            
        Returns:
            Formatted markdown table string
        """
        if not headers or not rows:
            return ""
        
        # Remove empty columns (all values are empty, None, or "No description provided")
        cols_to_keep = []
        for col_idx in range(len(headers)):
            col_values = [row[col_idx] if col_idx < len(row) else "" for row in rows]
            has_valid_value = any(
                str(val) and str(val).strip() not in ["", "None", "No description provided"] 
                for val in col_values
            )
            if has_valid_value:
                cols_to_keep.append(col_idx)
        
        # If no valid columns, return empty string
        if not cols_to_keep:
            return ""
        
        # Create new headers and rows with only the columns to keep
        filtered_headers = [headers[i] for i in cols_to_keep]
        filtered_rows = []
        for row in rows:
            filtered_row = []
            for i in cols_to_keep:
                val = row[i] if i < len(row) else ""
                filtered_row.append(val)
            filtered_rows.append(filtered_row)
        
        # Generate the table
        table = "| " + " | ".join(filtered_headers) + " |\n"
        table += "| " + " | ".join(["---" for _ in filtered_headers]) + " |\n"
        
        for row in filtered_rows:
            # Ensure row has same number of columns as headers
            row_data = row + [""] * (len(filtered_headers) - len(row))
            # Replace None and "No description provided" with empty strings
            row_data = [
                str(col) if str(col).strip() not in ["None", "No description provided"] else "" 
                for col in row_data
            ]
            table += "| " + " | ".join(row_data) + " |\n"
            
        return table
    
    @staticmethod
    def as_param_table(params: list) -> str:
        """
        Create a parameter table from param metadata.
        
        Args:
            params: List of parameter dictionaries
            
        Returns:
            Markdown table of parameters
        """
        if not params:
            return ""
            
        headers = ["Name", "Type", "Description", "Default"]
        rows = []
        
        for param in params:
            # Check which fields exist and add them
            description = param.get('description', '')
            default = param.get('default', '')
            
            # Skip description if it's "No description provided"
            if description == "No description provided":
                description = ''
                
            # Skip default if it's "None"
            if default == "None":
                default = ''
                
            row = [
                f"`{param['name']}`",
                f"`{param['type']}`",
                description,
                default
            ]
            rows.append(row)
            
        return MDX.as_markdown_table(headers, rows)
    
    @staticmethod
    def as_relative_link(target_name: str, target_path: str) -> str:
        """
        Create a relative markdown link to another doc page.
        
        Args:
            target_name: Display name for the link
            target_path: Relative path to the target doc
            
        Returns:
            Markdown link string
        """
        return f"[{target_name}]({target_path})"


@dataclass
class DocumentSection:
    """Base class for document sections."""
    
    def to_mdx(self) -> str:
        """Convert section to MDX text."""
        raise NotImplementedError("Subclasses must implement to_mdx()")