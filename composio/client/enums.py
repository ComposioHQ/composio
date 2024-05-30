"""
Helper Enum classes.

- TODO: Replace Enums with something lightweight
"""

from enum import Enum


class Tag(tuple, Enum):
    """App tags."""

    @property
    def name(self) -> str:
        """Returns trigger name."""
        return self.value[0]

    IMPORTANT = ("default", "important")
    ASANA_BATCH_API = ("asana", "Batch API")
    ASANA_GOAL_RELATIONSHIPS = ("asana", "Goal relationships")
    ASANA_USER_TASK_LISTS = ("asana", "User task lists")
    ASANA_STORIES = ("asana", "Stories")
    ASANA_CUSTOM_FIELDS = ("asana", "Custom fields")
    ASANA_MEMBERSHIPS = ("asana", "Memberships")
    ASANA_JOBS = ("asana", "Jobs")
    ASANA_TIME_TRACKING_ENTRIES = ("asana", "Time tracking entries")
    ASANA_ALLOCATIONS = ("asana", "Allocations")
    ASANA_RULES = ("asana", "Rules")
    ASANA_ATTACHMENTS = ("asana", "Attachments")
    ASANA_GOALS = ("asana", "Goals")
    ASANA_CUSTOM_FIELD_SETTINGS = ("asana", "Custom field settings")
    ASANA_TEAM_MEMBERSHIPS = ("asana", "Team memberships")
    ASANA_ORGANIZATION_EXPORTS = ("asana", "Organization exports")
    ASANA_PROJECTS = ("asana", "Projects")
    ASANA_PORTFOLIOS = ("asana", "Portfolios")
    ASANA_AUDIT_LOG_API = ("asana", "Audit log API")
    ASANA_TIME_PERIODS = ("asana", "Time periods")
    ASANA_EVENTS = ("asana", "Events")
    ASANA_TASK_TEMPLATES = ("asana", "Task templates")
    ASANA_TYPEAHEAD = ("asana", "Typeahead")
    ASANA_WORKSPACE_MEMBERSHIPS = ("asana", "Workspace memberships")
    ASANA_WORKSPACES = ("asana", "Workspaces")
    ASANA_WEBHOOKS = ("asana", "Webhooks")
    ASANA_PROJECT_STATUSES = ("asana", "Project statuses")
    ASANA_PROJECT_BRIEFS = ("asana", "Project briefs")
    ASANA_TEAMS = ("asana", "Teams")
    ASANA_USERS = ("asana", "Users")
    ASANA_TAGS = ("asana", "Tags")
    ASANA_PROJECT_MEMBERSHIPS = ("asana", "Project memberships")
    ASANA_STATUS_UPDATES = ("asana", "Status updates")
    ASANA_TASKS = ("asana", "Tasks")
    ASANA_PORTFOLIO_MEMBERSHIPS = ("asana", "Portfolio memberships")
    ASANA_PROJECT_TEMPLATES = ("asana", "Project templates")
    ASANA_SECTIONS = ("asana", "Sections")
    ATTIO_META = ("attio", "Meta")
    ATTIO_OBJECTS = ("attio", "Objects")
    ATTIO_ENTRIES = ("attio", "Entries")
    ATTIO_COMMENTS = ("attio", "Comments")
    ATTIO_WEBHOOKS = ("attio", "Webhooks")
    ATTIO_NOTES = ("attio", "Notes")
    ATTIO_LISTS = ("attio", "Lists")
    ATTIO_WORKSPACE_MEMBERS = ("attio", "Workspace members")
    ATTIO_TASKS = ("attio", "Tasks")
    ATTIO_ATTRIBUTES = ("attio", "Attributes")
    ATTIO_THREADS = ("attio", "Threads")
    ATTIO_RECORDS = ("attio", "Records")
    BREVO_FILES = ("brevo", "Files")
    BREVO_CONTACTS = ("brevo", "Contacts")
    BREVO_SENDERS = ("brevo", "Senders")
    BREVO_PROCESS = ("brevo", "Process")
    BREVO_TRANSACTIONAL_WHATSAPP = ("brevo", "Transactional WhatsApp")
    BREVO_EMAIL_CAMPAIGNS = ("brevo", "Email Campaigns")
    BREVO_DEALS = ("brevo", "Deals")
    BREVO_ACCOUNT = ("brevo", "Account")
    BREVO_CONVERSATIONS = ("brevo", "Conversations")
    BREVO_COUPONS = ("brevo", "Coupons")
    BREVO_TRANSACTIONAL_SMS = ("brevo", "Transactional SMS")
    BREVO_MASTER_ACCOUNT = ("brevo", "Master account")
    BREVO_DOMAINS = ("brevo", "Domains")
    BREVO_COMPANIES = ("brevo", "Companies")
    BREVO_RESELLER = ("brevo", "Reseller")
    BREVO_NOTES = ("brevo", "Notes")
    BREVO_WEBHOOKS = ("brevo", "Webhooks")
    BREVO_INBOUND_PARSING = ("brevo", "Inbound Parsing")
    BREVO_USER = ("brevo", "User")
    BREVO_EVENT = ("brevo", "Event")
    BREVO_TRANSACTIONAL_EMAILS = ("brevo", "Transactional emails")
    BREVO_EXTERNAL_FEEDS = ("brevo", "External Feeds")
    BREVO_TASKS = ("brevo", "Tasks")
    BREVO_ECOMMERCE = ("brevo", "Ecommerce")
    BREVO_WHATSAPP_CAMPAIGNS = ("brevo", "WhatsApp Campaigns")
    BREVO_SMS_CAMPAIGNS = ("brevo", "SMS Campaigns")
    CLICKUP_TIME_TRACKING = ("clickup", "Time Tracking")
    CLICKUP_GUESTS = ("clickup", "Guests")
    CLICKUP_COMMENTS = ("clickup", "Comments")
    CLICKUP_ROLES = ("clickup", "Roles")
    CLICKUP_SHARED_HIERARCHY = ("clickup", "Shared Hierarchy")
    CLICKUP_TASK_TEMPLATES = ("clickup", "Task Templates")
    CLICKUP_ATTACHMENTS = ("clickup", "Attachments")
    CLICKUP_GOALS = ("clickup", "Goals")
    CLICKUP_TASK_CHECKLISTS = ("clickup", "Task Checklists")
    CLICKUP_CUSTOM_TASK_TYPES = ("clickup", "Custom Task Types")
    CLICKUP_LISTS = ("clickup", "Lists")
    CLICKUP_TIME_TRACKING__LEGACY_ = ("clickup", "Time Tracking (Legacy)")
    CLICKUP_WEBHOOKS = ("clickup", "Webhooks")
    CLICKUP_TASK_RELATIONSHIPS = ("clickup", "Task Relationships")
    CLICKUP_TEAMS___USER_GROUPS = ("clickup", "Teams - User Groups")
    CLICKUP_CUSTOM_FIELDS = ("clickup", "Custom Fields")
    CLICKUP_FOLDERS = ("clickup", "Folders")
    CLICKUP_TAGS = ("clickup", "Tags")
    CLICKUP_USERS = ("clickup", "Users")
    CLICKUP_SPACES = ("clickup", "Spaces")
    CLICKUP_TASKS = ("clickup", "Tasks")
    CLICKUP_TEAMS___WORKSPACES = ("clickup", "Teams - Workspaces")
    CLICKUP_MEMBERS = ("clickup", "Members")
    CLICKUP_VIEWS = ("clickup", "Views")
    CLICKUP_AUTHORIZATION = ("clickup", "Authorization")
    ELEVENLABS_MODELS = ("elevenlabs", "models")
    ELEVENLABS_SPEECH_HISTORY = ("elevenlabs", "speech-history")
    ELEVENLABS_WORKSPACE = ("elevenlabs", "workspace")
    ELEVENLABS_SPEECH_TO_SPEECH = ("elevenlabs", "speech-to-speech")
    ELEVENLABS_TEXT_TO_SPEECH = ("elevenlabs", "text-to-speech")
    ELEVENLABS_PROJECTS = ("elevenlabs", "projects")
    ELEVENLABS_SAMPLES = ("elevenlabs", "samples")
    ELEVENLABS_PRONUNCIATION_DICTIONARY = ("elevenlabs", "Pronunciation Dictionary")
    ELEVENLABS_DUBBING = ("elevenlabs", "dubbing")
    ELEVENLABS_VOICES = ("elevenlabs", "voices")
    ELEVENLABS_VOICE_GENERATION = ("elevenlabs", "voice-generation")
    ELEVENLABS_USER = ("elevenlabs", "user")
    ELEVENLABS_AUDIO_NATIVE = ("elevenlabs", "audio-native")
    FIGMA_COMMENT_REACTIONS = ("figma", "Comment Reactions")
    FIGMA_COMPONENTS = ("figma", "Components")
    FIGMA_ACTIVITY_LOGS = ("figma", "Activity Logs")
    FIGMA_COMMENTS = ("figma", "Comments")
    FIGMA_DEV_RESOURCES = ("figma", "Dev Resources")
    FIGMA_PAYMENTS = ("figma", "Payments")
    FIGMA_USERS = ("figma", "Users")
    FIGMA_VARIABLES = ("figma", "Variables")
    FIGMA_STYLES = ("figma", "Styles")
    FIGMA_FILES = ("figma", "Files")
    FIGMA_WEBHOOKS = ("figma", "Webhooks")
    FIGMA_PROJECTS = ("figma", "Projects")
    FIGMA_COMPONENT_SETS = ("figma", "Component Sets")
    LISTENNOTES_PODCASTER_API = ("listennotes", "Podcaster API")
    LISTENNOTES_SEARCH_API = ("listennotes", "Search API")
    LISTENNOTES_DIRECTORY_API = ("listennotes", "Directory API")
    LISTENNOTES_PLAYLIST_API = ("listennotes", "Playlist API")
    LISTENNOTES_INSIGHTS_API = ("listennotes", "Insights API")
    NASA_PROJECT = ("nasa", "Project")
    NASA_ORGANIZATION = ("nasa", "Organization")
    NASA_RESOURCE = ("nasa", "Resource")
    OKTA_SUBSCRIPTION = ("okta", "Subscription")
    OKTA_USERFACTOR = ("okta", "UserFactor")
    OKTA_AUTHORIZATIONSERVER = ("okta", "AuthorizationServer")
    OKTA_NETWORKZONE = ("okta", "NetworkZone")
    OKTA_BRAND = ("okta", "Brand")
    OKTA_LINKEDOBJECT = ("okta", "LinkedObject")
    OKTA_AUTHENTICATOR = ("okta", "Authenticator")
    OKTA_POLICY = ("okta", "Policy")
    OKTA_INLINEHOOK = ("okta", "InlineHook")
    OKTA_USERSCHEMA = ("okta", "UserSchema")
    OKTA_ORG = ("okta", "Org")
    OKTA_TEMPLATE = ("okta", "Template")
    OKTA_GROUP = ("okta", "Group")
    OKTA_THREATINSIGHT = ("okta", "ThreatInsight")
    OKTA_PROFILEMAPPING = ("okta", "ProfileMapping")
    OKTA_SESSION = ("okta", "Session")
    OKTA_GROUPSCHEMA = ("okta", "GroupSchema")
    OKTA_LOG = ("okta", "Log")
    OKTA_DOMAIN = ("okta", "Domain")
    OKTA_USERTYPE = ("okta", "UserType")
    OKTA_USER = ("okta", "User")
    OKTA_TRUSTEDORIGIN = ("okta", "TrustedOrigin")
    OKTA_FEATURE = ("okta", "Feature")
    OKTA_IDENTITYPROVIDER = ("okta", "IdentityProvider")
    OKTA_APPLICATION = ("okta", "Application")
    OKTA_EVENTHOOK = ("okta", "EventHook")
    SPOTIFY_SEARCH = ("spotify", "Search")
    SPOTIFY_GENRES = ("spotify", "Genres")
    SPOTIFY_EPISODES = ("spotify", "Episodes")
    SPOTIFY_ALBUMS = ("spotify", "Albums")
    SPOTIFY_LIBRARY = ("spotify", "Library")
    SPOTIFY_USERS = ("spotify", "Users")
    SPOTIFY_PLAYER = ("spotify", "Player")
    SPOTIFY_CHAPTERS = ("spotify", "Chapters")
    SPOTIFY_MARKETS = ("spotify", "Markets")
    SPOTIFY_AUDIOBOOKS = ("spotify", "Audiobooks")
    SPOTIFY_ARTISTS = ("spotify", "Artists")
    SPOTIFY_SHOWS = ("spotify", "Shows")
    SPOTIFY_PLAYLISTS = ("spotify", "Playlists")
    SPOTIFY_TRACKS = ("spotify", "Tracks")
    SPOTIFY_CATEGORIES = ("spotify", "Categories")
    TASKADE_PROJECT = ("taskade", "Project")
    TASKADE_WORKSPACE = ("taskade", "Workspace")
    TASKADE_TASK = ("taskade", "Task")
    TASKADE_ME = ("taskade", "Me")
    TASKADE_FOLDER = ("taskade", "Folder")
    TASKADE_AGENT = ("taskade", "Agent")
    WHATSAPP_GROUPS = ("whatsapp", "Groups")
    WHATSAPP_CONTACTS = ("whatsapp", "Contacts")
    WHATSAPP_MEDIA = ("whatsapp", "Media")
    WHATSAPP_PROFILE = ("whatsapp", "Profile")
    WHATSAPP_USERS = ("whatsapp", "Users")
    WHATSAPP_REGISTRATION = ("whatsapp", "Registration")
    WHATSAPP_BACKUP_RESTORE = ("whatsapp", "Backup/Restore")
    WHATSAPP_HEALTH = ("whatsapp", "Health")
    WHATSAPP_MESSAGES = ("whatsapp", "Messages")
    WHATSAPP_BUSINESS_PROFILE = ("whatsapp", "Business Profile")
    WHATSAPP_APPLICATION = ("whatsapp", "Application")
    WHATSAPP_TWO_STEP_VERIFICATION = ("whatsapp", "Two-Step Verification")
    WHATSAPP_CERTIFICATES = ("whatsapp", "Certificates")
    ZOOM_SIP_PHONE = ("zoom", "SIP Phone")
    ZOOM_ARCHIVING = ("zoom", "Archiving")
    ZOOM_H323_DEVICES = ("zoom", "H323 Devices")
    ZOOM_MEETINGS = ("zoom", "Meetings")
    ZOOM_PAC = ("zoom", "PAC")
    ZOOM_TSP = ("zoom", "TSP")
    ZOOM_REPORTS = ("zoom", "Reports")
    ZOOM_WEBINARS = ("zoom", "Webinars")
    ZOOM_DEVICES = ("zoom", "Devices")
    ZOOM_TRACKING_FIELD = ("zoom", "Tracking Field")
    ZOOM_CLOUD_RECORDING = ("zoom", "Cloud Recording")


class App(str, Enum):
    """Composio App."""

    @property
    def is_local(self) -> bool:
        """If the app is local."""
        return self.value.lower() in [
            "mathematical",
            "localworkspace",
            "cmdmanagertool",
            "historykeeper",
        ]

    ABLY = "ably"
    ACCELO = "accelo"
    ACTIVE_COMPAIGN = "active-compaign"
    ADOBE = "adobe"
    AERO_WORKFLOW = "aero-workflow"
    ALCHEMY = "alchemy"
    ALTOVIZ = "altoviz"
    AMAZON = "amazon"
    AMCARDS = "amcards"
    AMPLITUDE = "amplitude"
    APIFY = "apify"
    APPDRAG = "appdrag"
    ASANA = "asana"
    ASHBY = "ashby"
    ATLASSIAN = "atlassian"
    ATTIO = "attio"
    AUTH0 = "auth0"
    AXONAUT = "axonaut"
    BAMBOOHR = "bamboohr"
    BANNERBEAR = "bannerbear"
    BASEROW = "baserow"
    BATTLENET = "battlenet"
    BEEMINDER = "beeminder"
    BITWARDEN = "bitwarden"
    BLACKBAUD = "blackbaud"
    BOLDSIGN = "boldsign"
    BOTBABA = "botbaba"
    BOX = "box"
    BRAINTREE = "braintree"
    BRANDFETCH = "brandfetch"
    BREVO = "brevo"
    BREX = "brex"
    BREX_STAGING = "brex-staging"
    BROWSEAI = "browseai"
    BROWSERHUB = "browserhub"
    BUBBLE = "bubble"
    CAL = "cal"
    CALENDLY = "calendly"
    CHATWORK = "chatwork"
    CHMEETINGS = "chmeetings"
    CLICKUP = "clickup"
    CLOSE = "close"
    CLOUDFLARE = "cloudflare"
    CODEINTERPRETER = "codeinterpreter"
    COINMARKETCAL = "coinmarketcal"
    COMPOSIO = "composio"
    CONTENTFUL = "contentful"
    CUSTOMER_IO = "customer_io"
    DAILYBOT = "dailybot"
    DATADOG = "datadog"
    DATAGMA = "datagma"
    DEEL = "deel"
    DEMIO = "demio"
    DIGICERT = "digicert"
    DISCORD = "discord"
    DOCMOSIS = "docmosis"
    DROPBOX = "dropbox"
    DROPBOX_SIGN = "dropbox-sign"
    ECHTPOST = "echtpost"
    ELEVENLABS = "elevenlabs"
    EPIC_GAMES = "epic-games"
    EVENTBRITE = "eventbrite"
    EXA = "exa"
    EXIST = "exist"
    FACEBOOK = "facebook"
    FACTORIAL = "factorial"
    FIGMA = "figma"
    FILEMANAGER = "filemanager"
    FINAGE = "finage"
    FITBIT = "fitbit"
    FLUTTERWAVE = "flutterwave"
    FOMO = "fomo"
    FORMCARRY = "formcarry"
    FORMSITE = "formsite"
    FRESHBOOKS = "freshbooks"
    FRESHDESK = "freshdesk"
    FRONT = "front"
    GITHUB = "github"
    GITLAB = "gitlab"
    GMAIL = "gmail"
    GOOGLECALENDAR = "googlecalendar"
    GOOGLEDOCS = "googledocs"
    GOOGLEDRIVE = "googledrive"
    GOOGLESHEETS = "googlesheets"
    GOOGLETASKS = "googletasks"
    GORGIAS = "gorgias"
    GUMROAD = "gumroad"
    GURU = "guru"
    HACKERRANK_WORK = "hackerrank-work"
    HARVEST = "harvest"
    HELCIM = "helcim"
    HEROKU = "heroku"
    HIGHLEVEL = "highlevel"
    HUBSPOT = "hubspot"
    HUMANLOOP = "humanloop"
    INTERCOM = "intercom"
    INTERZOID = "interzoid"
    JIRA = "jira"
    KEAP = "keap"
    KLAVIYO = "klaviyo"
    KLIPFOLIO = "klipfolio"
    LASTPASS = "lastpass"
    LAUNCH_DARKLY = "launch-darkly"
    LEVER = "lever"
    LEVER_SANDBOX = "lever-sandbox"
    LEXOFFICE = "lexoffice"
    LINEAR = "linear"
    LINKHUT = "linkhut"
    LISTENNOTES = "listennotes"
    MAILCHIMP = "mailchimp"
    MAINTAINX = "maintainx"
    MBOUM = "mboum"
    METATEXTAI = "metatextai"
    MICROSOFT_TEAMS = "microsoft-teams"
    MICROSOFT_TENANT = "microsoft-tenant"
    MIRO = "miro"
    MIXPANEL = "mixpanel"
    MOCEAN_API = "mocean-api"
    MONDAY = "monday"
    MORE_TREES = "more-trees"
    MOXIE = "moxie"
    MURAL = "mural"
    NASA = "nasa"
    NCSCALE = "ncscale"
    NETSUITE = "netsuite"
    NGROK = "ngrok"
    NOTION = "notion"
    OKTA = "okta"
    ONCEHUB = "oncehub"
    ONE_DRIVE = "one-drive"
    PAGERDUTY = "pagerduty"
    PANDADOC = "pandadoc"
    PIGGY = "piggy"
    PIPEDRIVE = "pipedrive"
    PLACEKEY = "placekey"
    PRINTNODE = "printnode"
    PROCESS_STREET = "process-street"
    PRODUCTBOARD = "productboard"
    QUALAROO = "qualaroo"
    RAFFLYS = "rafflys"
    RAVENSEOTOOLS = "ravenseotools"
    REDDIT = "reddit"
    RING_CENTRAL = "ring-central"
    ROCKET_REACH = "rocket-reach"
    SAGE = "sage"
    SALESFORCE = "salesforce"
    SCHEDULER = "scheduler"
    SCREENSHOTONE = "screenshotone"
    SERPAPI = "serpapi"
    SERVICEM8 = "servicem8"
    SHOPIFY = "shopify"
    SHORTCUT = "shortcut"
    SIMPLESAT = "simplesat"
    SLACK = "slack"
    SLACKBOT = "slackbot"
    SMARTRECRUITERS = "smartrecruiters"
    SMUGMUG = "smugmug"
    SNOWFLAKE = "snowflake"
    SPOTIFY = "spotify"
    SQUARE = "square"
    STACK_EXCHANGE = "stack-exchange"
    STRAVA = "strava"
    SURVEY_MONKEY = "survey-monkey"
    TAPFORM = "tapform"
    TASKADE = "taskade"
    TERMINUS = "terminus"
    TEXTRAZOR = "textrazor"
    TIMEKIT = "timekit"
    TIMELY = "timely"
    TINYPNG = "tinypng"
    TINYURL = "tinyurl"
    TISANE = "tisane"
    TODOIST = "todoist"
    TONEDEN = "toneden"
    TRELLO = "trello"
    TWITCH = "twitch"
    TWITTER = "twitter"
    TYPEFORM = "typeform"
    VENLY = "venly"
    VERO = "vero"
    WABOXAPP = "waboxapp"
    WAKATIME = "wakatime"
    WAVE_ACCOUNTING = "wave-accounting"
    WEBFLOW = "webflow"
    WHATSAPP = "whatsapp"
    WORKABLE = "workable"
    WORKIOM = "workiom"
    XERO = "xero"
    YANDEX = "yandex"
    YNAB = "ynab"
    YOUTUBE = "youtube"
    ZENDESK = "zendesk"
    ZENSERP = "zenserp"
    ZOHO = "zoho"
    ZOHO_BIGIN = "zoho-bigin"
    ZOHO_BOOKS = "zoho-books"
    ZOHO_DESK = "zoho-desk"
    ZOHO_INVENTORY = "zoho-inventory"
    ZOHO_INVOICE = "zoho-invoice"
    ZOHO_MAIL = "zoho-mail"
    ZOOM = "zoom"
    MATHEMATICAL = "mathematical"
    LOCALWORKSPACE = "localworkspace"
    CMDMANAGERTOOL = "cmdmanagertool"
    HISTORYKEEPER = "historykeeper"


