code_search_tool = [
    {
        "type": "function",
        "function": {
            "name": "find_code_snippet",
            "description": "Search the code in a given directory for a provided query and return the relevant code snippet",
            "parameters": {
                "type": "object",
                "properties": {
                    "dir_path": {
                        "type": "string",
                        "description": "The directory path where the code is located",
                    },
                    "query": {
                        "type": "string",
                        "description": "The query to search for in the code",
                    },
                },
                "required": ["dir_path", "query"],
            },
        }
    }
]