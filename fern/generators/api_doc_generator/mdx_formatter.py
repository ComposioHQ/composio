"""
MDX formatting utilities for API documentation generation.
"""

import typing as t


class MDX:
    """MDX Wrappers."""

    @staticmethod
    def as_title(content: str) -> str:
        """As MDX title."""
        return "---\n" f'title: "{content}"\n' "---\n"

    @staticmethod
    def as_card(content: str) -> str:
        """As MDX Card."""
        return f"<Card>\n{content}\n</Card>\n"

    @staticmethod
    def as_param(name: str, typ: str, doc: str, required: bool = False, default: t.Optional[str] = None) -> str:
        """As MDS Param field."""
        attributes = ""
        if required:
            attributes += ' required={true}'
        if default and default != "None" and default != "":
            attributes += f' default="{default}"'
        
        return (
            f'<ParamField path="{name}" type="{typ}"{attributes}>\n'
            f"{doc}\n"
            "</ParamField>\n"
        )

    @staticmethod
    def as_response(name: str, typ: str, doc: str) -> str:
        """As MDS Param field."""
        return f'<ParamField path="{name}" type="{typ}">\n' f"{doc}\n" "</ParamField>\n"
        
    @staticmethod
    def as_accordion(title: str, content: str) -> str:
        """Format content as an accordion component.
        
        :param title: The title/header for the accordion
        :param content: The content inside the accordion
        :return: Formatted accordion MDX
        """
        return f'<AccordionGroup>\n<Accordion title="{title}">\n{content}\n</Accordion>\n</AccordionGroup>\n'
    
    @staticmethod
    def as_code_block(content: str, language: str = "python") -> str:
        """Format content as a code block using backticks.
        
        :param content: The code to be displayed
        :param language: The programming language for syntax highlighting
        :return: Formatted code block MDX
        """
        return f"```{language}\n{content}\n```\n"
    
    @staticmethod
    def as_markdown_table(headers: list, rows: list) -> str:
        """Create a markdown table with headers and rows.
        
        :param headers: List of header strings
        :param rows: List of row lists where each inner list contains values for each column
        :return: Formatted markdown table
        """
        if not headers or not rows:
            return ""
        
        # Remove empty columns (all values are empty, None, or "No description provided")
        cols_to_keep = []
        for col_idx in range(len(headers)):
            col_values = [row[col_idx] if col_idx < len(row) else "" for row in rows]
            has_valid_value = any(str(val) and str(val).strip() not in ["", "None", "No description provided"] for val in col_values)
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
            row_data = [str(col) if str(col).strip() not in ["None", "No description provided"] else "" for col in row_data]
            table += "| " + " | ".join(row_data) + " |\n"
            
        return table
    
    @staticmethod
    def as_param_table(params: list) -> str:
        """Create a parameter table from param metadata.
        
        :param params: List of parameter dictionaries
        :return: Markdown table of parameters
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
        """Create a relative markdown link to another doc page.
        
        :param target_name: Display name for the link
        :param target_path: Relative path to the target doc
        :return: Markdown link
        """
        return f"[{target_name}]({target_path})" 