class Action(tuple, Enum):
    """App action."""

    @property
    def app(self) -> str:
        """Name of the app where this actions belongs."""
        return self.value[0]

    @property
    def action(self) -> str:
        """Name of the action."""
        return self.value[1]

    @property
    def no_auth(self) -> bool:
        """Name of the action."""
        return self.value[2]

    @property
    def is_local(self) -> bool:
        """If the action is local."""
        return len(self.value) > 3 and self.value[3]

    @classmethod
    def from_app(cls, name: str) -> "Action":
        """Create Action type enum from app name."""
        for action in cls:
            if name == action.app:
                return action
        raise ValueError(f"No action type found for name `{name}`")

    @classmethod
    def from_action(cls, name: str) -> "Action":
        """Create Action type enum from action name."""
        for action in cls:
            if name == action.action:
                return action
        raise ValueError(f"No action type found for name `{name}`")

    @classmethod
    def from_app_and_action(cls, app: str, name: str) -> "Action":
        """From name and action params."""
        for action in cls:
            if app == action.app and name == action.action:
                return action
        raise ValueError("No action type found for app " f"`{app}` and action `{name}`")

    APIFY_LIST_APIFY_ACTORS = ("apify", "apify_list_apify_actors", False)
    APIFY_CREATE_APIFY_ACTOR = ("apify", "apify_create_apify_actor", False)
    APIFY_GET_ACTOR_ID = ("apify", "apify_get_actor_id", False)
    APIFY_SEARCH_STORE = ("apify", "apify_search_store", False)
    APIFY_GET_LAST_RUN_DATA = ("apify", "apify_get_last_run_data", False)
    APIFY_LIST_APIFY_TASKS = ("apify", "apify_list_apify_tasks", False)
    ASANA_ALLOCATIONS_GET_RECORD_BY_ID = (
        "asana",
        "asana_allocations_get_record_by_id",
        False,
    )
    ASANA_ALLOCATIONS_UPDATE_RECORD_BY_ID = (
        "asana",
        "asana_allocations_update_record_by_id",
        False,
    )
    ASANA_ALLOCATIONS_DELETE_ALLOCATION_BY_ID = (
        "asana",
        "asana_allocations_delete_allocation_by_id",
        False,
    )
    ASANA_ALLOCATIONS_GET_MULTIPLE = ("asana", "asana_allocations_get_multiple", False)
    ASANA_ALLOCATIONS_CREATE_RECORD = (
        "asana",
        "asana_allocations_create_record",
        False,
    )
    ASANA_ATTACHMENTS_GET_ATTACHMENT_RECORD = (
        "asana",
        "asana_attachments_get_attachment_record",
        False,
    )
    ASANA_ATTACHMENTS_DELETE_SPECIFIC = (
        "asana",
        "asana_attachments_delete_specific",
        False,
    )
    ASANA_ATTACHMENTS_GET_ALL_FOR_OBJECT = (
        "asana",
        "asana_attachments_get_all_for_object",
        False,
    )
    ASANA_ATTACHMENTS_UPLOAD_ATTACHMENT = (
        "asana",
        "asana_attachments_upload_attachment",
        False,
    )
    ASANA_AUDIT_LOG_API_GET_AUDIT_LOG_EVENTS = (
        "asana",
        "asana_audit_log_api_get_audit_log_events",
        False,
    )
    ASANA_BATCH_API_SUBMIT_PARALLEL_REQUESTS = (
        "asana",
        "asana_batch_api_submit_parallel_requests",
        False,
    )
    ASANA_CUSTOM_FIELD_SETTINGS_GET_PROJECT_CUSTOM_FIELD_SETTINGS = (
        "asana",
        "asana_custom_field_settings_get_project_custom_field_settings",
        False,
    )
    ASANA_CUSTOM_FIELD_SETTINGS_GET_PORTFOLIO_CUSTOM_FIELD_SETTINGS = (
        "asana",
        "asana_custom_field_settings_get_portfolio_custom_field_settings",
        False,
    )
    ASANA_CUSTOM_FIELDS_CREATE_NEW_FIELD_RECORD = (
        "asana",
        "asana_custom_fields_create_new_field_record",
        False,
    )
    ASANA_CUSTOM_FIELDS_GET_METADATA = (
        "asana",
        "asana_custom_fields_get_metadata",
        False,
    )
    ASANA_CUSTOM_FIELDS_UPDATE_FIELD_RECORD = (
        "asana",
        "asana_custom_fields_update_field_record",
        False,
    )
    ASANA_CUSTOM_FIELDS_DELETE_FIELD_RECORD = (
        "asana",
        "asana_custom_fields_delete_field_record",
        False,
    )
    ASANA_CUSTOM_FIELDS_LIST_WORK_SPACE_CUSTOM_FIELDS = (
        "asana",
        "asana_custom_fields_list_work_space_custom_fields",
        False,
    )
    ASANA_CUSTOM_FIELDS_ADDE_NUM_OPTION = (
        "asana",
        "asana_custom_fields_adde_num_option",
        False,
    )
    ASANA_CUSTOM_FIELDS_REORDER_E_NUM_OPTION = (
        "asana",
        "asana_custom_fields_reorder_e_num_option",
        False,
    )
    ASANA_CUSTOM_FIELDS_UPDATE_E_NUM_OPTION = (
        "asana",
        "asana_custom_fields_update_e_num_option",
        False,
    )
    ASANA_EVENTS_GET_RESOURCE_EVENTS = (
        "asana",
        "asana_events_get_resource_events",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_GET_RECORD_BY_ID = (
        "asana",
        "asana_goal_relationships_get_record_by_id",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_UPDATE_GOAL_RELATIONSHIP_RECORD = (
        "asana",
        "asana_goal_relationships_update_goal_relationship_record",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_GET_COMPACT_RECORDS = (
        "asana",
        "asana_goal_relationships_get_compact_records",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_CREATE_SUPPORTING_RELATIONSHIP = (
        "asana",
        "asana_goal_relationships_create_supporting_relationship",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_REMOVE_SUPPORTING_RELATIONSHIP = (
        "asana",
        "asana_goal_relationships_remove_supporting_relationship",
        False,
    )
    ASANA_GOALS_GET_GOAL_RECORD = ("asana", "asana_goals_get_goal_record", False)
    ASANA_GOALS_UPDATE_GOAL_RECORD = ("asana", "asana_goals_update_goal_record", False)
    ASANA_GOALS_DELETE_RECORD = ("asana", "asana_goals_delete_record", False)
    ASANA_GOALS_GET_COMPACT_RECORDS = (
        "asana",
        "asana_goals_get_compact_records",
        False,
    )
    ASANA_GOALS_CREATE_NEW_GOAL_RECORD = (
        "asana",
        "asana_goals_create_new_goal_record",
        False,
    )
    ASANA_GOALS_CREATE_METRIC = ("asana", "asana_goals_create_metric", False)
    ASANA_GOALS_UPDATE_METRIC_CURRENT_VALUE = (
        "asana",
        "asana_goals_update_metric_current_value",
        False,
    )
    ASANA_GOALS_ADD_COLLABORATORS_TO_GOAL = (
        "asana",
        "asana_goals_add_collaborators_to_goal",
        False,
    )
    ASANA_GOALS_REMOVE_FOLLOWERS_FROM_GOAL = (
        "asana",
        "asana_goals_remove_followers_from_goal",
        False,
    )
    ASANA_GOALS_GET_PARENT_GOALS = ("asana", "asana_goals_get_parent_goals", False)
    ASANA_JOBS_GET_BY_ID = ("asana", "asana_jobs_get_by_id", False)
    ASANA_MEMBERSHIPS_GET_MULTIPLE = ("asana", "asana_memberships_get_multiple", False)
    ASANA_MEMBERSHIPS_CREATE_NEW_RECORD = (
        "asana",
        "asana_memberships_create_new_record",
        False,
    )
    ASANA_MEMBERSHIPS_GET_MEMBERSHIP_RECORD = (
        "asana",
        "asana_memberships_get_membership_record",
        False,
    )
    ASANA_MEMBERSHIPS_UPDATE_MEMBERSHIP_RECORD = (
        "asana",
        "asana_memberships_update_membership_record",
        False,
    )
    ASANA_MEMBERSHIPS_DELETE_RECORD = (
        "asana",
        "asana_memberships_delete_record",
        False,
    )
    ASANA_ORGANIZATION_EXPORTS_CREATE_EXPORT_REQUEST = (
        "asana",
        "asana_organization_exports_create_export_request",
        False,
    )
    ASANA_ORGANIZATION_EXPORTS_GET_EXPORT_DETAILS = (
        "asana",
        "asana_organization_exports_get_export_details",
        False,
    )
    ASANA_PORTFOLIO_MEMBERSHIPS_LIST_MULTIPLE_MEMBERSHIPS = (
        "asana",
        "asana_portfolio_memberships_list_multiple_memberships",
        False,
    )
    ASANA_PORTFOLIO_MEMBERSHIPS_GET_COMPLETE_RECORD = (
        "asana",
        "asana_portfolio_memberships_get_complete_record",
        False,
    )
    ASANA_PORTFOLIO_MEMBERSHIPS_GET_COMPACT = (
        "asana",
        "asana_portfolio_memberships_get_compact",
        False,
    )
    ASANA_PORTFOLIOS_LIST_MULTIPLE_PORTFOLIOS = (
        "asana",
        "asana_portfolios_list_multiple_portfolios",
        False,
    )
    ASANA_PORTFOLIOS_CREATE_NEW_PORTFOLIO_RECORD = (
        "asana",
        "asana_portfolios_create_new_portfolio_record",
        False,
    )
    ASANA_PORTFOLIOS_GET_RECORD = ("asana", "asana_portfolios_get_record", False)
    ASANA_PORTFOLIOS_UPDATE_PORTFOLIO_RECORD = (
        "asana",
        "asana_portfolios_update_portfolio_record",
        False,
    )
    ASANA_PORTFOLIOS_DELETE_RECORD = ("asana", "asana_portfolios_delete_record", False)
    ASANA_PORTFOLIOS_GET_ITEMS = ("asana", "asana_portfolios_get_items", False)
    ASANA_PORTFOLIOS_ADD_PORTFOLIO_ITEM = (
        "asana",
        "asana_portfolios_add_portfolio_item",
        False,
    )
    ASANA_PORTFOLIOS_REMOVE_ITEM_FROM_PORTFOLIO = (
        "asana",
        "asana_portfolios_remove_item_from_portfolio",
        False,
    )
    ASANA_PORTFOLIOS_ADD_CUSTOM_FIELD_SETTING = (
        "asana",
        "asana_portfolios_add_custom_field_setting",
        False,
    )
    ASANA_PORTFOLIOS_REMOVE_CUSTOM_FIELD_SETTING = (
        "asana",
        "asana_portfolios_remove_custom_field_setting",
        False,
    )
    ASANA_PORTFOLIOS_ADD_MEMBERS_TO_PORTFOLIO = (
        "asana",
        "asana_portfolios_add_members_to_portfolio",
        False,
    )
    ASANA_PORTFOLIOS_REMOVE_MEMBERS_FROM_PORTFOLIO = (
        "asana",
        "asana_portfolios_remove_members_from_portfolio",
        False,
    )
    ASANA_PROJECT_BRIEFS_GET_FULL_RECORD = (
        "asana",
        "asana_project_briefs_get_full_record",
        False,
    )
    ASANA_PROJECT_BRIEFS_UPDATE_BRIEF_RECORD = (
        "asana",
        "asana_project_briefs_update_brief_record",
        False,
    )
    ASANA_PROJECT_BRIEFS_REMOVE_BRIEF = (
        "asana",
        "asana_project_briefs_remove_brief",
        False,
    )
    ASANA_PROJECT_BRIEFS_CREATE_NEW_RECORD = (
        "asana",
        "asana_project_briefs_create_new_record",
        False,
    )
    ASANA_PROJECT_MEMBERSHIPS_GET_RECORD = (
        "asana",
        "asana_project_memberships_get_record",
        False,
    )
    ASANA_PROJECT_MEMBERSHIPS_GET_COMPACT_RECORDS = (
        "asana",
        "asana_project_memberships_get_compact_records",
        False,
    )
    ASANA_PROJECT_STATUSES_GET_STATUS_UPDATE_RECORD = (
        "asana",
        "asana_project_statuses_get_status_update_record",
        False,
    )
    ASANA_PROJECT_STATUSES_DELETE_SPECIFIC_STATUS_UPDATE = (
        "asana",
        "asana_project_statuses_delete_specific_status_update",
        False,
    )
    ASANA_PROJECT_STATUSES_GET_PROJECT_UPDATES = (
        "asana",
        "asana_project_statuses_get_project_updates",
        False,
    )
    ASANA_PROJECT_STATUSES_CREATE_NEW_STATUS_UPDATE_RECORD = (
        "asana",
        "asana_project_statuses_create_new_status_update_record",
        False,
    )
    ASANA_PROJECT_TEMPLATES_GET_RECORD = (
        "asana",
        "asana_project_templates_get_record",
        False,
    )
    ASANA_PROJECT_TEMPLATES_DELETE_TEMPLATE_RECORD = (
        "asana",
        "asana_project_templates_delete_template_record",
        False,
    )
    ASANA_PROJECT_TEMPLATES_LIST_MULTIPLE = (
        "asana",
        "asana_project_templates_list_multiple",
        False,
    )
    ASANA_PROJECT_TEMPLATES_GET_ALL_TEMPLATE_RECORDS = (
        "asana",
        "asana_project_templates_get_all_template_records",
        False,
    )
    ASANA_PROJECT_TEMPLATES_INSTANTIATE_PROJECT_JOB = (
        "asana",
        "asana_project_templates_instantiate_project_job",
        False,
    )
    ASANA_PROJECTS_LIST_MULTIPLE = ("asana", "asana_projects_list_multiple", False)
    ASANA_PROJECTS_CREATE_NEW_PROJECT_RECORD = (
        "asana",
        "asana_projects_create_new_project_record",
        False,
    )
    ASANA_PROJECTS_GET_PROJECT_RECORD = (
        "asana",
        "asana_projects_get_project_record",
        False,
    )
    ASANA_PROJECTS_UPDATE_PROJECT_RECORD = (
        "asana",
        "asana_projects_update_project_record",
        False,
    )
    ASANA_PROJECTS_DELETE_PROJECT_BY_ID = (
        "asana",
        "asana_projects_delete_project_by_id",
        False,
    )
    ASANA_PROJECTS_DUPLICATE_PROJECT_JOB = (
        "asana",
        "asana_projects_duplicate_project_job",
        False,
    )
    ASANA_PROJECTS_TASK_PROJECTS_LIST = (
        "asana",
        "asana_projects_task_projects_list",
        False,
    )
    ASANA_PROJECTS_GET_TEAM_PROJECTS = (
        "asana",
        "asana_projects_get_team_projects",
        False,
    )
    ASANA_PROJECTS_CREATE_PROJECT_FOR_TEAM = (
        "asana",
        "asana_projects_create_project_for_team",
        False,
    )
    ASANA_PROJECTS_GET_ALL_IN_WORK_SPACE = (
        "asana",
        "asana_projects_get_all_in_work_space",
        False,
    )
    ASANA_PROJECTS_CREATE_IN_WORK_SPACE = (
        "asana",
        "asana_projects_create_in_work_space",
        False,
    )
    ASANA_PROJECTS_ADD_CUSTOM_FIELD_SETTING = (
        "asana",
        "asana_projects_add_custom_field_setting",
        False,
    )
    ASANA_PROJECTS_REMOVE_CUSTOM_FIELD = (
        "asana",
        "asana_projects_remove_custom_field",
        False,
    )
    ASANA_PROJECTS_GET_TASK_COUNTS = ("asana", "asana_projects_get_task_counts", False)
    ASANA_PROJECTS_ADD_MEMBERS_TO_PROJECT = (
        "asana",
        "asana_projects_add_members_to_project",
        False,
    )
    ASANA_PROJECTS_REMOVE_MEMBERS_FROM_PROJECT = (
        "asana",
        "asana_projects_remove_members_from_project",
        False,
    )
    ASANA_PROJECTS_ADD_FOLLOWERS_TO_PROJECT = (
        "asana",
        "asana_projects_add_followers_to_project",
        False,
    )
    ASANA_PROJECTS_REMOVE_PROJECT_FOLLOWERS = (
        "asana",
        "asana_projects_remove_project_followers",
        False,
    )
    ASANA_PROJECTS_CREATE_PROJECT_TEMPLATE_JOB = (
        "asana",
        "asana_projects_create_project_template_job",
        False,
    )
    ASANA_RULES_TRIGGER_RULE_REQUEST = (
        "asana",
        "asana_rules_trigger_rule_request",
        False,
    )
    ASANA_SECTIONS_GET_RECORD = ("asana", "asana_sections_get_record", False)
    ASANA_SECTIONS_UPDATE_SECTION_RECORD = (
        "asana",
        "asana_sections_update_section_record",
        False,
    )
    ASANA_SECTIONS_DELETE_SECTION = ("asana", "asana_sections_delete_section", False)
    ASANA_SECTIONS_LIST_PROJECT_SECTIONS = (
        "asana",
        "asana_sections_list_project_sections",
        False,
    )
    ASANA_SECTIONS_CREATE_NEW_SECTION = (
        "asana",
        "asana_sections_create_new_section",
        False,
    )
    ASANA_SECTIONS_ADD_TASK_TO_SECTION = (
        "asana",
        "asana_sections_add_task_to_section",
        False,
    )
    ASANA_SECTIONS_MOVE_OR_INSERT = ("asana", "asana_sections_move_or_insert", False)
    ASANA_STATUS_UPDATES_GET_RECORD_BY_ID = (
        "asana",
        "asana_status_updates_get_record_by_id",
        False,
    )
    ASANA_STATUS_UPDATES_DELETE_SPECIFIC_STATUS_UPDATE = (
        "asana",
        "asana_status_updates_delete_specific_status_update",
        False,
    )
    ASANA_STATUS_UPDATES_GET_COMPACT_RECORDS = (
        "asana",
        "asana_status_updates_get_compact_records",
        False,
    )
    ASANA_STATUS_UPDATES_CREATE_NEW_STATUS_UPDATE_RECORD = (
        "asana",
        "asana_status_updates_create_new_status_update_record",
        False,
    )
    ASANA_STORIES_GET_FULL_RECORD = ("asana", "asana_stories_get_full_record", False)
    ASANA_STORIES_UPDATE_FULL_RECORD = (
        "asana",
        "asana_stories_update_full_record",
        False,
    )
    ASANA_STORIES_DELETE_STORY_RECORD = (
        "asana",
        "asana_stories_delete_story_record",
        False,
    )
    ASANA_STORIES_GET_TASK_STORIES = ("asana", "asana_stories_get_task_stories", False)
    ASANA_STORIES_CREATE_COMMENT = ("asana", "asana_stories_create_comment", False)
    ASANA_TAGS_LIST_FILTERED_TAGS = ("asana", "asana_tags_list_filtered_tags", False)
    ASANA_TAGS_CREATE_NEW_TAG_RECORD = (
        "asana",
        "asana_tags_create_new_tag_record",
        False,
    )
    ASANA_TAGS_GET_RECORD = ("asana", "asana_tags_get_record", False)
    ASANA_TAGS_UPDATE_TAG_RECORD = ("asana", "asana_tags_update_tag_record", False)
    ASANA_TAGS_REMOVE_TAG = ("asana", "asana_tags_remove_tag", False)
    ASANA_TAGS_GET_TASK_TAGS = ("asana", "asana_tags_get_task_tags", False)
    ASANA_TAGS_GET_FILTERED_TAGS = ("asana", "asana_tags_get_filtered_tags", False)
    ASANA_TAGS_CREATE_TAG_IN_WORK_SPACE = (
        "asana",
        "asana_tags_create_tag_in_work_space",
        False,
    )
    ASANA_TASK_TEMPLATES_LIST_MULTIPLE = (
        "asana",
        "asana_task_templates_list_multiple",
        False,
    )
    ASANA_TASK_TEMPLATES_GET_SINGLE_TEMPLATE = (
        "asana",
        "asana_task_templates_get_single_template",
        False,
    )
    ASANA_TASK_TEMPLATES_DELETE_TASK_TEMPLATE = (
        "asana",
        "asana_task_templates_delete_task_template",
        False,
    )
    ASANA_TASK_TEMPLATES_INSTANTIATE_TASK_JOB = (
        "asana",
        "asana_task_templates_instantiate_task_job",
        False,
    )
    ASANA_TASKS_GET_MULTIPLE = ("asana", "asana_tasks_get_multiple", False)
    ASANA_TASKS_CREATE_NEW_TASK = ("asana", "asana_tasks_create_new_task", False)
    ASANA_TASKS_GET_TASK_RECORD = ("asana", "asana_tasks_get_task_record", False)
    ASANA_TASKS_UPDATE_TASK_RECORD = ("asana", "asana_tasks_update_task_record", False)
    ASANA_TASKS_DELETE_TASK = ("asana", "asana_tasks_delete_task", False)
    ASANA_TASKS_DUPLICATE_TASK_JOB = ("asana", "asana_tasks_duplicate_task_job", False)
    ASANA_TASKS_GET_TASKS_BY_PROJECT = (
        "asana",
        "asana_tasks_get_tasks_by_project",
        False,
    )
    ASANA_TASKS_GET_SECTION_TASKS = ("asana", "asana_tasks_get_section_tasks", False)
    ASANA_TASKS_GET_MULTIPLE_WITH_TAG = (
        "asana",
        "asana_tasks_get_multiple_with_tag",
        False,
    )
    ASANA_TASKS_GET_USER_TASK_LIST_TASKS = (
        "asana",
        "asana_tasks_get_user_task_list_tasks",
        False,
    )
    ASANA_TASKS_GET_SUB_TASK_LIST = ("asana", "asana_tasks_get_sub_task_list", False)
    ASANA_TASKS_CREATE_SUB_TASK_RECORD = (
        "asana",
        "asana_tasks_create_sub_task_record",
        False,
    )
    ASANA_TASKS_SET_PARENT_TASK = ("asana", "asana_tasks_set_parent_task", False)
    ASANA_TASKS_GET_ALL_DEPENDENCIES = (
        "asana",
        "asana_tasks_get_all_dependencies",
        False,
    )
    ASANA_TASKS_SET_DEPENDENCIES_FOR_TASK = (
        "asana",
        "asana_tasks_set_dependencies_for_task",
        False,
    )
    ASANA_TASK_SUN_LINK_DEPENDENCIES_FROM_TASK = (
        "asana",
        "asana_task_sun_link_dependencies_from_task",
        False,
    )
    ASANA_TASKS_GET_DEPENDENTS = ("asana", "asana_tasks_get_dependents", False)
    ASANA_TASKS_SET_TASK_DEPENDENTS = (
        "asana",
        "asana_tasks_set_task_dependents",
        False,
    )
    ASANA_TASK_SUN_LINK_DEPENDENTS = ("asana", "asana_task_sun_link_dependents", False)
    ASANA_TASKS_ADD_PROJECT_TO_TASK = (
        "asana",
        "asana_tasks_add_project_to_task",
        False,
    )
    ASANA_TASKS_REMOVE_PROJECT_FROM_TASK = (
        "asana",
        "asana_tasks_remove_project_from_task",
        False,
    )
    ASANA_TASKS_ADD_TAG_TO_TASK = ("asana", "asana_tasks_add_tag_to_task", False)
    ASANA_TASKS_REMOVE_TAG_FROM_TASK = (
        "asana",
        "asana_tasks_remove_tag_from_task",
        False,
    )
    ASANA_TASKS_ADD_FOLLOWERS_TO_TASK = (
        "asana",
        "asana_tasks_add_followers_to_task",
        False,
    )
    ASANA_TASKS_REMOVE_FOLLOWERS_FROM_TASK = (
        "asana",
        "asana_tasks_remove_followers_from_task",
        False,
    )
    ASANA_TASKS_GET_BY_CUSTOM_ID = ("asana", "asana_tasks_get_by_custom_id", False)
    ASANA_TASKS_SEARCH_IN_WORK_SPACE = (
        "asana",
        "asana_tasks_search_in_work_space",
        False,
    )
    ASANA_TEAM_MEMBERSHIPS_GET_RECORD_BY_ID = (
        "asana",
        "asana_team_memberships_get_record_by_id",
        False,
    )
    ASANA_TEAM_MEMBERSHIPS_GET_COMPACT_RECORDS = (
        "asana",
        "asana_team_memberships_get_compact_records",
        False,
    )
    ASANA_TEAM_MEMBERSHIPS_GET_COMPACT = (
        "asana",
        "asana_team_memberships_get_compact",
        False,
    )
    ASANA_TEAM_MEMBERSHIPS_GET_USER_COMPACT = (
        "asana",
        "asana_team_memberships_get_user_compact",
        False,
    )
    ASANA_TEAMS_CREATE_TEAM_RECORD = ("asana", "asana_teams_create_team_record", False)
    ASANA_TEAMS_GET_TEAM_RECORD = ("asana", "asana_teams_get_team_record", False)
    ASANA_TEAMS_UPDATE_TEAM_RECORD = ("asana", "asana_teams_update_team_record", False)
    ASANA_TEAMS_LIST_WORK_SPACE_TEAMS = (
        "asana",
        "asana_teams_list_work_space_teams",
        False,
    )
    ASANA_TEAMS_GET_USER_TEAMS = ("asana", "asana_teams_get_user_teams", False)
    ASANA_TEAMS_ADD_USER_TO_TEAM = ("asana", "asana_teams_add_user_to_team", False)
    ASANA_TEAMS_REMOVE_USER_FROM_TEAM = (
        "asana",
        "asana_teams_remove_user_from_team",
        False,
    )
    ASANA_TIME_PERIODS_GET_FULL_RECORD = (
        "asana",
        "asana_time_periods_get_full_record",
        False,
    )
    ASANA_TIME_PERIODS_GET_COMPACT_TIME_PERIODS = (
        "asana",
        "asana_time_periods_get_compact_time_periods",
        False,
    )
    ASANA_TIME_TRACKING_ENTRIES_GET_FOR_TASK = (
        "asana",
        "asana_time_tracking_entries_get_for_task",
        False,
    )
    ASANA_TIME_TRACKING_ENTRIES_CREATE_NEW_TIME_ENTRY_RECORD = (
        "asana",
        "asana_time_tracking_entries_create_new_time_entry_record",
        False,
    )
    ASANA_TIME_TRACKING_ENTRIES_GET_RECORD = (
        "asana",
        "asana_time_tracking_entries_get_record",
        False,
    )
    ASANA_TIME_TRACKING_ENTRIES_UPDATE_TIME_TRACKING_ENTRY = (
        "asana",
        "asana_time_tracking_entries_update_time_tracking_entry",
        False,
    )
    ASANA_TIME_TRACKING_ENTRIES_DELETE_TIME_ENTRY = (
        "asana",
        "asana_time_tracking_entries_delete_time_entry",
        False,
    )
    ASANA_TYPE_AHEAD_GET_RESULTS = ("asana", "asana_type_ahead_get_results", False)
    ASANA_USER_TASK_LISTS_GET_RECORD = (
        "asana",
        "asana_user_task_lists_get_record",
        False,
    )
    ASANA_USER_TASK_LISTS_GET_USER_TASK_LIST = (
        "asana",
        "asana_user_task_lists_get_user_task_list",
        False,
    )
    ASANA_USERS_LIST_MULTIPLE_USERS = (
        "asana",
        "asana_users_list_multiple_users",
        False,
    )
    ASANA_USERS_GET_USER_RECORD = ("asana", "asana_users_get_user_record", False)
    ASANA_USERS_GET_FAVORITES_FOR_USER = (
        "asana",
        "asana_users_get_favorites_for_user",
        False,
    )
    ASANA_USERS_LIST_TEAM_USERS = ("asana", "asana_users_list_team_users", False)
    ASANA_USERS_LIST_WORK_SPACE_USERS = (
        "asana",
        "asana_users_list_work_space_users",
        False,
    )
    ASANA_WEB_HOOKS_LIST_MULTIPLE_WEB_HOOKS = (
        "asana",
        "asana_web_hooks_list_multiple_web_hooks",
        False,
    )
    ASANA_WEB_HOOKS_ESTABLISH_WEB_HOOK = (
        "asana",
        "asana_web_hooks_establish_web_hook",
        False,
    )
    ASANA_WEB_HOOKS_GET_WEB_HOOK_RECORD = (
        "asana",
        "asana_web_hooks_get_web_hook_record",
        False,
    )
    ASANA_WEB_HOOKS_UPDATE_WEB_HOOK_FILTERS = (
        "asana",
        "asana_web_hooks_update_web_hook_filters",
        False,
    )
    ASANA_WEB_HOOKS_REMOVE_WEB_HOOK = (
        "asana",
        "asana_web_hooks_remove_web_hook",
        False,
    )
    ASANA_WORK_SPACE_MEMBERSHIPS_GET_RECORD_BY_ID = (
        "asana",
        "asana_work_space_memberships_get_record_by_id",
        False,
    )
    ASANA_WORK_SPACE_MEMBERSHIPS_GET_USER_MEMBERSHIPS = (
        "asana",
        "asana_work_space_memberships_get_user_memberships",
        False,
    )
    ASANA_WORK_SPACE_MEMBERSHIPS_LIST_FOR_WORK_SPACE = (
        "asana",
        "asana_work_space_memberships_list_for_work_space",
        False,
    )
    ASANA_WORK_SPACES_LIST_MULTIPLE = (
        "asana",
        "asana_work_spaces_list_multiple",
        False,
    )
    ASANA_WORK_SPACES_GET_WORK_SPACE_RECORD = (
        "asana",
        "asana_work_spaces_get_work_space_record",
        False,
    )
    ASANA_WORK_SPACES_UPDATE_WORK_SPACE_RECORD = (
        "asana",
        "asana_work_spaces_update_work_space_record",
        False,
    )
    ASANA_WORK_SPACES_ADD_USER_TO_WORK_SPACE = (
        "asana",
        "asana_work_spaces_add_user_to_work_space",
        False,
    )
    ASANA_WORK_SPACES_REMOVE_USER_FROM_WORK_SPACE = (
        "asana",
        "asana_work_spaces_remove_user_from_work_space",
        False,
    )
    ATTIO_LIST_OBJECTS = ("attio", "attio_list_objects", False)
    ATTIO_CREATE_AN_OBJECT = ("attio", "attio_create_an_object", False)
    ATTIO_GET_AN_OBJECT = ("attio", "attio_get_an_object", False)
    ATTIO_UPDATE_AN_OBJECT = ("attio", "attio_update_an_object", False)
    ATTIO_LIST_ATTRIBUTES = ("attio", "attio_list_attributes", False)
    ATTIO_CREATE_AN_ATTRIBUTE = ("attio", "attio_create_an_attribute", False)
    ATTIO_GET_AN_ATTRIBUTE = ("attio", "attio_get_an_attribute", False)
    ATTIO_UPDATE_AN_ATTRIBUTE = ("attio", "attio_update_an_attribute", False)
    ATTIO_LIST_SELECT_OPTIONS = ("attio", "attio_list_select_options", False)
    ATTIO_CREATE_A_SELECT_OPTION = ("attio", "attio_create_a_select_option", False)
    ATTIO_UPDATE_A_SELECT_OPTION = ("attio", "attio_update_a_select_option", False)
    ATTIO_LIST_STATUSES = ("attio", "attio_list_statuses", False)
    ATTIO_CREATE_A_STATUS = ("attio", "attio_create_a_status", False)
    ATTIO_UPDATE_A_STATUS = ("attio", "attio_update_a_status", False)
    ATTIO_LIST_RECORDS = ("attio", "attio_list_records", False)
    ATTIO_CREATE_A_RECORD = ("attio", "attio_create_a_record", False)
    ATTIO_ASSERT_A_RECORD = ("attio", "attio_assert_a_record", False)
    ATTIO_GET_A_RECORD = ("attio", "attio_get_a_record", False)
    ATTIO_UPDATE_A_RECORD = ("attio", "attio_update_a_record", False)
    ATTIO_DELETE_A_RECORD = ("attio", "attio_delete_a_record", False)
    ATTIO_LIST_RECORD_ATTRIBUTE_VALUES = (
        "attio",
        "attio_list_record_attribute_values",
        False,
    )
    ATTIO_LIST_RECORD_ENTRIES = ("attio", "attio_list_record_entries", False)
    ATTIO_LIST_ALL_LISTS = ("attio", "attio_list_all_lists", False)
    ATTIO_CREATE_A_LIST = ("attio", "attio_create_a_list", False)
    ATTIO_GET_A_LIST = ("attio", "attio_get_a_list", False)
    ATTIO_UPDATE_A_LIST = ("attio", "attio_update_a_list", False)
    ATTIO_LIST_ENTRIES = ("attio", "attio_list_entries", False)
    ATTIO_CREATE_AN_ENTRY_ADD_RECORD_TO_LIST = (
        "attio",
        "attio_create_an_entry_add_record_to_list",
        False,
    )
    ATTIO_ASSERT_A_LIST_ENTRY_BY_PARENT = (
        "attio",
        "attio_assert_a_list_entry_by_parent",
        False,
    )
    ATTIO_GET_A_LIST_ENTRY = ("attio", "attio_get_a_list_entry", False)
    ATTIO_UPDATE_A_LIST_ENTRY_APPEND_MULTI_SELECT_VALUES = (
        "attio",
        "attio_update_a_list_entry_append_multi_select_values",
        False,
    )
    ATTIO_UPDATE_A_LIST_ENTRY_OVERWRITE_MULTI_SELECT_VALUES = (
        "attio",
        "attio_update_a_list_entry_overwrite_multi_select_values",
        False,
    )
    ATTIO_DELETE_A_LIST_ENTRY = ("attio", "attio_delete_a_list_entry", False)
    ATTIO_LIST_ATTRIBUTE_VALUES_FOR_A_LIST_ENTRY = (
        "attio",
        "attio_list_attribute_values_for_a_list_entry",
        False,
    )
    ATTIO_LIST_WORK_SPACE_MEMBERS = ("attio", "attio_list_work_space_members", False)
    ATTIO_GET_A_WORK_SPACE_MEMBER = ("attio", "attio_get_a_work_space_member", False)
    ATTIO_LIST_NOTES = ("attio", "attio_list_notes", False)
    ATTIO_CREATE_A_NOTE = ("attio", "attio_create_a_note", False)
    ATTIO_GET_A_NOTE = ("attio", "attio_get_a_note", False)
    ATTIO_DELETE_A_NOTE = ("attio", "attio_delete_a_note", False)
    ATTIO_LIST_TASKS = ("attio", "attio_list_tasks", False)
    ATTIO_CREATE_A_TASK = ("attio", "attio_create_a_task", False)
    ATTIO_GET_A_TASK = ("attio", "attio_get_a_task", False)
    ATTIO_UPDATE_A_TASK = ("attio", "attio_update_a_task", False)
    ATTIO_DELETE_A_TASK = ("attio", "attio_delete_a_task", False)
    ATTIO_LIST_THREADS = ("attio", "attio_list_threads", False)
    ATTIO_GET_A_THREAD = ("attio", "attio_get_a_thread", False)
    ATTIO_CREATE_A_COMMENT = ("attio", "attio_create_a_comment", False)
    ATTIO_GET_A_COMMENT = ("attio", "attio_get_a_comment", False)
    ATTIO_DELETE_A_COMMENT = ("attio", "attio_delete_a_comment", False)
    ATTIO_LIST_WEB_HOOKS = ("attio", "attio_list_web_hooks", False)
    ATTIO_CREATE_A_WEB_HOOK = ("attio", "attio_create_a_web_hook", False)
    ATTIO_GET_A_WEB_HOOK = ("attio", "attio_get_a_web_hook", False)
    ATTIO_UPDATE_A_WEB_HOOK = ("attio", "attio_update_a_web_hook", False)
    ATTIO_DELETE_A_WEB_HOOK = ("attio", "attio_delete_a_web_hook", False)
    ATTIO_IDENTIFY = ("attio", "attio_identify", False)
    BREVO_EMAIL_CAMPAIGNS_GET_ALL = ("brevo", "brevo_email_campaigns_get_all", False)
    BREVO_EMAIL_CAMPAIGNS_CREATE_CAMPAIGN = (
        "brevo",
        "brevo_email_campaigns_create_campaign",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_GET_REPORT = (
        "brevo",
        "brevo_email_campaigns_get_report",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_UPDATE_CAMPAIGN = (
        "brevo",
        "brevo_email_campaigns_update_campaign",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_REMOVE_CAMPAIGN = (
        "brevo",
        "brevo_email_campaigns_remove_campaign",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_SEND_IMMEDIATE = (
        "brevo",
        "brevo_email_campaigns_send_immediate",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_SEND_TEST_TO_TEST_LIST = (
        "brevo",
        "brevo_email_campaigns_send_test_to_test_list",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_UPDATE_STATUS = (
        "brevo",
        "brevo_email_campaigns_update_status",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_SEND_REPORT = (
        "brevo",
        "brevo_email_campaigns_send_report",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_GET_AB_TEST_RESULT = (
        "brevo",
        "brevo_email_campaigns_get_ab_test_result",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_GET_SHARED_URL = (
        "brevo",
        "brevo_email_campaigns_get_shared_url",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_EXPORT_RECIPIENTS_POST = (
        "brevo",
        "brevo_email_campaigns_export_recipients_post",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_UPLOAD_IMAGE_TO_GALLERY = (
        "brevo",
        "brevo_email_campaigns_upload_image_to_gallery",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_SEND_TRANSACTIONAL_EMAIL = (
        "brevo",
        "brevo_transactional_emails_send_transactional_email",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_LIST = (
        "brevo",
        "brevo_transactional_emails_get_list",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_CONTENT_BYU_U_ID = (
        "brevo",
        "brevo_transactional_emails_get_content_byu_u_id",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_DELETE_LOG = (
        "brevo",
        "brevo_transactional_emails_delete_log",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_LIST_TEMPLATES = (
        "brevo",
        "brevo_transactional_emails_list_templates",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_CREATE_TEMPLATE = (
        "brevo",
        "brevo_transactional_emails_create_template",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_TEMPLATE_INFO = (
        "brevo",
        "brevo_transactional_emails_get_template_info",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_UPDATE_TEMPLATE = (
        "brevo",
        "brevo_transactional_emails_update_template",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_DELETE_TEMPLATE_BY_ID = (
        "brevo",
        "brevo_transactional_emails_delete_template_by_id",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_SEND_TEST_TEMPLATE = (
        "brevo",
        "brevo_transactional_emails_send_test_template",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_AGGREGATED_REPORT = (
        "brevo",
        "brevo_transactional_emails_get_aggregated_report",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_ACTIVITY_PER_DAY = (
        "brevo",
        "brevo_transactional_emails_get_activity_per_day",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_ALL_ACTIVITY = (
        "brevo",
        "brevo_transactional_emails_get_all_activity",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_UNBLOCK_CONTACT = (
        "brevo",
        "brevo_transactional_emails_unblock_contact",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_LIST_BLOCKED_CONTACTS = (
        "brevo",
        "brevo_transactional_emails_list_blocked_contacts",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_BLOCKED_DOMAINS = (
        "brevo",
        "brevo_transactional_emails_get_blocked_domains",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_ADD_BLOCKED_DOMAIN = (
        "brevo",
        "brevo_transactional_emails_add_blocked_domain",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_UNBLOCK_DOMAIN = (
        "brevo",
        "brevo_transactional_emails_unblock_domain",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_REMOVE_HARD_BOUNCES = (
        "brevo",
        "brevo_transactional_emails_remove_hard_bounces",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_EMAIL_STATUS_BY_ID = (
        "brevo",
        "brevo_transactional_emails_get_email_status_by_id",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_DELETE_SCHEDULED_EMAILS = (
        "brevo",
        "brevo_transactional_emails_delete_scheduled_emails",
        False,
    )
    BREVO_CONTACTS_GET_ALL_CONTACTS = (
        "brevo",
        "brevo_contacts_get_all_contacts",
        False,
    )
    BREVO_CONTACTS_CREATE_NEW_CONTACT = (
        "brevo",
        "brevo_contacts_create_new_contact",
        False,
    )
    BREVO_CONTACTS_CREATE_DOUBLE_OPT_IN_CONTACT = (
        "brevo",
        "brevo_contacts_create_double_opt_in_contact",
        False,
    )
    BREVO_CONTACTS_GET_DETAILS = ("brevo", "brevo_contacts_get_details", False)
    BREVO_CONTACTS_DELETE_CONTACT = ("brevo", "brevo_contacts_delete_contact", False)
    BREVO_CONTACTS_UPDATE_CONTACT_BY_ID = (
        "brevo",
        "brevo_contacts_update_contact_by_id",
        False,
    )
    BREVO_CONTACTS_UPDATE_MULTIPLE = ("brevo", "brevo_contacts_update_multiple", False)
    BREVO_CONTACTS_GET_EMAIL_CAMPAIGN_STATS = (
        "brevo",
        "brevo_contacts_get_email_campaign_stats",
        False,
    )
    BREVO_CONTACTS_LIST_ATTRIBUTES = ("brevo", "brevo_contacts_list_attributes", False)
    BREVO_CONTACTS_UPDATE_ATTRIBUTE = (
        "brevo",
        "brevo_contacts_update_attribute",
        False,
    )
    BREVO_CONTACTS_CREATE_ATTRIBUTE = (
        "brevo",
        "brevo_contacts_create_attribute",
        False,
    )
    BREVO_CONTACTS_REMOVE_ATTRIBUTE = (
        "brevo",
        "brevo_contacts_remove_attribute",
        False,
    )
    BREVO_CONTACTS_GET_ALL_FOLDERS = ("brevo", "brevo_contacts_get_all_folders", False)
    BREVO_CONTACTS_CREATE_FOLDER = ("brevo", "brevo_contacts_create_folder", False)
    BREVO_CONTACTS_GET_FOLDER_DETAILS = (
        "brevo",
        "brevo_contacts_get_folder_details",
        False,
    )
    BREVO_CONTACTS_UPDATE_FOLDER = ("brevo", "brevo_contacts_update_folder", False)
    BREVO_CONTACTS_DELETE_FOLDER = ("brevo", "brevo_contacts_delete_folder", False)
    BREVO_CONTACTS_GET_FOLDER_LISTS = (
        "brevo",
        "brevo_contacts_get_folder_lists",
        False,
    )
    BREVO_CONTACTS_GET_ALL_LISTS = ("brevo", "brevo_contacts_get_all_lists", False)
    BREVO_CONTACTS_CREATE_LIST = ("brevo", "brevo_contacts_create_list", False)
    BREVO_CONTACTS_GET_LIST_DETAILS = (
        "brevo",
        "brevo_contacts_get_list_details",
        False,
    )
    BREVO_CONTACTS_UPDATE_LIST = ("brevo", "brevo_contacts_update_list", False)
    BREVO_CONTACTS_DELETE_LIST = ("brevo", "brevo_contacts_delete_list", False)
    BREVO_CONTACTS_GET_ALL_SEGMENTS = (
        "brevo",
        "brevo_contacts_get_all_segments",
        False,
    )
    BREVO_CONTACTS_GET_LIST_CONTACTS = (
        "brevo",
        "brevo_contacts_get_list_contacts",
        False,
    )
    BREVO_CONTACTS_ADD_TO_LIST = ("brevo", "brevo_contacts_add_to_list", False)
    BREVO_CONTACTS_REMOVE_CONTACT_FROM_LIST = (
        "brevo",
        "brevo_contacts_remove_contact_from_list",
        False,
    )
    BREVO_CONTACTS_EXPORT_PROCESS_ID = (
        "brevo",
        "brevo_contacts_export_process_id",
        False,
    )
    BREVO_CONTACTS_IMPORT_CONTACTS_PROCESS = (
        "brevo",
        "brevo_contacts_import_contacts_process",
        False,
    )
    BREVO_SMS_CAMPAIGNS_GET_ALL_INFORMATION = (
        "brevo",
        "brevo_sms_campaigns_get_all_information",
        False,
    )
    BREVO_SMS_CAMPAIGNS_CREATE_CAMPAIGN = (
        "brevo",
        "brevo_sms_campaigns_create_campaign",
        False,
    )
    BREVO_SMS_CAMPAIGNS_GET_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_sms_campaigns_get_campaign_by_id",
        False,
    )
    BREVO_SMS_CAMPAIGNS_UPDATE_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_sms_campaigns_update_campaign_by_id",
        False,
    )
    BREVO_SMS_CAMPAIGNS_REMOVE_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_sms_campaigns_remove_campaign_by_id",
        False,
    )
    BREVO_SMS_CAMPAIGNS_SEND_IMMEDIATELY = (
        "brevo",
        "brevo_sms_campaigns_send_immediately",
        False,
    )
    BREVO_SMS_CAMPAIGNS_UPDATE_STATUS = (
        "brevo",
        "brevo_sms_campaigns_update_status",
        False,
    )
    BREVO_SMS_CAMPAIGNS_SEND_TESTS_MS = (
        "brevo",
        "brevo_sms_campaigns_send_tests_ms",
        False,
    )
    BREVO_SMS_CAMPAIGNS_EXPORT_RECIPIENTS_PROCESS = (
        "brevo",
        "brevo_sms_campaigns_export_recipients_process",
        False,
    )
    BREVO_SMS_CAMPAIGNS_SEND_CAMPAIGN_REPORT = (
        "brevo",
        "brevo_sms_campaigns_send_campaign_report",
        False,
    )
    BREVO_TRANSACTIONAL_SMS_SENDS_MS_MESSAGE_TO_MOBILE = (
        "brevo",
        "brevo_transactional_sms_sends_ms_message_to_mobile",
        False,
    )
    BREVO_TRANSACTIONAL_SMS_GET_AGGREGATED_REPORT = (
        "brevo",
        "brevo_transactional_sms_get_aggregated_report",
        False,
    )
    BREVO_TRANSACTIONAL_SMS_GETS_MS_ACTIVITY_AGGREGATED_PER_DAY = (
        "brevo",
        "brevo_transactional_sms_gets_ms_activity_aggregated_per_day",
        False,
    )
    BREVO_TRANSACTIONAL_SMS_GET_ALL_EVENTS = (
        "brevo",
        "brevo_transactional_sms_get_all_events",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_GET_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_what_s_app_campaigns_get_campaign_by_id",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_DELETE_CAMPAIGN = (
        "brevo",
        "brevo_what_s_app_campaigns_delete_campaign",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_UPDATE_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_what_s_app_campaigns_update_campaign_by_id",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_GET_TEMPLATES = (
        "brevo",
        "brevo_what_s_app_campaigns_get_templates",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_CREATE_AND_SEND = (
        "brevo",
        "brevo_what_s_app_campaigns_create_and_send",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_GET_ALL = (
        "brevo",
        "brevo_what_s_app_campaigns_get_all",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_CREATE_TEMPLATE = (
        "brevo",
        "brevo_what_s_app_campaigns_create_template",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_SEND_TEMPLATE_FOR_APPROVAL = (
        "brevo",
        "brevo_what_s_app_campaigns_send_template_for_approval",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_GET_ACCOUNT_INFO = (
        "brevo",
        "brevo_what_s_app_campaigns_get_account_info",
        False,
    )
    BREVO_SENDERS_LIST_ALL = ("brevo", "brevo_senders_list_all", False)
    BREVO_SENDERS_CREATE_NEW_SENDER = (
        "brevo",
        "brevo_senders_create_new_sender",
        False,
    )
    BREVO_SENDERS_UPDATES_ENDERBY_ID = (
        "brevo",
        "brevo_senders_updates_enderby_id",
        False,
    )
    BREVO_SENDERS_REMOVE_SENDER = ("brevo", "brevo_senders_remove_sender", False)
    BREVO_SENDERS_VALIDATE_SENDER_USING_OT_P = (
        "brevo",
        "brevo_senders_validate_sender_using_ot_p",
        False,
    )
    BREVO_SENDERS_GET_ALL_DEDICATED_IPS = (
        "brevo",
        "brevo_senders_get_all_dedicated_ips",
        False,
    )
    BREVO_SENDERS_GET_DEDICATED_IPS = (
        "brevo",
        "brevo_senders_get_dedicated_ips",
        False,
    )
    BREVO_DOMAINS_GET_ALL = ("brevo", "brevo_domains_get_all", False)
    BREVO_DOMAINS_CREATE_NEW_DOMAIN = (
        "brevo",
        "brevo_domains_create_new_domain",
        False,
    )
    BREVO_DOMAINS_DELETE_DOMAIN = ("brevo", "brevo_domains_delete_domain", False)
    BREVO_DOMAINS_VALIDATE_CONFIGURATION = (
        "brevo",
        "brevo_domains_validate_configuration",
        False,
    )
    BREVO_DOMAINS_AUTHENTICATE_DOMAIN = (
        "brevo",
        "brevo_domains_authenticate_domain",
        False,
    )
    BREVO_WEB_HOOKS_GET_ALL = ("brevo", "brevo_web_hooks_get_all", False)
    BREVO_WEB_HOOKS_CREATE_HOOK = ("brevo", "brevo_web_hooks_create_hook", False)
    BREVO_WEB_HOOKS_GET_DETAILS = ("brevo", "brevo_web_hooks_get_details", False)
    BREVO_WEB_HOOKS_UPDATE_WEB_HOOK_BY_ID = (
        "brevo",
        "brevo_web_hooks_update_web_hook_by_id",
        False,
    )
    BREVO_WEB_HOOKS_DELETE_WEB_HOOK = (
        "brevo",
        "brevo_web_hooks_delete_web_hook",
        False,
    )
    BREVO_WEB_HOOKS_EXPORT_ALL_EVENTS = (
        "brevo",
        "brevo_web_hooks_export_all_events",
        False,
    )
    BREVO_RESELLER_LIST_CHILDREN_ACCOUNTS = (
        "brevo",
        "brevo_reseller_list_children_accounts",
        False,
    )
    BREVO_RESELLER_CREATE_CHILD = ("brevo", "brevo_reseller_create_child", False)
    BREVO_RESELLER_GET_CHILD_DETAILS = (
        "brevo",
        "brevo_reseller_get_child_details",
        False,
    )
    BREVO_RESELLER_UPDATE_CHILD_INFO = (
        "brevo",
        "brevo_reseller_update_child_info",
        False,
    )
    BREVO_RESELLER_DELETE_CHILD_BY_IDENTIFIER = (
        "brevo",
        "brevo_reseller_delete_child_by_identifier",
        False,
    )
    BREVO_RESELLER_UPDATE_CHILD_ACCOUNT_STATUS = (
        "brevo",
        "brevo_reseller_update_child_account_status",
        False,
    )
    BREVO_RESELLER_GET_CHILD_ACCOUNT_CREATION_STATUS = (
        "brevo",
        "brevo_reseller_get_child_account_creation_status",
        False,
    )
    BREVO_RESELLER_ASSOCIATE_DEDICATED_IP_TO_CHILD = (
        "brevo",
        "brevo_reseller_associate_dedicated_ip_to_child",
        False,
    )
    BREVO_RESELLER_DISSOCIATE_IP_TO_CHILD = (
        "brevo",
        "brevo_reseller_dissociate_ip_to_child",
        False,
    )
    BREVO_RESELLER_ADD_CHILD_CREDITS = (
        "brevo",
        "brevo_reseller_add_child_credits",
        False,
    )
    BREVO_RESELLER_REMOVE_CREDITS_FROM_CHILD = (
        "brevo",
        "brevo_reseller_remove_credits_from_child",
        False,
    )
    BREVO_RESELLER_GET_CHILD_DOMAINS = (
        "brevo",
        "brevo_reseller_get_child_domains",
        False,
    )
    BREVO_RESELLER_CREATE_CHILD_DOMAIN = (
        "brevo",
        "brevo_reseller_create_child_domain",
        False,
    )
    BREVO_RESELLER_UPDATE_SENDER_DOMAIN = (
        "brevo",
        "brevo_reseller_update_sender_domain",
        False,
    )
    BREVO_RESELLER_DELETE_SENDER_DOMAIN_BY_CHILD_IDENTIFIER_AND_DOMAIN_NAME = (
        "brevo",
        "brevo_reseller_delete_sender_domain_by_child_identifier_and_domain_name",
        False,
    )
    BREVO_RESELLER_GET_SESSION_TOKEN = (
        "brevo",
        "brevo_reseller_get_session_token",
        False,
    )
    BREVO_ACCOUNT_INFORMATION_DETAILS = (
        "brevo",
        "brevo_account_information_details",
        False,
    )
    BREVO_ACCOUNT_GET_USER_ACTIVITY_LOGS = (
        "brevo",
        "brevo_account_get_user_activity_logs",
        False,
    )
    BREVO_USER_GET_ALL_USERS = ("brevo", "brevo_user_get_all_users", False)
    BREVO_USER_CHECK_PERMISSION = ("brevo", "brevo_user_check_permission", False)
    BREVO_USER_REVOKE_PERMISSION_BY_EMAIL = (
        "brevo",
        "brevo_user_revoke_permission_by_email",
        False,
    )
    BREVO_USER_RESEND_INVITATION = ("brevo", "brevo_user_resend_invitation", False)
    BREVO_USERS_END_INVITATION = ("brevo", "brevo_users_end_invitation", False)
    BREVO_USER_UPDATE_PERMISSIONS = ("brevo", "brevo_user_update_permissions", False)
    BREVO_PROCESS_GET_ALL_PROCESSES = (
        "brevo",
        "brevo_process_get_all_processes",
        False,
    )
    BREVO_PROCESS_GET_PROCESS_INFORMATION = (
        "brevo",
        "brevo_process_get_process_information",
        False,
    )
    BREVO_INBOUND_PARSING_GET_ALL_EVENTS = (
        "brevo",
        "brevo_inbound_parsing_get_all_events",
        False,
    )
    BREVO_INBOUND_PARSING_GET_EMAIL_EVENTS = (
        "brevo",
        "brevo_inbound_parsing_get_email_events",
        False,
    )
    BREVO_INBOUND_PARSING_GET_ATTACHMENT_BY_TOKEN = (
        "brevo",
        "brevo_inbound_parsing_get_attachment_by_token",
        False,
    )
    BREVO_MASTER_ACCOUNT_LIST_SUB_ACCOUNTS = (
        "brevo",
        "brevo_master_account_list_sub_accounts",
        False,
    )
    BREVO_MASTER_ACCOUNT_CREATE_SUB_ACCOUNT = (
        "brevo",
        "brevo_master_account_create_sub_account",
        False,
    )
    BREVO_MASTER_ACCOUNT_GET_SUB_ACCOUNT_DETAILS = (
        "brevo",
        "brevo_master_account_get_sub_account_details",
        False,
    )
    BREVO_MASTER_ACCOUNT_DELETE_SUB_ACCOUNT = (
        "brevo",
        "brevo_master_account_delete_sub_account",
        False,
    )
    BREVO_MASTER_ACCOUNT_UPDATE_SUB_ACCOUNT_PLAN = (
        "brevo",
        "brevo_master_account_update_sub_account_plan",
        False,
    )
    BREVO_MASTER_ACCOUNT_GENERATES_SO_TOKEN = (
        "brevo",
        "brevo_master_account_generates_so_token",
        False,
    )
    BREVO_MASTER_ACCOUNT_GENERATES_SO_TOKEN_2 = (
        "brevo",
        "brevo_master_account_generates_so_token_2",
        False,
    )
    BREVO_MASTER_ACCOUNT_GET_DETAILS = (
        "brevo",
        "brevo_master_account_get_details",
        False,
    )
    BREVO_MASTER_ACCOUNT_CREATE_SUB_ACCOUNT_KEY = (
        "brevo",
        "brevo_master_account_create_sub_account_key",
        False,
    )
    BREVO_MASTER_ACCOUNT_ENABLE_DISABLE = (
        "brevo",
        "brevo_master_account_enable_disable",
        False,
    )
    BREVO_MASTER_ACCOUNT_CREATE_GROUP_OF_SUB_ACCOUNTS = (
        "brevo",
        "brevo_master_account_create_group_of_sub_accounts",
        False,
    )
    BREVO_MASTER_ACCOUNT_GET_GROUP_DETAILS = (
        "brevo",
        "brevo_master_account_get_group_details",
        False,
    )
    BREVO_MASTER_ACCOUNT_UPDATE_GROUP_SUB_ACCOUNTS = (
        "brevo",
        "brevo_master_account_update_group_sub_accounts",
        False,
    )
    BREVO_MASTER_ACCOUNT_DELETE_GROUP = (
        "brevo",
        "brevo_master_account_delete_group",
        False,
    )
    BREVO_MASTER_ACCOUNT_UN_LINK_SUB_ACCOUNT_FROM_GROUP = (
        "brevo",
        "brevo_master_account_un_link_sub_account_from_group",
        False,
    )
    BREVO_MASTER_ACCOUNTS_END_INVITATION_TO_ADMIN_USER = (
        "brevo",
        "brevo_master_accounts_end_invitation_to_admin_user",
        False,
    )
    BREVO_MASTER_ACCOUNT_RESEND_CANCEL_ADMIN_USER_INVITATION = (
        "brevo",
        "brevo_master_account_resend_cancel_admin_user_invitation",
        False,
    )
    BREVO_MASTER_ACCOUNT_REVOKE_ADMIN_USER = (
        "brevo",
        "brevo_master_account_revoke_admin_user",
        False,
    )
    BREVO_MASTER_ACCOUNT_LIST_ADMIN_USERS = (
        "brevo",
        "brevo_master_account_list_admin_users",
        False,
    )
    BREVO_MASTER_ACCOUNT_CHECK_ADMIN_USER_PERMISSIONS = (
        "brevo",
        "brevo_master_account_check_admin_user_permissions",
        False,
    )
    BREVO_MASTER_ACCOUNT_LIST_GROUPS = (
        "brevo",
        "brevo_master_account_list_groups",
        False,
    )
    BREVO_COMPANIES_GET_ALL = ("brevo", "brevo_companies_get_all", False)
    BREVO_COMPANIES_CREATE_COMPANY = ("brevo", "brevo_companies_create_company", False)
    BREVO_COMPANIES_GET_COMPANY_BY_ID = (
        "brevo",
        "brevo_companies_get_company_by_id",
        False,
    )
    BREVO_COMPANIES_DELETE_COMPANY = ("brevo", "brevo_companies_delete_company", False)
    BREVO_COMPANIES_UPDATE_COMPANY = ("brevo", "brevo_companies_update_company", False)
    BREVO_COMPANIES_GET_ATTRIBUTES = ("brevo", "brevo_companies_get_attributes", False)
    BREVO_COMPANIES_LINK_UN_LINK_WITH_CONTACT_DEAL = (
        "brevo",
        "brevo_companies_link_un_link_with_contact_deal",
        False,
    )
    BREVO_DEALS_GET_PIPELINE_STAGES = (
        "brevo",
        "brevo_deals_get_pipeline_stages",
        False,
    )
    BREVO_DEALS_GET_DETAILS = ("brevo", "brevo_deals_get_details", False)
    BREVO_DEALS_GET_ALL_PIPELINES = ("brevo", "brevo_deals_get_all_pipelines", False)
    BREVO_DEALS_GET_ATTRIBUTES = ("brevo", "brevo_deals_get_attributes", False)
    BREVO_DEALS_GET_ALL_DEALS = ("brevo", "brevo_deals_get_all_deals", False)
    BREVO_DEALS_CREATE_NEW_DEAL = ("brevo", "brevo_deals_create_new_deal", False)
    BREVO_DEALS_GET_BY_ID = ("brevo", "brevo_deals_get_by_id", False)
    BREVO_DEALS_DELETE_DEAL = ("brevo", "brevo_deals_delete_deal", False)
    BREVO_DEALS_UPDATE_DEAL_BY_ID = ("brevo", "brevo_deals_update_deal_by_id", False)
    BREVO_DEALS_LINK_UN_LINK_PATCH = ("brevo", "brevo_deals_link_un_link_patch", False)
    BREVO_TASKS_GET_ALL_TASK_TYPES = ("brevo", "brevo_tasks_get_all_task_types", False)
    BREVO_TASKS_GET_ALL = ("brevo", "brevo_tasks_get_all", False)
    BREVO_TASKS_CREATE_NEW_TASK = ("brevo", "brevo_tasks_create_new_task", False)
    BREVO_TASKS_GET_TASK_BY_ID = ("brevo", "brevo_tasks_get_task_by_id", False)
    BREVO_TASKS_REMOVE_TASK = ("brevo", "brevo_tasks_remove_task", False)
    BREVO_TASKS_UPDATE_TASK = ("brevo", "brevo_tasks_update_task", False)
    BREVO_NOTES_GET_ALL = ("brevo", "brevo_notes_get_all", False)
    BREVO_NOTES_CREATE_NEW_NOTE = ("brevo", "brevo_notes_create_new_note", False)
    BREVO_NOTES_GET_BY_ID = ("brevo", "brevo_notes_get_by_id", False)
    BREVO_NOTES_UPDATE_NOTE_BY_ID = ("brevo", "brevo_notes_update_note_by_id", False)
    BREVO_NOTES_REMOVE_BY_ID = ("brevo", "brevo_notes_remove_by_id", False)
    BREVO_FILES_GET_ALL_FILES = ("brevo", "brevo_files_get_all_files", False)
    BREVO_FILES_UPLOAD_FILE = ("brevo", "brevo_files_upload_file", False)
    BREVO_FILES_DOWNLOAD_FILE = ("brevo", "brevo_files_download_file", False)
    BREVO_FILES_DELETE_FILE = ("brevo", "brevo_files_delete_file", False)
    BREVO_FILES_GET_FILE_DETAILS = ("brevo", "brevo_files_get_file_details", False)
    BREVO_CONVERSATIONS_SEND_MESSAGE_AS_AGENT = (
        "brevo",
        "brevo_conversations_send_message_as_agent",
        False,
    )
    BREVO_CONVERSATIONS_GET_MESSAGE_BY_ID = (
        "brevo",
        "brevo_conversations_get_message_by_id",
        False,
    )
    BREVO_CONVERSATIONS_UPDATE_AGENT_MESSAGE = (
        "brevo",
        "brevo_conversations_update_agent_message",
        False,
    )
    BREVO_CONVERSATIONS_DELETE_MESSAGE_SENT_BY_AGENT = (
        "brevo",
        "brevo_conversations_delete_message_sent_by_agent",
        False,
    )
    BREVO_CONVERSATIONS_SEND_AUTOMATED_MESSAGE = (
        "brevo",
        "brevo_conversations_send_automated_message",
        False,
    )
    BREVO_CONVERSATIONS_GET_AUTOMATED_MESSAGE = (
        "brevo",
        "brevo_conversations_get_automated_message",
        False,
    )
    BREVO_CONVERSATIONS_UPDATE_PUSHED_MESSAGE = (
        "brevo",
        "brevo_conversations_update_pushed_message",
        False,
    )
    BREVO_CONVERSATIONS_DELETE_AUTOMATED_MESSAGE = (
        "brevo",
        "brevo_conversations_delete_automated_message",
        False,
    )
    BREVO_CONVERSATIONS_SET_AGENT_ONLINE_STATUS = (
        "brevo",
        "brevo_conversations_set_agent_online_status",
        False,
    )
    BREVO_E_COMMERCE_ACTIVATE_APP = ("brevo", "brevo_e_commerce_activate_app", False)
    BREVO_E_COMMERCE_GET_ORDERS = ("brevo", "brevo_e_commerce_get_orders", False)
    BREVO_E_COMMERCE_MANAGE_ORDER_STATUS = (
        "brevo",
        "brevo_e_commerce_manage_order_status",
        False,
    )
    BREVO_E_COMMERCE_CREATE_ORDER_BATCH = (
        "brevo",
        "brevo_e_commerce_create_order_batch",
        False,
    )
    BREVO_EVENT_TRACK_INTERACTION = ("brevo", "brevo_event_track_interaction", False)
    BREVO_E_COMMERCE_GET_ALL_CATEGORIES = (
        "brevo",
        "brevo_e_commerce_get_all_categories",
        False,
    )
    BREVO_E_COMMERCE_CREATE_CATEGORY = (
        "brevo",
        "brevo_e_commerce_create_category",
        False,
    )
    BREVO_E_COMMERCE_GET_CATEGORY_DETAILS = (
        "brevo",
        "brevo_e_commerce_get_category_details",
        False,
    )
    BREVO_E_COMMERCE_CREATE_CATEGORIES_BATCH = (
        "brevo",
        "brevo_e_commerce_create_categories_batch",
        False,
    )
    BREVO_E_COMMERCE_LIST_ALL_PRODUCTS = (
        "brevo",
        "brevo_e_commerce_list_all_products",
        False,
    )
    BREVO_E_COMMERCE_CREATE_PRODUCT = (
        "brevo",
        "brevo_e_commerce_create_product",
        False,
    )
    BREVO_E_COMMERCE_GET_PRODUCT_DETAILS = (
        "brevo",
        "brevo_e_commerce_get_product_details",
        False,
    )
    BREVO_E_COMMERCE_CREATE_PRODUCTS_BATCH = (
        "brevo",
        "brevo_e_commerce_create_products_batch",
        False,
    )
    BREVO_COUPONS_LIST_COUPON_COLLECTIONS = (
        "brevo",
        "brevo_coupons_list_coupon_collections",
        False,
    )
    BREVO_COUPONS_CREATE_COLLECTION = (
        "brevo",
        "brevo_coupons_create_collection",
        False,
    )
    BREVO_COUPONS_GET_BY_ID = ("brevo", "brevo_coupons_get_by_id", False)
    BREVO_COUPONS_UPDATE_COUPON_COLLECTION_BY_ID = (
        "brevo",
        "brevo_coupons_update_coupon_collection_by_id",
        False,
    )
    BREVO_COUPONS_CREATE_COUPON_COLLECTION = (
        "brevo",
        "brevo_coupons_create_coupon_collection",
        False,
    )
    BREVO_TRANSACTIONAL_WHAT_S_APPS_END_MESSAGE = (
        "brevo",
        "brevo_transactional_what_s_apps_end_message",
        False,
    )
    BREVO_TRANSACTIONAL_WHAT_S_APP_GET_ACTIVITY = (
        "brevo",
        "brevo_transactional_what_s_app_get_activity",
        False,
    )
    BREVO_EXTERNAL_FEEDS_GET_ALL_FEEDS = (
        "brevo",
        "brevo_external_feeds_get_all_feeds",
        False,
    )
    BREVO_EXTERNAL_FEEDS_CREATE_FEED = (
        "brevo",
        "brevo_external_feeds_create_feed",
        False,
    )
    BREVO_EXTERNAL_FEEDS_GET_FEED_BYU_U_ID = (
        "brevo",
        "brevo_external_feeds_get_feed_byu_u_id",
        False,
    )
    BREVO_EXTERNAL_FEEDS_UPDATE_FEED_BYU_U_ID = (
        "brevo",
        "brevo_external_feeds_update_feed_byu_u_id",
        False,
    )
    BREVO_EXTERNAL_FEEDS_DELETE_FEED_BYU_U_ID = (
        "brevo",
        "brevo_external_feeds_delete_feed_byu_u_id",
        False,
    )
    CLICKUP_ATTACHMENTS_UPLOAD_FILE_TO_TASK_AS_ATTACHMENT = (
        "clickup",
        "clickup_attachments_upload_file_to_task_as_attachment",
        False,
    )
    CLICKUP_AUTHORIZATION_GET_ACCESS_TOKEN = (
        "clickup",
        "clickup_authorization_get_access_token",
        False,
    )
    CLICKUP_AUTHORIZATION_VIEW_ACCOUNT_DETAILS = (
        "clickup",
        "clickup_authorization_view_account_details",
        False,
    )
    CLICKUP_AUTHORIZATION_GET_WORK_SPACE_LIST = (
        "clickup",
        "clickup_authorization_get_work_space_list",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_CREATE_NEW_CHECKLIST = (
        "clickup",
        "clickup_task_checklists_create_new_checklist",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_UPDATE_CHECKLIST = (
        "clickup",
        "clickup_task_checklists_update_checklist",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_REMOVE_CHECKLIST = (
        "clickup",
        "clickup_task_checklists_remove_checklist",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_ADD_LINE_ITEM = (
        "clickup",
        "clickup_task_checklists_add_line_item",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_UPDATE_CHECKLIST_ITEM = (
        "clickup",
        "clickup_task_checklists_update_checklist_item",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_REMOVE_CHECKLIST_ITEM = (
        "clickup",
        "clickup_task_checklists_remove_checklist_item",
        False,
    )
    CLICKUP_COMMENTS_GET_TASK_COMMENTS = (
        "clickup",
        "clickup_comments_get_task_comments",
        False,
    )
    CLICKUP_COMMENTS_CREATE_NEW_TASK_COMMENT = (
        "clickup",
        "clickup_comments_create_new_task_comment",
        False,
    )
    CLICKUP_COMMENTS_GET_VIEW_COMMENTS = (
        "clickup",
        "clickup_comments_get_view_comments",
        False,
    )
    CLICKUP_COMMENTS_CREATE_CHAT_VIEW_COMMENT = (
        "clickup",
        "clickup_comments_create_chat_view_comment",
        False,
    )
    CLICKUP_COMMENTS_GET_LIST_COMMENTS = (
        "clickup",
        "clickup_comments_get_list_comments",
        False,
    )
    CLICKUP_COMMENTS_ADD_TO_LIST_COMMENT = (
        "clickup",
        "clickup_comments_add_to_list_comment",
        False,
    )
    CLICKUP_COMMENTS_UPDATE_TASK_COMMENT = (
        "clickup",
        "clickup_comments_update_task_comment",
        False,
    )
    CLICKUP_COMMENTS_DELETE_TASK_COMMENT = (
        "clickup",
        "clickup_comments_delete_task_comment",
        False,
    )
    CLICKUP_CUSTOM_FIELDS_GET_LIST_FIELDS = (
        "clickup",
        "clickup_custom_fields_get_list_fields",
        False,
    )
    CLICKUP_CUSTOM_FIELDS_REMOVE_FIELD_VALUE = (
        "clickup",
        "clickup_custom_fields_remove_field_value",
        False,
    )
    CLICKUP_TASK_RELATIONSHIPS_ADD_DEPENDENCY = (
        "clickup",
        "clickup_task_relationships_add_dependency",
        False,
    )
    CLICKUP_TASK_RELATIONSHIPS_REMOVE_DEPENDENCY = (
        "clickup",
        "clickup_task_relationships_remove_dependency",
        False,
    )
    CLICKUP_TASK_RELATIONSHIPS_LINK_TASKS = (
        "clickup",
        "clickup_task_relationships_link_tasks",
        False,
    )
    CLICKUP_TASK_RELATIONSHIPS_REMOVE_LINK_BETWEEN_TASKS = (
        "clickup",
        "clickup_task_relationships_remove_link_between_tasks",
        False,
    )
    CLICKUP_FOLDERS_GET_CONTENTS_OF = (
        "clickup",
        "clickup_folders_get_contents_of",
        False,
    )
    CLICKUP_FOLDERS_CREATE_NEW_FOLDER = (
        "clickup",
        "clickup_folders_create_new_folder",
        False,
    )
    CLICKUP_FOLDERS_GET_FOLDER_CONTENT = (
        "clickup",
        "clickup_folders_get_folder_content",
        False,
    )
    CLICKUP_FOLDERS_RENAME_FOLDER = ("clickup", "clickup_folders_rename_folder", False)
    CLICKUP_FOLDERS_REMOVE_FOLDER = ("clickup", "clickup_folders_remove_folder", False)
    CLICKUP_GOALS_GET_WORK_SPACE_GOALS = (
        "clickup",
        "clickup_goals_get_work_space_goals",
        False,
    )
    CLICKUP_GOALS_ADD_NEW_GOAL_TO_WORK_SPACE = (
        "clickup",
        "clickup_goals_add_new_goal_to_work_space",
        False,
    )
    CLICKUP_GOALS_GET_DETAILS = ("clickup", "clickup_goals_get_details", False)
    CLICKUP_GOALS_UPDATE_GOAL_DETAILS = (
        "clickup",
        "clickup_goals_update_goal_details",
        False,
    )
    CLICKUP_GOALS_REMOVE_GOAL = ("clickup", "clickup_goals_remove_goal", False)
    CLICKUP_GOALS_ADD_KEY_RESULT = ("clickup", "clickup_goals_add_key_result", False)
    CLICKUP_GOALS_UPDATE_KEY_RESULT = (
        "clickup",
        "clickup_goals_update_key_result",
        False,
    )
    CLICKUP_GOALS_REMOVE_TARGET = ("clickup", "clickup_goals_remove_target", False)
    CLICKUP_GUESTS_INVITE_TO_WORK_SPACE = (
        "clickup",
        "clickup_guests_invite_to_work_space",
        False,
    )
    CLICKUP_GUESTS_GET_GUEST_INFORMATION = (
        "clickup",
        "clickup_guests_get_guest_information",
        False,
    )
    CLICKUP_GUESTS_EDIT_GUEST_ON_WORK_SPACE = (
        "clickup",
        "clickup_guests_edit_guest_on_work_space",
        False,
    )
    CLICKUP_GUESTS_REVOKE_GUEST_ACCESS_TO_WORK_SPACE = (
        "clickup",
        "clickup_guests_revoke_guest_access_to_work_space",
        False,
    )
    CLICKUP_GUESTS_ADD_TO_TASK = ("clickup", "clickup_guests_add_to_task", False)
    CLICKUP_GUESTS_REVOKE_ACCESS_TO_TASK = (
        "clickup",
        "clickup_guests_revoke_access_to_task",
        False,
    )
    CLICKUP_GUESTS_SHARE_LIST_WITH = (
        "clickup",
        "clickup_guests_share_list_with",
        False,
    )
    CLICKUP_GUESTS_REMOVE_FROM_LIST = (
        "clickup",
        "clickup_guests_remove_from_list",
        False,
    )
    CLICKUP_GUESTS_ADD_GUEST_TO_FOLDER = (
        "clickup",
        "clickup_guests_add_guest_to_folder",
        False,
    )
    CLICKUP_GUESTS_REVOKE_ACCESS_FROM_FOLDER = (
        "clickup",
        "clickup_guests_revoke_access_from_folder",
        False,
    )
    CLICKUP_LISTS_GET_FOLDER_LISTS = (
        "clickup",
        "clickup_lists_get_folder_lists",
        False,
    )
    CLICKUP_LISTS_ADD_TO_FOLDER = ("clickup", "clickup_lists_add_to_folder", False)
    CLICKUP_LISTS_GET_FOLDER_LESS = ("clickup", "clickup_lists_get_folder_less", False)
    CLICKUP_LISTS_CREATE_FOLDER_LESS_LIST = (
        "clickup",
        "clickup_lists_create_folder_less_list",
        False,
    )
    CLICKUP_LISTS_GET_LIST_DETAILS = (
        "clickup",
        "clickup_lists_get_list_details",
        False,
    )
    CLICKUP_LISTS_UPDATE_LIST_INFO_DUE_DATE_PRIORITY_ASSIGN_EE_COLOR = (
        "clickup",
        "clickup_lists_update_list_info_due_date_priority_assign_ee_color",
        False,
    )
    CLICKUP_LISTS_REMOVE_LIST = ("clickup", "clickup_lists_remove_list", False)
    CLICKUP_LISTS_ADD_TASK_TO_LIST = (
        "clickup",
        "clickup_lists_add_task_to_list",
        False,
    )
    CLICKUP_LISTS_REMOVE_TASK_FROM_LIST = (
        "clickup",
        "clickup_lists_remove_task_from_list",
        False,
    )
    CLICKUP_MEMBERS_GET_TASK_ACCESS = (
        "clickup",
        "clickup_members_get_task_access",
        False,
    )
    CLICKUP_MEMBERS_GET_LIST_USERS = (
        "clickup",
        "clickup_members_get_list_users",
        False,
    )
    CLICKUP_ROLES_LIST_AVAILABLE_CUSTOM_ROLES = (
        "clickup",
        "clickup_roles_list_available_custom_roles",
        False,
    )
    CLICKUP_SHARED_HIERARCHY_VIEW_TASKS_LISTS_FOLDERS = (
        "clickup",
        "clickup_shared_hierarchy_view_tasks_lists_folders",
        False,
    )
    CLICKUP_SPACES_GET_SPACE_DETAILS = (
        "clickup",
        "clickup_spaces_get_space_details",
        False,
    )
    CLICKUP_SPACES_ADD_NEW_SPACE_TO_WORK_SPACE = (
        "clickup",
        "clickup_spaces_add_new_space_to_work_space",
        False,
    )
    CLICKUP_SPACES_GET_DETAILS = ("clickup", "clickup_spaces_get_details", False)
    CLICKUP_SPACES_UPDATE_DETAILS_AND_ENABLE_CLICK_APPS = (
        "clickup",
        "clickup_spaces_update_details_and_enable_click_apps",
        False,
    )
    CLICKUP_SPACES_REMOVE_SPACE = ("clickup", "clickup_spaces_remove_space", False)
    CLICKUP_TAGS_GET_SPACE = ("clickup", "clickup_tags_get_space", False)
    CLICKUP_TAGS_CREATE_SPACE_TAG = ("clickup", "clickup_tags_create_space_tag", False)
    CLICKUP_TAGS_UPDATE_SPACE_TAG = ("clickup", "clickup_tags_update_space_tag", False)
    CLICKUP_TAGS_REMOVE_SPACE_TAG = ("clickup", "clickup_tags_remove_space_tag", False)
    CLICKUP_TAGS_ADD_TO_TASK = ("clickup", "clickup_tags_add_to_task", False)
    CLICKUP_TAGS_REMOVE_FROM_TASK = ("clickup", "clickup_tags_remove_from_task", False)
    CLICKUP_TASKS_GET_LIST_TASKS = ("clickup", "clickup_tasks_get_list_tasks", False)
    CLICKUP_TASKS_CREATE_NEW_TASK = ("clickup", "clickup_tasks_create_new_task", False)
    CLICKUP_TASKS_GET_TASK_DETAILS = (
        "clickup",
        "clickup_tasks_get_task_details",
        False,
    )
    CLICKUP_TASKS_UPDATE_TASK_FIELDS = (
        "clickup",
        "clickup_tasks_update_task_fields",
        False,
    )
    CLICKUP_TASKS_REMOVE_TASK_BY_ID = (
        "clickup",
        "clickup_tasks_remove_task_by_id",
        False,
    )
    CLICKUP_TASKS_FILTER_TEAM_TASKS = (
        "clickup",
        "clickup_tasks_filter_team_tasks",
        False,
    )
    CLICKUP_TASKS_GET_TIME_IN_STATUS = (
        "clickup",
        "clickup_tasks_get_time_in_status",
        False,
    )
    CLICKUP_TASKS_GET_TIME_IN_STATUS_BULK = (
        "clickup",
        "clickup_tasks_get_time_in_status_bulk",
        False,
    )
    CLICKUP_TASK_TEMPLATES_GET_TEMPLATES = (
        "clickup",
        "clickup_task_templates_get_templates",
        False,
    )
    CLICKUP_TASK_TEMPLATES_CREATE_FROM_TEMPLATE = (
        "clickup",
        "clickup_task_templates_create_from_template",
        False,
    )
    CLICKUP_TEAMS_WORK_SPACES_GET_WORK_SPACE_SEATS = (
        "clickup",
        "clickup_teams_work_spaces_get_work_space_seats",
        False,
    )
    CLICKUP_TEAMS_WORK_SPACES_GET_WORK_SPACE_PLAN = (
        "clickup",
        "clickup_teams_work_spaces_get_work_space_plan",
        False,
    )
    CLICKUP_TEAMS_USER_GROUPS_CREATE_TEAM = (
        "clickup",
        "clickup_teams_user_groups_create_team",
        False,
    )
    CLICKUP_CUSTOM_TASK_TYPES_GET_AVAILABLE_TASK_TYPES = (
        "clickup",
        "clickup_custom_task_types_get_available_task_types",
        False,
    )
    CLICKUP_TEAMS_USER_GROUPS_UPDATE_USER_GROUP = (
        "clickup",
        "clickup_teams_user_groups_update_user_group",
        False,
    )
    CLICKUP_TEAMS_USER_GROUPS_REMOVE_GROUP = (
        "clickup",
        "clickup_teams_user_groups_remove_group",
        False,
    )
    CLICKUP_TEAMS_USER_GROUPS_GET_USER_GROUPS = (
        "clickup",
        "clickup_teams_user_groups_get_user_groups",
        False,
    )
    CLICKUP_TIME_TRACKING_LEGACY_GET_TRACKED_TIME = (
        "clickup",
        "clickup_time_tracking_legacy_get_tracked_time",
        False,
    )
    CLICKUP_TIME_TRACKING_LEGACY_RECORD_TIME_FOR_TASK = (
        "clickup",
        "clickup_time_tracking_legacy_record_time_for_task",
        False,
    )
    CLICKUP_TIME_TRACKING_LEGACY_EDIT_TIME_TRACKED = (
        "clickup",
        "clickup_time_tracking_legacy_edit_time_tracked",
        False,
    )
    CLICKUP_TIME_TRACKING_LEGACY_REMOVE_TRACKED_TIME = (
        "clickup",
        "clickup_time_tracking_legacy_remove_tracked_time",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_TIME_ENTRIES_WITHIN_DATE_RANGE = (
        "clickup",
        "clickup_time_tracking_get_time_entries_within_date_range",
        False,
    )
    CLICKUP_TIME_TRACKING_CREATE_TIME_ENTRY = (
        "clickup",
        "clickup_time_tracking_create_time_entry",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_SINGLE_TIME_ENTRY = (
        "clickup",
        "clickup_time_tracking_get_single_time_entry",
        False,
    )
    CLICKUP_TIME_TRACKING_REMOVE_ENTRY = (
        "clickup",
        "clickup_time_tracking_remove_entry",
        False,
    )
    CLICKUP_TIME_TRACKING_UPDATE_TIME_ENTRY_DETAILS = (
        "clickup",
        "clickup_time_tracking_update_time_entry_details",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_TIME_ENTRY_HISTORY = (
        "clickup",
        "clickup_time_tracking_get_time_entry_history",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_CURRENT_TIME_ENTRY = (
        "clickup",
        "clickup_time_tracking_get_current_time_entry",
        False,
    )
    CLICKUP_TIME_TRACKING_REMOVE_TAGS_FROM_TIME_ENTRIES = (
        "clickup",
        "clickup_time_tracking_remove_tags_from_time_entries",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_ALL_TAGS_FROM_TIME_ENTRIES = (
        "clickup",
        "clickup_time_tracking_get_all_tags_from_time_entries",
        False,
    )
    CLICKUP_TIME_TRACKING_ADD_TAGS_FROM_TIME_ENTRIES = (
        "clickup",
        "clickup_time_tracking_add_tags_from_time_entries",
        False,
    )
    CLICKUP_TIME_TRACKING_CHANGE_TAG_NAMES = (
        "clickup",
        "clickup_time_tracking_change_tag_names",
        False,
    )
    CLICKUP_TIME_TRACKING_START_TIMER = (
        "clickup",
        "clickup_time_tracking_start_timer",
        False,
    )
    CLICKUP_TIME_TRACKING_STOP_TIME_ENTRY = (
        "clickup",
        "clickup_time_tracking_stop_time_entry",
        False,
    )
    CLICKUP_USERS_INVITE_USER_TO_WORK_SPACE = (
        "clickup",
        "clickup_users_invite_user_to_work_space",
        False,
    )
    CLICKUP_USERS_GET_USER_DETAILS = (
        "clickup",
        "clickup_users_get_user_details",
        False,
    )
    CLICKUP_USERS_UPDATE_USER_DETAILS = (
        "clickup",
        "clickup_users_update_user_details",
        False,
    )
    CLICKUP_USERS_DEACTIVATE_FROM_WORK_SPACE = (
        "clickup",
        "clickup_users_deactivate_from_work_space",
        False,
    )
    CLICKUP_VIEWS_GET_EVERYTHING_LEVEL = (
        "clickup",
        "clickup_views_get_everything_level",
        False,
    )
    CLICKUP_VIEWS_SPACE_VIEWS_GET = ("clickup", "clickup_views_space_views_get", False)
    CLICKUP_VIEWS_FOLDER_VIEWS_GET = (
        "clickup",
        "clickup_views_folder_views_get",
        False,
    )
    CLICKUP_VIEWS_GET_LIST_VIEWS = ("clickup", "clickup_views_get_list_views", False)
    CLICKUP_VIEWS_GET_VIEW_INFO = ("clickup", "clickup_views_get_view_info", False)
    CLICKUP_VIEWS_DELETE_VIEW_BY_ID = (
        "clickup",
        "clickup_views_delete_view_by_id",
        False,
    )
    CLICKUP_VIEWS_GET_TASKS_IN_VIEW = (
        "clickup",
        "clickup_views_get_tasks_in_view",
        False,
    )
    CLICKUP_WEB_HOOKS_WORK_SPACE_GET = (
        "clickup",
        "clickup_web_hooks_work_space_get",
        False,
    )
    CLICKUP_WEB_HOOKS_CREATE_WEB_HOOK = (
        "clickup",
        "clickup_web_hooks_create_web_hook",
        False,
    )
    CLICKUP_WEB_HOOKS_UPDATE_EVENTS_TO_MONITOR = (
        "clickup",
        "clickup_web_hooks_update_events_to_monitor",
        False,
    )
    CLICKUP_WEB_HOOKS_REMOVE_WEB_HOOK_BY_ID = (
        "clickup",
        "clickup_web_hooks_remove_web_hook_by_id",
        False,
    )
    CODEINTERPRETER_EXECUTE_CODE = (
        "codeinterpreter",
        "codeinterpreter_execute_code",
        True,
    )
    COMPOSIO_CHECK_ACTIVE_CONNECTION = (
        "composio",
        "composio_check_active_connection",
        True,
    )
    COMPOSIO_INITIATE_CONNECTION = ("composio", "composio_initiate_connection", True)
    COMPOSIO_WAIT_FOR_CONNECTION = ("composio", "composio_wait_for_connection", True)
    COMPOSIO_RETRIEVE_APPS = ("composio", "composio_retrieve_apps", True)
    COMPOSIO_RETRIEVE_ACTIONS = ("composio", "composio_retrieve_actions", True)
    DISCORD_GETMYOAUTH2APPLICATION = (
        "discord",
        "discord_getmyoauth2application",
        False,
    )
    DISCORD_LISTMYCONNECTIONS = ("discord", "discord_listmyconnections", False)
    DISCORD_CREATEDM = ("discord", "discord_createdm", False)
    DISCORD_LISTMYGUILDS = ("discord", "discord_listmyguilds", False)
    DISCORD_GETMYAPPLICATION = ("discord", "discord_getmyapplication", False)
    DISCORD_UPDATEMYAPPLICATION = ("discord", "discord_updatemyapplication", False)
    DISCORD_GETBOTGATEWAY = ("discord", "discord_getbotgateway", False)
    DISCORD_GETPUBLICKEYS = ("discord", "discord_getpublickeys", False)
    DISCORD_GETMYOAUTH2AUTHORIZATION = (
        "discord",
        "discord_getmyoauth2authorization",
        False,
    )
    DISCORD_LISTVOICEREGIONS = ("discord", "discord_listvoiceregions", False)
    DISCORD_GETMYUSER = ("discord", "discord_getmyuser", False)
    DISCORD_UPDATEMYUSER = ("discord", "discord_updatemyuser", False)
    DISCORD_CREATESTAGEINSTANCE = ("discord", "discord_createstageinstance", False)
    DISCORD_LISTSTICKERPACKS = ("discord", "discord_liststickerpacks", False)
    DISCORD_GETGATEWAY = ("discord", "discord_getgateway", False)
    DISCORD_CREATEGUILD = ("discord", "discord_createguild", False)
    DISCORD_LISTMYPRIVATEARCHIVEDTHREADS = (
        "discord",
        "discord_listmyprivatearchivedthreads",
        False,
    )
    DISCORD_LISTGUILDAPPLICATIONCOMMANDPERMISSIONS = (
        "discord",
        "discord_listguildapplicationcommandpermissions",
        False,
    )
    DISCORD_GETGUILDAPPLICATIONCOMMANDPERMISSIONS = (
        "discord",
        "discord_getguildapplicationcommandpermissions",
        False,
    )
    DISCORD_SETGUILDAPPLICATIONCOMMANDPERMISSIONS = (
        "discord",
        "discord_setguildapplicationcommandpermissions",
        False,
    )
    DISCORD_ADDMYMESSAGEREACTION = ("discord", "discord_addmymessagereaction", False)
    DISCORD_DELETEMYMESSAGEREACTION = (
        "discord",
        "discord_deletemymessagereaction",
        False,
    )
    DISCORD_LISTPRIVATEARCHIVEDTHREADS = (
        "discord",
        "discord_listprivatearchivedthreads",
        False,
    )
    DISCORD_LISTPUBLICARCHIVEDTHREADS = (
        "discord",
        "discord_listpublicarchivedthreads",
        False,
    )
    DISCORD_GETAPPLICATIONUSERROLECONNECTION = (
        "discord",
        "discord_getapplicationuserroleconnection",
        False,
    )
    DISCORD_UPDATEAPPLICATIONUSERROLECONNECTION = (
        "discord",
        "discord_updateapplicationuserroleconnection",
        False,
    )
    DISCORD_GETMYGUILDMEMBER = ("discord", "discord_getmyguildmember", False)
    DISCORD_GETAPPLICATIONROLECONNECTIONSMETADATA = (
        "discord",
        "discord_getapplicationroleconnectionsmetadata",
        False,
    )
    DISCORD_GETGUILDAPPLICATIONCOMMAND = (
        "discord",
        "discord_getguildapplicationcommand",
        False,
    )
    DISCORD_DELETEGUILDAPPLICATIONCOMMAND = (
        "discord",
        "discord_deleteguildapplicationcommand",
        False,
    )
    DISCORD_UPDATEGUILDAPPLICATIONCOMMAND = (
        "discord",
        "discord_updateguildapplicationcommand",
        False,
    )
    DISCORD_LISTGUILDAPPLICATIONCOMMANDS = (
        "discord",
        "discord_listguildapplicationcommands",
        False,
    )
    DISCORD_CREATEGUILDAPPLICATIONCOMMAND = (
        "discord",
        "discord_createguildapplicationcommand",
        False,
    )
    DISCORD_JOINTHREAD = ("discord", "discord_jointhread", False)
    DISCORD_LEAVETHREAD = ("discord", "discord_leavethread", False)
    DISCORD_BULKDELETEMESSAGES = ("discord", "discord_bulkdeletemessages", False)
    DISCORD_DELETEUSERMESSAGEREACTION = (
        "discord",
        "discord_deleteusermessagereaction",
        False,
    )
    DISCORD_LISTMESSAGEREACTIONSBYEMOJI = (
        "discord",
        "discord_listmessagereactionsbyemoji",
        False,
    )
    DISCORD_DELETEALLMESSAGEREACTIONSBYEMOJI = (
        "discord",
        "discord_deleteallmessagereactionsbyemoji",
        False,
    )
    DISCORD_DELETEALLMESSAGEREACTIONS = (
        "discord",
        "discord_deleteallmessagereactions",
        False,
    )
    DISCORD_CROSSPOSTMESSAGE = ("discord", "discord_crosspostmessage", False)
    DISCORD_CREATETHREADFROMMESSAGE = (
        "discord",
        "discord_createthreadfrommessage",
        False,
    )
    DISCORD_GETORIGINALWEBHOOKMESSAGE = (
        "discord",
        "discord_getoriginalwebhookmessage",
        False,
    )
    DISCORD_DELETEORIGINALWEBHOOKMESSAGE = (
        "discord",
        "discord_deleteoriginalwebhookmessage",
        False,
    )
    DISCORD_UPDATEORIGINALWEBHOOKMESSAGE = (
        "discord",
        "discord_updateoriginalwebhookmessage",
        False,
    )
    DISCORD_LISTGUILDSCHEDULEDEVENTUSERS = (
        "discord",
        "discord_listguildscheduledeventusers",
        False,
    )
    DISCORD_GETAUTOMODERATIONRULE = ("discord", "discord_getautomoderationrule", False)
    DISCORD_DELETEAUTOMODERATIONRULE = (
        "discord",
        "discord_deleteautomoderationrule",
        False,
    )
    DISCORD_LISTAUTOMODERATIONRULES = (
        "discord",
        "discord_listautomoderationrules",
        False,
    )
    DISCORD_CREATEAUTOMODERATIONRULE = (
        "discord",
        "discord_createautomoderationrule",
        False,
    )
    DISCORD_UPDATESELFVOICESTATE = ("discord", "discord_updateselfvoicestate", False)
    DISCORD_SEARCHGUILDMEMBERS = ("discord", "discord_searchguildmembers", False)
    DISCORD_GETACTIVEGUILDTHREADS = ("discord", "discord_getactiveguildthreads", False)
    DISCORD_UPDATEMYGUILDMEMBER = ("discord", "discord_updatemyguildmember", False)
    DISCORD_ADDGUILDMEMBERROLE = ("discord", "discord_addguildmemberrole", False)
    DISCORD_DELETEGUILDMEMBERROLE = ("discord", "discord_deleteguildmemberrole", False)
    DISCORD_LEAVEGUILD = ("discord", "discord_leaveguild", False)
    DISCORD_GETAPPLICATIONCOMMAND = ("discord", "discord_getapplicationcommand", False)
    DISCORD_DELETEAPPLICATIONCOMMAND = (
        "discord",
        "discord_deleteapplicationcommand",
        False,
    )
    DISCORD_UPDATEAPPLICATIONCOMMAND = (
        "discord",
        "discord_updateapplicationcommand",
        False,
    )
    DISCORD_LISTAPPLICATIONCOMMANDS = (
        "discord",
        "discord_listapplicationcommands",
        False,
    )
    DISCORD_CREATEAPPLICATIONCOMMAND = (
        "discord",
        "discord_createapplicationcommand",
        False,
    )
    DISCORD_GETTHREADMEMBER = ("discord", "discord_getthreadmember", False)
    DISCORD_ADDTHREADMEMBER = ("discord", "discord_addthreadmember", False)
    DISCORD_DELETETHREADMEMBER = ("discord", "discord_deletethreadmember", False)
    DISCORD_LISTTHREADMEMBERS = ("discord", "discord_listthreadmembers", False)
    DISCORD_SETCHANNELPERMISSIONOVERWRITE = (
        "discord",
        "discord_setchannelpermissionoverwrite",
        False,
    )
    DISCORD_DELETECHANNELPERMISSIONOVERWRITE = (
        "discord",
        "discord_deletechannelpermissionoverwrite",
        False,
    )
    DISCORD_ADDGROUPDMUSER = ("discord", "discord_addgroupdmuser", False)
    DISCORD_DELETEGROUPDMUSER = ("discord", "discord_deletegroupdmuser", False)
    DISCORD_FOLLOWCHANNEL = ("discord", "discord_followchannel", False)
    DISCORD_GETMESSAGE = ("discord", "discord_getmessage", False)
    DISCORD_DELETEMESSAGE = ("discord", "discord_deletemessage", False)
    DISCORD_UPDATEMESSAGE = ("discord", "discord_updatemessage", False)
    DISCORD_LISTMESSAGES = ("discord", "discord_listmessages", False)
    DISCORD_CREATEMESSAGE = ("discord", "discord_createmessage", False)
    DISCORD_LISTCHANNELWEBHOOKS = ("discord", "discord_listchannelwebhooks", False)
    DISCORD_CREATEWEBHOOK = ("discord", "discord_createwebhook", False)
    DISCORD_LISTCHANNELINVITES = ("discord", "discord_listchannelinvites", False)
    DISCORD_TRIGGERTYPINGINDICATOR = (
        "discord",
        "discord_triggertypingindicator",
        False,
    )
    DISCORD_PINMESSAGE = ("discord", "discord_pinmessage", False)
    DISCORD_UNPINMESSAGE = ("discord", "discord_unpinmessage", False)
    DISCORD_LISTPINNEDMESSAGES = ("discord", "discord_listpinnedmessages", False)
    DISCORD_GETWEBHOOKMESSAGE = ("discord", "discord_getwebhookmessage", False)
    DISCORD_DELETEWEBHOOKMESSAGE = ("discord", "discord_deletewebhookmessage", False)
    DISCORD_UPDATEWEBHOOKMESSAGE = ("discord", "discord_updatewebhookmessage", False)
    DISCORD_EXECUTEGITHUBCOMPATIBLEWEBHOOK = (
        "discord",
        "discord_executegithubcompatiblewebhook",
        False,
    )
    DISCORD_EXECUTESLACKCOMPATIBLEWEBHOOK = (
        "discord",
        "discord_executeslackcompatiblewebhook",
        False,
    )
    DISCORD_GETGUILDTEMPLATE = ("discord", "discord_getguildtemplate", False)
    DISCORD_CREATEGUILDFROMTEMPLATE = (
        "discord",
        "discord_createguildfromtemplate",
        False,
    )
    DISCORD_GETGUILDNEWMEMBERWELCOME = (
        "discord",
        "discord_getguildnewmemberwelcome",
        False,
    )
    DISCORD_GETGUILDSCHEDULEDEVENT = (
        "discord",
        "discord_getguildscheduledevent",
        False,
    )
    DISCORD_DELETEGUILDSCHEDULEDEVENT = (
        "discord",
        "discord_deleteguildscheduledevent",
        False,
    )
    DISCORD_LISTGUILDSCHEDULEDEVENTS = (
        "discord",
        "discord_listguildscheduledevents",
        False,
    )
    DISCORD_CREATEGUILDSCHEDULEDEVENT = (
        "discord",
        "discord_createguildscheduledevent",
        False,
    )
    DISCORD_GETGUILDWELCOMESCREEN = ("discord", "discord_getguildwelcomescreen", False)
    DISCORD_UPDATEGUILDWELCOMESCREEN = (
        "discord",
        "discord_updateguildwelcomescreen",
        False,
    )
    DISCORD_UPDATEVOICESTATE = ("discord", "discord_updatevoicestate", False)
    DISCORD_DELETEGUILDINTEGRATION = (
        "discord",
        "discord_deleteguildintegration",
        False,
    )
    DISCORD_LISTGUILDINTEGRATIONS = ("discord", "discord_listguildintegrations", False)
    DISCORD_GETGUILDWIDGET = ("discord", "discord_getguildwidget", False)
    DISCORD_GETGUILDSONBOARDING = ("discord", "discord_getguildsonboarding", False)
    DISCORD_PUTGUILDSONBOARDING = ("discord", "discord_putguildsonboarding", False)
    DISCORD_GETGUILDVANITYURL = ("discord", "discord_getguildvanityurl", False)
    DISCORD_LISTGUILDAUDITLOGENTRIES = (
        "discord",
        "discord_listguildauditlogentries",
        False,
    )
    DISCORD_GETGUILDWIDGETPNG = ("discord", "discord_getguildwidgetpng", False)
    DISCORD_SYNCGUILDTEMPLATE = ("discord", "discord_syncguildtemplate", False)
    DISCORD_DELETEGUILDTEMPLATE = ("discord", "discord_deleteguildtemplate", False)
    DISCORD_UPDATEGUILDTEMPLATE = ("discord", "discord_updateguildtemplate", False)
    DISCORD_LISTGUILDTEMPLATES = ("discord", "discord_listguildtemplates", False)
    DISCORD_CREATEGUILDTEMPLATE = ("discord", "discord_createguildtemplate", False)
    DISCORD_GETGUILDSTICKER = ("discord", "discord_getguildsticker", False)
    DISCORD_DELETEGUILDSTICKER = ("discord", "discord_deleteguildsticker", False)
    DISCORD_UPDATEGUILDSTICKER = ("discord", "discord_updateguildsticker", False)
    DISCORD_BULKBANUSERSFROMGUILD = ("discord", "discord_bulkbanusersfromguild", False)
    DISCORD_LISTGUILDSTICKERS = ("discord", "discord_listguildstickers", False)
    DISCORD_CREATEGUILDSTICKER = ("discord", "discord_createguildsticker", False)
    DISCORD_GETGUILDWEBHOOKS = ("discord", "discord_getguildwebhooks", False)
    DISCORD_LISTGUILDCHANNELS = ("discord", "discord_listguildchannels", False)
    DISCORD_CREATEGUILDCHANNEL = ("discord", "discord_createguildchannel", False)
    DISCORD_GETGUILDMEMBER = ("discord", "discord_getguildmember", False)
    DISCORD_ADDGUILDMEMBER = ("discord", "discord_addguildmember", False)
    DISCORD_DELETEGUILDMEMBER = ("discord", "discord_deleteguildmember", False)
    DISCORD_UPDATEGUILDMEMBER = ("discord", "discord_updateguildmember", False)
    DISCORD_LISTGUILDMEMBERS = ("discord", "discord_listguildmembers", False)
    DISCORD_GETGUILDPREVIEW = ("discord", "discord_getguildpreview", False)
    DISCORD_LISTGUILDINVITES = ("discord", "discord_listguildinvites", False)
    DISCORD_LISTGUILDVOICEREGIONS = ("discord", "discord_listguildvoiceregions", False)
    DISCORD_GETGUILDEMOJI = ("discord", "discord_getguildemoji", False)
    DISCORD_DELETEGUILDEMOJI = ("discord", "discord_deleteguildemoji", False)
    DISCORD_UPDATEGUILDEMOJI = ("discord", "discord_updateguildemoji", False)
    DISCORD_LISTGUILDEMOJIS = ("discord", "discord_listguildemojis", False)
    DISCORD_CREATEGUILDEMOJI = ("discord", "discord_createguildemoji", False)
    DISCORD_GETGUILDWIDGETSETTINGS = (
        "discord",
        "discord_getguildwidgetsettings",
        False,
    )
    DISCORD_UPDATEGUILDWIDGETSETTINGS = (
        "discord",
        "discord_updateguildwidgetsettings",
        False,
    )
    DISCORD_DELETEGUILDROLE = ("discord", "discord_deleteguildrole", False)
    DISCORD_UPDATEGUILDROLE = ("discord", "discord_updateguildrole", False)
    DISCORD_LISTGUILDROLES = ("discord", "discord_listguildroles", False)
    DISCORD_CREATEGUILDROLE = ("discord", "discord_createguildrole", False)
    DISCORD_PREVIEWPRUNEGUILD = ("discord", "discord_previewpruneguild", False)
    DISCORD_PRUNEGUILD = ("discord", "discord_pruneguild", False)
    DISCORD_GETGUILDBAN = ("discord", "discord_getguildban", False)
    DISCORD_BANUSERFROMGUILD = ("discord", "discord_banuserfromguild", False)
    DISCORD_UNBANUSERFROMGUILD = ("discord", "discord_unbanuserfromguild", False)
    DISCORD_LISTGUILDBANS = ("discord", "discord_listguildbans", False)
    DISCORD_SETGUILDMFALEVEL = ("discord", "discord_setguildmfalevel", False)
    DISCORD_GETSTAGEINSTANCE = ("discord", "discord_getstageinstance", False)
    DISCORD_DELETESTAGEINSTANCE = ("discord", "discord_deletestageinstance", False)
    DISCORD_UPDATESTAGEINSTANCE = ("discord", "discord_updatestageinstance", False)
    DISCORD_GETAPPLICATION = ("discord", "discord_getapplication", False)
    DISCORD_UPDATEAPPLICATION = ("discord", "discord_updateapplication", False)
    DISCORD_GETWEBHOOKBYTOKEN = ("discord", "discord_getwebhookbytoken", False)
    DISCORD_DELETEWEBHOOKBYTOKEN = ("discord", "discord_deletewebhookbytoken", False)
    DISCORD_UPDATEWEBHOOKBYTOKEN = ("discord", "discord_updatewebhookbytoken", False)
    DISCORD_GETSTICKER = ("discord", "discord_getsticker", False)
    DISCORD_GETWEBHOOK = ("discord", "discord_getwebhook", False)
    DISCORD_DELETEWEBHOOK = ("discord", "discord_deletewebhook", False)
    DISCORD_UPDATEWEBHOOK = ("discord", "discord_updatewebhook", False)
    DISCORD_GETCHANNEL = ("discord", "discord_getchannel", False)
    DISCORD_DELETECHANNEL = ("discord", "discord_deletechannel", False)
    DISCORD_INVITERESOLVE = ("discord", "discord_inviteresolve", False)
    DISCORD_INVITEREVOKE = ("discord", "discord_inviterevoke", False)
    DISCORD_GETGUILD = ("discord", "discord_getguild", False)
    DISCORD_DELETEGUILD = ("discord", "discord_deleteguild", False)
    DISCORD_UPDATEGUILD = ("discord", "discord_updateguild", False)
    DISCORD_GETUSER = ("discord", "discord_getuser", False)
    DROPBOX_GET_ABOUT_ME = ("dropbox", "dropbox_get_about_me", False)
    ELEVENLABS_GET_GENERATED_ITEMS_V_1_HISTORY_GET = (
        "elevenlabs",
        "elevenlabs_get_generated_items_v_1_history_get",
        False,
    )
    ELEVENLABS_GET_HISTORY_ITEM_BY_ID_V_1_HISTORY_HISTORY_ITEMID_GET = (
        "elevenlabs",
        "elevenlabs_get_history_item_by_id_v_1_history_history_itemid_get",
        False,
    )
    ELEVENLABS_DELETE_HISTORY_ITEM_V_1_HISTORY_HISTORY_ITEMID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_history_item_v_1_history_history_itemid_delete",
        False,
    )
    ELEVENLABS_GET_AUDIO_FROM_HISTORY_ITEM_V_1_HISTORY_HISTORY_ITEMID_AUDIO_GET = (
        "elevenlabs",
        "elevenlabs_get_audio_from_history_item_v_1_history_history_itemid_audio_get",
        False,
    )
    ELEVENLABS_DOWNLOAD_HISTORY_ITEMS_V_1_HISTORY_DOWNLOAD_POST = (
        "elevenlabs",
        "elevenlabs_download_history_items_v_1_history_download_post",
        False,
    )
    ELEVENLABS_DELETE_SAMPLE_V_1_VOICES_VOICE_ID_SAMPLES_SAMPLE_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_sample_v_1_voices_voice_id_samples_sample_id_delete",
        False,
    )
    ELEVENLABS_GET_AUDIO_FROM_SAMPLE_V_1_VOICES_VOICE_ID_SAMPLES_SAMPLE_ID_AUDIO_GET = (
        "elevenlabs",
        "elevenlabs_get_audio_from_sample_v_1_voices_voice_id_samples_sample_id_audio_get",
        False,
    )
    ELEVENLABS_TEXT_TO_SPEECH_V_1_TEXT_TO_SPEECH_VOICE_ID_POST = (
        "elevenlabs",
        "elevenlabs_text_to_speech_v_1_text_to_speech_voice_id_post",
        False,
    )
    ELEVENLABS_TEXT_TO_SPEECH_V_1_TEXT_TO_SPEECH_VOICE_ID_STREAM_POST = (
        "elevenlabs",
        "elevenlabs_text_to_speech_v_1_text_to_speech_voice_id_stream_post",
        False,
    )
    ELEVENLABS_SPEECH_TO_SPEECH_V_1_SPEECH_TO_SPEECH_VOICE_ID_POST = (
        "elevenlabs",
        "elevenlabs_speech_to_speech_v_1_speech_to_speech_voice_id_post",
        False,
    )
    ELEVENLABS_SPEECH_TO_SPEECH_STREAMING_V_1_SPEECH_TO_SPEECH_VOICE_ID_STREAM_POST = (
        "elevenlabs",
        "elevenlabs_speech_to_speech_streaming_v_1_speech_to_speech_voice_id_stream_post",
        False,
    )
    ELEVENLABS_VOICE_GENERATION_PARAMETERS_V_1_VOICE_GENERATION_GENERATE_VOICE_PARAMETERS_GET = (
        "elevenlabs",
        "elevenlabs_voice_generation_parameters_v_1_voice_generation_generate_voice_parameters_get",
        False,
    )
    ELEVENLABS_GENERATE_A_RANDOM_VOICE_V_1_VOICE_GENERATION_GENERATE_VOICE_POST = (
        "elevenlabs",
        "elevenlabs_generate_a_random_voice_v_1_voice_generation_generate_voice_post",
        False,
    )
    ELEVENLABS_CREATE_A_PREVIOUSLY_GENERATED_VOICE_V_1_VOICE_GENERATION_CREATE_VOICE_POST = (
        "elevenlabs",
        "elevenlabs_create_a_previously_generated_voice_v_1_voice_generation_create_voice_post",
        False,
    )
    ELEVENLABS_GET_USER_SUBSCRIPTION_INFO_V_1_USER_SUBSCRIPTION_GET = (
        "elevenlabs",
        "elevenlabs_get_user_subscription_info_v_1_user_subscription_get",
        False,
    )
    ELEVENLABS_GET_USER_INFO_V_1_USER_GET = (
        "elevenlabs",
        "elevenlabs_get_user_info_v_1_user_get",
        False,
    )
    ELEVENLABS_GET_VOICES_V_1_VOICES_GET = (
        "elevenlabs",
        "elevenlabs_get_voices_v_1_voices_get",
        False,
    )
    ELEVENLABS_GET_DEFAULT_VOICE_SETTINGS_V_1_VOICES_SETTINGS_DEFAULT_GET = (
        "elevenlabs",
        "elevenlabs_get_default_voice_settings_v_1_voices_settings_default_get",
        False,
    )
    ELEVENLABS_GET_VOICE_SETTINGS_V_1_VOICES_VOICE_ID_SETTINGS_GET = (
        "elevenlabs",
        "elevenlabs_get_voice_settings_v_1_voices_voice_id_settings_get",
        False,
    )
    ELEVENLABS_GET_VOICE_V_1_VOICES_VOICE_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_voice_v_1_voices_voice_id_get",
        False,
    )
    ELEVENLABS_DELETE_VOICE_V_1_VOICES_VOICE_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_voice_v_1_voices_voice_id_delete",
        False,
    )
    ELEVENLABS_EDIT_VOICE_SETTINGS_V_1_VOICES_VOICE_ID_SETTINGS_EDIT_POST = (
        "elevenlabs",
        "elevenlabs_edit_voice_settings_v_1_voices_voice_id_settings_edit_post",
        False,
    )
    ELEVENLABS_ADD_VOICE_V_1_VOICES_ADD_POST = (
        "elevenlabs",
        "elevenlabs_add_voice_v_1_voices_add_post",
        False,
    )
    ELEVENLABS_EDIT_VOICE_V_1_VOICES_VOICE_ID_EDIT_POST = (
        "elevenlabs",
        "elevenlabs_edit_voice_v_1_voices_voice_id_edit_post",
        False,
    )
    ELEVENLABS_ADD_SHARING_VOICE_V_1_VOICES_ADD_PUBLIC_USE_RID_VOICE_ID_POST = (
        "elevenlabs",
        "elevenlabs_add_sharing_voice_v_1_voices_add_public_use_rid_voice_id_post",
        False,
    )
    ELEVENLABS_GET_PROJECTS_V_1_PROJECTS_GET = (
        "elevenlabs",
        "elevenlabs_get_projects_v_1_projects_get",
        False,
    )
    ELEVENLABS_ADD_PROJECT_V_1_PROJECTS_ADD_POST = (
        "elevenlabs",
        "elevenlabs_add_project_v_1_projects_add_post",
        False,
    )
    ELEVENLABS_GET_PROJECT_BY_ID_V_1_PROJECTS_PROJECT_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_project_by_id_v_1_projects_project_id_get",
        False,
    )
    ELEVENLABS_DELETE_PROJECT_V_1_PROJECTS_PROJECT_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_project_v_1_projects_project_id_delete",
        False,
    )
    ELEVENLABS_CONVERT_PROJECT_V_1_PROJECTS_PROJECT_ID_CONVERT_POST = (
        "elevenlabs",
        "elevenlabs_convert_project_v_1_projects_project_id_convert_post",
        False,
    )
    ELEVENLABS_GET_PROJECT_SNAPSHOTS_V_1_PROJECTS_PROJECT_ID_SNAPSHOTS_GET = (
        "elevenlabs",
        "elevenlabs_get_project_snapshots_v_1_projects_project_id_snapshots_get",
        False,
    )
    ELEVENLABS_STREAM_PROJECT_AUDIO_V_1_PROJECTS_PROJECT_ID_SNAPSHOTS_PROJECT_SNAPSHOT_ID_STREAM_POST = (
        "elevenlabs",
        "elevenlabs_stream_project_audio_v_1_projects_project_id_snapshots_project_snapshot_id_stream_post",
        False,
    )
    ELEVENLABS_STREAMS_ARCHIVE_WITH_PROJECT_AUDIO_V_1_PROJECTS_PROJECT_ID_SNAPSHOTS_PROJECT_SNAPSHOT_ID_ARCHIVE_POST = (
        "elevenlabs",
        "elevenlabs_streams_archive_with_project_audio_v_1_projects_project_id_snapshots_project_snapshot_id_archive_post",
        False,
    )
    ELEVENLABS_GET_CHAPTERS_V_1_PROJECTS_PROJECT_ID_CHAPTERS_GET = (
        "elevenlabs",
        "elevenlabs_get_chapters_v_1_projects_project_id_chapters_get",
        False,
    )
    ELEVENLABS_GET_CHAPTER_BY_ID_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_chapter_by_id_v_1_projects_project_id_chapters_chapter_id_get",
        False,
    )
    ELEVENLABS_DELETE_CHAPTER_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_chapter_v_1_projects_project_id_chapters_chapter_id_delete",
        False,
    )
    ELEVENLABS_CONVERT_CHAPTER_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_CONVERT_POST = (
        "elevenlabs",
        "elevenlabs_convert_chapter_v_1_projects_project_id_chapters_chapter_id_convert_post",
        False,
    )
    ELEVENLABS_GET_CHAPTER_SNAPSHOTS_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_SNAPSHOTS_GET = (
        "elevenlabs",
        "elevenlabs_get_chapter_snapshots_v_1_projects_project_id_chapters_chapter_id_snapshots_get",
        False,
    )
    ELEVENLABS_STREAM_CHAPTER_AUDIO_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_SNAPSHOTS_CHAPTER_SNAPSHOT_ID_STREAM_POST = (
        "elevenlabs",
        "elevenlabs_stream_chapter_audio_v_1_projects_project_id_chapters_chapter_id_snapshots_chapter_snapshot_id_stream_post",
        False,
    )
    ELEVENLABS_UPDATE_PRONUNCIATION_DICTIONARIES_V_1_PROJECTS_PROJECT_ID_UPDATE_PRONUNCIATION_DICTIONARIES_POST = (
        "elevenlabs",
        "elevenlabs_update_pronunciation_dictionaries_v_1_projects_project_id_update_pronunciation_dictionaries_post",
        False,
    )
    ELEVENLABS_DUB_A_VIDEO_OR_AN_AUDIOFILE_V_1_DUBBING_POST = (
        "elevenlabs",
        "elevenlabs_dub_a_video_or_an_audiofile_v_1_dubbing_post",
        False,
    )
    ELEVENLABS_GET_DUBBING_PROJECT_METADATA_V_1_DUBBING_DUBBING_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_dubbing_project_metadata_v_1_dubbing_dubbing_id_get",
        False,
    )
    ELEVENLABS_DELETE_DUBBING_PROJECT_V_1_DUBBING_DUBBING_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_dubbing_project_v_1_dubbing_dubbing_id_delete",
        False,
    )
    ELEVENLABS_GET_DUBBED_FILE_V_1_DUBBING_DUBBING_ID_AUDIO_LANGUAGE_CODE_GET = (
        "elevenlabs",
        "elevenlabs_get_dubbed_file_v_1_dubbing_dubbing_id_audio_language_code_get",
        False,
    )
    ELEVENLABS_GET_TRANSCRIPT_FOR_DUB_V_1_DUBBING_DUBBING_ID_TRANSCRIPT_LANGUAGE_CODE_GET = (
        "elevenlabs",
        "elevenlabs_get_transcript_for_dub_v_1_dubbing_dubbing_id_transcript_language_code_get",
        False,
    )
    ELEVENLABS_GETS_SO_PROVIDER_ADMIN_ADMIN_ADMIN_URL_PREFIX_S_SO_PROVIDER_GET = (
        "elevenlabs",
        "elevenlabs_gets_so_provider_admin_admin_admin_url_prefix_s_so_provider_get",
        False,
    )
    ELEVENLABS_GET_MODELS_V_1_MODELS_GET = (
        "elevenlabs",
        "elevenlabs_get_models_v_1_models_get",
        False,
    )
    ELEVENLABS_CREATES_AUDIO_NATIVE_ENABLED_PROJECT_V_1_AUDIO_NATIVE_POST = (
        "elevenlabs",
        "elevenlabs_creates_audio_native_enabled_project_v_1_audio_native_post",
        False,
    )
    ELEVENLABS_GET_VOICES_V_1_SHARED_VOICES_GET = (
        "elevenlabs",
        "elevenlabs_get_voices_v_1_shared_voices_get",
        False,
    )
    ELEVENLABS_ADD_A_PRONUNCIATION_DICTIONARY_V_1_PRONUNCIATION_DICTIONARIES_ADD_FROM_FILE_POST = (
        "elevenlabs",
        "elevenlabs_add_a_pronunciation_dictionary_v_1_pronunciation_dictionaries_add_from_file_post",
        False,
    )
    ELEVENLABS_ADD_RULES_TO_THE_PRONUNCIATION_DICTIONARY_V_1_PRONUNCIATION_DICTIONARIES_PRONUNCIATION_DICTIONARY_ID_ADD_RULES_POST = (
        "elevenlabs",
        "elevenlabs_add_rules_to_the_pronunciation_dictionary_v_1_pronunciation_dictionaries_pronunciation_dictionary_id_add_rules_post",
        False,
    )
    ELEVENLABS_REMOVE_RULES_FROM_THE_PRONUNCIATION_DICTIONARY_V_1_PRONUNCIATION_DICTIONARIES_PRONUNCIATION_DICTIONARY_ID_REMOVE_RULES_POST = (
        "elevenlabs",
        "elevenlabs_remove_rules_from_the_pronunciation_dictionary_v_1_pronunciation_dictionaries_pronunciation_dictionary_id_remove_rules_post",
        False,
    )
    ELEVENLABS_GET_PL_S_FILE_WITH_A_PRONUNCIATION_DICTIONARY_VERSION_RULES_V_1_PRONUNCIATION_DICTIONARIES_DICTIONARY_ID_VERSION_ID_DOWNLOAD_GET = (
        "elevenlabs",
        "elevenlabs_get_pl_s_file_with_a_pronunciation_dictionary_version_rules_v_1_pronunciation_dictionaries_dictionary_id_version_id_download_get",
        False,
    )
    ELEVENLABS_GET_METADATA_FOR_A_PRONUNCIATION_DICTIONARY_V_1_PRONUNCIATION_DICTIONARIES_PRONUNCIATION_DICTIONARY_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_metadata_for_a_pronunciation_dictionary_v_1_pronunciation_dictionaries_pronunciation_dictionary_id_get",
        False,
    )
    ELEVENLABS_GET_PRONUNCIATION_DICTIONARIES_V_1_PRONUNCIATION_DICTIONARIES_GET = (
        "elevenlabs",
        "elevenlabs_get_pronunciation_dictionaries_v_1_pronunciation_dictionaries_get",
        False,
    )
    ELEVENLABS_GET_A_PROFILE_PAGE_PROFILE_HANDLE_GET = (
        "elevenlabs",
        "elevenlabs_get_a_profile_page_profile_handle_get",
        False,
    )
    ELEVENLABS_REDIRECT_TO_MINT_LI_FY_DOCS_GET = (
        "elevenlabs",
        "elevenlabs_redirect_to_mint_li_fy_docs_get",
        False,
    )
    EXA_SEARCH = ("exa", "exa_search", True)
    EXA_SIMILARLINK = ("exa", "exa_similarlink", True)
    FIGMA_GET_FILE = ("figma", "figma_get_file", False)
    FIGMA_GET_FILE_NODES = ("figma", "figma_get_file_nodes", False)
    FIGMA_GET_IMAGES = ("figma", "figma_get_images", False)
    FIGMA_GET_IMAGE_FILLS = ("figma", "figma_get_image_fills", False)
    FIGMA_GET_TEAM_PROJECTS = ("figma", "figma_get_team_projects", False)
    FIGMA_GET_PROJECT_FILES = ("figma", "figma_get_project_files", False)
    FIGMA_GET_FILE_VERSIONS = ("figma", "figma_get_file_versions", False)
    FIGMA_GET_COMMENTS = ("figma", "figma_get_comments", False)
    FIGMA_POST_COMMENT = ("figma", "figma_post_comment", False)
    FIGMA_DELETE_COMMENT = ("figma", "figma_delete_comment", False)
    FIGMA_GET_COMMENT_REACTIONS = ("figma", "figma_get_comment_reactions", False)
    FIGMA_POST_COMMENT_REACTION = ("figma", "figma_post_comment_reaction", False)
    FIGMA_DELETE_COMMENT_REACTION = ("figma", "figma_delete_comment_reaction", False)
    FIGMA_GET_ME = ("figma", "figma_get_me", False)
    FIGMA_GET_TEAM_COMPONENTS = ("figma", "figma_get_team_components", False)
    FIGMA_GET_FILE_COMPONENTS = ("figma", "figma_get_file_components", False)
    FIGMA_GET_COMPONENT = ("figma", "figma_get_component", False)
    FIGMA_GET_TEAM_COMPONENT_SETS = ("figma", "figma_get_team_component_sets", False)
    FIGMA_GET_FILE_COMPONENT_SETS = ("figma", "figma_get_file_component_sets", False)
    FIGMA_GET_COMPONENT_SET = ("figma", "figma_get_component_set", False)
    FIGMA_GET_TEAM_STYLES = ("figma", "figma_get_team_styles", False)
    FIGMA_GET_FILE_STYLES = ("figma", "figma_get_file_styles", False)
    FIGMA_GET_STYLE = ("figma", "figma_get_style", False)
    FIGMA_POST_WEB_HOOK = ("figma", "figma_post_web_hook", False)
    FIGMA_GET_WEB_HOOK = ("figma", "figma_get_web_hook", False)
    FIGMA_PUT_WEB_HOOK = ("figma", "figma_put_web_hook", False)
    FIGMA_DELETE_WEB_HOOK = ("figma", "figma_delete_web_hook", False)
    FIGMA_GET_TEAM_WEB_HOOKS = ("figma", "figma_get_team_web_hooks", False)
    FIGMA_GET_WEB_HOOK_REQUESTS = ("figma", "figma_get_web_hook_requests", False)
    FIGMA_GET_ACTIVITY_LOGS = ("figma", "figma_get_activity_logs", False)
    FIGMA_GET_PAYMENTS = ("figma", "figma_get_payments", False)
    FIGMA_GET_LOCAL_VARIABLES = ("figma", "figma_get_local_variables", False)
    FIGMA_GET_PUBLISHED_VARIABLES = ("figma", "figma_get_published_variables", False)
    FIGMA_POST_VARIABLES = ("figma", "figma_post_variables", False)
    FIGMA_GET_DEV_RESOURCES = ("figma", "figma_get_dev_resources", False)
    FIGMA_POST_DEV_RESOURCES = ("figma", "figma_post_dev_resources", False)
    FIGMA_PUT_DEV_RESOURCES = ("figma", "figma_put_dev_resources", False)
    FIGMA_DELETED_EV_RESOURCE = ("figma", "figma_deleted_ev_resource", False)
    FILEMANAGER_CREATE_SHELL_ACTION = (
        "filemanager",
        "filemanager_create_shell_action",
        True,
    )
    FILEMANAGER_CLOSE_SHELL_ACTION = (
        "filemanager",
        "filemanager_close_shell_action",
        True,
    )
    FILEMANAGER_RUN_COMMAND_ACTION = (
        "filemanager",
        "filemanager_run_command_action",
        True,
    )
    FILEMANAGER_SET_ENV_VAR_ACTION = (
        "filemanager",
        "filemanager_set_env_var_action",
        True,
    )
    FILEMANAGER_OPEN_FILE_ACTION = ("filemanager", "filemanager_open_file_action", True)
    FILEMANAGER_GOTO_LINE_ACTION = ("filemanager", "filemanager_goto_line_action", True)
    FILEMANAGER_SCROLL_ACTION = ("filemanager", "filemanager_scroll_action", True)
    FILEMANAGER_CREATE_FILE_ACTION = (
        "filemanager",
        "filemanager_create_file_action",
        True,
    )
    FILEMANAGER_EDIT_FILE_ACTION = ("filemanager", "filemanager_edit_file_action", True)
    GITHUB_CREATE_ISSUE = ("github", "github_create_issue", False)
    GITHUB_LIST_GITHUB_REPOS = ("github", "github_list_github_repos", False)
    GITHUB_STAR_REPO = ("github", "github_star_repo", False)
    GITHUB_GET_ABOUT_ME = ("github", "github_get_about_me", False)
    GITHUB_FETCH_README = ("github", "github_fetch_readme", False)
    GITHUB_GET_COMMITS = ("github", "github_get_commits", False)
    GITHUB_GET_COMMITS_WITH_CODE = ("github", "github_get_commits_with_code", False)
    GITHUB_GET_PATCH_FOR_COMMIT = ("github", "github_get_patch_for_commit", False)
    GMAIL_SEND_EMAIL = ("gmail", "gmail_send_email", False)
    GMAIL_CREATE_EMAIL_DRAFT = ("gmail", "gmail_create_email_draft", False)
    GMAIL_FIND_EMAIL_ID = ("gmail", "gmail_find_email_id", False)
    GMAIL_FETCH_LAST_THREE_MESSAGES = (
        "gmail",
        "gmail_fetch_last_three_messages",
        False,
    )
    GMAIL_ADD_LABEL_TO_EMAIL = ("gmail", "gmail_add_label_to_email", False)
    GMAIL_LIST_LABELS = ("gmail", "gmail_list_labels", False)
    GMAIL_FETCH_MESSAGE_BY_THREAD_ID = (
        "gmail",
        "gmail_fetch_message_by_thread_id",
        False,
    )
    GMAIL_REPLY_TO_THREAD = ("gmail", "gmail_reply_to_thread", False)
    GMAIL_FETCH_EMAILS_WITH_LABEL = ("gmail", "gmail_fetch_emails_with_label", False)
    GOOGLECALENDAR_CREATE_GOOGLE_EVENT = (
        "googlecalendar",
        "googlecalendar_create_google_event",
        False,
    )
    GOOGLECALENDAR_REMOVE_ATTENDEE = (
        "googlecalendar",
        "googlecalendar_remove_attendee",
        False,
    )
    GOOGLECALENDAR_FIND_EVENT = ("googlecalendar", "googlecalendar_find_event", False)
    GOOGLECALENDAR_DELETE_GOOGLE_EVENT = (
        "googlecalendar",
        "googlecalendar_delete_google_event",
        False,
    )
    GOOGLECALENDAR_UPDATE_GOOGLE_EVENT = (
        "googlecalendar",
        "googlecalendar_update_google_event",
        False,
    )
    GOOGLECALENDAR_FIND_FREE_SLOTS = (
        "googlecalendar",
        "googlecalendar_find_free_slots",
        False,
    )
    GOOGLECALENDAR_DUPLICATE_GOOGLE_CALENDAR = (
        "googlecalendar",
        "googlecalendar_duplicate_google_calendar",
        False,
    )
    GOOGLECALENDAR_LIST_GOOGLE_CALENDARS = (
        "googlecalendar",
        "googlecalendar_list_google_calendars",
        False,
    )
    GOOGLECALENDAR_PATCH_GOOGLE_CALENDAR = (
        "googlecalendar",
        "googlecalendar_patch_google_calendar",
        False,
    )
    GOOGLECALENDAR_QUICK_ADD_GOOGLE_CALENDAR = (
        "googlecalendar",
        "googlecalendar_quick_add_google_calendar",
        False,
    )
    GOOGLECALENDAR_GET_CURRENT_DATE_TIME = (
        "googlecalendar",
        "googlecalendar_get_current_date_time",
        False,
    )
    GOOGLEDRIVE_COPY_FILE = ("googledrive", "googledrive_copy_file", False)
    GOOGLEDRIVE_CREATE_FOLDER = ("googledrive", "googledrive_create_folder", False)
    GOOGLEDRIVE_CREATE_FILE_FROM_TEXT = (
        "googledrive",
        "googledrive_create_file_from_text",
        False,
    )
    GOOGLEDRIVE_FIND_FILE = ("googledrive", "googledrive_find_file", False)
    GOOGLEDRIVE_FIND_FOLDER = ("googledrive", "googledrive_find_folder", False)
    GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE = (
        "googledrive",
        "googledrive_add_file_sharing_preference",
        False,
    )
    GOOGLESHEETS_CREATE_GOOGLE_SHEET1 = (
        "googlesheets",
        "googlesheets_create_google_sheet1",
        False,
    )
    GOOGLESHEETS_CREATE_SPREADSHEET_COLUMN = (
        "googlesheets",
        "googlesheets_create_spreadsheet_column",
        False,
    )
    GOOGLESHEETS_CREATE_SPREADSHEET_ROW = (
        "googlesheets",
        "googlesheets_create_spreadsheet_row",
        False,
    )
    GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW = (
        "googlesheets",
        "googlesheets_lookup_spreadsheet_row",
        False,
    )
    GOOGLESHEETS_FIND_WORKSHEET_BY_TITLE = (
        "googlesheets",
        "googlesheets_find_worksheet_by_title",
        False,
    )
    GOOGLESHEETS_FORMAT_SPREADSHEET_ROW = (
        "googlesheets",
        "googlesheets_format_spreadsheet_row",
        False,
    )
    GOOGLESHEETS_UPDATE_SPREADSHEET_ROW = (
        "googlesheets",
        "googlesheets_update_spreadsheet_row",
        False,
    )
    GOOGLESHEETS_FIND_OR_CREATE_WORKSHEET = (
        "googlesheets",
        "googlesheets_find_or_create_worksheet",
        False,
    )
    GOOGLETASKS_CREATE_TASK_LIST = (
        "googletasks",
        "googletasks_create_task_list",
        False,
    )
    GOOGLETASKS_DELETE_TASK_LIST = (
        "googletasks",
        "googletasks_delete_task_list",
        False,
    )
    GOOGLETASKS_GET_TASK_LIST = ("googletasks", "googletasks_get_task_list", False)
    GOOGLETASKS_LIST_TASK_LISTS = ("googletasks", "googletasks_list_task_lists", False)
    GOOGLETASKS_PATCH_TASK_LIST = ("googletasks", "googletasks_patch_task_list", False)
    GOOGLETASKS_CLEAR_TASKS = ("googletasks", "googletasks_clear_tasks", False)
    GOOGLETASKS_DELETE_TASK = ("googletasks", "googletasks_delete_task", False)
    GOOGLETASKS_GET_TASK = ("googletasks", "googletasks_get_task", False)
    GOOGLETASKS_INSERT_TASK = ("googletasks", "googletasks_insert_task", False)
    GOOGLETASKS_PATCH_TASK = ("googletasks", "googletasks_patch_task", False)
    LINEAR_CREATE_LINEAR_ISSUE = ("linear", "linear_create_linear_issue", False)
    LINEAR_LIST_LINEAR_PROJECTS = ("linear", "linear_list_linear_projects", False)
    LINEAR_LIST_LINEAR_TEAMS = ("linear", "linear_list_linear_teams", False)
    LISTENNOTES_SEARCH = ("listennotes", "listennotes_search", False)
    LISTENNOTES_TYPE_AHEAD = ("listennotes", "listennotes_type_ahead", False)
    LISTENNOTES_SEARCH_EPISODE_TITLES = (
        "listennotes",
        "listennotes_search_episode_titles",
        False,
    )
    LISTENNOTES_GET_TRENDING_SEARCHES = (
        "listennotes",
        "listennotes_get_trending_searches",
        False,
    )
    LISTENNOTES_GET_RELATED_SEARCHES = (
        "listennotes",
        "listennotes_get_related_searches",
        False,
    )
    LISTENNOTES_SPELL_CHECK = ("listennotes", "listennotes_spell_check", False)
    LISTENNOTES_GET_BEST_PODCASTS = (
        "listennotes",
        "listennotes_get_best_podcasts",
        False,
    )
    LISTENNOTES_GET_PODCAST_BY_ID = (
        "listennotes",
        "listennotes_get_podcast_by_id",
        False,
    )
    LISTENNOTES_DELETE_PODCAST_BY_ID = (
        "listennotes",
        "listennotes_delete_podcast_by_id",
        False,
    )
    LISTENNOTES_GET_EPISODE_BY_ID = (
        "listennotes",
        "listennotes_get_episode_by_id",
        False,
    )
    LISTENNOTES_GET_EPISODES_IN_BATCH = (
        "listennotes",
        "listennotes_get_episodes_in_batch",
        False,
    )
    LISTENNOTES_GET_PODCASTS_IN_BATCH = (
        "listennotes",
        "listennotes_get_podcasts_in_batch",
        False,
    )
    LISTENNOTES_GET_CURATE_D_PODCAST_BY_ID = (
        "listennotes",
        "listennotes_get_curate_d_podcast_by_id",
        False,
    )
    LISTENNOTES_GET_GENRES = ("listennotes", "listennotes_get_genres", False)
    LISTENNOTES_GET_REGIONS = ("listennotes", "listennotes_get_regions", False)
    LISTENNOTES_GET_LANGUAGES = ("listennotes", "listennotes_get_languages", False)
    LISTENNOTES_JUST_LISTEN = ("listennotes", "listennotes_just_listen", False)
    LISTENNOTES_GET_CURATE_D_PODCASTS = (
        "listennotes",
        "listennotes_get_curate_d_podcasts",
        False,
    )
    LISTENNOTES_GET_PODCAST_RECOMMENDATIONS = (
        "listennotes",
        "listennotes_get_podcast_recommendations",
        False,
    )
    LISTENNOTES_GET_EPISODE_RECOMMENDATIONS = (
        "listennotes",
        "listennotes_get_episode_recommendations",
        False,
    )
    LISTENNOTES_SUBMIT_PODCAST = ("listennotes", "listennotes_submit_podcast", False)
    LISTENNOTES_REFRESH_RSS = ("listennotes", "listennotes_refresh_rss", False)
    LISTENNOTES_GET_PLAYLIST_BY_ID = (
        "listennotes",
        "listennotes_get_playlist_by_id",
        False,
    )
    LISTENNOTES_GET_PLAYLISTS = ("listennotes", "listennotes_get_playlists", False)
    LISTENNOTES_GET_PODCAST_AUDIENCE = (
        "listennotes",
        "listennotes_get_podcast_audience",
        False,
    )
    LISTENNOTES_GET_PODCASTS_BY_DOMAIN_NAME = (
        "listennotes",
        "listennotes_get_podcasts_by_domain_name",
        False,
    )
    NASA_RESOURCE_GET_SPECIFICATION = ("nasa", "nasa_resource_get_specification", False)
    NASA_PROJECT_LIST_AVAILABLE_IDS = ("nasa", "nasa_project_list_available_ids", False)
    NASA_PROJECT_FIND_MATCHING_PROJECTS = (
        "nasa",
        "nasa_project_find_matching_projects",
        False,
    )
    NASA_PROJECT_GET_INFO = ("nasa", "nasa_project_get_info", False)
    NASA_ORGANIZATION_GET_LIST_BY_NAME = (
        "nasa",
        "nasa_organization_get_list_by_name",
        False,
    )
    NASA_ORGANIZATION_LIST_TYPES = ("nasa", "nasa_organization_list_types", False)
    NASA_ORGANIZATION_GET_INFORMATION = (
        "nasa",
        "nasa_organization_get_information",
        False,
    )
    NOTION_GET_ABOUT_ME = ("notion", "notion_get_about_me", False)
    NOTION_ADD_PAGE_CONTENT = ("notion", "notion_add_page_content", False)
    NOTION_ARCHIVE_NOTION_PAGE = ("notion", "notion_archive_notion_page", False)
    NOTION_CREATE_DATABASE = ("notion", "notion_create_database", False)
    NOTION_CREATE_COMMENT = ("notion", "notion_create_comment", False)
    NOTION_CREATE_NOTION_PAGE = ("notion", "notion_create_notion_page", False)
    NOTION_DELETE_BLOCK = ("notion", "notion_delete_block", False)
    NOTION_FETCH_COMMENTS = ("notion", "notion_fetch_comments", False)
    NOTION_FETCH_DATABASE = ("notion", "notion_fetch_database", False)
    NOTION_FETCH_ROW = ("notion", "notion_fetch_row", False)
    NOTION_SEARCH_NOTION_PAGE = ("notion", "notion_search_notion_page", False)
    NOTION_UPDATE_SCHEMA_DATABASE = ("notion", "notion_update_schema_database", False)
    NOTION_FETCH_NOTION_BLOCK = ("notion", "notion_fetch_notion_block", False)
    NOTION_FETCH_NOTION_CHILD_BLOCK = (
        "notion",
        "notion_fetch_notion_child_block",
        False,
    )
    NOTION_GET_ABOUT_USER = ("notion", "notion_get_about_user", False)
    NOTION_LIST_USERS = ("notion", "notion_list_users", False)
    NOTION_INSERT_ROW_DATABASE = ("notion", "notion_insert_row_database", False)
    NOTION_UPDATE_ROW_DATABASE = ("notion", "notion_update_row_database", False)
    NOTION_QUERY_DATABASE = ("notion", "notion_query_database", False)
    OKTA_APPLICATION_LIST_APPS = ("okta", "okta_application_list_apps", False)
    OKTA_APPLICATION_CREATE_NEW = ("okta", "okta_application_create_new", False)
    OKTA_APPLICATION_REMOVE_INACTIVE = (
        "okta",
        "okta_application_remove_inactive",
        False,
    )
    OKTA_APPLICATION_GET_BY_ID = ("okta", "okta_application_get_by_id", False)
    OKTA_APPLICATION_UPDATE_APPLICATION_IN_ORG = (
        "okta",
        "okta_application_update_application_in_org",
        False,
    )
    OKTA_APPLICATION_GET_DEFAULT_PROVISIONING_CONNECTION = (
        "okta",
        "okta_application_get_default_provisioning_connection",
        False,
    )
    OKTA_APPLICATION_SET_DEFAULT_PROVISIONING_CONNECTION = (
        "okta",
        "okta_application_set_default_provisioning_connection",
        False,
    )
    OKTA_APPLICATION_ACTIVATE_DEFAULT_PROVISIONING_CONNECTION = (
        "okta",
        "okta_application_activate_default_provisioning_connection",
        False,
    )
    OKTA_APPLICATION_DEACTIVATE_DEFAULT_PROVISIONING_CONNECTION = (
        "okta",
        "okta_application_deactivate_default_provisioning_connection",
        False,
    )
    OKTA_APPLICATION_LIST_CSR_S_FOR_APPLICATION = (
        "okta",
        "okta_application_list_csr_s_for_application",
        False,
    )
    OKTA_APPLICATION_GENERATE_CSR_FOR_APPLICATION = (
        "okta",
        "okta_application_generate_csr_for_application",
        False,
    )
    OKTA_APPLICATION_DELETE_CSR_BY_ID = (
        "okta",
        "okta_application_delete_csr_by_id",
        False,
    )
    OKTA_APPLICATION_GET_CREDENTIALS_CSR_S = (
        "okta",
        "okta_application_get_credentials_csr_s",
        False,
    )
    OKTA_APPLICATION_PUBLISH_CSR_LIFECYCLE = (
        "okta",
        "okta_application_publish_csr_lifecycle",
        False,
    )
    OKTA_APPLICATION_LIST_KEY_CREDENTIALS = (
        "okta",
        "okta_application_list_key_credentials",
        False,
    )
    OKTA_APPLICATION_GENERATE_X_509_CERTIFICATE = (
        "okta",
        "okta_application_generate_x_509_certificate",
        False,
    )
    OKTA_APPLICATION_GET_KEY_CREDENTIAL = (
        "okta",
        "okta_application_get_key_credential",
        False,
    )
    OKTA_APPLICATION_CLONE_APPLICATION_KEY_CREDENTIAL = (
        "okta",
        "okta_application_clone_application_key_credential",
        False,
    )
    OKTA_APPLICATION_LIST_CLIENT_SECRETS = (
        "okta",
        "okta_application_list_client_secrets",
        False,
    )
    OKTA_APPLICATION_ADD_CLIENT_SECRET = (
        "okta",
        "okta_application_add_client_secret",
        False,
    )
    OKTA_APPLICATION_REMOVE_SECRET = ("okta", "okta_application_remove_secret", False)
    OKTA_APPLICATION_GET_CLIENT_SECRET = (
        "okta",
        "okta_application_get_client_secret",
        False,
    )
    OKTA_APPLICATION_ACTIVATE_CLIENT_SECRET = (
        "okta",
        "okta_application_activate_client_secret",
        False,
    )
    OKTA_APPLICATION_DEACTIVATE_CLIENT_SECRET_BY_ID = (
        "okta",
        "okta_application_deactivate_client_secret_by_id",
        False,
    )
    OKTA_APPLICATION_LIST_FEATURES = ("okta", "okta_application_list_features", False)
    OKTA_APPLICATION_GET_FEATURE = ("okta", "okta_application_get_feature", False)
    OKTA_APPLICATION_UPDATE_FEATURE = ("okta", "okta_application_update_feature", False)
    OKTA_APPLICATION_LIST_SCOPE_CONSENT_GRANTS = (
        "okta",
        "okta_application_list_scope_consent_grants",
        False,
    )
    OKTA_APPLICATION_GRANT_CONSENT_TO_SCOPE = (
        "okta",
        "okta_application_grant_consent_to_scope",
        False,
    )
    OKTA_APPLICATION_REVOKE_PERMISSION = (
        "okta",
        "okta_application_revoke_permission",
        False,
    )
    OKTA_APPLICATION_GET_SINGLE_SCOPE_CONSENT_GRANT = (
        "okta",
        "okta_application_get_single_scope_consent_grant",
        False,
    )
    OKTA_APPLICATION_LIST_GROUPS_ASSIGNED = (
        "okta",
        "okta_application_list_groups_assigned",
        False,
    )
    OKTA_APPLICATION_REMOVE_GROUP_ASSIGNMENT = (
        "okta",
        "okta_application_remove_group_assignment",
        False,
    )
    OKTA_APPLICATION_GET_GROUP_ASSIGNMENT = (
        "okta",
        "okta_application_get_group_assignment",
        False,
    )
    OKTA_APPLICATION_ASSIGN_GROUP_TO = (
        "okta",
        "okta_application_assign_group_to",
        False,
    )
    OKTA_APPLICATION_ACTIVATE_INACTIVE = (
        "okta",
        "okta_application_activate_inactive",
        False,
    )
    OKTA_APPLICATION_DEACTIVATE_LIFECYCLE = (
        "okta",
        "okta_application_deactivate_lifecycle",
        False,
    )
    OKTA_APPLICATION_UPDATE_LOGO = ("okta", "okta_application_update_logo", False)
    OKTA_APPLICATION_ASSIGN_POLICY_TO_APPLICATION = (
        "okta",
        "okta_application_assign_policy_to_application",
        False,
    )
    OKTA_APPLICATION_PREVIEWS_AM_LAPP_METADATA = (
        "okta",
        "okta_application_previews_am_lapp_metadata",
        False,
    )
    OKTA_APPLICATION_REVOKE_ALL_TOKENS = (
        "okta",
        "okta_application_revoke_all_tokens",
        False,
    )
    OKTA_APPLICATION_LIST_TOKENS = ("okta", "okta_application_list_tokens", False)
    OKTA_APPLICATION_REVOKE_TOKEN = ("okta", "okta_application_revoke_token", False)
    OKTA_APPLICATION_GET_TOKEN = ("okta", "okta_application_get_token", False)
    OKTA_APPLICATION_LIST_ASSIGNED_USERS = (
        "okta",
        "okta_application_list_assigned_users",
        False,
    )
    OKTA_APPLICATION_ASSIGN_USER_TO_APPLICATION = (
        "okta",
        "okta_application_assign_user_to_application",
        False,
    )
    OKTA_APPLICATION_REMOVE_USER_FROM = (
        "okta",
        "okta_application_remove_user_from",
        False,
    )
    OKTA_APPLICATION_GET_SPECIFIC_USER_ASSIGNMENT = (
        "okta",
        "okta_application_get_specific_user_assignment",
        False,
    )
    OKTA_APPLICATION_UPDATE_PROFILE_FOR_USER = (
        "okta",
        "okta_application_update_profile_for_user",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_LIST_ALL_AVAILABLE = (
        "okta",
        "okta_authentic_at_or_list_all_available",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_CREATE_NEW = ("okta", "okta_authentic_at_or_create_new", False)
    OKTA_AUTHENTIC_AT_OR_GET_SUCCESS = (
        "okta",
        "okta_authentic_at_or_get_success",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_UPDATE_AUTHENTIC_AT_OR = (
        "okta",
        "okta_authentic_at_or_update_authentic_at_or",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_ACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_authentic_at_or_activate_lifecycle_success",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_DEACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_authentic_at_or_deactivate_lifecycle_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_LIST_SERVERS = (
        "okta",
        "okta_authorization_server_list_servers",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_NEW_SERVER = (
        "okta",
        "okta_authorization_server_create_new_server",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_SUCCESS = (
        "okta",
        "okta_authorization_server_delete_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_BY_ID = (
        "okta",
        "okta_authorization_server_get_by_id",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_BY_ID = (
        "okta",
        "okta_authorization_server_update_by_id",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_CLAIMS = (
        "okta",
        "okta_authorization_server_get_claims",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_CLAIMS = (
        "okta",
        "okta_authorization_server_create_claims",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_CLAIM = (
        "okta",
        "okta_authorization_server_delete_claim",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_CLAIMS_2 = (
        "okta",
        "okta_authorization_server_get_claims_2",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_CLAIM_SUCCESS = (
        "okta",
        "okta_authorization_server_update_claim_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_LIST_CLIENTS = (
        "okta",
        "okta_authorization_server_list_clients",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_CLIENT_TOKEN = (
        "okta",
        "okta_authorization_server_delete_client_token",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_CLIENT_TOKENS = (
        "okta",
        "okta_authorization_server_get_client_tokens",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_AU_TH_TOKEN = (
        "okta",
        "okta_authorization_server_delete_au_th_token",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_CLIENT_AU_TH_TOKEN = (
        "okta",
        "okta_authorization_server_get_client_au_th_token",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_LIST_CREDENTIALS_KEYS = (
        "okta",
        "okta_authorization_server_list_credentials_keys",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ROTATE_KEY_LIFECYCLE = (
        "okta",
        "okta_authorization_server_rotate_key_lifecycle",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_authorization_server_activate_lifecycle_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DEACTIVATE_LIFECYCLE = (
        "okta",
        "okta_authorization_server_deactivate_lifecycle",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_POLICIES_SUCCESS = (
        "okta",
        "okta_authorization_server_get_policies_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_POLICY = (
        "okta",
        "okta_authorization_server_create_policy",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_POLICY_BY_ID = (
        "okta",
        "okta_authorization_server_delete_policy_by_id",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_POLICIES = (
        "okta",
        "okta_authorization_server_get_policies",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_POLICY_SUCCESS = (
        "okta",
        "okta_authorization_server_update_policy_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ACTIVATE_POLICY_LIFECYCLE = (
        "okta",
        "okta_authorization_server_activate_policy_lifecycle",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DEACTIVATE_POLICY_LIFECYCLE = (
        "okta",
        "okta_authorization_server_deactivate_policy_lifecycle",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ENUMERATE_POLICY_RULES = (
        "okta",
        "okta_authorization_server_enumerate_policy_rules",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_POLICY_RULE = (
        "okta",
        "okta_authorization_server_create_policy_rule",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_POLICY_RULE = (
        "okta",
        "okta_authorization_server_delete_policy_rule",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_POLICY_RULE_BY_ID = (
        "okta",
        "okta_authorization_server_get_policy_rule_by_id",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_POLICY_RULE_CONFIGURATION = (
        "okta",
        "okta_authorization_server_update_policy_rule_configuration",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ACTIVATE_POLICY_RULE = (
        "okta",
        "okta_authorization_server_activate_policy_rule",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DEACTIVATE_POLICY_RULE = (
        "okta",
        "okta_authorization_server_deactivate_policy_rule",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_SCOPES = (
        "okta",
        "okta_authorization_server_get_scopes",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_SCOPE = (
        "okta",
        "okta_authorization_server_create_scope",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_SCOPE = (
        "okta",
        "okta_authorization_server_delete_scope",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_SCOPES_2 = (
        "okta",
        "okta_authorization_server_get_scopes_2",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_SCOPE_SUCCESS = (
        "okta",
        "okta_authorization_server_update_scope_success",
        False,
    )
    OKTA_BRAND_GET_ALL_BRANDS = ("okta", "okta_brand_get_all_brands", False)
    OKTA_BRAND_GET_BY_ID = ("okta", "okta_brand_get_by_id", False)
    OKTA_BRAND_UPDATE_BY_BRAN_DID = ("okta", "okta_brand_update_by_bran_did", False)
    OKTA_BRAND_LIST_EMAIL_TEMPLATES = ("okta", "okta_brand_list_email_templates", False)
    OKTA_BRAND_GET_EMAIL_TEMPLATE = ("okta", "okta_brand_get_email_template", False)
    OKTA_BRAND_DELETE_EMAIL_TEMPLATE_CUSTOMIZATION_S = (
        "okta",
        "okta_brand_delete_email_template_customization_s",
        False,
    )
    OKTA_BRAND_LIST_EMAIL_TEMPLATE_CUSTOMIZATION_S = (
        "okta",
        "okta_brand_list_email_template_customization_s",
        False,
    )
    OKTA_BRAND_CREATE_EMAIL_TEMPLATE_CUSTOMIZATION = (
        "okta",
        "okta_brand_create_email_template_customization",
        False,
    )
    OKTA_BRAND_DELETE_EMAIL_CUSTOMIZATION = (
        "okta",
        "okta_brand_delete_email_customization",
        False,
    )
    OKTA_BRAND_GET_EMAIL_TEMPLATE_CUSTOMIZATION_BY_ID = (
        "okta",
        "okta_brand_get_email_template_customization_by_id",
        False,
    )
    OKTA_BRAND_UPDATE_EMAIL_CUSTOMIZATION = (
        "okta",
        "okta_brand_update_email_customization",
        False,
    )
    OKTA_BRAND_GET_EMAIL_CUSTOMIZATION_PREVIEW = (
        "okta",
        "okta_brand_get_email_customization_preview",
        False,
    )
    OKTA_BRAND_GET_EMAIL_TEMPLATE_DEFAULT_CONTENT = (
        "okta",
        "okta_brand_get_email_template_default_content",
        False,
    )
    OKTA_BRAND_GET_EMAIL_TEMPLATE_DEFAULT_CONTENT_PREVIEW = (
        "okta",
        "okta_brand_get_email_template_default_content_preview",
        False,
    )
    OKTA_BRAND_GET_EMAIL_TEMPLATE_DEFAULT_CONTENT_PREVIEW_2 = (
        "okta",
        "okta_brand_get_email_template_default_content_preview_2",
        False,
    )
    OKTA_BRAND_GET_THEMES = ("okta", "okta_brand_get_themes", False)
    OKTA_BRAND_GET_THEME_BY_ID = ("okta", "okta_brand_get_theme_by_id", False)
    OKTA_BRAND_UPDATE_THEME = ("okta", "okta_brand_update_theme", False)
    OKTA_BRAND_DELETE_THEME_BACKGROUND_IMAGE = (
        "okta",
        "okta_brand_delete_theme_background_image",
        False,
    )
    OKTA_BRAND_UPDATE_THEME_BACKGROUND_IMAGE = (
        "okta",
        "okta_brand_update_theme_background_image",
        False,
    )
    OKTA_BRAND_DELETE_THEME_FAVICON = ("okta", "okta_brand_delete_theme_favicon", False)
    OKTA_BRAND_UPDATE_THEME_FAVICON = ("okta", "okta_brand_update_theme_favicon", False)
    OKTA_BRAND_DELETE_THEME_LOGO = ("okta", "okta_brand_delete_theme_logo", False)
    OKTA_BRAND_UPDATE_THEME_LOGO = ("okta", "okta_brand_update_theme_logo", False)
    OKTA_DOMAIN_LIST_VERIFIED_CUSTOM = (
        "okta",
        "okta_domain_list_verified_custom",
        False,
    )
    OKTA_DOMAIN_CREATE_NEW_DOMAIN = ("okta", "okta_domain_create_new_domain", False)
    OKTA_DOMAIN_REMOVE_BY_ID = ("okta", "okta_domain_remove_by_id", False)
    OKTA_DOMAIN_GET_BY_ID = ("okta", "okta_domain_get_by_id", False)
    OKTA_DOMAIN_CREATE_CERTIFICATE = ("okta", "okta_domain_create_certificate", False)
    OKTA_DOMAIN_VERIFY_BY_ID = ("okta", "okta_domain_verify_by_id", False)
    OKTA_EVENT_HOOK_LIST_SUCCESS_EVENTS = (
        "okta",
        "okta_event_hook_list_success_events",
        False,
    )
    OKTA_EVENT_HOOK_CREATE_SUCCESS = ("okta", "okta_event_hook_create_success", False)
    OKTA_EVENT_HOOK_REMOVE_SUCCESS_EVENT = (
        "okta",
        "okta_event_hook_remove_success_event",
        False,
    )
    OKTA_EVENT_HOOK_GET_SUCCESS_EVENT = (
        "okta",
        "okta_event_hook_get_success_event",
        False,
    )
    OKTA_EVENT_HOOK_UPDATE_SUCCESS_EVENT = (
        "okta",
        "okta_event_hook_update_success_event",
        False,
    )
    OKTA_EVENT_HOOK_ACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_event_hook_activate_lifecycle_success",
        False,
    )
    OKTA_EVENT_HOOK_DEACTIVATE_LIFECYCLE_EVENT = (
        "okta",
        "okta_event_hook_deactivate_lifecycle_event",
        False,
    )
    OKTA_EVENT_HOOK_VERIFY_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_event_hook_verify_lifecycle_success",
        False,
    )
    OKTA_FEATURE_GET_SUCCESS = ("okta", "okta_feature_get_success", False)
    OKTA_FEATURE_GET_SUCCESS_BY_ID = ("okta", "okta_feature_get_success_by_id", False)
    OKTA_FEATURE_LIST_DEPENDENCIES = ("okta", "okta_feature_list_dependencies", False)
    OKTA_FEATURE_LIST_DEPENDENTS = ("okta", "okta_feature_list_dependents", False)
    OKTA_FEATURE_CREATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_feature_create_lifecycle_success",
        False,
    )
    OKTA_GROUP_LIST = ("okta", "okta_group_list", False)
    OKTA_GROUP_CREATE_NEW_GROUP = ("okta", "okta_group_create_new_group", False)
    OKTA_GROUP_GET_ALL_RULES = ("okta", "okta_group_get_all_rules", False)
    OKTA_GROUP_ADD_RULE = ("okta", "okta_group_add_rule", False)
    OKTA_GROUP_REMOVE_RULE_BY_ID = ("okta", "okta_group_remove_rule_by_id", False)
    OKTA_GROUP_GET_GROUP_RULE_BY_ID = ("okta", "okta_group_get_group_rule_by_id", False)
    OKTA_GROUP_UPDATE_RULE = ("okta", "okta_group_update_rule", False)
    OKTA_GROUP_ACTIVATE_RULE_LIFECYCLE = (
        "okta",
        "okta_group_activate_rule_lifecycle",
        False,
    )
    OKTA_GROUP_DEACTIVATE_RULE_LIFECYCLE = (
        "okta",
        "okta_group_deactivate_rule_lifecycle",
        False,
    )
    OKTA_GROUP_REMOVE_OPERATION = ("okta", "okta_group_remove_operation", False)
    OKTA_GROUP_GET_RULES = ("okta", "okta_group_get_rules", False)
    OKTA_GROUP_UPDATE_PROFILE = ("okta", "okta_group_update_profile", False)
    OKTA_GROUP_LIST_ASSIGNED_APPS = ("okta", "okta_group_list_assigned_apps", False)
    OKTA_GROUP_GET_ROLE_LIST = ("okta", "okta_group_get_role_list", False)
    OKTA_GROUP_ASSIGN_ROLE_TO_GROUP = ("okta", "okta_group_assign_role_to_group", False)
    OKTA_GROUP_UN_ASSIGN_ROLE = ("okta", "okta_group_un_assign_role", False)
    OKTA_GROUP_GET_ROLE_SUCCESS = ("okta", "okta_group_get_role_success", False)
    OKTA_GROUP_GET_ROLE_TARGETS_CATALOG_APPS = (
        "okta",
        "okta_group_get_role_targets_catalog_apps",
        False,
    )
    OKTA_GROUP_DELETE_TARGET_GROUP_ROLES_CATALOG_APPS = (
        "okta",
        "okta_group_delete_target_group_roles_catalog_apps",
        False,
    )
    OKTA_GROUP_UPDATE_ROLES_CATALOG_APPS = (
        "okta",
        "okta_group_update_roles_catalog_apps",
        False,
    )
    OKTA_GROUP_REMOVE_APP_INSTANCE_TARGET_TO_APP_ADMIN_ROLE_GIVEN_TO_GROUP = (
        "okta",
        "okta_group_remove_app_instance_target_to_app_admin_role_given_to_group",
        False,
    )
    OKTA_GROUP_ADD_APP_INSTANCE_TARGET_TO_APP_ADMIN_ROLE_GIVEN_TO_GROUP = (
        "okta",
        "okta_group_add_app_instance_target_to_app_admin_role_given_to_group",
        False,
    )
    OKTA_GROUP_LIST_ROLE_TARGETS_GROUPS = (
        "okta",
        "okta_group_list_role_targets_groups",
        False,
    )
    OKTA_GROUP_REMOVE_TARGET_GROUP = ("okta", "okta_group_remove_target_group", False)
    OKTA_GROUP_UPDATE_TARGET_GROUPS_ROLE = (
        "okta",
        "okta_group_update_target_groups_role",
        False,
    )
    OKTA_GROUP_ENUMERATE_GROUP_MEMBERS = (
        "okta",
        "okta_group_enumerate_group_members",
        False,
    )
    OKTA_GROUP_REMOVE_USER_FROM = ("okta", "okta_group_remove_user_from", False)
    OKTA_GROUP_ADD_USER_TO_GROUP = ("okta", "okta_group_add_user_to_group", False)
    OKTA_IDENTITY_PROVIDER_LIST = ("okta", "okta_identity_provider_list", False)
    OKTA_IDENTITY_PROVIDER_ADD_NEW_IDP = (
        "okta",
        "okta_identity_provider_add_new_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_ENUMERATE_IDP_KEYS = (
        "okta",
        "okta_identity_provider_enumerate_idp_keys",
        False,
    )
    OKTA_IDENTITY_PROVIDER_ADD_X_509_CERTIFICATE_PUBLIC_KEY = (
        "okta",
        "okta_identity_provider_add_x_509_certificate_public_key",
        False,
    )
    OKTA_IDENTITY_PROVIDER_DELETE_KEY_CREDENTIAL = (
        "okta",
        "okta_identity_provider_delete_key_credential",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_KEY_CREDENTIAL_BY_IDP = (
        "okta",
        "okta_identity_provider_get_key_credential_by_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_REMOVE_IDP = (
        "okta",
        "okta_identity_provider_remove_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_BY_IDP = (
        "okta",
        "okta_identity_provider_get_by_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_UPDATE_CONFIGURATION = (
        "okta",
        "okta_identity_provider_update_configuration",
        False,
    )
    OKTA_IDENTITY_PROVIDER_LIST_CSR_S_FOR_CERTIFICATE_SIGNING_REQUESTS = (
        "okta",
        "okta_identity_provider_list_csr_s_for_certificate_signing_requests",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GENERATE_CSR = (
        "okta",
        "okta_identity_provider_generate_csr",
        False,
    )
    OKTA_IDENTITY_PROVIDER_REVOKE_CSR_FOR_IDENTITY_PROVIDER = (
        "okta",
        "okta_identity_provider_revoke_csr_for_identity_provider",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_CSR_BY_IDP = (
        "okta",
        "okta_identity_provider_get_csr_by_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_UPDATE_CSR_LIFECYCLE_PUBLISH = (
        "okta",
        "okta_identity_provider_update_csr_lifecycle_publish",
        False,
    )
    OKTA_IDENTITY_PROVIDER_LIST_SIGNING_KEY_CREDENTIALS = (
        "okta",
        "okta_identity_provider_list_signing_key_credentials",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GENERATE_NEW_SIGNING_KEY_CREDENTIAL = (
        "okta",
        "okta_identity_provider_generate_new_signing_key_credential",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_SIGNING_KEY_CREDENTIAL_BY_IDP = (
        "okta",
        "okta_identity_provider_get_signing_key_credential_by_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_CLONE_SIGNING_KEY_CREDENTIAL = (
        "okta",
        "okta_identity_provider_clone_signing_key_credential",
        False,
    )
    OKTA_IDENTITY_PROVIDER_ACTIVATE_IDP_LIFECYCLE = (
        "okta",
        "okta_identity_provider_activate_idp_lifecycle",
        False,
    )
    OKTA_IDENTITY_PROVIDER_DEACTIVATE_IDP = (
        "okta",
        "okta_identity_provider_deactivate_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_USER = ("okta", "okta_identity_provider_get_user", False)
    OKTA_IDENTITY_PROVIDE_RUN_LINK_USER = (
        "okta",
        "okta_identity_provide_run_link_user",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_LINKED_USER_BY_ID = (
        "okta",
        "okta_identity_provider_get_linked_user_by_id",
        False,
    )
    OKTA_IDENTITY_PROVIDER_LINK_USER_TO_IDP_WITHOUT_TRANSACTION = (
        "okta",
        "okta_identity_provider_link_user_to_idp_without_transaction",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_SOCIAL_AU_TH_TOKENS = (
        "okta",
        "okta_identity_provider_get_social_au_th_tokens",
        False,
    )
    OKTA_INLINE_HOOK_GET_SUCCESS = ("okta", "okta_inline_hook_get_success", False)
    OKTA_INLINE_HOOK_CREATE_SUCCESS = ("okta", "okta_inline_hook_create_success", False)
    OKTA_INLINE_HOOK_DELETE_MATCHING_BY_ID = (
        "okta",
        "okta_inline_hook_delete_matching_by_id",
        False,
    )
    OKTA_INLINE_HOOK_GET_BY_ID = ("okta", "okta_inline_hook_get_by_id", False)
    OKTA_INLINE_HOOK_UPDATE_BY_ID = ("okta", "okta_inline_hook_update_by_id", False)
    OKTA_INLINE_HOOK_ACTIVATE_LIFECYCLE = (
        "okta",
        "okta_inline_hook_activate_lifecycle",
        False,
    )
    OKTA_INLINE_HOOK_DEACTIVATE_LIFECYCLE = (
        "okta",
        "okta_inline_hook_deactivate_lifecycle",
        False,
    )
    OKTA_LOG_GET_LIST_EVENTS = ("okta", "okta_log_get_list_events", False)
    OKTA_PROFILE_MAPPING_LIST_WITH_PAGINATION = (
        "okta",
        "okta_profile_mapping_list_with_pagination",
        False,
    )
    OKTA_PROFILE_MAPPING_GET_BY_ID = ("okta", "okta_profile_mapping_get_by_id", False)
    OKTA_PROFILE_MAPPING_UPDATE_PROPERTY_MAPPINGS = (
        "okta",
        "okta_profile_mapping_update_property_mappings",
        False,
    )
    OKTA_USER_SCHEMA_GET_USER_SCHEMA = (
        "okta",
        "okta_user_schema_get_user_schema",
        False,
    )
    OKTA_GROUP_SCHEMA_GET = ("okta", "okta_group_schema_get", False)
    OKTA_LINKED_OBJECT_GET_USER_LINKED_OBJECTS = (
        "okta",
        "okta_linked_object_get_user_linked_objects",
        False,
    )
    OKTA_LINKED_OBJECT_CREATE_LINKED_OBJECT = (
        "okta",
        "okta_linked_object_create_linked_object",
        False,
    )
    OKTA_LINKED_OBJECT_DELETE_USER_LINKED_OBJECT = (
        "okta",
        "okta_linked_object_delete_user_linked_object",
        False,
    )
    OKTA_LINKED_OBJECT_GET_USER_LINKED_OBJECTS_2 = (
        "okta",
        "okta_linked_object_get_user_linked_objects_2",
        False,
    )
    OKTA_USER_SCHEMA_GET_SCHEMA_BY_ID = (
        "okta",
        "okta_user_schema_get_schema_by_id",
        False,
    )
    OKTA_USER_TYPE_GET_ALL_USER_TYPES = (
        "okta",
        "okta_user_type_get_all_user_types",
        False,
    )
    OKTA_USER_TYPE_CREATE_NEW_USER_TYPE = (
        "okta",
        "okta_user_type_create_new_user_type",
        False,
    )
    OKTA_USER_TYPE_DELETE_PERMANENTLY = (
        "okta",
        "okta_user_type_delete_permanently",
        False,
    )
    OKTA_USER_TYPE_GET_BY_ID = ("okta", "okta_user_type_get_by_id", False)
    OKTA_USER_TYPE_UPDATE_EXISTING_TYPE = (
        "okta",
        "okta_user_type_update_existing_type",
        False,
    )
    OKTA_USER_TYPEREPLACE_EXISTING_TYPE = (
        "okta",
        "okta_user_typereplace_existing_type",
        False,
    )
    OKTA_ORG_GET_SETTINGS = ("okta", "okta_org_get_settings", False)
    OKTA_ORG_UPDATE_SETTINGS = ("okta", "okta_org_update_settings", False)
    OKTA_ORG_UPDATE_SETTING = ("okta", "okta_org_update_setting", False)
    OKTA_ORG_LIST_CONTACT_TYPES = ("okta", "okta_org_list_contact_types", False)
    OKTA_ORG_GET_CONTACT_USER = ("okta", "okta_org_get_contact_user", False)
    OKTA_ORG_UPDATE_CONTACT_USER = ("okta", "okta_org_update_contact_user", False)
    OKTA_ORG_UPDATE_ORGANIZATION_LOGO = (
        "okta",
        "okta_org_update_organization_logo",
        False,
    )
    OKTA_ORG_GET_ORG_PREFERENCES = ("okta", "okta_org_get_org_preferences", False)
    OKTA_ORG_HIDE_END_USER_FOOTER = ("okta", "okta_org_hide_end_user_footer", False)
    OKTA_ORG_MAKE_OK_TAU_I_FOOTER_VISIBLE = (
        "okta",
        "okta_org_make_ok_tau_i_footer_visible",
        False,
    )
    OKTA_ORG_GETO_KTA_COMMUNICATION_SETTINGS = (
        "okta",
        "okta_org_geto_kta_communication_settings",
        False,
    )
    OKTA_OR_GO_PTI_NO_KTA_COMMUNICATION_EMAILS = (
        "okta",
        "okta_or_go_pti_no_kta_communication_emails",
        False,
    )
    OKTA_OR_GOP_TO_U_TO_KTA_COMMUNICATION_EMAILS = (
        "okta",
        "okta_or_gop_to_u_to_kta_communication_emails",
        False,
    )
    OKTA_ORG_GETO_KTA_SUPPORT_SETTINGS = (
        "okta",
        "okta_org_geto_kta_support_settings",
        False,
    )
    OKTA_ORG_EXTENDO_KTA_SUPPORT = ("okta", "okta_org_extendo_kta_support", False)
    OKTA_ORG_GRAN_TO_KTA_SUPPORT_ACCESS = (
        "okta",
        "okta_org_gran_to_kta_support_access",
        False,
    )
    OKTA_ORG_EXTENDO_KTA_SUPPORT_2 = ("okta", "okta_org_extendo_kta_support_2", False)
    OKTA_POLICY_GET_ALL_WITH_TYPE = ("okta", "okta_policy_get_all_with_type", False)
    OKTA_POLICY_CREATE_NEW_POLICY = ("okta", "okta_policy_create_new_policy", False)
    OKTA_POLICY_REMOVE_POLICY_OPERATION = (
        "okta",
        "okta_policy_remove_policy_operation",
        False,
    )
    OKTA_POLICY_GET_POLICY = ("okta", "okta_policy_get_policy", False)
    OKTA_POLICY_UPDATE_OPERATION = ("okta", "okta_policy_update_operation", False)
    OKTA_POLICY_ACTIVATE_LIFECYCLE = ("okta", "okta_policy_activate_lifecycle", False)
    OKTA_POLICY_DEACTIVATE_LIFECYCLE = (
        "okta",
        "okta_policy_deactivate_lifecycle",
        False,
    )
    OKTA_POLICY_ENUMERATE_RULES = ("okta", "okta_policy_enumerate_rules", False)
    OKTA_POLICY_CREATE_RULE = ("okta", "okta_policy_create_rule", False)
    OKTA_POLICY_REMOVE_RULE = ("okta", "okta_policy_remove_rule", False)
    OKTA_POLICY_GET_POLICY_RULE = ("okta", "okta_policy_get_policy_rule", False)
    OKTA_POLICY_UPDATE_RULE = ("okta", "okta_policy_update_rule", False)
    OKTA_POLICY_ACTIVATE_RULE_LIFECYCLE = (
        "okta",
        "okta_policy_activate_rule_lifecycle",
        False,
    )
    OKTA_POLICY_DEACTIVATE_RULE_LIFECYCLE = (
        "okta",
        "okta_policy_deactivate_rule_lifecycle",
        False,
    )
    OKTA_SUBSCRIPTION_LIST_ROLE_SUBSCRIPTIONS = (
        "okta",
        "okta_subscription_list_role_subscriptions",
        False,
    )
    OKTA_SUBSCRIPTION_GET_ROLE_SUBSCRIPTIONS_BY_NOTIFICATION_TYPE = (
        "okta",
        "okta_subscription_get_role_subscriptions_by_notification_type",
        False,
    )
    OKTA_SUBSCRIPTION_ROLE_NOTIFICATION_SUBSCRIBE = (
        "okta",
        "okta_subscription_role_notification_subscribe",
        False,
    )
    OKTA_SUBSCRIPTION_CUSTOM_ROLE_NOTIFICATION_UNSUBSCRIBE = (
        "okta",
        "okta_subscription_custom_role_notification_unsubscribe",
        False,
    )
    OKTA_SESSION_CREATE_SESSION_WITH_TOKEN = (
        "okta",
        "okta_session_create_session_with_token",
        False,
    )
    OKTA_SESSION_CLOSE = ("okta", "okta_session_close", False)
    OKTA_SESSION_GET_DETAILS = ("okta", "okta_session_get_details", False)
    OKTA_SESSION_REFRESH_LIFECYCLE = ("okta", "okta_session_refresh_lifecycle", False)
    OKTA_TEMPLATE_ENUMERATES_MS_TEMPLATES = (
        "okta",
        "okta_template_enumerates_ms_templates",
        False,
    )
    OKTA_TEMPLATE_ADD_NEW_CUSTOMS_MS = (
        "okta",
        "okta_template_add_new_customs_ms",
        False,
    )
    OKTA_TEMPLATE_REMOVES_MS = ("okta", "okta_template_removes_ms", False)
    OKTA_TEMPLATE_GET_BY_ID = ("okta", "okta_template_get_by_id", False)
    OKTA_TEMPLATE_PARTIAL_SMS_UPDATE = (
        "okta",
        "okta_template_partial_sms_update",
        False,
    )
    OKTA_TEMPLATE_UPDATES_MS_TEMPLATE = (
        "okta",
        "okta_template_updates_ms_template",
        False,
    )
    OKTA_THREAT_INSIGHT_GET_CURRENT_CONFIGURATION = (
        "okta",
        "okta_threat_insight_get_current_configuration",
        False,
    )
    OKTA_THREAT_INSIGHT_UPDATE_CONFIGURATION = (
        "okta",
        "okta_threat_insight_update_configuration",
        False,
    )
    OKTA_TRUSTED_ORIGIN_GET_LIST = ("okta", "okta_trusted_origin_get_list", False)
    OKTA_TRUSTED_ORIGIN_CREATE_SUCCESS = (
        "okta",
        "okta_trusted_origin_create_success",
        False,
    )
    OKTA_TRUSTED_ORIGIN_DELETE_SUCCESS = (
        "okta",
        "okta_trusted_origin_delete_success",
        False,
    )
    OKTA_TRUSTED_ORIGIN_GET_SUCCESS_BY_ID = (
        "okta",
        "okta_trusted_origin_get_success_by_id",
        False,
    )
    OKTA_TRUSTED_ORIGIN_UPDATE_SUCCESS = (
        "okta",
        "okta_trusted_origin_update_success",
        False,
    )
    OKTA_TRUSTED_ORIGIN_ACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_trusted_origin_activate_lifecycle_success",
        False,
    )
    OKTA_TRUSTED_ORIGIN_DEACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_trusted_origin_deactivate_lifecycle_success",
        False,
    )
    OKTA_USER_LIST_ACTIVE_USERS = ("okta", "okta_user_list_active_users", False)
    OKTA_USER_CREATE_NEW_USER = ("okta", "okta_user_create_new_user", False)
    OKTA_USER_UPDATE_LINKED_OBJECT = ("okta", "okta_user_update_linked_object", False)
    OKTA_USER_DELETE_PERMANENTLY = ("okta", "okta_user_delete_permanently", False)
    OKTA_USER_GETO_KTA_USER = ("okta", "okta_user_geto_kta_user", False)
    OKTA_USER_UPDATE_PROFILE = ("okta", "okta_user_update_profile", False)
    OKTA_USER_UPDATE_PROFILE_2 = ("okta", "okta_user_update_profile_2", False)
    OKTA_USER_LIST_ASSIGNED_APP_LINKS = (
        "okta",
        "okta_user_list_assigned_app_links",
        False,
    )
    OKTA_USER_LIST_CLIENTS = ("okta", "okta_user_list_clients", False)
    OKTA_USER_REVOKE_GRANTS_FOR_USER_AND_CLIENT = (
        "okta",
        "okta_user_revoke_grants_for_user_and_client",
        False,
    )
    OKTA_USER_LIST_GRANTS_FOR_CLIENT = (
        "okta",
        "okta_user_list_grants_for_client",
        False,
    )
    OKTA_USER_REVOKE_ALL_TOKENS = ("okta", "okta_user_revoke_all_tokens", False)
    OKTA_USER_LIST_REFRESH_TOKENS_FOR_USER_AND_CLIENT = (
        "okta",
        "okta_user_list_refresh_tokens_for_user_and_client",
        False,
    )
    OKTA_USER_REVOKE_TOKEN_FOR_CLIENT = (
        "okta",
        "okta_user_revoke_token_for_client",
        False,
    )
    OKTA_USER_GET_CLIENT_REFRESH_TOKEN = (
        "okta",
        "okta_user_get_client_refresh_token",
        False,
    )
    OKTA_USER_CHANGE_PASSWORD_VALIDATION = (
        "okta",
        "okta_user_change_password_validation",
        False,
    )
    OKTA_USER_UPDATE_RECOVERY_QUESTION = (
        "okta",
        "okta_user_update_recovery_question",
        False,
    )
    OKTA_USER_FORGOT_PASSWORD = ("okta", "okta_user_forgot_password", False)
    OKTA_USER_FACTOR_ENUMERATE_ENROLLED = (
        "okta",
        "okta_user_factor_enumerate_enrolled",
        False,
    )
    OKTA_USER_FACTOR_ENROLL_SUPPORTED_FACTOR = (
        "okta",
        "okta_user_factor_enroll_supported_factor",
        False,
    )
    OKTA_USER_FACTOR_ENUMERATE_SUPPORTED_FACTORS = (
        "okta",
        "okta_user_factor_enumerate_supported_factors",
        False,
    )
    OKTA_USER_FACTOR_ENUMERATE_SECURITY_QUESTIONS = (
        "okta",
        "okta_user_factor_enumerate_security_questions",
        False,
    )
    OKTA_USER_FACTO_RUN_ENROLL_FACTOR = (
        "okta",
        "okta_user_facto_run_enroll_factor",
        False,
    )
    OKTA_USER_FACTOR_GET_FACTOR = ("okta", "okta_user_factor_get_factor", False)
    OKTA_USER_FACTOR_ACTIVATE_FACTOR_LIFECYCLE = (
        "okta",
        "okta_user_factor_activate_factor_lifecycle",
        False,
    )
    OKTA_USER_FACTOR_POLL_FACTOR_TRANSACTION_STATUS = (
        "okta",
        "okta_user_factor_poll_factor_transaction_status",
        False,
    )
    OKTA_USER_FACTOR_VERIFY_OT_P = ("okta", "okta_user_factor_verify_ot_p", False)
    OKTA_USER_REVOKE_GRANTS = ("okta", "okta_user_revoke_grants", False)
    OKTA_USER_LIST_GRANTS = ("okta", "okta_user_list_grants", False)
    OKTA_USER_REVOKE_GRANT = ("okta", "okta_user_revoke_grant", False)
    OKTA_USER_GET_GRANT_BY_ID = ("okta", "okta_user_get_grant_by_id", False)
    OKTA_USER_GET_MEMBER_GROUPS = ("okta", "okta_user_get_member_groups", False)
    OKTA_USER_LIST_I_DPS_FOR_USER = ("okta", "okta_user_list_i_dps_for_user", False)
    OKTA_USER_ACTIVATE_LIFECYCLE = ("okta", "okta_user_activate_lifecycle", False)
    OKTA_USER_DEACTIVATE_LIFECYCLE = ("okta", "okta_user_deactivate_lifecycle", False)
    OKTA_USER_EXPIRE_PASSWORD_AND_GET_TEMPORARY_PASSWORD = (
        "okta",
        "okta_user_expire_password_and_get_temporary_password",
        False,
    )
    OKTA_USER_EXPIRE_PASSWORD_AND_TEMPORARY_PASSWORD = (
        "okta",
        "okta_user_expire_password_and_temporary_password",
        False,
    )
    OKTA_USER_REACTIVATE_USER = ("okta", "okta_user_reactivate_user", False)
    OKTA_USER_RESET_FACTORS_OPERATION = (
        "okta",
        "okta_user_reset_factors_operation",
        False,
    )
    OKTA_USER_GENERATE_PASSWORD_RESET_TOKEN = (
        "okta",
        "okta_user_generate_password_reset_token",
        False,
    )
    OKTA_USER_SUSPEND_LIFECYCLE = ("okta", "okta_user_suspend_lifecycle", False)
    OKTA_USER_UNLOCK_USER_STATUS = ("okta", "okta_user_unlock_user_status", False)
    OKTA_USE_RUN_SUSPEND_LIFECYCLE = ("okta", "okta_use_run_suspend_lifecycle", False)
    OKTA_USER_DELETE_LINKED_OBJECTS = ("okta", "okta_user_delete_linked_objects", False)
    OKTA_USER_GET_LINKED_OBJECTS = ("okta", "okta_user_get_linked_objects", False)
    OKTA_USER_LIST_ASSIGNED_ROLES = ("okta", "okta_user_list_assigned_roles", False)
    OKTA_USER_ASSIGN_ROLE = ("okta", "okta_user_assign_role", False)
    OKTA_USE_RUN_ASSIGN_ROLE = ("okta", "okta_use_run_assign_role", False)
    OKTA_USER_GET_ASSIGNED_ROLE = ("okta", "okta_user_get_assigned_role", False)
    OKTA_USER_LIST_APP_TARGETS_FOR_ROLE = (
        "okta",
        "okta_user_list_app_targets_for_role",
        False,
    )
    OKTA_USER_UPDATE_ROLES_CATALOG_APPS = (
        "okta",
        "okta_user_update_roles_catalog_apps",
        False,
    )
    OKTA_USER_DELETE_TARGET_APP = ("okta", "okta_user_delete_target_app", False)
    OKTA_USER_UPDATE_ROLES_CATALOG_APPS_2 = (
        "okta",
        "okta_user_update_roles_catalog_apps_2",
        False,
    )
    OKTA_USER_REMOVE_APP_INSTANCE_TARGET_TO_APP_ADMINISTRATOR_ROLE_GIVEN_TO = (
        "okta",
        "okta_user_remove_app_instance_target_to_app_administrator_role_given_to",
        False,
    )
    OKTA_USER_ADD_APP_INSTANCE_TARGET_TO_APP_ADMINISTRATOR_ROLE_GIVEN_TO_USER = (
        "okta",
        "okta_user_add_app_instance_target_to_app_administrator_role_given_to_user",
        False,
    )
    OKTA_USER_LIST_ROLE_TARGETS_GROUPS = (
        "okta",
        "okta_user_list_role_targets_groups",
        False,
    )
    OKTA_USER_REMOVE_TARGET_GROUP = ("okta", "okta_user_remove_target_group", False)
    OKTA_USER_UPDATE_ROLES_CATALOG_APPS_3 = (
        "okta",
        "okta_user_update_roles_catalog_apps_3",
        False,
    )
    OKTA_USER_REVOKE_ALL_SESSIONS = ("okta", "okta_user_revoke_all_sessions", False)
    OKTA_USER_LIST_SUBSCRIPTIONS = ("okta", "okta_user_list_subscriptions", False)
    OKTA_USER_GET_SUBSCRIPTION_BY_NOTIFICATION = (
        "okta",
        "okta_user_get_subscription_by_notification",
        False,
    )
    OKTA_SUBSCRIPTION_USER_NOTIFICATION_SUBSCRIBE = (
        "okta",
        "okta_subscription_user_notification_subscribe",
        False,
    )
    OKTA_SUBSCRIPTION_UNSUBSCRIBE_USER_SUBSCRIPTION_BY_NOTIFICATION_TYPE = (
        "okta",
        "okta_subscription_unsubscribe_user_subscription_by_notification_type",
        False,
    )
    OKTA_NETWORK_ZONE_LIST_ZONES = ("okta", "okta_network_zone_list_zones", False)
    OKTA_NETWORK_ZONE_CREATE_NEW = ("okta", "okta_network_zone_create_new", False)
    OKTA_NETWORK_ZONE_REMOVE_ZONE = ("okta", "okta_network_zone_remove_zone", False)
    OKTA_NETWORK_ZONE_GET_BY_ID = ("okta", "okta_network_zone_get_by_id", False)
    OKTA_NETWORK_ZONE_UPDATE_ZONE = ("okta", "okta_network_zone_update_zone", False)
    OKTA_NETWORK_ZONE_ACTIVATE_LIFECYCLE = (
        "okta",
        "okta_network_zone_activate_lifecycle",
        False,
    )
    OKTA_NETWORK_ZONE_DEACTIVATE_ZONE_LIFECYCLE = (
        "okta",
        "okta_network_zone_deactivate_zone_lifecycle",
        False,
    )
    SCHEDULER_SCHEDULE_JOB_ACTION = ("scheduler", "scheduler_schedule_job_action", True)
    SERPAPI_SEARCH = ("serpapi", "serpapi_search", True)
    SLACK_SEND_SLACK_MESSAGE = ("slack", "slack_send_slack_message", False)
    SLACK_LIST_SLACK_CHANNELS = ("slack", "slack_list_slack_channels", False)
    SLACK_LIST_SLACK_MEMBERS = ("slack", "slack_list_slack_members", False)
    SLACK_LIST_SLACK_MESSAGES = ("slack", "slack_list_slack_messages", False)
    SLACKBOT_SEND_SLACK_MESSAGE = ("slackbot", "slackbot_send_slack_message", False)
    SLACKBOT_LIST_SLACK_CHANNELS = ("slackbot", "slackbot_list_slack_channels", False)
    SLACKBOT_LIST_SLACK_MEMBERS = ("slackbot", "slackbot_list_slack_members", False)
    SLACKBOT_LIST_SLACK_MESSAGES = ("slackbot", "slackbot_list_slack_messages", False)
    SNOWFLAKE_RUN_QUERY = ("snowflake", "snowflake_run_query", False)
    SNOWFLAKE_SHOW_TABLES = ("snowflake", "snowflake_show_tables", False)
    SNOWFLAKE_DESCRIBE_TABLE = ("snowflake", "snowflake_describe_table", False)
    SNOWFLAKE_EXPLORE_COLUMNS = ("snowflake", "snowflake_explore_columns", False)
    SPOTIFY_GET_AN_ALBUM = ("spotify", "spotify_get_an_album", False)
    SPOTIFY_GET_MULTIPLE_ALBUMS = ("spotify", "spotify_get_multiple_albums", False)
    SPOTIFY_GET_AN_ALBUMS_TRACKS = ("spotify", "spotify_get_an_albums_tracks", False)
    SPOTIFY_GET_AN_ARTIST = ("spotify", "spotify_get_an_artist", False)
    SPOTIFY_GET_MULTIPLE_ARTISTS = ("spotify", "spotify_get_multiple_artists", False)
    SPOTIFY_GET_AN_ARTISTS_ALBUMS = ("spotify", "spotify_get_an_artists_albums", False)
    SPOTIFY_GET_AN_ARTISTS_TOP_TRACKS = (
        "spotify",
        "spotify_get_an_artists_top_tracks",
        False,
    )
    SPOTIFY_GET_AN_ARTISTS_RELATED_ARTISTS = (
        "spotify",
        "spotify_get_an_artists_related_artists",
        False,
    )
    SPOTIFY_GET_A_SHOW = ("spotify", "spotify_get_a_show", False)
    SPOTIFY_GET_MULTIPLE_SHOWS = ("spotify", "spotify_get_multiple_shows", False)
    SPOTIFY_GET_A_SHOWS_EPISODES = ("spotify", "spotify_get_a_shows_episodes", False)
    SPOTIFY_GET_AN_EPISODE = ("spotify", "spotify_get_an_episode", False)
    SPOTIFY_GET_MULTIPLE_EPISODES = ("spotify", "spotify_get_multiple_episodes", False)
    SPOTIFY_GET_AN_AUDIOBOOK = ("spotify", "spotify_get_an_audiobook", False)
    SPOTIFY_GET_MULTIPLE_AUDIOBOOKS = (
        "spotify",
        "spotify_get_multiple_audiobooks",
        False,
    )
    SPOTIFY_GET_AUDIOBOOK_CHAPTERS = (
        "spotify",
        "spotify_get_audiobook_chapters",
        False,
    )
    SPOTIFY_GET_USERS_SAVED_AUDIOBOOKS = (
        "spotify",
        "spotify_get_users_saved_audiobooks",
        False,
    )
    SPOTIFY_SAVE_AUDIOBOOKS_USER = ("spotify", "spotify_save_audiobooks_user", False)
    SPOTIFY_REMOVE_AUDIOBOOKS_USER = (
        "spotify",
        "spotify_remove_audiobooks_user",
        False,
    )
    SPOTIFY_CHECKUSERS_SAVED_AUDIOBOOKS = (
        "spotify",
        "spotify_checkusers_saved_audiobooks",
        False,
    )
    SPOTIFY_GET_A_CHAPTER = ("spotify", "spotify_get_a_chapter", False)
    SPOTIFY_GET_SEVERAL_CHAPTERS = ("spotify", "spotify_get_several_chapters", False)
    SPOTIFY_GET_TRACK = ("spotify", "spotify_get_track", False)
    SPOTIFY_GET_SEVERAL_TRACKS = ("spotify", "spotify_get_several_tracks", False)
    SPOTIFY_SEARCH = ("spotify", "spotify_search", False)
    SPOTIFY_GET_CURRENT_USERS_PROFILE = (
        "spotify",
        "spotify_get_current_users_profile",
        False,
    )
    SPOTIFY_GET_PLAYLIST = ("spotify", "spotify_get_playlist", False)
    SPOTIFY_CHANGE_PLAYLIST_DETAILS = (
        "spotify",
        "spotify_change_playlist_details",
        False,
    )
    SPOTIFY_GET_PLAYLISTS_TRACKS = ("spotify", "spotify_get_playlists_tracks", False)
    SPOTIFY_ADD_TRACKS_TO_PLAYLIST = (
        "spotify",
        "spotify_add_tracks_to_playlist",
        False,
    )
    SPOTIFY_REORDER_OR_REPLACE_PLAYLISTS_TRACKS = (
        "spotify",
        "spotify_reorder_or_replace_playlists_tracks",
        False,
    )
    SPOTIFY_REMOVE_TRACKS_PLAYLIST = (
        "spotify",
        "spotify_remove_tracks_playlist",
        False,
    )
    SPOTIFY_GET_A_LIST_OF_CURRENT_USERS_PLAYLISTS = (
        "spotify",
        "spotify_get_a_list_of_current_users_playlists",
        False,
    )
    SPOTIFY_GET_USERS_SAVED_ALBUMS = (
        "spotify",
        "spotify_get_users_saved_albums",
        False,
    )
    SPOTIFY_SAVE_ALBUMS_USER = ("spotify", "spotify_save_albums_user", False)
    SPOTIFY_REMOVE_ALBUMS_USER = ("spotify", "spotify_remove_albums_user", False)
    SPOTIFY_CHECKUSERS_SAVED_ALBUMS = (
        "spotify",
        "spotify_checkusers_saved_albums",
        False,
    )
    SPOTIFY_GET_USERS_SAVED_TRACKS = (
        "spotify",
        "spotify_get_users_saved_tracks",
        False,
    )
    SPOTIFY_SAVE_TRACKS_USER = ("spotify", "spotify_save_tracks_user", False)
    SPOTIFY_REMOVE_TRACKS_USER = ("spotify", "spotify_remove_tracks_user", False)
    SPOTIFY_CHECKUSERS_SAVED_TRACKS = (
        "spotify",
        "spotify_checkusers_saved_tracks",
        False,
    )
    SPOTIFY_GET_USERS_SAVED_EPISODES = (
        "spotify",
        "spotify_get_users_saved_episodes",
        False,
    )
    SPOTIFY_SAVE_EPISODES_USER = ("spotify", "spotify_save_episodes_user", False)
    SPOTIFY_REMOVE_EPISODES_USER = ("spotify", "spotify_remove_episodes_user", False)
    SPOTIFY_CHECKUSERS_SAVED_EPISODES = (
        "spotify",
        "spotify_checkusers_saved_episodes",
        False,
    )
    SPOTIFY_GET_USERS_SAVED_SHOWS = ("spotify", "spotify_get_users_saved_shows", False)
    SPOTIFY_SAVE_SHOWS_USER = ("spotify", "spotify_save_shows_user", False)
    SPOTIFY_REMOVE_SHOWS_USER = ("spotify", "spotify_remove_shows_user", False)
    SPOTIFY_CHECKUSERS_SAVED_SHOWS = (
        "spotify",
        "spotify_checkusers_saved_shows",
        False,
    )
    SPOTIFY_GET_USERS_PROFILE = ("spotify", "spotify_get_users_profile", False)
    SPOTIFY_GET_LIST_USERS_PLAYLISTS = (
        "spotify",
        "spotify_get_list_users_playlists",
        False,
    )
    SPOTIFY_CREATE_PLAYLIST = ("spotify", "spotify_create_playlist", False)
    SPOTIFY_FOLLOW_PLAYLIST = ("spotify", "spotify_follow_playlist", False)
    SPOTIFY_UN_FOLLOW_PLAYLIST = ("spotify", "spotify_un_follow_playlist", False)
    SPOTIFY_GET_FEATURED_PLAYLISTS = (
        "spotify",
        "spotify_get_featured_playlists",
        False,
    )
    SPOTIFY_GET_CATEGORIES = ("spotify", "spotify_get_categories", False)
    SPOTIFY_GET_A_CATEGORY = ("spotify", "spotify_get_a_category", False)
    SPOTIFY_GET_A_CATEGORIES_PLAYLISTS = (
        "spotify",
        "spotify_get_a_categories_playlists",
        False,
    )
    SPOTIFY_GET_PLAYLIST_COVER = ("spotify", "spotify_get_playlist_cover", False)
    SPOTIFY_UPLOAD_CUSTOM_PLAYLIST_COVER = (
        "spotify",
        "spotify_upload_custom_playlist_cover",
        False,
    )
    SPOTIFY_GET_NEW_RELEASES = ("spotify", "spotify_get_new_releases", False)
    SPOTIFY_GET_FOLLOWED = ("spotify", "spotify_get_followed", False)
    SPOTIFY_FOLLOW_ARTISTS_USERS = ("spotify", "spotify_follow_artists_users", False)
    SPOTIFY_UN_FOLLOW_ARTISTS_USERS = (
        "spotify",
        "spotify_un_follow_artists_users",
        False,
    )
    SPOTIFY_CHECK_CURRENT_USER_FOLLOWS = (
        "spotify",
        "spotify_check_current_user_follows",
        False,
    )
    SPOTIFY_CHECK_IF_USER_FOLLOWS_PLAYLIST = (
        "spotify",
        "spotify_check_if_user_follows_playlist",
        False,
    )
    SPOTIFY_GET_SEVERAL_AUDIO_FEATURES = (
        "spotify",
        "spotify_get_several_audio_features",
        False,
    )
    SPOTIFY_GET_AUDIO_FEATURES = ("spotify", "spotify_get_audio_features", False)
    SPOTIFY_GET_AUDIO_ANALYSIS = ("spotify", "spotify_get_audio_analysis", False)
    SPOTIFY_GET_RECOMMENDATIONS = ("spotify", "spotify_get_recommendations", False)
    SPOTIFY_GET_RECOMMENDATION_GENRES = (
        "spotify",
        "spotify_get_recommendation_genres",
        False,
    )
    SPOTIFY_GET_INFORMATION_ABOUT_THE_USERS_CURRENT_PLAYBACK = (
        "spotify",
        "spotify_get_information_about_the_users_current_playback",
        False,
    )
    SPOTIFY_TRANSFER_A_USERS_PLAYBACK = (
        "spotify",
        "spotify_transfer_a_users_playback",
        False,
    )
    SPOTIFY_GET_A_USERS_AVAILABLE_DEVICES = (
        "spotify",
        "spotify_get_a_users_available_devices",
        False,
    )
    SPOTIFY_GET_THE_USERS_CURRENTLY_PLAYING_TRACK = (
        "spotify",
        "spotify_get_the_users_currently_playing_track",
        False,
    )
    SPOTIFY_START_A_USERS_PLAYBACK = (
        "spotify",
        "spotify_start_a_users_playback",
        False,
    )
    SPOTIFY_PAUSE_A_USERS_PLAYBACK = (
        "spotify",
        "spotify_pause_a_users_playback",
        False,
    )
    SPOTIFY_SKIP_USERS_PLAYBACK_TO_NEXT_TRACK = (
        "spotify",
        "spotify_skip_users_playback_to_next_track",
        False,
    )
    SPOTIFY_SKIP_USERS_PLAYBACK_TO_PREVIOUS_TRACK = (
        "spotify",
        "spotify_skip_users_playback_to_previous_track",
        False,
    )
    SPOTIFY_SEEK_TO_POSITION_IN_CURRENTLY_PLAYING_TRACK = (
        "spotify",
        "spotify_seek_to_position_in_currently_playing_track",
        False,
    )
    SPOTIFY_SET_REPEAT_MODE_ON_USERS_PLAYBACK = (
        "spotify",
        "spotify_set_repeat_mode_on_users_playback",
        False,
    )
    SPOTIFY_SET_VOLUME_FOR_USERS_PLAYBACK = (
        "spotify",
        "spotify_set_volume_for_users_playback",
        False,
    )
    SPOTIFY_TOGGLE_SHUFFLE_FOR_USERS_PLAYBACK = (
        "spotify",
        "spotify_toggle_shuffle_for_users_playback",
        False,
    )
    SPOTIFY_GET_RECENTLY_PLAYED = ("spotify", "spotify_get_recently_played", False)
    SPOTIFY_GET_QUEUE = ("spotify", "spotify_get_queue", False)
    SPOTIFY_ADD_TO_QUEUE = ("spotify", "spotify_add_to_queue", False)
    SPOTIFY_GET_AVAILABLE_MARKETS = ("spotify", "spotify_get_available_markets", False)
    SPOTIFY_GET_USERS_TOP_ARTISTS = ("spotify", "spotify_get_users_top_artists", False)
    SPOTIFY_GET_USERS_TOP_TRACKS = ("spotify", "spotify_get_users_top_tracks", False)
    TASKADE_WORK_SPACE_CREATE_PROJECT = (
        "taskade",
        "taskade_work_space_create_project",
        False,
    )
    TASKADE_WORK_SPACES_GET = ("taskade", "taskade_work_spaces_get", False)
    TASKADE_WORK_SPACE_FOLDERS_GET = (
        "taskade",
        "taskade_work_space_folders_get",
        False,
    )
    TASKADE_PROJECT_COPY = ("taskade", "taskade_project_copy", False)
    TASKADE_PROJECT_CREATE = ("taskade", "taskade_project_create", False)
    TASKADE_PROJECT_SHARE_LINK_GET = (
        "taskade",
        "taskade_project_share_link_get",
        False,
    )
    TASKADE_PROJECT_SHARE_LINK_ENABLE = (
        "taskade",
        "taskade_project_share_link_enable",
        False,
    )
    TASKADE_PROJECT_TASKS_GET = ("taskade", "taskade_project_tasks_get", False)
    TASKADE_TASK_COMPLETE = ("taskade", "taskade_task_complete", False)
    TASKADE_TASK_CREATE = ("taskade", "taskade_task_create", False)
    TASKADE_TASK_DELETE = ("taskade", "taskade_task_delete", False)
    TASKADE_TASK_GET = ("taskade", "taskade_task_get", False)
    TASKADE_TASK_DELETE_ASSIGN_EES = (
        "taskade",
        "taskade_task_delete_assign_ees",
        False,
    )
    TASKADE_TASK_DELETE_DATE = ("taskade", "taskade_task_delete_date", False)
    TASKADE_TASK_PUT_DATE = ("taskade", "taskade_task_put_date", False)
    TASKADE_TASK_PUT_ASSIGN_EES = ("taskade", "taskade_task_put_assign_ees", False)
    TASKADE_FOLDER_PROJECTS_GET = ("taskade", "taskade_folder_projects_get", False)
    TASKADE_FOLDER_CREATE_AGENT = ("taskade", "taskade_folder_create_agent", False)
    TASKADE_ME_PROJECTS_GET = ("taskade", "taskade_me_projects_get", False)
    TASKADE_AGENT_PUBLIC_ACCESS_ENABLE = (
        "taskade",
        "taskade_agent_public_access_enable",
        False,
    )
    TRELLO_CREATE_TRELLO_LIST = ("trello", "trello_create_trello_list", False)
    TRELLO_CREATE_TRELLO_CARD = ("trello", "trello_create_trello_card", False)
    TRELLO_GET_TRELLO_BOARD_CARDS = ("trello", "trello_get_trello_board_cards", False)
    TRELLO_DELETE_TRELLO_CARD = ("trello", "trello_delete_trello_card", False)
    TRELLO_ADD_TRELLO_CARD_COMMENT = ("trello", "trello_add_trello_card_comment", False)
    TRELLO_CREATE_TRELLO_LABEL = ("trello", "trello_create_trello_label", False)
    TRELLO_UPDATE_TRELLO_BOARD = ("trello", "trello_update_trello_board", False)
    TRELLO_GET_ABOUT_ME = ("trello", "trello_get_about_me", False)
    TRELLO_SEARCH_TRELLO = ("trello", "trello_search_trello", False)
    TRELLO_SEARCH_TRELLO_MEMBER = ("trello", "trello_search_trello_member", False)
    TRELLO_UPDATE_TRELLO_CARD = ("trello", "trello_update_trello_card", False)
    TRELLO_GET_TRELLO_MEMBER_BOARD = ("trello", "trello_get_trello_member_board", False)
    TYPEFORM_GET_ABOUT_ME = ("typeform", "typeform_get_about_me", False)
    WHATSAPP_REGISTRATION_REQUEST_CODE = (
        "whatsapp",
        "whatsapp_registration_request_code",
        False,
    )
    WHATSAPP_APPLICATION_SET_SHARDS = (
        "whatsapp",
        "whatsapp_application_set_shards",
        False,
    )
    WHATSAPP_REGISTRATION_VERIFY_ACCOUNT = (
        "whatsapp",
        "whatsapp_registration_verify_account",
        False,
    )
    WHATSAPP_CERTIFICATES_UPLOAD_EXTERNAL_CERTIFICATE = (
        "whatsapp",
        "whatsapp_certificates_upload_external_certificate",
        False,
    )
    WHATSAPP_CERTIFICATES_DOWNLOAD_CA_CERTIFICATE = (
        "whatsapp",
        "whatsapp_certificates_download_ca_certificate",
        False,
    )
    WHATSAPP_CERTIFICATES_DELETE_WEB_HOOK_CA = (
        "whatsapp",
        "whatsapp_certificates_delete_web_hook_ca",
        False,
    )
    WHATSAPP_CERTIFICATES_DOWNLOAD_WEB_HOOK_CA_CERTIFICATE = (
        "whatsapp",
        "whatsapp_certificates_download_web_hook_ca_certificate",
        False,
    )
    WHATSAPP_CERTIFICATES_UPLOAD_WEB_HOOK_CA_CERTIFICATE = (
        "whatsapp",
        "whatsapp_certificates_upload_web_hook_ca_certificate",
        False,
    )
    WHATSAPP_CONTACTS_CREATE_CONTACT = (
        "whatsapp",
        "whatsapp_contacts_create_contact",
        False,
    )
    WHATSAPP_GROUPS_GET_ALL = ("whatsapp", "whatsapp_groups_get_all", False)
    WHATSAPP_GROUPS_CREATE_GROUP = ("whatsapp", "whatsapp_groups_create_group", False)
    WHATSAPP_GROUPS_GET_INFO = ("whatsapp", "whatsapp_groups_get_info", False)
    WHATSAPP_GROUPS_UPDATE_INFO = ("whatsapp", "whatsapp_groups_update_info", False)
    WHATSAPP_GROUPS_DEMOTE_ADMIN = ("whatsapp", "whatsapp_groups_demote_admin", False)
    WHATSAPP_GROUPS_PROMOTE_TO_ADMIN = (
        "whatsapp",
        "whatsapp_groups_promote_to_admin",
        False,
    )
    WHATSAPP_GROUPS_DELETE_GROUP_ICON = (
        "whatsapp",
        "whatsapp_groups_delete_group_icon",
        False,
    )
    WHATSAPP_GROUPS_GET_ICON_BINARY = (
        "whatsapp",
        "whatsapp_groups_get_icon_binary",
        False,
    )
    WHATSAPP_GROUPS_SET_GROUP_ICON = (
        "whatsapp",
        "whatsapp_groups_set_group_icon",
        False,
    )
    WHATSAPP_GROUPS_DELETE_INVITE = ("whatsapp", "whatsapp_groups_delete_invite", False)
    WHATSAPP_GROUPS_GET_INVITE_DETAILS = (
        "whatsapp",
        "whatsapp_groups_get_invite_details",
        False,
    )
    WHATSAPP_GROUPS_LEAVE_GROUP = ("whatsapp", "whatsapp_groups_leave_group", False)
    WHATSAPP_GROUPS_REMOVE_PARTICIPANT = (
        "whatsapp",
        "whatsapp_groups_remove_participant",
        False,
    )
    WHATSAPP_HEALTH_CHECK_STATUS = ("whatsapp", "whatsapp_health_check_status", False)
    WHATSAPP_MEDIA_UPLOAD_MEDIA = ("whatsapp", "whatsapp_media_upload_media", False)
    WHATSAPP_MEDIA_REMOVE_MEDIA = ("whatsapp", "whatsapp_media_remove_media", False)
    WHATSAPP_MEDIA_DOWNLOAD = ("whatsapp", "whatsapp_media_download", False)
    WHATSAPP_MESSAGES_SEND_MESSAGE = (
        "whatsapp",
        "whatsapp_messages_send_message",
        False,
    )
    WHATSAPP_MESSAGES_MARK_AS_READ = (
        "whatsapp",
        "whatsapp_messages_mark_as_read",
        False,
    )
    WHATSAPP_HEALTH_GET_METRICS_DATA = (
        "whatsapp",
        "whatsapp_health_get_metrics_data",
        False,
    )
    WHATSAPP_TWO_STEP_VERIFICATION_DISABLE = (
        "whatsapp",
        "whatsapp_two_step_verification_disable",
        False,
    )
    WHATSAPP_TWO_STEP_VERIFICATION_ENABLE_ACCOUNT = (
        "whatsapp",
        "whatsapp_two_step_verification_enable_account",
        False,
    )
    WHATSAPP_APPLICATION_RESET_SETTINGS = (
        "whatsapp",
        "whatsapp_application_reset_settings",
        False,
    )
    WHATSAPP_APPLICATION_GET_SETTINGS = (
        "whatsapp",
        "whatsapp_application_get_settings",
        False,
    )
    WHATSAPP_APPLICATION_UPDATE_SETTINGS = (
        "whatsapp",
        "whatsapp_application_update_settings",
        False,
    )
    WHATSAPP_APPLICATION_LIST_MEDIA_PROVIDERS = (
        "whatsapp",
        "whatsapp_application_list_media_providers",
        False,
    )
    WHATSAPP_APPLICATION_REMOVE_PROVIDER = (
        "whatsapp",
        "whatsapp_application_remove_provider",
        False,
    )
    WHATSAPP_BACKUP_RESTORE_SETTINGS_POST = (
        "whatsapp",
        "whatsapp_backup_restore_settings_post",
        False,
    )
    WHATSAPP_BUSINESS_PROFILE_GET = ("whatsapp", "whatsapp_business_profile_get", False)
    WHATSAPP_BUSINESS_PROFILE_UPDATE = (
        "whatsapp",
        "whatsapp_business_profile_update",
        False,
    )
    WHATSAPP_PROFILE_GET_ABOUT = ("whatsapp", "whatsapp_profile_get_about", False)
    WHATSAPP_PROFILE_UPDATE_ABOUT = ("whatsapp", "whatsapp_profile_update_about", False)
    WHATSAPP_PROFILE_REMOVE_PHOTO = ("whatsapp", "whatsapp_profile_remove_photo", False)
    WHATSAPP_PROFILE_GET_PHOTO = ("whatsapp", "whatsapp_profile_get_photo", False)
    WHATSAPP_PROFILE_UPDATE_PHOTO = ("whatsapp", "whatsapp_profile_update_photo", False)
    WHATSAPP_BACKUP_RESTORE_SETTINGS_POST_2 = (
        "whatsapp",
        "whatsapp_backup_restore_settings_post_2",
        False,
    )
    WHATSAPP_HEALTH_GET_APP_STATS = ("whatsapp", "whatsapp_health_get_app_stats", False)
    WHATSAPP_HEALTH_GET_DB_STATS = ("whatsapp", "whatsapp_health_get_db_stats", False)
    WHATSAPP_HEALTH_GET_SUPPORT_INFO = (
        "whatsapp",
        "whatsapp_health_get_support_info",
        False,
    )
    WHATSAPP_USERS_CREATE_USER = ("whatsapp", "whatsapp_users_create_user", False)
    WHATSAPP_USERS_PERFORM_LOGIN = ("whatsapp", "whatsapp_users_perform_login", False)
    WHATSAPP_USERS_PERFORM_LOG_OUT = (
        "whatsapp",
        "whatsapp_users_perform_log_out",
        False,
    )
    WHATSAPP_USERS_REMOVE_USER = ("whatsapp", "whatsapp_users_remove_user", False)
    WHATSAPP_USERS_GET_BY_USERNAME = (
        "whatsapp",
        "whatsapp_users_get_by_username",
        False,
    )
    WHATSAPP_USERS_UPDATE_USER = ("whatsapp", "whatsapp_users_update_user", False)
    YOUTUBE_LIST_USER_PLAYLISTS = ("youtube", "youtube_list_user_playlists", False)
    YOUTUBE_LIST_USER_SUBSCRIPTIONS = (
        "youtube",
        "youtube_list_user_subscriptions",
        False,
    )
    YOUTUBE_SEARCH_YOU_TUBE = ("youtube", "youtube_search_you_tube", False)
    YOUTUBE_LIST_CAPTION_TRACK = ("youtube", "youtube_list_caption_track", False)
    YOUTUBE_LOAD_CAPTIONS = ("youtube", "youtube_load_captions", False)
    YOUTUBE_LIST_CHANNEL_VIDEOS = ("youtube", "youtube_list_channel_videos", False)
    YOUTUBE_SUBSCRIBE_CHANNEL = ("youtube", "youtube_subscribe_channel", False)
    YOUTUBE_VIDEO_DETAILS = ("youtube", "youtube_video_details", False)
    YOUTUBE_UPDATE_THUMBNAIL = ("youtube", "youtube_update_thumbnail", False)
    YOUTUBE_UPDATE_VIDEO = ("youtube", "youtube_update_video", False)
    ZENDESK_CREATE_ZENDESK_ORGANIZATION = (
        "zendesk",
        "zendesk_create_zendesk_organization",
        False,
    )
    ZENDESK_DELETE_ZENDESK_ORGANIZATION = (
        "zendesk",
        "zendesk_delete_zendesk_organization",
        False,
    )
    ZENDESK_COUNT_ZENDESK_ORGANIZATIONS = (
        "zendesk",
        "zendesk_count_zendesk_organizations",
        False,
    )
    ZENDESK_GET_ZENDESK_ORGANIZATION = (
        "zendesk",
        "zendesk_get_zendesk_organization",
        False,
    )
    ZENDESK_GET_ALL_ZENDESK_ORGANIZATIONS = (
        "zendesk",
        "zendesk_get_all_zendesk_organizations",
        False,
    )
    ZENDESK_UPDATE_ZENDESK_ORGANIZATION = (
        "zendesk",
        "zendesk_update_zendesk_organization",
        False,
    )
    ZENDESK_CREATE_ZENDESK_TICKET = ("zendesk", "zendesk_create_zendesk_ticket", False)
    ZENDESK_DELETE_ZENDESK_TICKET = ("zendesk", "zendesk_delete_zendesk_ticket", False)
    ZENDESK_GET_ABOUT_ME = ("zendesk", "zendesk_get_about_me", False)
    ZOOM_ARCHIVING_MEETING_FILES_LIST = (
        "zoom",
        "zoom_archiving_meeting_files_list",
        False,
    )
    ZOOM_ARCHIVING_GET_STATISTICS = ("zoom", "zoom_archiving_get_statistics", False)
    ZOOM_ARCHIVING_UPDATE_AUTO_DELETE_STATUS = (
        "zoom",
        "zoom_archiving_update_auto_delete_status",
        False,
    )
    ZOOM_ARCHIVING_MEETING_FILES_LIST_2 = (
        "zoom",
        "zoom_archiving_meeting_files_list_2",
        False,
    )
    ZOOM_ARCHIVING_MEETING_FILES_DELETE = (
        "zoom",
        "zoom_archiving_meeting_files_delete",
        False,
    )
    ZOOM_CLOUD_RECORDING_GET_MEETING_RECORDINGS = (
        "zoom",
        "zoom_cloud_recording_get_meeting_recordings",
        False,
    )
    ZOOM_CLOUD_RECORDING_DELETE_MEETING_RECORDINGS = (
        "zoom",
        "zoom_cloud_recording_delete_meeting_recordings",
        False,
    )
    ZOOM_ANALYTICS_DETAILS = ("zoom", "zoom_analytics_details", False)
    ZOOM_ANALYTICS_SUMMARY = ("zoom", "zoom_analytics_summary", False)
    ZOOM_CLOUD_RECORDING_LIST_REGISTRANTS = (
        "zoom",
        "zoom_cloud_recording_list_registrants",
        False,
    )
    ZOOM_CLOUD_RECORDING_CREATE_REGISTRANT = (
        "zoom",
        "zoom_cloud_recording_create_registrant",
        False,
    )
    ZOOM_CLOUD_RECORDING_LIST_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_cloud_recording_list_registration_questions",
        False,
    )
    ZOOM_CLOUD_RECORDING_UPDATE_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_cloud_recording_update_registration_questions",
        False,
    )
    ZOOM_CLOUD_RECORDING_UPDATE_REGISTRANT_STATUS = (
        "zoom",
        "zoom_cloud_recording_update_registrant_status",
        False,
    )
    ZOOM_CLOUD_RECORDING_GET_SETTINGS = (
        "zoom",
        "zoom_cloud_recording_get_settings",
        False,
    )
    ZOOM_CLOUD_RECORDING_UPDATE_SETTINGS = (
        "zoom",
        "zoom_cloud_recording_update_settings",
        False,
    )
    ZOOM_CLOUD_RECORDING_DELETE_RECORDING = (
        "zoom",
        "zoom_cloud_recording_delete_recording",
        False,
    )
    ZOOM_CLOUD_RECORDING_RECOVER_STATUS = (
        "zoom",
        "zoom_cloud_recording_recover_status",
        False,
    )
    ZOOM_CLOUD_RECORDING_RECOVER_RECORDING_STATUS = (
        "zoom",
        "zoom_cloud_recording_recover_recording_status",
        False,
    )
    ZOOM_CLOUD_RECORDING_LIST_RECORDINGS = (
        "zoom",
        "zoom_cloud_recording_list_recordings",
        False,
    )
    ZOOM_DEVICES_LIST = ("zoom", "zoom_devices_list", False)
    ZOOM_DEVICES_CREATE_NEW_DEVICE = ("zoom", "zoom_devices_create_new_device", False)
    ZOOM_DEVICES_LIST_ZD_M_GROUP_INFO = (
        "zoom",
        "zoom_devices_list_zd_m_group_info",
        False,
    )
    ZOOM_DEVICES_ASSIGN_DEVICE_ZP_A_ASSIGNMENT = (
        "zoom",
        "zoom_devices_assign_device_zp_a_assignment",
        False,
    )
    ZOOM_DEVICES_UPGRADE_ZP_A_OS_APP = (
        "zoom",
        "zoom_devices_upgrade_zp_a_os_app",
        False,
    )
    ZOOM_DEVICES_REMOVE_ZP_A_DEVICE_BY_VENDOR_AND_MAC_ADDRESS = (
        "zoom",
        "zoom_devices_remove_zp_a_device_by_vendor_and_mac_address",
        False,
    )
    ZOOM_DEVICES_GET_ZP_A_VERSION_INFO = (
        "zoom",
        "zoom_devices_get_zp_a_version_info",
        False,
    )
    ZOOM_DEVICES_GET_DETAIL = ("zoom", "zoom_devices_get_detail", False)
    ZOOM_DEVICES_REMOVE_DEVICE_ZM_D = ("zoom", "zoom_devices_remove_device_zm_d", False)
    ZOOM_DEVICES_UPDATE_DEVICE_NAME = ("zoom", "zoom_devices_update_device_name", False)
    ZOOM_DEVICES_CHANGE_DEVICE_ASSOCIATION = (
        "zoom",
        "zoom_devices_change_device_association",
        False,
    )
    ZOOM_H_323_DEVICES_LIST_DEVICES = ("zoom", "zoom_h_323_devices_list_devices", False)
    ZOOM_H_323_DEVICES_CREATE_DEVICE = (
        "zoom",
        "zoom_h_323_devices_create_device",
        False,
    )
    ZOOM_H_323_DEVICES_DELETE_DEVICE = (
        "zoom",
        "zoom_h_323_devices_delete_device",
        False,
    )
    ZOOM_H_323_DEVICES_UPDATE_DEVICE_INFO = (
        "zoom",
        "zoom_h_323_devices_update_device_info",
        False,
    )
    ZOOM_MEETINGS_DELETE_MEETING_CHAT_MESSAGE = (
        "zoom",
        "zoom_meetings_delete_meeting_chat_message",
        False,
    )
    ZOOM_MEETINGS_UPDATE_MESSAGE = ("zoom", "zoom_meetings_update_message", False)
    ZOOM_MEETINGS_CONTROL_IN_MEETING_FEATURES = (
        "zoom",
        "zoom_meetings_control_in_meeting_features",
        False,
    )
    ZOOM_MEETINGS_LIST_MEETING_SUMMARIES = (
        "zoom",
        "zoom_meetings_list_meeting_summaries",
        False,
    )
    ZOOM_MEETINGS_GET_DETAILS = ("zoom", "zoom_meetings_get_details", False)
    ZOOM_MEETINGS_REMOVE_MEETING = ("zoom", "zoom_meetings_remove_meeting", False)
    ZOOM_MEETINGS_UPDATE_DETAILS = ("zoom", "zoom_meetings_update_details", False)
    ZOOM_MEETINGS_CREATE_BATCH_POLLS = (
        "zoom",
        "zoom_meetings_create_batch_polls",
        False,
    )
    ZOOM_MEETINGS_BATCH_REGISTRANTS_CREATE = (
        "zoom",
        "zoom_meetings_batch_registrants_create",
        False,
    )
    ZOOM_MEETINGS_GET_INVITATION_NOTE = (
        "zoom",
        "zoom_meetings_get_invitation_note",
        False,
    )
    ZOOM_MEETINGS_CREATE_INVITE_LINKS = (
        "zoom",
        "zoom_meetings_create_invite_links",
        False,
    )
    ZOOM_MEETINGS_GET_JOIN_TOKEN = ("zoom", "zoom_meetings_get_join_token", False)
    ZOOM_MEETINGS_GET_MEETING_ARCHIVE_TOKEN_FOR_LOCAL_ARCHIVING = (
        "zoom",
        "zoom_meetings_get_meeting_archive_token_for_local_archiving",
        False,
    )
    ZOOM_MEETINGS_GET_JOIN_TOKEN_LOCAL_RECORDING = (
        "zoom",
        "zoom_meetings_get_join_token_local_recording",
        False,
    )
    ZOOM_MEETINGS_GET_LIVE_STREAM_DETAILS = (
        "zoom",
        "zoom_meetings_get_live_stream_details",
        False,
    )
    ZOOM_MEETINGS_UPDATE_LIVE_STREAM = (
        "zoom",
        "zoom_meetings_update_live_stream",
        False,
    )
    ZOOM_MEETINGS_LIVE_STREAM_STATUS_UPDATE = (
        "zoom",
        "zoom_meetings_live_stream_status_update",
        False,
    )
    ZOOM_MEETINGS_GET_MEETING_SUMMARY = (
        "zoom",
        "zoom_meetings_get_meeting_summary",
        False,
    )
    ZOOM_MEETINGS_LIST_MEETING_POLLS = (
        "zoom",
        "zoom_meetings_list_meeting_polls",
        False,
    )
    ZOOM_MEETINGS_CREATE_POLL = ("zoom", "zoom_meetings_create_poll", False)
    ZOOM_MEETINGS_GET_POLL = ("zoom", "zoom_meetings_get_poll", False)
    ZOOM_MEETINGS_UPDATE_MEETING_POLL = (
        "zoom",
        "zoom_meetings_update_meeting_poll",
        False,
    )
    ZOOM_MEETINGS_POLL_DELETE = ("zoom", "zoom_meetings_poll_delete", False)
    ZOOM_MEETINGS_LIST_REGISTRANTS = ("zoom", "zoom_meetings_list_registrants", False)
    ZOOM_MEETINGS_ADD_REGISTRANT = ("zoom", "zoom_meetings_add_registrant", False)
    ZOOM_MEETINGS_LIST_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_meetings_list_registration_questions",
        False,
    )
    ZOOM_MEETINGS_UPDATE_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_meetings_update_registration_questions",
        False,
    )
    ZOOM_MEETINGS_UPDATE_REGISTRANT_STATUS = (
        "zoom",
        "zoom_meetings_update_registrant_status",
        False,
    )
    ZOOM_MEETINGS_GET_REGISTRANT_DETAILS = (
        "zoom",
        "zoom_meetings_get_registrant_details",
        False,
    )
    ZOOM_MEETINGS_DELETE_REGISTRANT = ("zoom", "zoom_meetings_delete_registrant", False)
    ZOOM_MEETINGS_GETS_IP_URI_WITH_PASS_CODE = (
        "zoom",
        "zoom_meetings_gets_ip_uri_with_pass_code",
        False,
    )
    ZOOM_MEETINGS_UPDATE_MEETING_STATUS = (
        "zoom",
        "zoom_meetings_update_meeting_status",
        False,
    )
    ZOOM_MEETINGS_GET_MEETING_SURVEY = (
        "zoom",
        "zoom_meetings_get_meeting_survey",
        False,
    )
    ZOOM_MEETINGS_DELETE_MEETING_SURVEY = (
        "zoom",
        "zoom_meetings_delete_meeting_survey",
        False,
    )
    ZOOM_MEETINGS_UPDATE_SURVEY = ("zoom", "zoom_meetings_update_survey", False)
    ZOOM_MEETINGS_GET_MEETING_TOKEN = ("zoom", "zoom_meetings_get_meeting_token", False)
    ZOOM_MEETINGS_GET_DETAILS_2 = ("zoom", "zoom_meetings_get_details_2", False)
    ZOOM_MEETINGS_LIST_PAST_MEETING_INSTANCES = (
        "zoom",
        "zoom_meetings_list_past_meeting_instances",
        False,
    )
    ZOOM_MEETINGS_GET_PAST_MEETING_PARTICIPANTS = (
        "zoom",
        "zoom_meetings_get_past_meeting_participants",
        False,
    )
    ZOOM_MEETINGS_LIST_PAST_MEETING_POLLS = (
        "zoom",
        "zoom_meetings_list_past_meeting_polls",
        False,
    )
    ZOOM_MEETINGS_LIST_PAST_MEETING_QA = (
        "zoom",
        "zoom_meetings_list_past_meeting_qa",
        False,
    )
    ZOOM_MEETINGS_LIST_MEETING_TEMPLATES = (
        "zoom",
        "zoom_meetings_list_meeting_templates",
        False,
    )
    ZOOM_MEETINGS_CREATE_TEMPLATE_FROM_MEETING = (
        "zoom",
        "zoom_meetings_create_template_from_meeting",
        False,
    )
    ZOOM_MEETINGS_LIST_HOST_SCHEDULED = (
        "zoom",
        "zoom_meetings_list_host_scheduled",
        False,
    )
    ZOOM_MEETINGS_CREATE_MEETING = ("zoom", "zoom_meetings_create_meeting", False)
    ZOOM_MEETINGS_LIST_UPCOMING_MEETINGS = (
        "zoom",
        "zoom_meetings_list_upcoming_meetings",
        False,
    )
    ZOOM_PAC_LIST_ACCOUNTS = ("zoom", "zoom_pac_list_accounts", False)
    ZOOM_REPORTS_LIST_SIGN_IN_SIGN_OUT_ACTIVITIES = (
        "zoom",
        "zoom_reports_list_sign_in_sign_out_activities",
        False,
    )
    ZOOM_REPORTS_GET_BILLING_DEPARTMENT_REPORTS = (
        "zoom",
        "zoom_reports_get_billing_department_reports",
        False,
    )
    ZOOM_REPORTS_GET_BILLING_INVOICES = (
        "zoom",
        "zoom_reports_get_billing_invoices",
        False,
    )
    ZOOM_REPORTS_GET_CLOUD_RECORDING_USAGE_REPORT = (
        "zoom",
        "zoom_reports_get_cloud_recording_usage_report",
        False,
    )
    ZOOM_REPORTS_GET_DAILY_USAGE_REPORT = (
        "zoom",
        "zoom_reports_get_daily_usage_report",
        False,
    )
    ZOOM_REPORTS_GET_MEETING_DETAIL_REPORTS = (
        "zoom",
        "zoom_reports_get_meeting_detail_reports",
        False,
    )
    ZOOM_REPORTS_GET_MEETING_PARTICIPANT_REPORTS = (
        "zoom",
        "zoom_reports_get_meeting_participant_reports",
        False,
    )
    ZOOM_REPORTS_GET_MEETING_POLL_REPORTS = (
        "zoom",
        "zoom_reports_get_meeting_poll_reports",
        False,
    )
    ZOOM_REPORTS_GET_MEETING_QA_REPORT = (
        "zoom",
        "zoom_reports_get_meeting_qa_report",
        False,
    )
    ZOOM_REPORTS_GET_MEETING_SURVEY_REPORT = (
        "zoom",
        "zoom_reports_get_meeting_survey_report",
        False,
    )
    ZOOM_REPORTS_GET_OPERATION_LOGS_REPORT = (
        "zoom",
        "zoom_reports_get_operation_logs_report",
        False,
    )
    ZOOM_REPORTS_GET_TELEPHONE_REPORTS = (
        "zoom",
        "zoom_reports_get_telephone_reports",
        False,
    )
    ZOOM_REPORTS_LIST_UPCOMING_EVENTS_REPORT = (
        "zoom",
        "zoom_reports_list_upcoming_events_report",
        False,
    )
    ZOOM_REPORTS_GET_ACTIVE_INACTIVE_HOST_REPORTS = (
        "zoom",
        "zoom_reports_get_active_inactive_host_reports",
        False,
    )
    ZOOM_REPORTS_GET_MEETING_REPORTS = (
        "zoom",
        "zoom_reports_get_meeting_reports",
        False,
    )
    ZOOM_REPORTS_GET_WEB_IN_AR_DETAILS_REPORT = (
        "zoom",
        "zoom_reports_get_web_in_ar_details_report",
        False,
    )
    ZOOM_REPORTS_WEB_IN_AR_PARTICIPANTS_LIST = (
        "zoom",
        "zoom_reports_web_in_ar_participants_list",
        False,
    )
    ZOOM_REPORTS_GET_WEB_IN_AR_POLL_REPORTS = (
        "zoom",
        "zoom_reports_get_web_in_ar_poll_reports",
        False,
    )
    ZOOM_REPORTS_GET_WEB_IN_AR_QA_REPORT = (
        "zoom",
        "zoom_reports_get_web_in_ar_qa_report",
        False,
    )
    ZOOM_REPORTS_GET_WEB_IN_AR_SURVEY_REPORT = (
        "zoom",
        "zoom_reports_get_web_in_ar_survey_report",
        False,
    )
    ZOOM_SIP_PHONE_LIST = ("zoom", "zoom_sip_phone_list", False)
    ZOOM_SIP_PHONE_ENABLE_USERS_IP_PHONE = (
        "zoom",
        "zoom_sip_phone_enable_users_ip_phone",
        False,
    )
    ZOOM_SIP_PHONE_DELETE_PHONE = ("zoom", "zoom_sip_phone_delete_phone", False)
    ZOOM_SIP_PHONE_UPDATE_SPECIFIC_PHONE = (
        "zoom",
        "zoom_sip_phone_update_specific_phone",
        False,
    )
    ZOOM_TSP_GET_ACCOUNT_INFO = ("zoom", "zoom_tsp_get_account_info", False)
    ZOOM_TSP_UPDATE_ACCOUNT_TSP_INFORMATION = (
        "zoom",
        "zoom_tsp_update_account_tsp_information",
        False,
    )
    ZOOM_TSP_LIST_USE_RTSP_ACCOUNTS = ("zoom", "zoom_tsp_list_use_rtsp_accounts", False)
    ZOOM_TSP_ADD_USE_RTSP_ACCOUNT = ("zoom", "zoom_tsp_add_use_rtsp_account", False)
    ZOOM_TSP_SET_GLOBAL_DIAL_IN_URL = ("zoom", "zoom_tsp_set_global_dial_in_url", False)
    ZOOM_TSP_GET_USE_RTSP_ACCOUNT = ("zoom", "zoom_tsp_get_use_rtsp_account", False)
    ZOOM_TSP_DELETE_USE_RTSP_ACCOUNT = (
        "zoom",
        "zoom_tsp_delete_use_rtsp_account",
        False,
    )
    ZOOM_TSP_UPDATE_USE_RTSP_ACCOUNT = (
        "zoom",
        "zoom_tsp_update_use_rtsp_account",
        False,
    )
    ZOOM_TRACKING_FIELD_LIST = ("zoom", "zoom_tracking_field_list", False)
    ZOOM_TRACKING_FIELD_CREATE_FIELD = (
        "zoom",
        "zoom_tracking_field_create_field",
        False,
    )
    ZOOM_TRACKING_FIELD_GET = ("zoom", "zoom_tracking_field_get", False)
    ZOOM_TRACKING_FIELD_DELETE_FIELD = (
        "zoom",
        "zoom_tracking_field_delete_field",
        False,
    )
    ZOOM_TRACKING_FIELD_UPDATE = ("zoom", "zoom_tracking_field_update", False)
    ZOOM_WEB_IN_ARS_DELETE_MESSAGE_BY_ID = (
        "zoom",
        "zoom_web_in_ars_delete_message_by_id",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_ABSENTEES = ("zoom", "zoom_web_in_ars_list_absentees", False)
    ZOOM_WEB_IN_ARS_LIST_PAST_INSTANCES = (
        "zoom",
        "zoom_web_in_ars_list_past_instances",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_PARTICIPANTS = (
        "zoom",
        "zoom_web_in_ars_list_participants",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_POLL_RESULTS = (
        "zoom",
        "zoom_web_in_ars_list_poll_results",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_PAST_WEB_IN_AR_QA = (
        "zoom",
        "zoom_web_in_ars_list_past_web_in_ar_qa",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_WEB_IN_AR_TEMPLATES = (
        "zoom",
        "zoom_web_in_ars_list_web_in_ar_templates",
        False,
    )
    ZOOM_WEB_IN_ARS_CREATE_WEB_IN_AR_TEMPLATE = (
        "zoom",
        "zoom_web_in_ars_create_web_in_ar_template",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_WEB_IN_ARS = ("zoom", "zoom_web_in_ars_list_web_in_ars", False)
    ZOOM_WEB_IN_ARS_CREATE_WEB_IN_AR = (
        "zoom",
        "zoom_web_in_ars_create_web_in_ar",
        False,
    )
    ZOOM_WEB_IN_ARS_GET_DETAILS = ("zoom", "zoom_web_in_ars_get_details", False)
    ZOOM_WEB_IN_ARS_REMOVE_WEB_IN_AR = (
        "zoom",
        "zoom_web_in_ars_remove_web_in_ar",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_SCHEDULED_WEB_IN_AR = (
        "zoom",
        "zoom_web_in_ars_update_scheduled_web_in_ar",
        False,
    )
    ZOOM_WEB_IN_ARS_CREATE_BATCH_REGISTRANTS = (
        "zoom",
        "zoom_web_in_ars_create_batch_registrants",
        False,
    )
    ZOOM_WEB_IN_ARS_GET_SESSION_BRANDING = (
        "zoom",
        "zoom_web_in_ars_get_session_branding",
        False,
    )
    ZOOM_WEB_IN_ARS_CREATE_BRANDING_NAME_TAG = (
        "zoom",
        "zoom_web_in_ars_create_branding_name_tag",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_BRANDING_NAME_TAG = (
        "zoom",
        "zoom_web_in_ars_delete_branding_name_tag",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_BRANDING_NAME_TAG = (
        "zoom",
        "zoom_web_in_ars_update_branding_name_tag",
        False,
    )
    ZOOM_WEB_IN_ARS_UPLOAD_BRANDING_VIRTUAL_BACKGROUND = (
        "zoom",
        "zoom_web_in_ars_upload_branding_virtual_background",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_BRANDING_VIRTUAL_BACKGROUND = (
        "zoom",
        "zoom_web_in_ars_delete_branding_virtual_background",
        False,
    )
    ZOOM_WEB_IN_ARS_SET_DEFAULT_BRANDING_VIRTUAL_BACKGROUND = (
        "zoom",
        "zoom_web_in_ars_set_default_branding_virtual_background",
        False,
    )
    ZOOM_WEB_IN_ARS_UPLOAD_BRANDING_WALLPAPER = (
        "zoom",
        "zoom_web_in_ars_upload_branding_wallpaper",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_BRANDING_WALLPAPER = (
        "zoom",
        "zoom_web_in_ars_delete_branding_wallpaper",
        False,
    )
    ZOOM_WEB_IN_ARS_CREATE_INVITE_LINKS = (
        "zoom",
        "zoom_web_in_ars_create_invite_links",
        False,
    )
    ZOOM_WEB_IN_ARS_JOIN_TOKEN_LIVE_STREAMING = (
        "zoom",
        "zoom_web_in_ars_join_token_live_streaming",
        False,
    )
    ZOOM_WEB_IN_ARS_GET_MEETING_ARCHIVE_TOKEN_FOR_LOCAL_ARCHIVING = (
        "zoom",
        "zoom_web_in_ars_get_meeting_archive_token_for_local_archiving",
        False,
    )
    ZOOM_WEB_IN_ARS_GET_JOIN_TOKEN_LOCAL_RECORDING = (
        "zoom",
        "zoom_web_in_ars_get_join_token_local_recording",
        False,
    )
    ZOOM_WEB_IN_ARS_GET_LIVE_STREAM_DETAILS = (
        "zoom",
        "zoom_web_in_ars_get_live_stream_details",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_LIVE_STREAM = (
        "zoom",
        "zoom_web_in_ars_update_live_stream",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_LIVE_STREAM_STATUS = (
        "zoom",
        "zoom_web_in_ars_update_live_stream_status",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_PANELISTS = ("zoom", "zoom_web_in_ars_list_panelists", False)
    ZOOM_WEB_IN_ARS_ADD_PANELISTS = ("zoom", "zoom_web_in_ars_add_panelists", False)
    ZOOM_WEB_IN_ARS_REMOVE_PANELISTS = (
        "zoom",
        "zoom_web_in_ars_remove_panelists",
        False,
    )
    ZOOM_WEB_IN_ARS_REMOVE_PANELIST = ("zoom", "zoom_web_in_ars_remove_panelist", False)
    ZOOM_WEB_IN_ARS_LIST_POLLS = ("zoom", "zoom_web_in_ars_list_polls", False)
    ZOOM_WEB_IN_ARS_CREATE_POLL = ("zoom", "zoom_web_in_ars_create_poll", False)
    ZOOM_WEB_IN_ARS_GET_POLL_DETAILS = (
        "zoom",
        "zoom_web_in_ars_get_poll_details",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_POLL = ("zoom", "zoom_web_in_ars_update_poll", False)
    ZOOM_WEB_IN_ARS_DELETE_POLL = ("zoom", "zoom_web_in_ars_delete_poll", False)
    ZOOM_WEB_IN_ARS_LIST_REGISTRANTS = (
        "zoom",
        "zoom_web_in_ars_list_registrants",
        False,
    )
    ZOOM_WEB_IN_ARS_ADD_REGISTRANT = ("zoom", "zoom_web_in_ars_add_registrant", False)
    ZOOM_WEB_IN_ARS_LIST_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_web_in_ars_list_registration_questions",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_web_in_ars_update_registration_questions",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_REGISTRANT_STATUS = (
        "zoom",
        "zoom_web_in_ars_update_registrant_status",
        False,
    )
    ZOOM_WEB_IN_ARS_REGISTRANT_DETAILS = (
        "zoom",
        "zoom_web_in_ars_registrant_details",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_REGISTRANT = (
        "zoom",
        "zoom_web_in_ars_delete_registrant",
        False,
    )
    ZOOM_WEB_IN_ARS_GETS_IP_URI_WITH_PASS_CODE = (
        "zoom",
        "zoom_web_in_ars_gets_ip_uri_with_pass_code",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_STATUS = ("zoom", "zoom_web_in_ars_update_status", False)
    ZOOM_WEB_IN_ARS_GET_SURVEY = ("zoom", "zoom_web_in_ars_get_survey", False)
    ZOOM_WEB_IN_ARS_DELETE_SURVEY = ("zoom", "zoom_web_in_ars_delete_survey", False)
    ZOOM_WEB_IN_ARS_UPDATE_SURVEY = ("zoom", "zoom_web_in_ars_update_survey", False)
    ZOOM_WEB_IN_ARS_GET_WEB_IN_ART_OKEN = (
        "zoom",
        "zoom_web_in_ars_get_web_in_art_oken",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_TRACKING_SOURCES = (
        "zoom",
        "zoom_web_in_ars_list_tracking_sources",
        False,
    )
    CALCULATOR = ("mathematical", "mathematical_calculator", True, True)
    WORKSPACESTATUS = ("localworkspace", "localworkspace_workspacestatus", True, True)
    SETUPWORKSPACE = ("localworkspace", "localworkspace_setupworkspace", True, True)
    SETUPGITHUBREPO = ("localworkspace", "localworkspace_setupgithubrepo", True, True)
    CREATEWORKSPACEACTION = (
        "localworkspace",
        "localworkspace_createworkspaceaction",
        True,
        True,
    )
    FINDFILECMD = ("cmdmanagertool", "cmdmanagertool_findfilecmd", True, True)
    CREATEFILECMD = ("cmdmanagertool", "cmdmanagertool_createfilecmd", True, True)
    GOTOLINENUMINOPENFILE = (
        "cmdmanagertool",
        "cmdmanagertool_gotolinenuminopenfile",
        True,
        True,
    )
    OPENFILE = ("cmdmanagertool", "cmdmanagertool_openfile", True, True)
    SCROLLUP = ("cmdmanagertool", "cmdmanagertool_scrollup", True, True)
    SCROLLDOWN = ("cmdmanagertool", "cmdmanagertool_scrolldown", True, True)
    SEARCHFILECMD = ("cmdmanagertool", "cmdmanagertool_searchfilecmd", True, True)
    SEARCHDIRCMD = ("cmdmanagertool", "cmdmanagertool_searchdircmd", True, True)
    SETCURSORS = ("cmdmanagertool", "cmdmanagertool_setcursors", True, True)
    EDITFILE = ("cmdmanagertool", "cmdmanagertool_editfile", True, True)
    RUNCOMMANDONWORKSPACE = (
        "cmdmanagertool",
        "cmdmanagertool_runcommandonworkspace",
        True,
        True,
    )
    GETWORKSPACEHISTORY = (
        "historykeeper",
        "historykeeper_getworkspacehistory",
        True,
        True,
    )


class Trigger(tuple, Enum):
    """App trigger."""

    @property
    def app(self) -> str:
        """App name."""
        return self.value[0]

    @property
    def event(self) -> str:
        """Event name."""
        return self.value[1]

    GITHUB_PULL_REQUEST_EVENT = ("github", "github_pull_request_event")
    GITHUB_COMMIT_EVENT = ("github", "github_commit_event")
    SLACK_NEW_MESSAGE = ("slack", "slack_receive_message")
    SLACKBOT_NEW_MESSAGE = ("slackbot", "slackbot_receive_message")
