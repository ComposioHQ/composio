from crewai_tools import tool
import requests
import dotenv
import os
from utils.calendar import get_calendar_by_connectedAccountId


dotenv.load_dotenv()
COMPOSIO_API_KEY = os.environ["COMPOSIO_API_KEY"] # Get the API key from composio

# calendar = GoogleCalendar(credentials_path='./.credentials/credentials.json')


@tool("Create Event")
def create_event(connectedAccountId: str, start_datetime: str, end_datetime: str, title: str | None = None, description: str | None = None, eventType: str | None = None, create_meeting_room: bool | None = None, guestsCanSeeOtherGuests: bool | None = None, guestsCanInviteOthers: bool | None = None, location: str | None = None, visibility: str | None = None, attendees: list | None = None, send_updates: bool | None = None, guests_can_modify: bool | None = None, calendar_id: str | None = None) -> str:
    """
        Create a new event in a Google Calendar.

        :param required connectedAccountId: The ID of the connected account.
        :param required start_datetime: The start date and time of the event in ISO 8601 format.
        :param required end_datetime: The end date and time of the event in ISO 8601 format.
        :param required title: The title of the event.
        :param optional description: The description of the event.\
        :param optional eventType: Specific type of the event. This cannot be modified after the event is created. 
        Possible values are:
        "default" - A regular event or not further specified.
        "outOfOffice" - An out-of-office event.
        "focusTime" - A focus-time event.
        "workingLocation" - A working location event.
        Currently, only "default " and "workingLocation" events can be created using the API. Extended support for other event types will be made available in later releases.
        :param optional create_meeting_room: Whether to create a google meet event. If set to true, a link to the google meet event will be created and added to the event.
        :param optional guestsCanSeeOtherGuests: Whether guests can see other guests.
        :param optional guestsCanInviteOthers: Whether guests can invite others.
        :param optional location: Geographic location of the event as free-form text.
        :param optional visibility: Visibility of the event. 
        Possible values are:
        "default" - Uses the default visibility for events on the calendar. This is the default value.
        "public" - The event is public and event details are visible to all readers of the calendar.
        "private" - The event is private and only event attendees may view event details.
        "confidential" - The event is private. This value is provided for compatibility reasons.
        :param optional attendees: List of mails of attendees for the event. This should be a list of strings (each string a email). It should not contain any thing else. Example ['email1@gmail.com','email2@icloud.com'].
        :param optional send_updates: Defaults to True. Whether to send updates to the attendees of the event.
        :param optional guests_can_modify: Whether guests can modify the event.
        :param optional calendar_id: ID of the Google Calendar. primary for interacting with primary calendar.
    """

    print("\n\nCreating event\n\n")

    url = "https://backend.composio.dev/api/v1/actions/googlecalendar_create_event/execute"

    # Build the payload
    input_data = {
        "start_datetime": start_datetime,
        "end_datetime": end_datetime,
        "summary": title
    }

    if description is not None:
        input_data["description"] = description
    if eventType is not None:
        input_data["eventType"] = eventType
    if create_meeting_room is not None:
        input_data["create_meeting_room"] = create_meeting_room
    if guestsCanSeeOtherGuests is not None:
        input_data["guestsCanSeeOtherGuests"] = guestsCanSeeOtherGuests
    if guestsCanInviteOthers is not None:
        input_data["guestsCanInviteOthers"] = guestsCanInviteOthers
    if location is not None:
        input_data["location"] = location
    if visibility is not None:
        input_data["visibility"] = visibility
    if attendees is not None:
        input_data["attendees"] = attendees
    if send_updates is not None:
        input_data["send_updates"] = send_updates
    if guests_can_modify is not None:
        input_data["guests_can_modify"] = guests_can_modify
    if calendar_id is not None:
        input_data["calendar_id"] = calendar_id

    payload = {
        "connectedAccountId": connectedAccountId,
        "appName": "googlecalendar",
        "input": input_data
    }

    headers = {
        "X-API-Key": COMPOSIO_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)
    response_json = response.json()

    if response_json["executed"]:
        return "Created the event successfully!"

    elif not response_json["executed"]:
        if int(response_json["response"]["error"]["code"]) == 401:
            return "Your account's authentication credentials is expired. Please re authenticate again by using `!authenticate` command."

        return "Something went wrong in creating the event."

    else:
        return "Failed to create event"


