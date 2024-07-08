import os
import json
from dotenv import load_dotenv
import discord
from discord.ext import commands
from composio_integration import create_google_calendar_event, update_google_calendar_event, delete_google_calendar_event

# Load environment variables from .env file
load_dotenv()

# Load configuration from config.json
with open('config.json') as config_file:
    config = json.load(config_file)

# Initialize Discord bot
intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix='!', intents=intents)

last_created_event = None  # Initialize as None or with appropriate tracking mechanism

# Discord command to create an event
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
@bot.command(name='delete_event')
async def delete_event(ctx, title):
    try:
        # Fetch the event by title to get its ID
        event_list = delete_google_calendar_event.list_events(query=title)
        events = event_list.get('items', [])

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
