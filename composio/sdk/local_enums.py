from enum import Enum


class LocalApp(Enum):
    MATHEMATICAL = "mathematical"
    LOCAL_WORKSPACE = "localworkspace"
    CMD_MANAGER = "cmdmanagertool"


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
    CMD_MANAGER_GOTO_CMD = ("cmd_manager", "cmd_manager_gotocmd", True)
    CMD_MANAGER_CREATE_FILE_CMD = ("cmd_manager", "cmd_manager_createfilecmd", True)
    CMD_MANAGER_OPEN_CMD = ("cmd_manager", "cmd_manager_opencmd", True)
    CMD_MANAGER_EDIT_FILE = ("cmd_manager", "cmd_manager_editfile", True)
    CMD_MANAGER_RUN_COMMAND_ON_WORKSPACE = ("cmd_manager", "cmd_manager_runcommandonworkspace", True)
    CMD_MANAGER_SCROLL_DOWN = ("cmd_manager", "cmd_manager_scrolldown", True)
    CMD_MANAGER_SCROLL_UP = ("cmd_manager", "cmd_manager_scrollup", True)
    CMD_MANAGER_SEARCH_DIR_CMD = ("cmd_manager", "cmd_manager_searchdircmd", True)
    CMD_MANAGER_SEARCH_FILE_CMD = ("cmd_manager", "cmd_manager_searchfilecmd", True)
    CMD_MANAGER_FIND_FILE_CMD = ("cmd_manager", "cmd_manager_findfilecmd", True)
