import os


# Get the directory of the current file
current_dir = os.path.dirname(os.path.abspath(__file__))

# Path to the .scm file
c_tags_query_path = os.path.join(current_dir, "tree-sitter-c-tags.scm")

# Read the contents of the .scm file
with open(c_tags_query_path, "r", encoding="utf-8") as f:
    c_tags_query = f.read()

# Export the query
__all__ = ["c_tags_query"]
