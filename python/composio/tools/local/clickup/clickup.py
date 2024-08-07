from composio.tools.local.base import Tool

from .actions.add_dependency import AddDependency
from .actions.add_guest_to_folder import AddGuestToFolder
from .actions.add_guest_to_list import AddGuestToList
from .actions.add_guest_to_task import AddGuestToTask
from .actions.add_tag_to_task import AddTagToTask
from .actions.add_tags_from_time_entries import AddTagsFromTimeEntries
from .actions.add_task_link import AddTaskLink
from .actions.add_task_to_list import AddTaskToList
from .actions.change_tag_names_from_time_entries import ChangeTagNamesFromTimeEntries
from .actions.create_a_time_entry import CreateATimeEntry
from .actions.create_chat_view_comment import CreateChatViewComment
from .actions.create_checklist import (
    CreateChecklist,
    task_checklists_create_new_checklist,
)
from .actions.create_checklist_item import CreateChecklistItem
from .actions.create_folder import CreateFolder, folders_create_new_folder
from .actions.create_folder_view import CreateFolderView
from .actions.create_folderless_list import CreateFolderlessList
from .actions.create_goal import CreateGoal
from .actions.create_key_result import CreateKeyResult
from .actions.create_list import CreateList
from .actions.create_list_comment import CreateListComment
from .actions.create_list_view import CreateListView
from .actions.create_space import CreateSpace
from .actions.create_space_tag import CreateSpaceTag
from .actions.create_space_view import CreateSpaceView
from .actions.create_task import CreateTask
from .actions.create_task_attachment import (
    CreateTaskAttachment,
    attachments_upload_file_to_task_as_attachment,
)
from .actions.create_task_comment import CreateTaskComment
from .actions.create_task_from_template import CreateTaskFromTemplate
from .actions.create_team import CreateTeam, teams_user_groups_create_team
from .actions.create_webhook import CreateWebhook
from .actions.create_workspace_everything_level_view import (
    CreateWorkspaceEverythingLevelView,
)
from .actions.delete_a_time_entry import DeleteATimeEntry
from .actions.delete_checklist import DeleteChecklist
from .actions.delete_checklist_item import DeleteChecklistItem
from .actions.delete_comment import DeleteComment
from .actions.delete_dependency import DeleteDependency
from .actions.delete_folder import DeleteFolder
from .actions.delete_goal import DeleteGoal
from .actions.delete_key_result import DeleteKeyResult
from .actions.delete_list import DeleteList
from .actions.delete_space import DeleteSpace
from .actions.delete_space_tag import DeleteSpaceTag
from .actions.delete_task import DeleteTask
from .actions.delete_task_link import DeleteTaskLink
from .actions.delete_team import DeleteTeam
from .actions.delete_time_tracked import DeleteTimeTracked
from .actions.delete_view import DeleteView
from .actions.delete_webhook import DeleteWebhook
from .actions.edit_checklist import EditChecklist
from .actions.edit_checklist_item import EditChecklistItem
from .actions.edit_guest_on_workspace import EditGuestOnWorkspace
from .actions.edit_key_result import EditKeyResult
from .actions.edit_space_tag import EditSpaceTag
from .actions.edit_time_tracked import EditTimeTracked
from .actions.edit_user_on_workspace import EditUserOnWorkspace
from .actions.get_access_token import GetAccessToken, authorization_get_access_token
from .actions.get_accessible_custom_fields import GetAccessibleCustomFields
from .actions.get_all_tags_from_time_entries import GetAllTagsFromTimeEntries
from .actions.get_authorized_teams_workspaces import (
    GetAuthorizedTeamsWorkspaces,
    authorization_get_work_space_list,
)
from .actions.get_authorized_user import (
    GetAuthorizedUser,
    authorization_view_account_details,
)
from .actions.get_bulk_tasks_time_in_status import GetBulkTasksTimeInStatus
from .actions.get_chat_view_comments import GetChatViewComments
from .actions.get_custom_roles import GetCustomRoles
from .actions.get_custom_task_types import GetCustomTaskTypes
from .actions.get_filtered_team_tasks import GetFilteredTeamTasks
from .actions.get_folder import GetFolder, folders_get_folder_content
from .actions.get_folder_views import GetFolderViews
from .actions.get_folderless_lists import GetFolderlessLists
from .actions.get_folders import GetFolders, folders_get_contents_of
from .actions.get_goal import GetGoal
from .actions.get_goals import GetGoals
from .actions.get_guest import GetGuest
from .actions.get_list import GetList
from .actions.get_list_comments import GetListComments
from .actions.get_list_members import GetListMembers, members_get_list_users
from .actions.get_list_views import GetListViews
from .actions.get_lists import GetLists, lists_get_folder_lists
from .actions.get_running_time_entry import GetRunningTimeEntry
from .actions.get_singular_time_entry import GetSingularTimeEntry
from .actions.get_space import GetSpace, spaces_get_details
from .actions.get_space_tags import GetSpaceTags
from .actions.get_space_views import GetSpaceViews, views_space_views_get
from .actions.get_spaces import GetSpaces, spaces_get_space_details
from .actions.get_task import GetTask, tasks_get_task_details
from .actions.get_task_comments import GetTaskComments
from .actions.get_task_members import GetTaskMembers
from .actions.get_task_s_time_in_status import GetTaskSTimeInStatus
from .actions.get_task_templates import GetTaskTemplates
from .actions.get_tasks import GetTasks, tasks_get_list_tasks
from .actions.get_teams import GetTeams
from .actions.get_time_entries_within_a_date_range import GetTimeEntriesWithinADateRange
from .actions.get_time_entry_history import GetTimeEntryHistory
from .actions.get_tracked_time import GetTrackedTime
from .actions.get_user import GetUser
from .actions.get_view import GetView
from .actions.get_view_tasks import GetViewTasks
from .actions.get_webhooks import GetWebhooks
from .actions.get_workspace_everything_level_views import (
    GetWorkspaceEverythingLevelViews,
    views_get_everything_level,
)
from .actions.get_workspace_plan import (
    GetWorkspacePlan,
    teams_work_spaces_get_work_space_plan,
)
from .actions.get_workspace_seats import (
    GetWorkspaceSeats,
    teams_work_spaces_get_work_space_seats,
)
from .actions.invite_guest_to_workspace import InviteGuestToWorkspace
from .actions.invite_user_to_workspace import InviteUserToWorkspace
from .actions.remove_custom_field_value import RemoveCustomFieldValue
from .actions.remove_guest_from_folder import RemoveGuestFromFolder
from .actions.remove_guest_from_list import RemoveGuestFromList
from .actions.remove_guest_from_task import RemoveGuestFromTask
from .actions.remove_guest_from_workspace import RemoveGuestFromWorkspace
from .actions.remove_tag_from_task import RemoveTagFromTask
from .actions.remove_tags_from_time_entries import RemoveTagsFromTimeEntries
from .actions.remove_task_from_list import RemoveTaskFromList
from .actions.remove_user_from_workspace import RemoveUserFromWorkspace
from .actions.set_custom_field_value import SetCustomFieldValue
from .actions.shared_hierarchy import SharedHierarchy
from .actions.start_a_time_entry import StartATimeEntry
from .actions.stop_a_time_entry import StopATimeEntry
from .actions.track_time import TrackTime
from .actions.update_a_time_entry import UpdateATimeEntry
from .actions.update_comment import UpdateComment
from .actions.update_folder import UpdateFolder
from .actions.update_goal import UpdateGoal
from .actions.update_list import UpdateList
from .actions.update_space import UpdateSpace
from .actions.update_task import UpdateTask
from .actions.update_team import UpdateTeam
from .actions.update_view import UpdateView
from .actions.update_webhook import UpdateWebhook


