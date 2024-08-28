from pdfreader import pdfreader
from composio_openai import ComposioToolSet

composio_toolset = ComposioToolSet()

# Register the custom PDF reader tool
tools = composio_toolset.get_tools(
    actions=[
        pdfreader,  # This is the saved custom tool
    ]
)

# Example usage
pdf_file_path = "/home/jkjarvis/Downloads/AnuttamAnand_Resume.pdf"  # Replace with your PDF file path
result = composio_toolset.execute_action(action=pdfreader, params={"pdf_location":pdf_file_path})

print(result)
