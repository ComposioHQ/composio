"""
Trigger enums.
"""
from composio.client.enums.base import TRIGGERS_CACHE, TriggerData, _AnnotatedEnum, enum


@enum
class Trigger(_AnnotatedEnum[TriggerData], path=TRIGGERS_CACHE):
    """Trigger object."""

    GITHUB_COMMIT_EVENT: "Trigger"
    GITHUB_ISSUE_ADDED_EVENT: "Trigger"
    GITHUB_LABEL_ADDED_EVENT: "Trigger"
    GITHUB_PULL_REQUEST_EVENT: "Trigger"
    GOOGLEDRIVE_GOOGLE_DRIVE_CHANGES: "Trigger"
    NOTION_NEW_PAGE: "Trigger"
    SLACK_NEW_CHANNEL_CREATED: "Trigger"
    SLACK_REACTION_ADDED: "Trigger"
    SLACK_REACTION_REMOVED: "Trigger"
    SLACK_NEW_MESSAGE: "Trigger"
    SLACK_THREAD_REPLY: "Trigger"
    SLACKBOT_NEW_CHANNEL_CREATED: "Trigger"
    SLACKBOT_REACTION_ADDED: "Trigger"
    SLACKBOT_REACTION_REMOVED: "Trigger"
    SLACKBOT_NEW_MESSAGE: "Trigger"
    SLACKBOT_THREAD_REPLY: "Trigger"
    SPOTIFY_NEW_DEVICE_ADDED: "Trigger"
    SPOTIFY_NEW_SONG_ADDED_TO_PLAYLIST: "Trigger"
    SPOTIFY_NEW_PLAYLIST_CREATED_OR_DELETED: "Trigger"
    YOUTUBE_NEW_YOUTUBE_ACTIVITY: "Trigger"
    YOUTUBE_NEW_ITEM_IN_YOUTUBE_PLAYLIST: "Trigger"
    YOUTUBE_NEW_PLAYLIST_IN_YOUTUBE_CHANNEL: "Trigger"
    YOUTUBE_NEW_YOUTUBE_CHANNEL_SUBSCRIPTION: "Trigger"

    @property
    def name(self) -> str:
        """Name of the trigger."""
        return self.load().name

    @property
    def app(self) -> str:
        """Name of the app where this trigger belongs to."""
        return self.load().app