class ClickupLocal(Tool):
    def actions(self) -> list:
        return [
            CreateTaskAttachment,
            attachments_upload_file_to_task_as_attachment,
            GetAccessToken,
            authorization_get_access_token,
            GetAuthorizedUser,
            authorization_view_account_details,
            GetAuthorizedTeamsWorkspaces,
            authorization_get_work_space_list,
            CreateChecklist,
            task_checklists_create_new_checklist,
            EditChecklist,
            DeleteChecklist,
            CreateChecklistItem,
            EditChecklistItem,
            DeleteChecklistItem,
            GetTaskComments,
            CreateTaskComment,
            GetChatViewComments,
            CreateChatViewComment,
            GetListComments,
            CreateListComment,
            UpdateComment,
            DeleteComment,
            GetAccessibleCustomFields,
            SetCustomFieldValue,
            RemoveCustomFieldValue,
            AddDependency,
            DeleteDependency,
            AddTaskLink,
            DeleteTaskLink,
            GetFolders,
            folders_get_contents_of,
            CreateFolder,
            folders_create_new_folder,
            GetFolder,
            folders_get_folder_content,
            UpdateFolder,
            DeleteFolder,
            GetGoals,
            CreateGoal,
            GetGoal,
            UpdateGoal,
            DeleteGoal,
            CreateKeyResult,
            EditKeyResult,
            DeleteKeyResult,
            InviteGuestToWorkspace,
            GetGuest,
            EditGuestOnWorkspace,
            RemoveGuestFromWorkspace,
            AddGuestToTask,
            RemoveGuestFromTask,
            AddGuestToList,
            RemoveGuestFromList,
            AddGuestToFolder,
            RemoveGuestFromFolder,
            GetLists,
            lists_get_folder_lists,
            CreateList,
            GetFolderlessLists,
            CreateFolderlessList,
            GetList,
            UpdateList,
            DeleteList,
            AddTaskToList,
            RemoveTaskFromList,
            GetTaskMembers,
            GetListMembers,
            members_get_list_users,
            GetCustomRoles,
            SharedHierarchy,
            GetSpaces,
            spaces_get_space_details,
            CreateSpace,
            GetSpace,
            spaces_get_details,
            UpdateSpace,
            DeleteSpace,
            GetSpaceTags,
            CreateSpaceTag,
            EditSpaceTag,
            DeleteSpaceTag,
            AddTagToTask,
            RemoveTagFromTask,
            GetTasks,
            tasks_get_list_tasks,
            CreateTask,
            GetTask,
            tasks_get_task_details,
            UpdateTask,
            DeleteTask,
            GetFilteredTeamTasks,
            GetTaskSTimeInStatus,
            GetBulkTasksTimeInStatus,
            GetTaskTemplates,
            CreateTaskFromTemplate,
            GetWorkspaceSeats,
            teams_work_spaces_get_work_space_seats,
            GetWorkspacePlan,
            teams_work_spaces_get_work_space_plan,
            CreateTeam,
            teams_user_groups_create_team,
            GetCustomTaskTypes,
            UpdateTeam,
            DeleteTeam,
            GetTeams,
            GetTrackedTime,
            TrackTime,
            EditTimeTracked,
            DeleteTimeTracked,
            GetTimeEntriesWithinADateRange,
            CreateATimeEntry,
            GetSingularTimeEntry,
            DeleteATimeEntry,
            UpdateATimeEntry,
            GetTimeEntryHistory,
            GetRunningTimeEntry,
            RemoveTagsFromTimeEntries,
            GetAllTagsFromTimeEntries,
            AddTagsFromTimeEntries,
            ChangeTagNamesFromTimeEntries,
            StartATimeEntry,
            StopATimeEntry,
            InviteUserToWorkspace,
            GetUser,
            EditUserOnWorkspace,
            RemoveUserFromWorkspace,
            GetWorkspaceEverythingLevelViews,
            views_get_everything_level,
            CreateWorkspaceEverythingLevelView,
            GetSpaceViews,
            views_space_views_get,
            CreateSpaceView,
            GetFolderViews,
            CreateFolderView,
            GetListViews,
            CreateListView,
            GetView,
            UpdateView,
            DeleteView,
            GetViewTasks,
            GetWebhooks,
            CreateWebhook,
            UpdateWebhook,
            DeleteWebhook,
        ]

    def triggers(self) -> list:
        return []
