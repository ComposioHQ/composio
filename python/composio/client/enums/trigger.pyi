import typing as t
from composio.client.enums.enum import Enum, EnumGenerator
from .base import TriggerData
_TRIGGER_CACHE: t.Dict[str, 'Trigger'] = {}

class Trigger(Enum[TriggerData], metaclass=EnumGenerator):
    cache_folder = 'triggers'
    cache = _TRIGGER_CACHE
    storage = TriggerData

    def load_from_runtime(self) -> t.Optional[TriggerData]:
        ...

    def fetch_and_cache(self) -> t.Optional[TriggerData]:
        ...

    @property
    def name(self) -> str:
        ...

    @property
    def app(self) -> str:
        ...
    SALESFORCE_NEW_LEAD_TRIGGER: 'Trigger'
    PIPEDRIVE_PIPEDRIVE_NEW_NOTE_TRIGGER: 'Trigger'
    GMAIL_NEW_GMAIL_MESSAGE: 'Trigger'
    PIPEDRIVE_PIPEDRIVE_NEW_ORGANIZATION_TRIGGER: 'Trigger'
    SLACKBOT_CHANNEL_CREATED: 'Trigger'
    SLACK_RECEIVE_THREAD_REPLY: 'Trigger'
    ZENDESK_NEW_ZENDESK_TICKET_TRIGGER: 'Trigger'
    PIPEDRIVE_PIPEDRIVE_NEW_DEAL_TRIGGER: 'Trigger'
    GITHUB_LABEL_ADDED_EVENT: 'Trigger'
    TRELLO_TRELLO_NEW_BOARD_TRIGGER: 'Trigger'
    MAILCHIMP_MAILCHIMP_CAMPAIGN_TRIGGER: 'Trigger'
    MAILCHIMP_MAILCHIMP_SUBSCRIBE_TRIGGER: 'Trigger'
    ASANA_TASK_TRIGGER: 'Trigger'
    MAILCHIMP_MAILCHIMP_UNSUBSCRIBE_TRIGGER: 'Trigger'
    OUTLOOK_OUTLOOK_MESSAGE_TRIGGER: 'Trigger'
    GITHUB_PULL_REQUEST_EVENT: 'Trigger'
    SLACK_RECEIVE_MESSAGE: 'Trigger'
    LINEAR_COMMENT_EVENT_TRIGGER: 'Trigger'
    GOOGLEDRIVE_GOOGLE_DRIVE_CHANGES: 'Trigger'
    SLACKBOT_REACTION_REMOVED: 'Trigger'
    SLACKBOT_RECEIVE_THREAD_REPLY: 'Trigger'
    TRELLO_TRELLO_ARCHIVED_CARD_TRIGGER: 'Trigger'
    TRELLO_TRELLO_NEW_CARD_TRIGGER: 'Trigger'
    LINEAR_ISSUE_CREATED_TRIGGER: 'Trigger'
    GITHUB_ISSUE_ADDED_EVENT: 'Trigger'
    YOUTUBE_NEW_ITEM_IN_PLAYLIST_TRIGGER: 'Trigger'
    NOTION_PAGE_ADDED_TO_DATABASE: 'Trigger'
    SLACKBOT_RECEIVE_MESSAGE: 'Trigger'
    SALESFORCE_NEW_CONTACT_TRIGGER: 'Trigger'
    TRELLO_TRELLO_UPDATED_CARD_TRIGGER: 'Trigger'
    GITHUB_FOLLOWER_EVENT: 'Trigger'
    YOUTUBE_NEW_PLAYLIST_TRIGGER: 'Trigger'
    GITHUB_STAR_ADDED_EVENT: 'Trigger'
    MAILCHIMP_MAILCHIMP_PROFILE_UPDATE_TRIGGER: 'Trigger'
    SLACK_REACTION_ADDED: 'Trigger'
    ZENDESK_NEW_USER_TRIGGER: 'Trigger'
    ONE_DRIVE_ONE_DRIVE_ITEM_TRIGGER: 'Trigger'
    YOUTUBE_NEW_SUBSCRIPTION_TRIGGER: 'Trigger'
    YOUTUBE_NEW_ACTIVITY_TRIGGER: 'Trigger'
    SLACK_REACTION_REMOVED: 'Trigger'
    SLACKBOT_REACTION_ADDED: 'Trigger'
    GITHUB_COMMIT_EVENT: 'Trigger'
    SLACK_CHANNEL_CREATED: 'Trigger'
    LINEAR_ISSUE_UPDATED_TRIGGER: 'Trigger'