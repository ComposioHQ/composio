from enum import Enum

class Tag(Enum):
    IMPORTANT = ("default", "important")
    ALL = ("default", "all")

class App(Enum):
    GOOGLEMEET = "googlemeet"
    GOOGLESHEETS = "googlesheets"
    SCHEDULER = "scheduler"
    GOOGLEDOCS = "googledocs"
    GOOGLEDRIVE = "googledrive"

class Action(Enum):
    def __init__(self, service, action, no_auth):
        self.service = service
        self.action = action
        self.no_auth = no_auth

    GOOGLEMEET_GET_MEET = ("googlemeet", "googlemeet_get_meet", False)
    GOOGLEMEET_CREATE_MEET = ("googlemeet", "googlemeet_create_meet", False)
    GOOGLEMEET_GET_CONFERENCE_RECORD_FOR_MEET = ("googlemeet", "googlemeet_get_conference_record_for_meet", False)
    GOOGLEMEET_GET_RECORDINGS_BY_CONFERENCE_RECORD_ID = ("googlemeet", "googlemeet_get_recordings_by_conference_record_id", False)
    GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID = ("googlemeet", "googlemeet_get_transcripts_by_conference_record_id", False)
    GOOGLESHEETS_CREATE_GOOGLE_SHEET1 = ("googlesheets", "googlesheets_create_google_sheet1", False)
    GOOGLESHEETS_GET_SPREADSHEET_INFO = ("googlesheets", "googlesheets_get_spreadsheet_info", False)
    GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW = ("googlesheets", "googlesheets_lookup_spreadsheet_row", False)
    GOOGLESHEETS_BATCH_UPDATE = ("googlesheets", "googlesheets_batch_update", False)
    GOOGLESHEETS_CLEAR_VALUES = ("googlesheets", "googlesheets_clear_values", False)
    GOOGLESHEETS_BATCH_GET = ("googlesheets", "googlesheets_batch_get", False)
    SCHEDULER_SCHEDULE_JOB_ACTION = ("scheduler", "scheduler_schedule_job_action", True)
    GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT = ("googledocs", "googledocs_update_existing_document", False)
    GOOGLEDOCS_GET_DOCUMENT_BY_ID = ("googledocs", "googledocs_get_document_by_id", False)
    GOOGLEDOCS_CREATE_DOCUMENT = ("googledocs", "googledocs_create_document", False)
    GOOGLEDRIVE_COPY_FILE = ("googledrive", "googledrive_copy_file", False)
    GOOGLEDRIVE_CREATE_FOLDER = ("googledrive", "googledrive_create_folder", False)
    GOOGLEDRIVE_CREATE_FILE_FROM_TEXT = ("googledrive", "googledrive_create_file_from_text", False)
    GOOGLEDRIVE_FIND_FILE = ("googledrive", "googledrive_find_file", False)
    GOOGLEDRIVE_FIND_FOLDER = ("googledrive", "googledrive_find_folder", False)
    GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE = ("googledrive", "googledrive_add_file_sharing_preference", False)
    GOOGLEDRIVE_EXPORT_FILE = ("googledrive", "googledrive_export_file", False)
    GOOGLEDRIVE_EDIT_FILE = ("googledrive", "googledrive_edit_file", False)
    GOOGLEDRIVE_DELETE_FOLDER_OR_FILE = ("googledrive", "googledrive_delete_folder_or_file", False)

class Trigger(Enum):
    def __init__(self, service, trigger):
        self.service = service
        self.trigger = trigger