@tool("Find Events")
def find_events(connectedAccountId: str, query: str | None = None, max_results: int | None = None, time_max: str | None = None, time_min: str | None = None, event_types: str | None = None, calendar_id: str | None = None) -> str:
    """
        Find events in a Google Calendar.

        :param required connectedAccountId: The ID of the connected account.
        :param optional query: Search terms to find events that match these terms in the event's summary, description, location, attendee's displayName, attendee's email, organizer's displayName, organizer's email, etc if needed.
        :param optional max_results: The maximum number of events to return.
        :param optional time_max: The maximum time for the event.
        :param optional time_min: Lower bound (exclusive) for an event's end time to filter by. Must be an RFC3339 timestamp with mandatory time zone offset.
        The start of the interval for the query formatted as per RFC3339.
        :param optional event_types: Event types to return. Acceptable values are 'default', 'focusTime', 'outOfOffice', 'workingLocation'.
        :param optional calendar_id: The ID of the calendar to search in.
    """

    print("\n\nFinding events\n\n")

    url = "https://backend.composio.dev/api/v1/actions/googlecalendar_find_event/execute"

    # Build the input dictionary dynamically
    input_data = {}
    if query is not None:
        input_data["query"] = query
    if max_results is not None:
        input_data["max_results"] = max_results
    if time_max is not None:
        input_data["time_max"] = time_max
    if time_min is not None:
        input_data["time_min"] = time_min
    if event_types is not None:
        input_data["event_types"] = event_types
    if calendar_id is not None:
        input_data["calendar_id"] = calendar_id

    payload = {
        "connectedAccountId": connectedAccountId,
        "appName": "googlecalendar",
        "input": input_data
    }

    headers = {
        "X-API-Key": COMPOSIO_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)
    # print(payload, "\n\n")
    # print(response.json())
    response_json = response.json()

    if response_json["executed"]:
        events = response_json["response"]["event_data"]
        if events:
            event_list = [] # List to store the event summaries
            for event in events:
                try:
                    if event["summary"]:
                        event_list.append(f'`{event["summary"]}`')
                except KeyError:
                    pass
            print(f"Found events successfully! \nThe events are: {', '.join(event_list)}")
            return f"Found events successfully! \nThe events are: {', '.join(event_list)}"
        else:
            return "No events found"
    else:
        if int(response_json["response"]["error"]["code"]) == 401:
            return "Your account's authentication credentials is expired. Please re authenticate again by using `!authenticate` command."

        return "Something went wrong in finding the event."


@tool("Delete Event")
def delete_event(connectedAccountId: str, event_id: str, calendar_id: str | None = None) -> str:
    """
        Delete an event from a Google Calendar.
        Event ID can be obtained by using the `Get Event ID via Title` tool.

        :param required connectedAccountId: The ID of the connected account.
        :param required event_id: The ID of the event to delete.
        :param optional calendar_id: The ID of the calendar to delete the event from.
    """

    print("\n\nDeleting event\n\n")

    url = "https://backend.composio.dev/api/v1/actions/googlecalendar_delete_event/execute"

    # Build the payload
    input_data = {
        "event_id": event_id
    }
    if calendar_id is not None:
        input_data["calendar_id"] = calendar_id

    payload = {
        "connectedAccountId": connectedAccountId,
        "appName": "googlecalendar",
        "input": input_data
    }

    headers = {
        "X-API-Key": COMPOSIO_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)
    response_json = response.json()

    print(response)
    print(response_json)

    if response_json["executed"]:
        return "The event is deleted successfully! "
        
    else:
        if int(response_json["response"]["error"]["code"]) == 401:
            return "Your account's authentication credentials is expired. Please re authenticate again by using `!authenticate` command."

        return "Something went wrong in deleting the event."


@tool("Update Event")
def update_event(connectedAccountId: str, event_id: str, start_datetime: str | None = None, end_datetime: str | None = None, title: str | None = None, description: str | None = None) -> str:
    """
        Update an existing event in a Google Calendar.
        Event ID can be obtained by using the `Get Event ID via Title` tool.

        :param required connectedAccountId: The ID of the connected account.
        :param required event_id: The ID of the event to update.
        :param optional start_datetime: The new start date and time of the event in ISO 8601 format.
        :param optional end_datetime: The new end date and time of the event in ISO 8601 format.
        :param optional title: The new title of the event.
        :param optional description: The new description of the event.
    """

    print("\n\nUpdating event\n\n")

    url = "https://backend.composio.dev/api/v1/actions/googlecalendar_update_event/execute"

    # Build the payload
    input_data = {
        "event_id": event_id
    }
    if start_datetime is not None:
        input_data["start_datetime"] = start_datetime
    if end_datetime is not None:
        input_data["end_datetime"] = end_datetime
    if title is not None:
        input_data["summary"] = title
    if description is not None:
        input_data["description"] = description

    payload = {
        "connectedAccountId": connectedAccountId,
        "appName": "googlecalendar",
        "input": input_data
    }

    headers = {
        "X-API-Key": COMPOSIO_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)
    response_json = response.json()
    print(response)
    print(response_json)

    if response_json["executed"]:
        return "Event updated successfully"

    else:
        if int(response_json["response"]["error"]["code"]) == 401:
            return "Your account's authentication credentials is expired. Please re authenticate again by using `!authenticate` command."

        return "Something went wrong in updating the event."


