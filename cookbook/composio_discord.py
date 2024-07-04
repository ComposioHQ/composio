import os
import json
from dotenv import load_dotenv
import discord
from discord.ext import commands
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
import openai
from composio_langchain import ComposioToolSet, App, Action

# Load environment variables from .env file
load_dotenv()

# Load configuration from config.json
with open('config.json') as config_file:
    config = json.load(config_file)

# Initialize Discord bot
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

# Initialize OpenAI with your API key
openai.api_key = config['COMPOSIO_API_KEY']

# Connect to Composio with specific action filters
composio_toolset = ComposioToolSet(entity_id=config['account_id'])
google_calendar_tools = composio_toolset.get_tools(apps=[App.GOOGLECALENDAR])
google_calendar_actions = composio_toolset.get_actions(actions=[
    Action.GOOGLECALENDAR_CREATE_EVENT,
    Action.GOOGLECALENDAR_DELETE_EVENT,
    Action.GOOGLECALENDAR_UPDATE_EVENT
])

# Connect to Google Calendar API
SCOPES = ['https://www.googleapis.com/auth/calendar.events']

# Function to get credentials for Google Calendar API
def get_credentials():
    creds = None
    if os.path.exists('token.json'):
        creds = Credentials.from_authorized_user_file('token.json', SCOPES)
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file('credentials.json', SCOPES)
            creds = flow.run_local_server(port=0)  # Use run_local_server instead of run_console
        with open('token.json', 'w') as token:
            token.write(creds.to_json())
    return creds

# Function to create an event in Google Calendar
async def create_google_calendar_event(event_data):
    try:
        creds = get_credentials()
        service = build('calendar', 'v3', credentials=creds)
        event = {
            'summary': event_data['summary'],
            'location': event_data.get('location', ''),
            'description': event_data.get('description', ''),
            'start': {
                'dateTime': event_data['start'],
                'timeZone': event_data.get('timeZone', 'UTC'),
            },
            'end': {
                'dateTime': event_data['end'],
                'timeZone': event_data.get('timeZone', 'UTC'),
            },
        }
        event = service.events().insert(calendarId='primary', body=event).execute()
        return event
    except Exception as e:
        print(f"Error creating event: {e}")
        return None

# Function to update an event in Google Calendar
async def update_google_calendar_event(event_id, event_data):
    try:
        creds = get_credentials()
        service = build('calendar', 'v3', credentials=creds)
        event = service.events().get(calendarId='primary', eventId=event_id).execute()

        if event:
            # Update event details
            event['summary'] = event_data.get('summary', event['summary'])
            event['location'] = event_data.get('location', event.get('location', ''))
            event['description'] = event_data.get('description', event.get('description', ''))
            event['start']['dateTime'] = event_data.get('start', event['start']['dateTime'])
            event['end']['dateTime'] = event_data.get('end', event['end']['dateTime'])

            updated_event = service.events().update(calendarId='primary', eventId=event_id, body=event).execute()
            return updated_event
        else:
            return None  # Event with event_id not found
    except Exception as e:
        print(f"Error updating event: {e}")
        return None

# Function to delete an event from Google Calendar
async def delete_google_calendar_event(event_id):
    try:
        creds = get_credentials()
        service = build('calendar', 'v3', credentials=creds)
        service.events().delete(calendarId='primary', eventId=event_id).execute()
        return True
    except Exception as e:
        print(f"Error deleting event: {e}")
        return False

last_created_event = None  # Initialize as None or with appropriate tracking mechanism

# Function to create an event (example)
@bot.command(name='create_event')
async def create_event(ctx, title, start_time, end_time, description):
    try:
        event_data = {
            'summary': title,
            'start': start_time,
            'end': end_time,
            'description': description
        }
        response = await create_google_calendar_event(event_data)

        if response:
            global last_created_event
            last_created_event = response  # Update last_created_event with the created event
            await ctx.send(f"Event '{title}' created successfully. Event Link: {response.get('htmlLink')}")
        else:
            await ctx.send(f"Failed to create event '{title}'. Check the server logs for more details.")
    except Exception as e:
        await ctx.send(f"Failed to create event '{title}'. Error: {str(e)}")

# Discord command to update an event
@bot.command(name='update_event')
async def update_event(ctx, title, start_time, end_time, *, description=''):
    try:
        global last_created_event
        if last_created_event:
            event_id = last_created_event.get('id')
            event_data = {
                'summary': title,
                'start': start_time,
                'end': end_time,
                'description': description
            }
            response = await update_google_calendar_event(event_id, event_data)

            if response:
                await ctx.send(f"Event '{title}' updated successfully.")
            else:
                await ctx.send(f"Failed to update event '{title}'. Event not found in calendar.")
        else:
            await ctx.send("No recent event found to update.")
    except Exception as e:
        await ctx.send(f"Failed to update event '{title}'. Error: {str(e)}")

# Discord command to delete an event
# Discord command to delete an event
@bot.command(name='delete_event')
async def delete_event(ctx, title):
    try:
        # Fetch the event by title to get its ID
        creds = get_credentials()
        service = build('calendar', 'v3', credentials=creds, developerKey=config['google_calendar']['api_key'])
        events_result = service.events().list(calendarId='primary', q=title).execute()
        events = events_result.get('items', [])

        if not events:
            await ctx.send(f"Event '{title}' not found in calendar.")
            return

        # Assume we delete the first occurrence of the event found
        event_id = events[0]['id']

        response = await delete_google_calendar_event(event_id)

        if response:
            await ctx.send(f"Event '{title}' deleted successfully.")
        else:
            await ctx.send(f"Failed to delete event '{title}'. Check the server logs for more details.")
    except Exception as e:
        await ctx.send(f"Failed to delete event '{title}'. Error: {str(e)}")



# Run the bot
bot.run(config['Event_BOT'])
