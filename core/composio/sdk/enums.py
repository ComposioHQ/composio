from enum import Enum

class App(Enum):
    CLICKUP = "clickup"
    GOOGLE_DRIVE = "google-drive"
    GOOGLE_SHEETS = "google-sheets"
    MIRO = "miro"
    CALENDLY = "calendly"
    ZENDESK = "zendesk"
    ASANA = "asana"
    GITHUB = "github"
    DISCORD = "discord"
    TYPEFORM = "typeform"
    JIRA = "jira"
    TODOIST = "todoist"
    SLACK = "slack"
    TRELLO = "trello"
    GOOGLE_CALENDAR = "google-calendar"
    GOOGLE_DOCS = "google-docs"
    LINEAR = "linear"
    NOTION = "notion"
    DROPBOX = "dropbox"
    EVENTBRITE = "eventbrite"

class TestIntegration(Enum):
    CLICKUP = "test-clickup-connector"
    GOOGLE_DRIVE = "test-google-drive-connector"
    GOOGLE_SHEETS = "test-google-sheets-connector"
    MIRO = "test-miro-connector"
    CALENDLY = "test-calendly-connector"
    ZENDESK = "test-zendesk-connector"
    ASANA = "test-asana-connector"
    GITHUB = "test-github-connector"
    DISCORD = "test-discord-connector"
    TYPEFORM = "test-typeform-connector"
    JIRA = "test-jira-connector"
    TODOIST = "test-todoist-connector"
    SLACK = "test-slack-connector"
    TRELLO = "test-trello-connector"
    GOOGLE_CALENDAR = "test-google-calendar-connector"
    GOOGLE_DOCS = "test-google-docs-connector"
    LINEAR = "test-linear-connector"
    NOTION = "test-notion-connector"
    DROPBOX = "test-dropbox-connector"
    EVENTBRITE = "test-eventbrite-connector"

class Action(Enum):
    def __init__(self, service, action):
        self.service = service
        self.action = action

    ZENDESK_CREATE_ZENDESK_ORGANIZATION = ("zendesk", "zendesk_create_zendesk_organization")
    ZENDESK_DELETE_ZENDESK_ORGANIZATION = ("zendesk", "zendesk_delete_zendesk_organization")
    ZENDESK_COUNT_ZENDESK_ORGANIZATIONS = ("zendesk", "zendesk_count_zendesk_organizations")
    ZENDESK_GET_ZENDESK_ORGANIZATION = ("zendesk", "zendesk_get_zendesk_organization")
    ZENDESK_GET_ZENDESK_ORGANIZATIONS = ("zendesk", "zendesk_get_all_zendesk_organizations")
    ZENDESK_UPDATE_ZENDESK_ORGANIZATION = ("zendesk", "zendesk_update_zendesk_organization")
    ZENDESK_CREATE_ZENDESK_TICKET = ("zendesk", "zendesk_create_zendesk_ticket")
    ZENDESK_DELETE_ZENDESK_TICKET = ("zendesk", "zendesk_delete_zendesk_ticket")
    ZENDESK_GET_ZENDESK_ABOUT_ME = ("zendesk", "zendesk_get_about_me")
    ASANA_CREATE_SUBTASK = ("asana", "asana_create_subtask")
    ASANA_GET_SUBTASKS = ("asana", "asana_get_subtasks")
    GITHUB_CREATE_ISSUE = ("github", "github_create_issue")
    GITHUB_GET_REPOSITORY = ("github", "github_list_github_repos")
    GITHUB_STAR_REPO = ("github", "github_star_repo")
    GITHUB_GET_ABOUT_ME = ("github", "github_get_about_me")
    TYPEFORM_GET_ABOUT_ME = ("typeform", "typeform_get_about_me")
    TRELLO_CREATE_TRELLO_LIST = ("trello", "trello_create_trello_list")
    TRELLO_CREATE_TRELLO_CARD = ("trello", "trello_create_trello_card")
    TRELLO_GET_TRELLO_BOARD_CARDS = ("trello", "trello_get_trello_board_cards")
    TRELLO_DELETE_TRELLO_CARD = ("trello", "trello_delete_trello_card")
    TRELLO_ADD_TRELLO_CARD_COMMENT = ("trello", "trello_add_trello_card_comment")
    TRELLO_CREATE_TRELLO_LABEL = ("trello", "trello_create_trello_label")
    TRELLO_UPDATE_TRELLO_BOARD = ("trello", "trello_update_trello_board")
    TRELLO_GET_ABOUT_ME = ("trello", "trello_get_about_me")
    LINEAR_CREATE_ISSUE = ("linear", "linear_create_linear_issue")
    LINEAR_GET_PROJECTS = ("linear", "linear_list_linear_projects")
    LINEAR_GET_TEAMS_BY_PROJECT = ("linear", "linear_list_linear_teams")
    NOTION_CREATE_NOTION_DATABASE = ("notion", "notion_create_notion_database")
    NOTION_CREATE_NOTION_PAGE = ("notion", "notion_create_notion_page")
    NOTION_FETCH_NOTION_PAGE = ("notion", "notion_fetch_notion_page")
    NOTION_ARCHIVE_NOTION_PAGE = ("notion", "notion_archive_notion_page")
    NOTION_FETCH_NOTION_DATABASE = ("notion", "notion_fetch_notion_database")
    NOTION_UPDATE_NOTION_DATABASE = ("notion", "notion_update_notion_database")
    NOTION_CREATE_PAGE_COMMENT = ("notion", "notion_create_page_comment")
    NOTION_GET_ABOUT_ME = ("notion", "notion_get_about_me")
    DROPBOX_GET_ABOUT_ME = ("dropbox", "dropbox_get_about_me")