@tool("Remove Attendee from Event")
def remove_attendee_event(connectedAccountId: str, event_id: str, attendee_email: str, calendar_id: str | None = None) -> str:
    """
        Remove an attendee from an existing event in a Google Calendar.
        Event ID can be obtained by using the `Get Event ID via Title` tool.

        :param required connectedAccountId: The ID of the connected account.
        :param required event_id: The ID of the event.
        :param required attendee_email: The email of the attendee to remove.
        :param optional calendar_id: The ID of the calendar to remove the attendee from.
    """

    print("\n\nRemoving attendee from event\n\n")

    url = "https://backend.composio.dev/api/v1/actions/googlecalendar_remove_attendee/execute"

    # Build the payload
    input_data = {
        "event_id": event_id,
        "attendee_email": attendee_email
    }

    if calendar_id is not None:
        input_data["calendar_id"] = calendar_id

    payload = {
        "connectedAccountId": connectedAccountId,
        "appName": "googlecalendar",
        "input": input_data
    }

    headers = {
        "X-API-Key": COMPOSIO_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)
    response_json = response.json()

    if response_json["executed"]:
        return "Attendee removed successfully"
    else:
        if int(response_json["response"]["error"]["code"]) == 401:
            return "Your account's authentication credentials is expired. Please re authenticate again by using `!authenticate` command."

        return "Something went wrong in removing the attendee from the event."
    

@tool("Quick Add Event")
def quick_add_event(connectionAccountId: str, calendar_id: str | None = None, text: str | None = None, send_updates: str | None = None) -> str:
    """
        Create a new event in a Google Calendar based on a simple text string like 'Appointment at Somewhere on June 3rd 10am-10:25am' You can only give title and timeslot here. No recurring meetings and no attendee can be added here. This is not a preferred endpoint. Only use this if no other endpoint is possible.

        :param required connectionAccountId: The ID of the connected account.
        :param optional calendar_id: Calendar identifier. To retrieve calendar IDs call the calendarList.list method. If you want to access the primary calendar of the currently logged in user, use the 'primary' keyword.
        :param optional text: The text describing the event to be created.
        :param optional send_updates: Guests who should receive notifications about the creation of the new event. Acceptable values are: 'all': Notifications are sent to all guests. 'externalOnly': Notifications are sent to non-Google Calendar guests only. 'none': No notifications are sent.
    """

    print("\n\nQuick adding event\n\n")

    url = "https://backend.composio.dev/api/v1/actions/googlecalendar_quick_add/execute"

    # Build the payload
    input_data = {}
    if calendar_id is not None:
        input_data["calendar_id"] = calendar_id
    if text is not None:
        input_data["text"] = text
    if send_updates is not None:
        input_data["send_updates"] = send_updates

    payload = {
        "connectedAccountId": connectionAccountId,
        "appName": "googlecalendar",
        "input": input_data
    }

    headers = {
        "X-API-Key": COMPOSIO_API_KEY,
        "Content-Type": "application/json"
    }

    response = requests.post(url, json=payload, headers=headers)
    response_json = response.json()

    if response_json["executed"]:
        return "Quick event created successfully"
    else:
        if int(response_json["response"]["error"]["code"]) == 401:
            return "Your account's authentication credentials is expired. Please re authenticate again by using `!authenticate` command."

        return "Something went wrong in creating a quick event."
    

@tool("Get Event ID via Title")
def get_event_id_by_title(connectionAccountId: str, title: str) -> str:
    """
        Get the event ID by title in a Google Calendar.

        :param required connectionAccountId: The ID of the connected account.
        :param required title: The title of the event.

        You can use this event ID to perform other actions on the event like updating, deleting, etc.
    """

    print("\n\nGetting event ID by title\n\n")

    calendar = get_calendar_by_connectedAccountId(connectionAccountId)

    events = list(calendar.get_events(
        calendar_id="primary",
        single_events=True,
        order_by="startTime",
        query=title
    ))
    
    if not events:
        return "No events found with the given title."
    
    event = events[0]
    return event.event_id


    
