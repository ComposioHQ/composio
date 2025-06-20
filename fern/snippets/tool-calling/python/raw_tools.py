from composio import Composio

composio = Composio()

tool = composio.tools.get_raw_composio_tool_by_slug("HACKERNEWS_GET_LATEST_POSTS")

print(tool.model_dump_json())
