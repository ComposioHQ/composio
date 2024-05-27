from enum import Enum


class LocalApp(Enum):
    MATHEMATICAL = "mathematical"
    LOCAL_WORKSPACE = "localworkspace"
    CMD_MANAGER = "cmdmanagertool"
    HISTORY_KEEPER = "historykeeper"


class LocalAction(Enum):
    def __init__(self, service, action, no_auth):
        self.service = service
        self.action = action
        self.no_auth = no_auth

    MATHEMATICAL_CLACULATOR = (
        "mathematical",
        "mathematical_calculator",
        False,
    )
    LOCAL_WORKSPACE_CREATE_WORKSPACE_ACTION = ("localworkspace", "localworkspace_createworkspaceaction", True)
    LOCAL_WORKSPACE_WORKSPACE_STATUS = ("localworkspace", "localworkspace_workspacestatus", True)
    LOCAL_WORKSPACE_SETUP_WORKSPACE = ("localworkspace", "localworkspace_setupworkspace", True)
    LOCAL_WORKSPACE_SETUP_GITHUB_REPO = ("localworkspace", "localworkspace_setupgithubrepo", True)
    CMD_MANAGER_TOOL_GOTO_CMD = ("cmdmanagertool", "cmdmanagertool_gotocmd", True)
    CMD_MANAGER_TOOL_CREATE_FILE_CMD = ("cmdmanagertool", "cmdmanagertool_createfilecmd", True)
    CMD_MANAGER_TOOL_OPEN_FILE = ("cmdmanagertool", "cmdmanagertool_openfile", True)
    CMD_MANAGER_TOOL_EDIT_FILE = ("cmdmanagertool", "cmdmanagertool_editfile", True)
    CMD_MANAGER_TOOL_RUN_COMMAND_ON_WORKSPACE = ("cmdmanagertool", "cmdmanagertool_runcommandonworkspace", True)
    CMD_MANAGER_TOOL_SCROLL_DOWN = ("cmdmanagertool", "cmdmanagertool_scrolldown", True)
    CMD_MANAGER_TOOL_SCROLL_UP = ("cmdmanagertool", "cmdmanagertool_scrollup", True)
    CMD_MANAGER_TOOL_SEARCH_DIR_CMD = ("cmdmanagertool", "cmdmanagertool_searchdircmd", True)
    CMD_MANAGER_TOOL_SEARCH_FILE_CMD = ("cmdmanagertool", "cmdmanagertool_searchfilecmd", True)
    CMD_MANAGER_TOOL_FIND_FILE_CMD = ("cmdmanagertool", "cmdmanagertool_findfilecmd", True)
    HISTORY_KEEPER_GET_HISTORY = ("historykeeper", "historykeeper_getworkspacehistory", True)

