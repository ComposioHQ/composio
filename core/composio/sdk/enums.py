from enum import Enum

class Apps(Enum):
    ASANA = "asana"
    CALENDLY = "calendly"
    GITHUB = "github"
    EVENTBRITE = "eventbrite"
    TODOIST = "todoist"
    CLICKUP = "clickup"
    DROPBOX = "dropbox"
    LINEAR = "linear"
    GOOGLE_DOCS = "google-docs"
    NOTION = "notion"
    SLACK = "slack"
    GOOGLE_DRIVE = "google-drive"
    ZENDESK = "zendesk"
    TRELLO = "trello"
    MIRO = "miro"
    GOOGLE_CALENDAR = "google-calendar"
    GOOGLE_SHEETS = "google-sheets"
    DISCORD = "discord"

class Actions(Enum):
  class Asana(Enum):
    CREATE_SUBTASK = "asana_create_subtask"
    GET_SUBTASKS = "asana_get_subtasks"

  class Github(Enum):
    CREATE_ISSUE = "github_create_issue"
    GET_REPOSITORY = "github_list_github_repos"
    GET_ABOUT_ME = "github_get_about_me"

  class Dropbox(Enum):
    GET_ABOUT_ME = "dropbox_get_about_me"

  class Linear(Enum):
    CREATE_ISSUE = "linear_create_linear_issue"
    GET_PROJECTS = "linear_list_linear_projects"
    GET_TEAMS_BY_PROJECT = "linear_list_linear_teams"

  class Notion(Enum):
    CREATE_NOTION_DATABASE = "notion_create_notion_database"
    CREATE_NOTION_PAGE = "notion_create_notion_page"
    FETCH_NOTION_PAGE = "notion_fetch_notion_page"
    ARCHIVE_NOTION_PAGE = "notion_archive_notion_page"
    FETCH_NOTION_DATABASE = "notion_fetch_notion_database"
    UPDATE_NOTION_DATABASE = "notion_update_notion_database"
    CREATE_PAGE_COMMENT = "notion_create_page_comment"
    GET_ABOUT_ME = "notion_get_about_me"

  class Zendesk(Enum):
    CREATE_ZENDESK_ORGANIZATION = "zendesk_create_zendesk_organization"
    DELETE_ZENDESK_ORGANIZATION = "zendesk_delete_zendesk_organization"
    COUNT_ZENDESK_ORGANIZATIONS = "zendesk_count_zendesk_organizations"
    GET_ZENDESK_ORGANIZATION = "zendesk_get_zendesk_organization"
    GET_ZENDESK_ORGANIZATIONS = "zendesk_get_all_zendesk_organizations"
    UPDATE_ZENDESK_ORGANIZATION = "zendesk_update_zendesk_organization"
    CREATE_ZENDESK_TICKET = "zendesk_create_zendesk_ticket"
    DELETE_ZENDESK_TICKET = "zendesk_delete_zendesk_ticket"
    GET_ZENDESK_ABOUT_ME = "zendesk_get_about_me"

  class Trello(Enum):
    CREATE_TRELLO_LIST = "trello_create_trello_list"
    CREATE_TRELLO_CARD = "trello_create_trello_card"
    GET_TRELLO_BOARD_CARDS = "trello_get_trello_board_cards"
    DELETE_TRELLO_CARD = "trello_delete_trello_card"
    ADD_TRELLO_CARD_COMMENT = "trello_add_trello_card_comment"
    CREATE_TRELLO_LABEL = "trello_create_trello_label"
    UPDATE_TRELLO_BOARD = "trello_update_trello_board"
    GET_ABOUT_ME = "trello_get_about_me"

