import typing as t

SESSION_PRESET_DIRECT_TOOLS: t.Literal["direct_tools"] = "direct_tools"
PRELOAD_TOOLS_ALL: t.Literal["all"] = "all"

#: Header that carries a Composio user API key (``uak_...``) instead of a
#: project API key. It is the only credential default header the MCP export reads.
USER_API_KEY_HEADER = "x-user-api-key"
#: Headers that carry the explicit organization / project scope.
ORG_ID_HEADER = "x-org-id"
PROJECT_ID_HEADER = "x-project-id"
