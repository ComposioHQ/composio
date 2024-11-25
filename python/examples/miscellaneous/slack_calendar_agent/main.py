import os
import re
from typing import Dict, List, Tuple

from composio import Composio
from composio.client import Action
from composio.client.collections import TriggerEventData
from composio.tools import ComposioToolSet

from agents import agent

BOT_ID = os.environ["BOT_ID"]

toolset = ComposioToolSet()
listener = toolset.create_trigger_listener()

composio_client = Composio(api_key=os.getenv("COMPOSIO_API_KEY"))
entity = composio_client.get_entity("default")


def extract_user_ids(message: str, exclude_id: str = BOT_ID) -> List[str]:
    """Extracts Slack user IDs, optionally excluding the bot's ID."""
    pattern = r"<@(\w+)>"
    user_ids = re.findall(pattern, message)
    return [user_id for user_id in user_ids if user_id != exclude_id]

def fetch_user_details(user_ids: List[str]) -> Dict[str, str]:
    """Fetches user details from Slack and returns a mapping of user ID to username and email."""
    uid_to_email = {}
    for user_id in user_ids:
        response = entity.execute(
            action=Action.SLACKBOT_USERS_PROFILE_GET_PROFILE_INFO,
            params={"user": user_id},
        )
        if response['response_data']['ok']:
            user = response['response_data']['profile']
            email = user.get('email')
            if email:
                uid_to_email[user_id] = email
    return uid_to_email

def replace_user_ids_with_emails(text: str, uid_to_email: Dict[str, str]) -> str:
    """Replaces user IDs in the text with their corresponding emails."""
    pattern = re.compile(r"<@(\w+)>")
    return pattern.sub(lambda match: uid_to_email.get(match.group(1), match.group(0)), text)

def replace_emails_with_uids(text: str, uids_to_emails: Dict[str, str]) -> str:
    """Replaces all email addresses in the given text with their corresponding user IDs."""
    # Invert the dictionary to map emails to user IDs
    emails_to_uids = {email: uid for uid, email in uids_to_emails.items()}
    email_pattern = re.compile(r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b')
    return email_pattern.sub(lambda match: '<@' + emails_to_uids.get(match.group(0), match.group(0)) + '>', text)

def remove_url_brackets(text:str) -> str:
    # Regular expression to find URLs enclosed within '<' and '>'
    url_pattern = r'<(https?://[^\s]+)>'
    # Replace found URLs without '<' and '>'
    cleaned_text = re.sub(url_pattern, r'\1', text)
    return cleaned_text

def run_agent(text: str, channel: str) -> Tuple[str, int]:
    user_ids = extract_user_ids(text)
    uid_to_email = fetch_user_details(user_ids)
    text_with_emails = replace_user_ids_with_emails(text, uid_to_email)
    
    response = agent.chat(text_with_emails)
    reply_with_usernames = replace_emails_with_uids(response.response, uid_to_email)
    reply_with_formatted_url = remove_url_brackets(reply_with_usernames)
    # Post the text with usernames to the Slack channel
    entity.execute(action=Action.SLACKBOT_CHAT_ME_MESSAGE,
                   params={"text": reply_with_formatted_url, "channel": channel})
    return "Agent run completed", 200


@listener.callback(filters={"trigger_name": "slackbot_receive_message"})
def event_handler(event: TriggerEventData) -> Tuple:
    message = event.payload['event']['text']
    channel = event.payload['event']['channel']
    if BOT_ID not in message:
        return "Ignored", 204

    return run_agent(message, channel)

print("Subscription created!")
listener.listen()