"""
Helper Enum classes.

- TODO: Replace Enums with something lightweight
"""

import typing as t
from enum import Enum


class Tag(tuple, Enum):
    """App tags."""

    @property
    def app(self) -> str:
        """Returns app name."""
        return self.value[0]

    @property
    def val(self) -> str:
        """Returns tag value."""
        return self.value[1]

    IMPORTANT = ("default", "important")
    ASANA_ALLOCATIONS = ("asana", "Allocations")
    ASANA_ATTACHMENTS = ("asana", "Attachments")
    ASANA_AUDIT_LOG_API = ("asana", "Audit log API")
    ASANA_BATCH_API = ("asana", "Batch API")
    ASANA_CUSTOM_FIELD_SETTINGS = ("asana", "Custom field settings")
    ASANA_CUSTOM_FIELDS = ("asana", "Custom fields")
    ASANA_EVENTS = ("asana", "Events")
    ASANA_GOAL_RELATIONSHIPS = ("asana", "Goal relationships")
    ASANA_GOALS = ("asana", "Goals")
    ASANA_JOBS = ("asana", "Jobs")
    ASANA_MEMBERSHIPS = ("asana", "Memberships")
    ASANA_ORGANIZATION_EXPORTS = ("asana", "Organization exports")
    ASANA_PORTFOLIO_MEMBERSHIPS = ("asana", "Portfolio memberships")
    ASANA_PORTFOLIOS = ("asana", "Portfolios")
    ASANA_PROJECT_BRIEFS = ("asana", "Project briefs")
    ASANA_PROJECT_MEMBERSHIPS = ("asana", "Project memberships")
    ASANA_PROJECT_STATUSES = ("asana", "Project statuses")
    ASANA_PROJECT_TEMPLATES = ("asana", "Project templates")
    ASANA_PROJECTS = ("asana", "Projects")
    ASANA_RULES = ("asana", "Rules")
    ASANA_SECTIONS = ("asana", "Sections")
    ASANA_STATUS_UPDATES = ("asana", "Status updates")
    ASANA_STORIES = ("asana", "Stories")
    ASANA_TAGS = ("asana", "Tags")
    ASANA_TASK_TEMPLATES = ("asana", "Task templates")
    ASANA_TASKS = ("asana", "Tasks")
    ASANA_TEAM_MEMBERSHIPS = ("asana", "Team memberships")
    ASANA_TEAMS = ("asana", "Teams")
    ASANA_TIME_PERIODS = ("asana", "Time periods")
    ASANA_TIME_TRACKING_ENTRIES = ("asana", "Time tracking entries")
    ASANA_TYPEAHEAD = ("asana", "Typeahead")
    ASANA_USER_TASK_LISTS = ("asana", "User task lists")
    ASANA_USERS = ("asana", "Users")
    ASANA_WEBHOOKS = ("asana", "Webhooks")
    ASANA_WORKSPACE_MEMBERSHIPS = ("asana", "Workspace memberships")
    ASANA_WORKSPACES = ("asana", "Workspaces")
    ATTIO_ATTRIBUTES = ("attio", "Attributes")
    ATTIO_COMMENTS = ("attio", "Comments")
    ATTIO_ENTRIES = ("attio", "Entries")
    ATTIO_LISTS = ("attio", "Lists")
    ATTIO_META = ("attio", "Meta")
    ATTIO_NOTES = ("attio", "Notes")
    ATTIO_OBJECTS = ("attio", "Objects")
    ATTIO_RECORDS = ("attio", "Records")
    ATTIO_TASKS = ("attio", "Tasks")
    ATTIO_THREADS = ("attio", "Threads")
    ATTIO_WEBHOOKS = ("attio", "Webhooks")
    ATTIO_WORKSPACE_MEMBERS = ("attio", "Workspace members")
    BREVO_ACCOUNT = ("brevo", "Account")
    BREVO_COMPANIES = ("brevo", "Companies")
    BREVO_CONTACTS = ("brevo", "Contacts")
    BREVO_CONVERSATIONS = ("brevo", "Conversations")
    BREVO_COUPONS = ("brevo", "Coupons")
    BREVO_DEALS = ("brevo", "Deals")
    BREVO_DOMAINS = ("brevo", "Domains")
    BREVO_ECOMMERCE = ("brevo", "Ecommerce")
    BREVO_EMAIL_CAMPAIGNS = ("brevo", "Email Campaigns")
    BREVO_EVENT = ("brevo", "Event")
    BREVO_EXTERNAL_FEEDS = ("brevo", "External Feeds")
    BREVO_FILES = ("brevo", "Files")
    BREVO_INBOUND_PARSING = ("brevo", "Inbound Parsing")
    BREVO_MASTER_ACCOUNT = ("brevo", "Master account")
    BREVO_NOTES = ("brevo", "Notes")
    BREVO_PROCESS = ("brevo", "Process")
    BREVO_RESELLER = ("brevo", "Reseller")
    BREVO_SMS_CAMPAIGNS = ("brevo", "SMS Campaigns")
    BREVO_SENDERS = ("brevo", "Senders")
    BREVO_TASKS = ("brevo", "Tasks")
    BREVO_TRANSACTIONAL_SMS = ("brevo", "Transactional SMS")
    BREVO_TRANSACTIONAL_WHATSAPP = ("brevo", "Transactional WhatsApp")
    BREVO_TRANSACTIONAL_EMAILS = ("brevo", "Transactional emails")
    BREVO_USER = ("brevo", "User")
    BREVO_WEBHOOKS = ("brevo", "Webhooks")
    BREVO_WHATSAPP_CAMPAIGNS = ("brevo", "WhatsApp Campaigns")
    CLICKUP_ATTACHMENTS = ("clickup", "Attachments")
    CLICKUP_AUTHORIZATION = ("clickup", "Authorization")
    CLICKUP_COMMENTS = ("clickup", "Comments")
    CLICKUP_CUSTOM_FIELDS = ("clickup", "Custom Fields")
    CLICKUP_CUSTOM_TASK_TYPES = ("clickup", "Custom Task Types")
    CLICKUP_FOLDERS = ("clickup", "Folders")
    CLICKUP_GOALS = ("clickup", "Goals")
    CLICKUP_GUESTS = ("clickup", "Guests")
    CLICKUP_LISTS = ("clickup", "Lists")
    CLICKUP_MEMBERS = ("clickup", "Members")
    CLICKUP_ROLES = ("clickup", "Roles")
    CLICKUP_SHARED_HIERARCHY = ("clickup", "Shared Hierarchy")
    CLICKUP_SPACES = ("clickup", "Spaces")
    CLICKUP_TAGS = ("clickup", "Tags")
    CLICKUP_TASK_CHECKLISTS = ("clickup", "Task Checklists")
    CLICKUP_TASK_RELATIONSHIPS = ("clickup", "Task Relationships")
    CLICKUP_TASK_TEMPLATES = ("clickup", "Task Templates")
    CLICKUP_TASKS = ("clickup", "Tasks")
    CLICKUP_TEAMS___USER_GROUPS = ("clickup", "Teams - User Groups")
    CLICKUP_TEAMS___WORKSPACES = ("clickup", "Teams - Workspaces")
    CLICKUP_TIME_TRACKING = ("clickup", "Time Tracking")
    CLICKUP_TIME_TRACKING__LEGACY_ = ("clickup", "Time Tracking (Legacy)")
    CLICKUP_USERS = ("clickup", "Users")
    CLICKUP_VIEWS = ("clickup", "Views")
    CLICKUP_WEBHOOKS = ("clickup", "Webhooks")
    ELEVENLABS_PRONUNCIATION_DICTIONARY = ("elevenlabs", "Pronunciation Dictionary")
    ELEVENLABS_AUDIO_NATIVE = ("elevenlabs", "audio-native")
    ELEVENLABS_DUBBING = ("elevenlabs", "dubbing")
    ELEVENLABS_MODELS = ("elevenlabs", "models")
    ELEVENLABS_PROJECTS = ("elevenlabs", "projects")
    ELEVENLABS_SAMPLES = ("elevenlabs", "samples")
    ELEVENLABS_SPEECH_HISTORY = ("elevenlabs", "speech-history")
    ELEVENLABS_SPEECH_TO_SPEECH = ("elevenlabs", "speech-to-speech")
    ELEVENLABS_TEXT_TO_SPEECH = ("elevenlabs", "text-to-speech")
    ELEVENLABS_USER = ("elevenlabs", "user")
    ELEVENLABS_VOICE_GENERATION = ("elevenlabs", "voice-generation")
    ELEVENLABS_VOICES = ("elevenlabs", "voices")
    ELEVENLABS_WORKSPACE = ("elevenlabs", "workspace")
    FIGMA_ACTIVITY_LOGS = ("figma", "Activity Logs")
    FIGMA_COMMENT_REACTIONS = ("figma", "Comment Reactions")
    FIGMA_COMMENTS = ("figma", "Comments")
    FIGMA_COMPONENT_SETS = ("figma", "Component Sets")
    FIGMA_COMPONENTS = ("figma", "Components")
    FIGMA_DEV_RESOURCES = ("figma", "Dev Resources")
    FIGMA_FILES = ("figma", "Files")
    FIGMA_PAYMENTS = ("figma", "Payments")
    FIGMA_PROJECTS = ("figma", "Projects")
    FIGMA_STYLES = ("figma", "Styles")
    FIGMA_USERS = ("figma", "Users")
    FIGMA_VARIABLES = ("figma", "Variables")
    FIGMA_WEBHOOKS = ("figma", "Webhooks")
    GITHUB_ACTIONS = ("github", "actions")
    GITHUB_ACTIVITY = ("github", "activity")
    GITHUB_APPS = ("github", "apps")
    GITHUB_BILLING = ("github", "billing")
    GITHUB_CHECKS = ("github", "checks")
    GITHUB_CLASSROOM = ("github", "classroom")
    GITHUB_CODE = ("github", "code")
    GITHUB_CODE_SCANNING = ("github", "code-scanning")
    GITHUB_CODES_OF_CONDUCT = ("github", "codes-of-conduct")
    GITHUB_CODESPACES = ("github", "codespaces")
    GITHUB_COPILOT = ("github", "copilot")
    GITHUB_DEPENDABOT = ("github", "dependabot")
    GITHUB_DEPENDENCY_GRAPH = ("github", "dependency-graph")
    GITHUB_EMOJIS = ("github", "emojis")
    GITHUB_GISTS = ("github", "gists")
    GITHUB_GIT = ("github", "git")
    GITHUB_GITIGNORE = ("github", "gitignore")
    GITHUB_IMPORTANT = ("github", "important")
    GITHUB_INTERACTIONS = ("github", "interactions")
    GITHUB_ISSUES = ("github", "issues")
    GITHUB_LICENSES = ("github", "licenses")
    GITHUB_MARKDOWN = ("github", "markdown")
    GITHUB_META = ("github", "meta")
    GITHUB_MIGRATIONS = ("github", "migrations")
    GITHUB_OIDC = ("github", "oidc")
    GITHUB_ORGS = ("github", "orgs")
    GITHUB_PACKAGES = ("github", "packages")
    GITHUB_PROJECTS = ("github", "projects")
    GITHUB_PULLS = ("github", "pulls")
    GITHUB_RATE_LIMIT = ("github", "rate-limit")
    GITHUB_REACTIONS = ("github", "reactions")
    GITHUB_REPOS = ("github", "repos")
    GITHUB_SEARCH = ("github", "search")
    GITHUB_SECRET_SCANNING = ("github", "secret-scanning")
    GITHUB_SECURITY_ADVISORIES = ("github", "security-advisories")
    GITHUB_TEAMS = ("github", "teams")
    GITHUB_USERS = ("github", "users")
    LISTENNOTES_DIRECTORY_API = ("listennotes", "Directory API")
    LISTENNOTES_INSIGHTS_API = ("listennotes", "Insights API")
    LISTENNOTES_PLAYLIST_API = ("listennotes", "Playlist API")
    LISTENNOTES_PODCASTER_API = ("listennotes", "Podcaster API")
    LISTENNOTES_SEARCH_API = ("listennotes", "Search API")
    NASA_ORGANIZATION = ("nasa", "Organization")
    NASA_PROJECT = ("nasa", "Project")
    NASA_RESOURCE = ("nasa", "Resource")
    OKTA_APPLICATION = ("okta", "Application")
    OKTA_AUTHENTICATOR = ("okta", "Authenticator")
    OKTA_AUTHORIZATIONSERVER = ("okta", "AuthorizationServer")
    OKTA_BRAND = ("okta", "Brand")
    OKTA_DOMAIN = ("okta", "Domain")
    OKTA_EVENTHOOK = ("okta", "EventHook")
    OKTA_FEATURE = ("okta", "Feature")
    OKTA_GROUP = ("okta", "Group")
    OKTA_GROUPSCHEMA = ("okta", "GroupSchema")
    OKTA_IDENTITYPROVIDER = ("okta", "IdentityProvider")
    OKTA_INLINEHOOK = ("okta", "InlineHook")
    OKTA_LINKEDOBJECT = ("okta", "LinkedObject")
    OKTA_LOG = ("okta", "Log")
    OKTA_NETWORKZONE = ("okta", "NetworkZone")
    OKTA_ORG = ("okta", "Org")
    OKTA_POLICY = ("okta", "Policy")
    OKTA_PROFILEMAPPING = ("okta", "ProfileMapping")
    OKTA_SESSION = ("okta", "Session")
    OKTA_SUBSCRIPTION = ("okta", "Subscription")
    OKTA_TEMPLATE = ("okta", "Template")
    OKTA_THREATINSIGHT = ("okta", "ThreatInsight")
    OKTA_TRUSTEDORIGIN = ("okta", "TrustedOrigin")
    OKTA_USER = ("okta", "User")
    OKTA_USERFACTOR = ("okta", "UserFactor")
    OKTA_USERSCHEMA = ("okta", "UserSchema")
    OKTA_USERTYPE = ("okta", "UserType")
    PAGERDUTY_ABILITIES = ("pagerduty", "Abilities")
    PAGERDUTY_ADD_ONS = ("pagerduty", "Add-ons")
    PAGERDUTY_ALERT_GROUPING_SETTINGS = ("pagerduty", "Alert Grouping Settings")
    PAGERDUTY_ANALYTICS = ("pagerduty", "Analytics")
    PAGERDUTY_AUDIT = ("pagerduty", "Audit")
    PAGERDUTY_AUTOMATION_ACTIONS = ("pagerduty", "Automation Actions")
    PAGERDUTY_BUSINESS_SERVICES = ("pagerduty", "Business Services")
    PAGERDUTY_CHANGE_EVENTS = ("pagerduty", "Change Events")
    PAGERDUTY_CUSTOM_FIELDS = ("pagerduty", "Custom Fields")
    PAGERDUTY_ESCALATION_POLICIES = ("pagerduty", "Escalation Policies")
    PAGERDUTY_EVENT_ORCHESTRATIONS = ("pagerduty", "Event Orchestrations")
    PAGERDUTY_EXTENSION_SCHEMAS = ("pagerduty", "Extension Schemas")
    PAGERDUTY_EXTENSIONS = ("pagerduty", "Extensions")
    PAGERDUTY_INCIDENT_WORKFLOWS = ("pagerduty", "Incident Workflows")
    PAGERDUTY_INCIDENTS = ("pagerduty", "Incidents")
    PAGERDUTY_LICENSES = ("pagerduty", "Licenses")
    PAGERDUTY_LOG_ENTRIES = ("pagerduty", "Log Entries")
    PAGERDUTY_MAINTENANCE_WINDOWS = ("pagerduty", "Maintenance Windows")
    PAGERDUTY_NOTIFICATIONS = ("pagerduty", "Notifications")
    PAGERDUTY_ON_CALLS = ("pagerduty", "On-Calls")
    PAGERDUTY_PAUSED_INCIDENT_REPORTS = ("pagerduty", "Paused Incident Reports")
    PAGERDUTY_PRIORITIES = ("pagerduty", "Priorities")
    PAGERDUTY_RESPONSE_PLAYS = ("pagerduty", "Response Plays")
    PAGERDUTY_RULESETS = ("pagerduty", "Rulesets")
    PAGERDUTY_SCHEDULES = ("pagerduty", "Schedules")
    PAGERDUTY_SERVICE_DEPENDENCIES = ("pagerduty", "Service Dependencies")
    PAGERDUTY_SERVICES = ("pagerduty", "Services")
    PAGERDUTY_STANDARDS = ("pagerduty", "Standards")
    PAGERDUTY_STATUS_DASHBOARDS = ("pagerduty", "Status Dashboards")
    PAGERDUTY_STATUS_PAGES = ("pagerduty", "Status Pages")
    PAGERDUTY_TAGS = ("pagerduty", "Tags")
    PAGERDUTY_TEAMS = ("pagerduty", "Teams")
    PAGERDUTY_TEMPLATES = ("pagerduty", "Templates")
    PAGERDUTY_USERS = ("pagerduty", "Users")
    PAGERDUTY_VENDORS = ("pagerduty", "Vendors")
    PAGERDUTY_WEBHOOKS = ("pagerduty", "Webhooks")
    SLACK_ADMIN = ("slack", "admin")
    SLACK_ADMIN_APPS = ("slack", "admin.apps")
    SLACK_ADMIN_APPS_APPROVED = ("slack", "admin.apps.approved")
    SLACK_ADMIN_APPS_REQUESTS = ("slack", "admin.apps.requests")
    SLACK_ADMIN_APPS_RESTRICTED = ("slack", "admin.apps.restricted")
    SLACK_ADMIN_CONVERSATIONS = ("slack", "admin.conversations")
    SLACK_ADMIN_CONVERSATIONS_EKM = ("slack", "admin.conversations.ekm")
    SLACK_ADMIN_CONVERSATIONS_RESTRICTACCESS = (
        "slack",
        "admin.conversations.restrictAccess",
    )
    SLACK_ADMIN_EMOJI = ("slack", "admin.emoji")
    SLACK_ADMIN_INVITEREQUESTS = ("slack", "admin.inviteRequests")
    SLACK_ADMIN_INVITEREQUESTS_APPROVED = ("slack", "admin.inviteRequests.approved")
    SLACK_ADMIN_INVITEREQUESTS_DENIED = ("slack", "admin.inviteRequests.denied")
    SLACK_ADMIN_TEAMS = ("slack", "admin.teams")
    SLACK_ADMIN_TEAMS_ADMINS = ("slack", "admin.teams.admins")
    SLACK_ADMIN_TEAMS_OWNERS = ("slack", "admin.teams.owners")
    SLACK_ADMIN_TEAMS_SETTINGS = ("slack", "admin.teams.settings")
    SLACK_ADMIN_USERGROUPS = ("slack", "admin.usergroups")
    SLACK_ADMIN_USERS = ("slack", "admin.users")
    SLACK_ADMIN_USERS_SESSION = ("slack", "admin.users.session")
    SLACK_API = ("slack", "api")
    SLACK_APPS = ("slack", "apps")
    SLACK_APPS_EVENT_AUTHORIZATIONS = ("slack", "apps.event.authorizations")
    SLACK_APPS_PERMISSIONS = ("slack", "apps.permissions")
    SLACK_APPS_PERMISSIONS_RESOURCES = ("slack", "apps.permissions.resources")
    SLACK_APPS_PERMISSIONS_SCOPES = ("slack", "apps.permissions.scopes")
    SLACK_APPS_PERMISSIONS_USERS = ("slack", "apps.permissions.users")
    SLACK_AUTH = ("slack", "auth")
    SLACK_BOTS = ("slack", "bots")
    SLACK_CALLS = ("slack", "calls")
    SLACK_CALLS_PARTICIPANTS = ("slack", "calls.participants")
    SLACK_CHAT = ("slack", "chat")
    SLACK_CHAT_SCHEDULEDMESSAGES = ("slack", "chat.scheduledMessages")
    SLACK_CONVERSATIONS = ("slack", "conversations")
    SLACK_DIALOG = ("slack", "dialog")
    SLACK_DND = ("slack", "dnd")
    SLACK_EMOJI = ("slack", "emoji")
    SLACK_FILES = ("slack", "files")
    SLACK_FILES_COMMENTS = ("slack", "files.comments")
    SLACK_FILES_REMOTE = ("slack", "files.remote")
    SLACK_IMPORTANT = ("slack", "important")
    SLACK_MIGRATION = ("slack", "migration")
    SLACK_OAUTH = ("slack", "oauth")
    SLACK_OAUTH_V2 = ("slack", "oauth.v2")
    SLACK_PINS = ("slack", "pins")
    SLACK_REACTIONS = ("slack", "reactions")
    SLACK_REMINDERS = ("slack", "reminders")
    SLACK_RTM = ("slack", "rtm")
    SLACK_SEARCH = ("slack", "search")
    SLACK_STARS = ("slack", "stars")
    SLACK_TEAM = ("slack", "team")
    SLACK_TEAM_PROFILE = ("slack", "team.profile")
    SLACK_USERGROUPS = ("slack", "usergroups")
    SLACK_USERGROUPS_USERS = ("slack", "usergroups.users")
    SLACK_USERS = ("slack", "users")
    SLACK_USERS_PROFILE = ("slack", "users.profile")
    SLACK_VIEWS = ("slack", "views")
    SLACK_WORKFLOWS = ("slack", "workflows")
    SLACKBOT_API = ("slackbot", "api")
    SLACKBOT_APPS = ("slackbot", "apps")
    SLACKBOT_APPS_EVENT_AUTHORIZATIONS = ("slackbot", "apps.event.authorizations")
    SLACKBOT_APPS_PERMISSIONS = ("slackbot", "apps.permissions")
    SLACKBOT_APPS_PERMISSIONS_RESOURCES = ("slackbot", "apps.permissions.resources")
    SLACKBOT_APPS_PERMISSIONS_SCOPES = ("slackbot", "apps.permissions.scopes")
    SLACKBOT_APPS_PERMISSIONS_USERS = ("slackbot", "apps.permissions.users")
    SLACKBOT_AUTH = ("slackbot", "auth")
    SLACKBOT_BOTS = ("slackbot", "bots")
    SLACKBOT_CALLS = ("slackbot", "calls")
    SLACKBOT_CALLS_PARTICIPANTS = ("slackbot", "calls.participants")
    SLACKBOT_CHAT = ("slackbot", "chat")
    SLACKBOT_CHAT_SCHEDULEDMESSAGES = ("slackbot", "chat.scheduledMessages")
    SLACKBOT_CONVERSATIONS = ("slackbot", "conversations")
    SLACKBOT_DIALOG = ("slackbot", "dialog")
    SLACKBOT_DND = ("slackbot", "dnd")
    SLACKBOT_EMOJI = ("slackbot", "emoji")
    SLACKBOT_FILES = ("slackbot", "files")
    SLACKBOT_FILES_COMMENTS = ("slackbot", "files.comments")
    SLACKBOT_FILES_REMOTE = ("slackbot", "files.remote")
    SLACKBOT_IMPORTANT = ("slackbot", "important")
    SLACKBOT_MIGRATION = ("slackbot", "migration")
    SLACKBOT_OAUTH = ("slackbot", "oauth")
    SLACKBOT_OAUTH_V2 = ("slackbot", "oauth.v2")
    SLACKBOT_PINS = ("slackbot", "pins")
    SLACKBOT_REACTIONS = ("slackbot", "reactions")
    SLACKBOT_REMINDERS = ("slackbot", "reminders")
    SLACKBOT_RTM = ("slackbot", "rtm")
    SLACKBOT_STARS = ("slackbot", "stars")
    SLACKBOT_TEAM = ("slackbot", "team")
    SLACKBOT_TEAM_PROFILE = ("slackbot", "team.profile")
    SLACKBOT_USERGROUPS = ("slackbot", "usergroups")
    SLACKBOT_USERGROUPS_USERS = ("slackbot", "usergroups.users")
    SLACKBOT_USERS = ("slackbot", "users")
    SLACKBOT_USERS_PROFILE = ("slackbot", "users.profile")
    SLACKBOT_VIEWS = ("slackbot", "views")
    SLACKBOT_WORKFLOWS = ("slackbot", "workflows")
    SPOTIFY_ALBUMS = ("spotify", "Albums")
    SPOTIFY_ARTISTS = ("spotify", "Artists")
    SPOTIFY_AUDIOBOOKS = ("spotify", "Audiobooks")
    SPOTIFY_CATEGORIES = ("spotify", "Categories")
    SPOTIFY_CHAPTERS = ("spotify", "Chapters")
    SPOTIFY_EPISODES = ("spotify", "Episodes")
    SPOTIFY_GENRES = ("spotify", "Genres")
    SPOTIFY_LIBRARY = ("spotify", "Library")
    SPOTIFY_MARKETS = ("spotify", "Markets")
    SPOTIFY_PLAYER = ("spotify", "Player")
    SPOTIFY_PLAYLISTS = ("spotify", "Playlists")
    SPOTIFY_SEARCH = ("spotify", "Search")
    SPOTIFY_SHOWS = ("spotify", "Shows")
    SPOTIFY_TRACKS = ("spotify", "Tracks")
    SPOTIFY_USERS = ("spotify", "Users")
    STRAVA_ACTIVITIES = ("strava", "Activities")
    STRAVA_ATHLETES = ("strava", "Athletes")
    STRAVA_CLUBS = ("strava", "Clubs")
    STRAVA_GEARS = ("strava", "Gears")
    STRAVA_ROUTES = ("strava", "Routes")
    STRAVA_SEGMENTEFFORTS = ("strava", "SegmentEfforts")
    STRAVA_SEGMENTS = ("strava", "Segments")
    STRAVA_STREAMS = ("strava", "Streams")
    STRAVA_UPLOADS = ("strava", "Uploads")
    TASKADE_AGENT = ("taskade", "Agent")
    TASKADE_FOLDER = ("taskade", "Folder")
    TASKADE_ME = ("taskade", "Me")
    TASKADE_PROJECT = ("taskade", "Project")
    TASKADE_TASK = ("taskade", "Task")
    TASKADE_WORKSPACE = ("taskade", "Workspace")
    TRELLO_ACTION = ("trello", "action")
    TRELLO_BATCH = ("trello", "batch")
    TRELLO_BOARD = ("trello", "board")
    TRELLO_CARD = ("trello", "card")
    TRELLO_CHECKLIST = ("trello", "checklist")
    TRELLO_LABEL = ("trello", "label")
    TRELLO_LIST = ("trello", "list")
    TRELLO_MEMBER = ("trello", "member")
    TRELLO_NOTIFICATION = ("trello", "notification")
    TRELLO_ORGANIZATION = ("trello", "organization")
    TRELLO_SEARCH = ("trello", "search")
    TRELLO_SESSION = ("trello", "session")
    TRELLO_TOKEN = ("trello", "token")
    TRELLO_TYPE = ("trello", "type")
    TRELLO_WEBHOOK = ("trello", "webhook")
    WHATSAPP_APPLICATION = ("whatsapp", "Application")
    WHATSAPP_BACKUP_RESTORE = ("whatsapp", "Backup/Restore")
    WHATSAPP_BUSINESS_PROFILE = ("whatsapp", "Business Profile")
    WHATSAPP_CERTIFICATES = ("whatsapp", "Certificates")
    WHATSAPP_CONTACTS = ("whatsapp", "Contacts")
    WHATSAPP_GROUPS = ("whatsapp", "Groups")
    WHATSAPP_HEALTH = ("whatsapp", "Health")
    WHATSAPP_MEDIA = ("whatsapp", "Media")
    WHATSAPP_MESSAGES = ("whatsapp", "Messages")
    WHATSAPP_PROFILE = ("whatsapp", "Profile")
    WHATSAPP_REGISTRATION = ("whatsapp", "Registration")
    WHATSAPP_TWO_STEP_VERIFICATION = ("whatsapp", "Two-Step Verification")
    WHATSAPP_USERS = ("whatsapp", "Users")
    ZOOM_ARCHIVING = ("zoom", "Archiving")
    ZOOM_CLOUD_RECORDING = ("zoom", "Cloud Recording")
    ZOOM_DEVICES = ("zoom", "Devices")
    ZOOM_H323_DEVICES = ("zoom", "H323 Devices")
    ZOOM_MEETINGS = ("zoom", "Meetings")
    ZOOM_PAC = ("zoom", "PAC")
    ZOOM_REPORTS = ("zoom", "Reports")
    ZOOM_SIP_PHONE = ("zoom", "SIP Phone")
    ZOOM_TSP = ("zoom", "TSP")
    ZOOM_TRACKING_FIELD = ("zoom", "Tracking Field")
    ZOOM_WEBINARS = ("zoom", "Webinars")


class App(str, Enum):
    """Composio App."""

    @property
    def actions(self) -> t.Iterator["Action"]:
        """Iterate over actions for this app."""
        for action in Action:
            if action.name.startswith(self.value):
                yield action

    @property
    def is_local(self) -> bool:
        """If the app is local."""
        return self.value.lower() in [
            "mathematical",
            "localworkspace",
            "cmdmanagertool",
            "historykeeper",
            "ragtool",
            "webtool",
            "greptile",
            "submitpatchtool",
            "sqltool",
            "filetool",
        ]

    APIFY = "apify"
    ASANA = "asana"
    ATTIO = "attio"
    BREVO = "brevo"
    CLICKUP = "clickup"
    CODEINTERPRETER = "codeinterpreter"
    COMPOSIO = "composio"
    DISCORD = "discord"
    DROPBOX = "dropbox"
    ELEVENLABS = "elevenlabs"
    EXA = "exa"
    FIGMA = "figma"
    FILEMANAGER = "filemanager"
    FIRECRAWL = "firecrawl"
    GITHUB = "github"
    GMAIL = "gmail"
    GOOGLECALENDAR = "googlecalendar"
    GOOGLEDOCS = "googledocs"
    GOOGLEDRIVE = "googledrive"
    GOOGLEMEET = "googlemeet"
    GOOGLESHEETS = "googlesheets"
    GOOGLETASKS = "googletasks"
    HACKERNEWS = "hackernews"
    HEROKU = "heroku"
    INDUCEDAI = "inducedai"
    LINEAR = "linear"
    LISTENNOTES = "listennotes"
    MULTIONAI = "multionai"
    NASA = "nasa"
    NOTION = "notion"
    OKTA = "okta"
    PAGERDUTY = "pagerduty"
    PERPLEXITYAI = "perplexityai"
    SCHEDULER = "scheduler"
    SERPAPI = "serpapi"
    SLACK = "slack"
    SLACKBOT = "slackbot"
    SNOWFLAKE = "snowflake"
    SOUNDCLOUD = "soundcloud"
    SPLITWISE = "splitwise"
    SPOTIFY = "spotify"
    STRAVA = "strava"
    TASKADE = "taskade"
    TAVILY = "tavily"
    TRELLO = "trello"
    TWILIO = "twilio"
    TYPEFORM = "typeform"
    WEATHERMAP = "weathermap"
    WHATSAPP = "whatsapp"
    WORKABLE = "workable"
    YOUSEARCH = "yousearch"
    YOUTUBE = "youtube"
    ZENDESK = "zendesk"
    ZOOM = "zoom"
    MATHEMATICAL = "mathematical"
    LOCALWORKSPACE = "localworkspace"
    CMDMANAGERTOOL = "cmdmanagertool"
    HISTORYKEEPER = "historykeeper"
    RAGTOOL = "ragtool"
    WEBTOOL = "webtool"
    GREPTILE = "greptile"
    SUBMITPATCHTOOL = "submitpatchtool"
    SQLTOOL = "sqltool"
    FILETOOL = "filetool"


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

    APIFY_CREATE_APIFY_ACTOR = ("apify", "apify_create_apify_actor", False)
    APIFY_GET_ACTOR_ID = ("apify", "apify_get_actor_id", False)
    APIFY_GET_LAST_RUN_DATA = ("apify", "apify_get_last_run_data", False)
    APIFY_LIST_APIFY_ACTORS = ("apify", "apify_list_apify_actors", False)
    APIFY_LIST_APIFY_TASKS = ("apify", "apify_list_apify_tasks", False)
    APIFY_SEARCH_STORE = ("apify", "apify_search_store", False)
    ASANA_ALLOCATIONS_CREATE_RECORD = (
        "asana",
        "asana_allocations_create_record",
        False,
    )
    ASANA_ALLOCATIONS_DELETE_ALLOCATION_BY_ID = (
        "asana",
        "asana_allocations_delete_allocation_by_id",
        False,
    )
    ASANA_ALLOCATIONS_GET_MULTIPLE = ("asana", "asana_allocations_get_multiple", False)
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
    ASANA_ATTACHMENTS_GET_ATTACHMENT_RECORD = (
        "asana",
        "asana_attachments_get_attachment_record",
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
    ASANA_CUSTOM_FIELD_SETTINGS_GET_PORTFOLIO_CUSTOM_FIELD_SETTINGS = (
        "asana",
        "asana_custom_field_settings_get_portfolio_custom_field_settings",
        False,
    )
    ASANA_CUSTOM_FIELD_SETTINGS_GET_PROJECT_CUSTOM_FIELD_SETTINGS = (
        "asana",
        "asana_custom_field_settings_get_project_custom_field_settings",
        False,
    )
    ASANA_CUSTOM_FIELDS_ADDE_NUM_OPTION = (
        "asana",
        "asana_custom_fields_adde_num_option",
        False,
    )
    ASANA_CUSTOM_FIELDS_CREATE_NEW_FIELD_RECORD = (
        "asana",
        "asana_custom_fields_create_new_field_record",
        False,
    )
    ASANA_CUSTOM_FIELDS_DELETE_FIELD_RECORD = (
        "asana",
        "asana_custom_fields_delete_field_record",
        False,
    )
    ASANA_CUSTOM_FIELDS_GET_METADATA = (
        "asana",
        "asana_custom_fields_get_metadata",
        False,
    )
    ASANA_CUSTOM_FIELDS_LIST_WORK_SPACE_CUSTOM_FIELDS = (
        "asana",
        "asana_custom_fields_list_work_space_custom_fields",
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
    ASANA_CUSTOM_FIELDS_UPDATE_FIELD_RECORD = (
        "asana",
        "asana_custom_fields_update_field_record",
        False,
    )
    ASANA_EVENTS_GET_RESOURCE_EVENTS = (
        "asana",
        "asana_events_get_resource_events",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_CREATE_SUPPORTING_RELATIONSHIP = (
        "asana",
        "asana_goal_relationships_create_supporting_relationship",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_GET_COMPACT_RECORDS = (
        "asana",
        "asana_goal_relationships_get_compact_records",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_GET_RECORD_BY_ID = (
        "asana",
        "asana_goal_relationships_get_record_by_id",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_REMOVE_SUPPORTING_RELATIONSHIP = (
        "asana",
        "asana_goal_relationships_remove_supporting_relationship",
        False,
    )
    ASANA_GOAL_RELATIONSHIPS_UPDATE_GOAL_RELATIONSHIP_RECORD = (
        "asana",
        "asana_goal_relationships_update_goal_relationship_record",
        False,
    )
    ASANA_GOALS_ADD_COLLABORATORS_TO_GOAL = (
        "asana",
        "asana_goals_add_collaborators_to_goal",
        False,
    )
    ASANA_GOALS_CREATE_METRIC = ("asana", "asana_goals_create_metric", False)
    ASANA_GOALS_CREATE_NEW_GOAL_RECORD = (
        "asana",
        "asana_goals_create_new_goal_record",
        False,
    )
    ASANA_GOALS_DELETE_RECORD = ("asana", "asana_goals_delete_record", False)
    ASANA_GOALS_GET_COMPACT_RECORDS = (
        "asana",
        "asana_goals_get_compact_records",
        False,
    )
    ASANA_GOALS_GET_GOAL_RECORD = ("asana", "asana_goals_get_goal_record", False)
    ASANA_GOALS_GET_PARENT_GOALS = ("asana", "asana_goals_get_parent_goals", False)
    ASANA_GOALS_REMOVE_FOLLOWERS_FROM_GOAL = (
        "asana",
        "asana_goals_remove_followers_from_goal",
        False,
    )
    ASANA_GOALS_UPDATE_GOAL_RECORD = ("asana", "asana_goals_update_goal_record", False)
    ASANA_GOALS_UPDATE_METRIC_CURRENT_VALUE = (
        "asana",
        "asana_goals_update_metric_current_value",
        False,
    )
    ASANA_JOBS_GET_BY_ID = ("asana", "asana_jobs_get_by_id", False)
    ASANA_MEMBERSHIPS_CREATE_NEW_RECORD = (
        "asana",
        "asana_memberships_create_new_record",
        False,
    )
    ASANA_MEMBERSHIPS_DELETE_RECORD = (
        "asana",
        "asana_memberships_delete_record",
        False,
    )
    ASANA_MEMBERSHIPS_GET_MEMBERSHIP_RECORD = (
        "asana",
        "asana_memberships_get_membership_record",
        False,
    )
    ASANA_MEMBERSHIPS_GET_MULTIPLE = ("asana", "asana_memberships_get_multiple", False)
    ASANA_MEMBERSHIPS_UPDATE_MEMBERSHIP_RECORD = (
        "asana",
        "asana_memberships_update_membership_record",
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
    ASANA_PORTFOLIO_MEMBERSHIPS_GET_COMPACT = (
        "asana",
        "asana_portfolio_memberships_get_compact",
        False,
    )
    ASANA_PORTFOLIO_MEMBERSHIPS_GET_COMPLETE_RECORD = (
        "asana",
        "asana_portfolio_memberships_get_complete_record",
        False,
    )
    ASANA_PORTFOLIO_MEMBERSHIPS_LIST_MULTIPLE_MEMBERSHIPS = (
        "asana",
        "asana_portfolio_memberships_list_multiple_memberships",
        False,
    )
    ASANA_PORTFOLIOS_ADD_CUSTOM_FIELD_SETTING = (
        "asana",
        "asana_portfolios_add_custom_field_setting",
        False,
    )
    ASANA_PORTFOLIOS_ADD_MEMBERS_TO_PORTFOLIO = (
        "asana",
        "asana_portfolios_add_members_to_portfolio",
        False,
    )
    ASANA_PORTFOLIOS_ADD_PORTFOLIO_ITEM = (
        "asana",
        "asana_portfolios_add_portfolio_item",
        False,
    )
    ASANA_PORTFOLIOS_CREATE_NEW_PORTFOLIO_RECORD = (
        "asana",
        "asana_portfolios_create_new_portfolio_record",
        False,
    )
    ASANA_PORTFOLIOS_DELETE_RECORD = ("asana", "asana_portfolios_delete_record", False)
    ASANA_PORTFOLIOS_GET_ITEMS = ("asana", "asana_portfolios_get_items", False)
    ASANA_PORTFOLIOS_GET_RECORD = ("asana", "asana_portfolios_get_record", False)
    ASANA_PORTFOLIOS_LIST_MULTIPLE_PORTFOLIOS = (
        "asana",
        "asana_portfolios_list_multiple_portfolios",
        False,
    )
    ASANA_PORTFOLIOS_REMOVE_CUSTOM_FIELD_SETTING = (
        "asana",
        "asana_portfolios_remove_custom_field_setting",
        False,
    )
    ASANA_PORTFOLIOS_REMOVE_ITEM_FROM_PORTFOLIO = (
        "asana",
        "asana_portfolios_remove_item_from_portfolio",
        False,
    )
    ASANA_PORTFOLIOS_REMOVE_MEMBERS_FROM_PORTFOLIO = (
        "asana",
        "asana_portfolios_remove_members_from_portfolio",
        False,
    )
    ASANA_PORTFOLIOS_UPDATE_PORTFOLIO_RECORD = (
        "asana",
        "asana_portfolios_update_portfolio_record",
        False,
    )
    ASANA_PROJECT_BRIEFS_CREATE_NEW_RECORD = (
        "asana",
        "asana_project_briefs_create_new_record",
        False,
    )
    ASANA_PROJECT_BRIEFS_GET_FULL_RECORD = (
        "asana",
        "asana_project_briefs_get_full_record",
        False,
    )
    ASANA_PROJECT_BRIEFS_REMOVE_BRIEF = (
        "asana",
        "asana_project_briefs_remove_brief",
        False,
    )
    ASANA_PROJECT_BRIEFS_UPDATE_BRIEF_RECORD = (
        "asana",
        "asana_project_briefs_update_brief_record",
        False,
    )
    ASANA_PROJECT_MEMBERSHIPS_GET_COMPACT_RECORDS = (
        "asana",
        "asana_project_memberships_get_compact_records",
        False,
    )
    ASANA_PROJECT_MEMBERSHIPS_GET_RECORD = (
        "asana",
        "asana_project_memberships_get_record",
        False,
    )
    ASANA_PROJECT_STATUSES_CREATE_NEW_STATUS_UPDATE_RECORD = (
        "asana",
        "asana_project_statuses_create_new_status_update_record",
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
    ASANA_PROJECT_STATUSES_GET_STATUS_UPDATE_RECORD = (
        "asana",
        "asana_project_statuses_get_status_update_record",
        False,
    )
    ASANA_PROJECT_TEMPLATES_DELETE_TEMPLATE_RECORD = (
        "asana",
        "asana_project_templates_delete_template_record",
        False,
    )
    ASANA_PROJECT_TEMPLATES_GET_ALL_TEMPLATE_RECORDS = (
        "asana",
        "asana_project_templates_get_all_template_records",
        False,
    )
    ASANA_PROJECT_TEMPLATES_GET_RECORD = (
        "asana",
        "asana_project_templates_get_record",
        False,
    )
    ASANA_PROJECT_TEMPLATES_INSTANTIATE_PROJECT_JOB = (
        "asana",
        "asana_project_templates_instantiate_project_job",
        False,
    )
    ASANA_PROJECT_TEMPLATES_LIST_MULTIPLE = (
        "asana",
        "asana_project_templates_list_multiple",
        False,
    )
    ASANA_PROJECTS_ADD_CUSTOM_FIELD_SETTING = (
        "asana",
        "asana_projects_add_custom_field_setting",
        False,
    )
    ASANA_PROJECTS_ADD_FOLLOWERS_TO_PROJECT = (
        "asana",
        "asana_projects_add_followers_to_project",
        False,
    )
    ASANA_PROJECTS_ADD_MEMBERS_TO_PROJECT = (
        "asana",
        "asana_projects_add_members_to_project",
        False,
    )
    ASANA_PROJECTS_CREATE_IN_WORK_SPACE = (
        "asana",
        "asana_projects_create_in_work_space",
        False,
    )
    ASANA_PROJECTS_CREATE_NEW_PROJECT_RECORD = (
        "asana",
        "asana_projects_create_new_project_record",
        False,
    )
    ASANA_PROJECTS_CREATE_PROJECT_FOR_TEAM = (
        "asana",
        "asana_projects_create_project_for_team",
        False,
    )
    ASANA_PROJECTS_CREATE_PROJECT_TEMPLATE_JOB = (
        "asana",
        "asana_projects_create_project_template_job",
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
    ASANA_PROJECTS_GET_ALL_IN_WORK_SPACE = (
        "asana",
        "asana_projects_get_all_in_work_space",
        False,
    )
    ASANA_PROJECTS_GET_PROJECT_RECORD = (
        "asana",
        "asana_projects_get_project_record",
        False,
    )
    ASANA_PROJECTS_GET_TASK_COUNTS = ("asana", "asana_projects_get_task_counts", False)
    ASANA_PROJECTS_GET_TEAM_PROJECTS = (
        "asana",
        "asana_projects_get_team_projects",
        False,
    )
    ASANA_PROJECTS_LIST_MULTIPLE = ("asana", "asana_projects_list_multiple", False)
    ASANA_PROJECTS_REMOVE_CUSTOM_FIELD = (
        "asana",
        "asana_projects_remove_custom_field",
        False,
    )
    ASANA_PROJECTS_REMOVE_MEMBERS_FROM_PROJECT = (
        "asana",
        "asana_projects_remove_members_from_project",
        False,
    )
    ASANA_PROJECTS_REMOVE_PROJECT_FOLLOWERS = (
        "asana",
        "asana_projects_remove_project_followers",
        False,
    )
    ASANA_PROJECTS_TASK_PROJECTS_LIST = (
        "asana",
        "asana_projects_task_projects_list",
        False,
    )
    ASANA_PROJECTS_UPDATE_PROJECT_RECORD = (
        "asana",
        "asana_projects_update_project_record",
        False,
    )
    ASANA_RULES_TRIGGER_RULE_REQUEST = (
        "asana",
        "asana_rules_trigger_rule_request",
        False,
    )
    ASANA_SECTIONS_ADD_TASK_TO_SECTION = (
        "asana",
        "asana_sections_add_task_to_section",
        False,
    )
    ASANA_SECTIONS_CREATE_NEW_SECTION = (
        "asana",
        "asana_sections_create_new_section",
        False,
    )
    ASANA_SECTIONS_DELETE_SECTION = ("asana", "asana_sections_delete_section", False)
    ASANA_SECTIONS_GET_RECORD = ("asana", "asana_sections_get_record", False)
    ASANA_SECTIONS_LIST_PROJECT_SECTIONS = (
        "asana",
        "asana_sections_list_project_sections",
        False,
    )
    ASANA_SECTIONS_MOVE_OR_INSERT = ("asana", "asana_sections_move_or_insert", False)
    ASANA_SECTIONS_UPDATE_SECTION_RECORD = (
        "asana",
        "asana_sections_update_section_record",
        False,
    )
    ASANA_STATUS_UPDATES_CREATE_NEW_STATUS_UPDATE_RECORD = (
        "asana",
        "asana_status_updates_create_new_status_update_record",
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
    ASANA_STATUS_UPDATES_GET_RECORD_BY_ID = (
        "asana",
        "asana_status_updates_get_record_by_id",
        False,
    )
    ASANA_STORIES_CREATE_COMMENT = ("asana", "asana_stories_create_comment", False)
    ASANA_STORIES_DELETE_STORY_RECORD = (
        "asana",
        "asana_stories_delete_story_record",
        False,
    )
    ASANA_STORIES_GET_FULL_RECORD = ("asana", "asana_stories_get_full_record", False)
    ASANA_STORIES_GET_TASK_STORIES = ("asana", "asana_stories_get_task_stories", False)
    ASANA_STORIES_UPDATE_FULL_RECORD = (
        "asana",
        "asana_stories_update_full_record",
        False,
    )
    ASANA_TAGS_CREATE_NEW_TAG_RECORD = (
        "asana",
        "asana_tags_create_new_tag_record",
        False,
    )
    ASANA_TAGS_CREATE_TAG_IN_WORK_SPACE = (
        "asana",
        "asana_tags_create_tag_in_work_space",
        False,
    )
    ASANA_TAGS_GET_FILTERED_TAGS = ("asana", "asana_tags_get_filtered_tags", False)
    ASANA_TAGS_GET_RECORD = ("asana", "asana_tags_get_record", False)
    ASANA_TAGS_GET_TASK_TAGS = ("asana", "asana_tags_get_task_tags", False)
    ASANA_TAGS_LIST_FILTERED_TAGS = ("asana", "asana_tags_list_filtered_tags", False)
    ASANA_TAGS_REMOVE_TAG = ("asana", "asana_tags_remove_tag", False)
    ASANA_TAGS_UPDATE_TAG_RECORD = ("asana", "asana_tags_update_tag_record", False)
    ASANA_TASK_SUN_LINK_DEPENDENCIES_FROM_TASK = (
        "asana",
        "asana_task_sun_link_dependencies_from_task",
        False,
    )
    ASANA_TASK_SUN_LINK_DEPENDENTS = ("asana", "asana_task_sun_link_dependents", False)
    ASANA_TASK_TEMPLATES_DELETE_TASK_TEMPLATE = (
        "asana",
        "asana_task_templates_delete_task_template",
        False,
    )
    ASANA_TASK_TEMPLATES_GET_SINGLE_TEMPLATE = (
        "asana",
        "asana_task_templates_get_single_template",
        False,
    )
    ASANA_TASK_TEMPLATES_INSTANTIATE_TASK_JOB = (
        "asana",
        "asana_task_templates_instantiate_task_job",
        False,
    )
    ASANA_TASK_TEMPLATES_LIST_MULTIPLE = (
        "asana",
        "asana_task_templates_list_multiple",
        False,
    )
    ASANA_TASKS_ADD_FOLLOWERS_TO_TASK = (
        "asana",
        "asana_tasks_add_followers_to_task",
        False,
    )
    ASANA_TASKS_ADD_PROJECT_TO_TASK = (
        "asana",
        "asana_tasks_add_project_to_task",
        False,
    )
    ASANA_TASKS_ADD_TAG_TO_TASK = ("asana", "asana_tasks_add_tag_to_task", False)
    ASANA_TASKS_CREATE_NEW_TASK = ("asana", "asana_tasks_create_new_task", False)
    ASANA_TASKS_CREATE_SUB_TASK_RECORD = (
        "asana",
        "asana_tasks_create_sub_task_record",
        False,
    )
    ASANA_TASKS_DELETE_TASK = ("asana", "asana_tasks_delete_task", False)
    ASANA_TASKS_DUPLICATE_TASK_JOB = ("asana", "asana_tasks_duplicate_task_job", False)
    ASANA_TASKS_GET_ALL_DEPENDENCIES = (
        "asana",
        "asana_tasks_get_all_dependencies",
        False,
    )
    ASANA_TASKS_GET_BY_CUSTOM_ID = ("asana", "asana_tasks_get_by_custom_id", False)
    ASANA_TASKS_GET_DEPENDENTS = ("asana", "asana_tasks_get_dependents", False)
    ASANA_TASKS_GET_MULTIPLE = ("asana", "asana_tasks_get_multiple", False)
    ASANA_TASKS_GET_MULTIPLE_WITH_TAG = (
        "asana",
        "asana_tasks_get_multiple_with_tag",
        False,
    )
    ASANA_TASKS_GET_SECTION_TASKS = ("asana", "asana_tasks_get_section_tasks", False)
    ASANA_TASKS_GET_SUB_TASK_LIST = ("asana", "asana_tasks_get_sub_task_list", False)
    ASANA_TASKS_GET_TASK_RECORD = ("asana", "asana_tasks_get_task_record", False)
    ASANA_TASKS_GET_TASKS_BY_PROJECT = (
        "asana",
        "asana_tasks_get_tasks_by_project",
        False,
    )
    ASANA_TASKS_GET_USER_TASK_LIST_TASKS = (
        "asana",
        "asana_tasks_get_user_task_list_tasks",
        False,
    )
    ASANA_TASKS_REMOVE_FOLLOWERS_FROM_TASK = (
        "asana",
        "asana_tasks_remove_followers_from_task",
        False,
    )
    ASANA_TASKS_REMOVE_PROJECT_FROM_TASK = (
        "asana",
        "asana_tasks_remove_project_from_task",
        False,
    )
    ASANA_TASKS_REMOVE_TAG_FROM_TASK = (
        "asana",
        "asana_tasks_remove_tag_from_task",
        False,
    )
    ASANA_TASKS_SEARCH_IN_WORK_SPACE = (
        "asana",
        "asana_tasks_search_in_work_space",
        False,
    )
    ASANA_TASKS_SET_DEPENDENCIES_FOR_TASK = (
        "asana",
        "asana_tasks_set_dependencies_for_task",
        False,
    )
    ASANA_TASKS_SET_PARENT_TASK = ("asana", "asana_tasks_set_parent_task", False)
    ASANA_TASKS_SET_TASK_DEPENDENTS = (
        "asana",
        "asana_tasks_set_task_dependents",
        False,
    )
    ASANA_TASKS_UPDATE_TASK_RECORD = ("asana", "asana_tasks_update_task_record", False)
    ASANA_TEAM_MEMBERSHIPS_GET_COMPACT = (
        "asana",
        "asana_team_memberships_get_compact",
        False,
    )
    ASANA_TEAM_MEMBERSHIPS_GET_COMPACT_RECORDS = (
        "asana",
        "asana_team_memberships_get_compact_records",
        False,
    )
    ASANA_TEAM_MEMBERSHIPS_GET_RECORD_BY_ID = (
        "asana",
        "asana_team_memberships_get_record_by_id",
        False,
    )
    ASANA_TEAM_MEMBERSHIPS_GET_USER_COMPACT = (
        "asana",
        "asana_team_memberships_get_user_compact",
        False,
    )
    ASANA_TEAMS_ADD_USER_TO_TEAM = ("asana", "asana_teams_add_user_to_team", False)
    ASANA_TEAMS_CREATE_TEAM_RECORD = ("asana", "asana_teams_create_team_record", False)
    ASANA_TEAMS_GET_TEAM_RECORD = ("asana", "asana_teams_get_team_record", False)
    ASANA_TEAMS_GET_USER_TEAMS = ("asana", "asana_teams_get_user_teams", False)
    ASANA_TEAMS_LIST_WORK_SPACE_TEAMS = (
        "asana",
        "asana_teams_list_work_space_teams",
        False,
    )
    ASANA_TEAMS_REMOVE_USER_FROM_TEAM = (
        "asana",
        "asana_teams_remove_user_from_team",
        False,
    )
    ASANA_TEAMS_UPDATE_TEAM_RECORD = ("asana", "asana_teams_update_team_record", False)
    ASANA_TIME_PERIODS_GET_COMPACT_TIME_PERIODS = (
        "asana",
        "asana_time_periods_get_compact_time_periods",
        False,
    )
    ASANA_TIME_PERIODS_GET_FULL_RECORD = (
        "asana",
        "asana_time_periods_get_full_record",
        False,
    )
    ASANA_TIME_TRACKING_ENTRIES_CREATE_NEW_TIME_ENTRY_RECORD = (
        "asana",
        "asana_time_tracking_entries_create_new_time_entry_record",
        False,
    )
    ASANA_TIME_TRACKING_ENTRIES_DELETE_TIME_ENTRY = (
        "asana",
        "asana_time_tracking_entries_delete_time_entry",
        False,
    )
    ASANA_TIME_TRACKING_ENTRIES_GET_FOR_TASK = (
        "asana",
        "asana_time_tracking_entries_get_for_task",
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
    ASANA_USERS_GET_FAVORITES_FOR_USER = (
        "asana",
        "asana_users_get_favorites_for_user",
        False,
    )
    ASANA_USERS_GET_USER_RECORD = ("asana", "asana_users_get_user_record", False)
    ASANA_USERS_LIST_MULTIPLE_USERS = (
        "asana",
        "asana_users_list_multiple_users",
        False,
    )
    ASANA_USERS_LIST_TEAM_USERS = ("asana", "asana_users_list_team_users", False)
    ASANA_USERS_LIST_WORK_SPACE_USERS = (
        "asana",
        "asana_users_list_work_space_users",
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
    ASANA_WEB_HOOKS_LIST_MULTIPLE_WEB_HOOKS = (
        "asana",
        "asana_web_hooks_list_multiple_web_hooks",
        False,
    )
    ASANA_WEB_HOOKS_REMOVE_WEB_HOOK = (
        "asana",
        "asana_web_hooks_remove_web_hook",
        False,
    )
    ASANA_WEB_HOOKS_UPDATE_WEB_HOOK_FILTERS = (
        "asana",
        "asana_web_hooks_update_web_hook_filters",
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
    ASANA_WORK_SPACES_ADD_USER_TO_WORK_SPACE = (
        "asana",
        "asana_work_spaces_add_user_to_work_space",
        False,
    )
    ASANA_WORK_SPACES_GET_WORK_SPACE_RECORD = (
        "asana",
        "asana_work_spaces_get_work_space_record",
        False,
    )
    ASANA_WORK_SPACES_LIST_MULTIPLE = (
        "asana",
        "asana_work_spaces_list_multiple",
        False,
    )
    ASANA_WORK_SPACES_REMOVE_USER_FROM_WORK_SPACE = (
        "asana",
        "asana_work_spaces_remove_user_from_work_space",
        False,
    )
    ASANA_WORK_SPACES_UPDATE_WORK_SPACE_RECORD = (
        "asana",
        "asana_work_spaces_update_work_space_record",
        False,
    )
    ATTIO_ASSERT_A_LIST_ENTRY_BY_PARENT = (
        "attio",
        "attio_assert_a_list_entry_by_parent",
        False,
    )
    ATTIO_ASSERT_A_RECORD = ("attio", "attio_assert_a_record", False)
    ATTIO_CREATE_A_COMMENT = ("attio", "attio_create_a_comment", False)
    ATTIO_CREATE_A_LIST = ("attio", "attio_create_a_list", False)
    ATTIO_CREATE_A_NOTE = ("attio", "attio_create_a_note", False)
    ATTIO_CREATE_A_RECORD = ("attio", "attio_create_a_record", False)
    ATTIO_CREATE_A_SELECT_OPTION = ("attio", "attio_create_a_select_option", False)
    ATTIO_CREATE_A_STATUS = ("attio", "attio_create_a_status", False)
    ATTIO_CREATE_A_TASK = ("attio", "attio_create_a_task", False)
    ATTIO_CREATE_A_WEB_HOOK = ("attio", "attio_create_a_web_hook", False)
    ATTIO_CREATE_AN_ATTRIBUTE = ("attio", "attio_create_an_attribute", False)
    ATTIO_CREATE_AN_ENTRY_ADD_RECORD_TO_LIST = (
        "attio",
        "attio_create_an_entry_add_record_to_list",
        False,
    )
    ATTIO_CREATE_AN_OBJECT = ("attio", "attio_create_an_object", False)
    ATTIO_DELETE_A_COMMENT = ("attio", "attio_delete_a_comment", False)
    ATTIO_DELETE_A_LIST_ENTRY = ("attio", "attio_delete_a_list_entry", False)
    ATTIO_DELETE_A_NOTE = ("attio", "attio_delete_a_note", False)
    ATTIO_DELETE_A_RECORD = ("attio", "attio_delete_a_record", False)
    ATTIO_DELETE_A_TASK = ("attio", "attio_delete_a_task", False)
    ATTIO_DELETE_A_WEB_HOOK = ("attio", "attio_delete_a_web_hook", False)
    ATTIO_GET_A_COMMENT = ("attio", "attio_get_a_comment", False)
    ATTIO_GET_A_LIST = ("attio", "attio_get_a_list", False)
    ATTIO_GET_A_LIST_ENTRY = ("attio", "attio_get_a_list_entry", False)
    ATTIO_GET_A_NOTE = ("attio", "attio_get_a_note", False)
    ATTIO_GET_A_RECORD = ("attio", "attio_get_a_record", False)
    ATTIO_GET_A_TASK = ("attio", "attio_get_a_task", False)
    ATTIO_GET_A_THREAD = ("attio", "attio_get_a_thread", False)
    ATTIO_GET_A_WEB_HOOK = ("attio", "attio_get_a_web_hook", False)
    ATTIO_GET_A_WORK_SPACE_MEMBER = ("attio", "attio_get_a_work_space_member", False)
    ATTIO_GET_AN_ATTRIBUTE = ("attio", "attio_get_an_attribute", False)
    ATTIO_GET_AN_OBJECT = ("attio", "attio_get_an_object", False)
    ATTIO_IDENTIFY = ("attio", "attio_identify", False)
    ATTIO_LIST_ALL_LISTS = ("attio", "attio_list_all_lists", False)
    ATTIO_LIST_ATTRIBUTE_VALUES_FOR_A_LIST_ENTRY = (
        "attio",
        "attio_list_attribute_values_for_a_list_entry",
        False,
    )
    ATTIO_LIST_ATTRIBUTES = ("attio", "attio_list_attributes", False)
    ATTIO_LIST_ENTRIES = ("attio", "attio_list_entries", False)
    ATTIO_LIST_NOTES = ("attio", "attio_list_notes", False)
    ATTIO_LIST_OBJECTS = ("attio", "attio_list_objects", False)
    ATTIO_LIST_RECORD_ATTRIBUTE_VALUES = (
        "attio",
        "attio_list_record_attribute_values",
        False,
    )
    ATTIO_LIST_RECORD_ENTRIES = ("attio", "attio_list_record_entries", False)
    ATTIO_LIST_RECORDS = ("attio", "attio_list_records", False)
    ATTIO_LIST_SELECT_OPTIONS = ("attio", "attio_list_select_options", False)
    ATTIO_LIST_STATUSES = ("attio", "attio_list_statuses", False)
    ATTIO_LIST_TASKS = ("attio", "attio_list_tasks", False)
    ATTIO_LIST_THREADS = ("attio", "attio_list_threads", False)
    ATTIO_LIST_WEB_HOOKS = ("attio", "attio_list_web_hooks", False)
    ATTIO_LIST_WORK_SPACE_MEMBERS = ("attio", "attio_list_work_space_members", False)
    ATTIO_UPDATE_A_LIST = ("attio", "attio_update_a_list", False)
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
    ATTIO_UPDATE_A_RECORD = ("attio", "attio_update_a_record", False)
    ATTIO_UPDATE_A_SELECT_OPTION = ("attio", "attio_update_a_select_option", False)
    ATTIO_UPDATE_A_STATUS = ("attio", "attio_update_a_status", False)
    ATTIO_UPDATE_A_TASK = ("attio", "attio_update_a_task", False)
    ATTIO_UPDATE_A_WEB_HOOK = ("attio", "attio_update_a_web_hook", False)
    ATTIO_UPDATE_AN_ATTRIBUTE = ("attio", "attio_update_an_attribute", False)
    ATTIO_UPDATE_AN_OBJECT = ("attio", "attio_update_an_object", False)
    BREVO_ACCOUNT_GET_USER_ACTIVITY_LOGS = (
        "brevo",
        "brevo_account_get_user_activity_logs",
        False,
    )
    BREVO_ACCOUNT_INFORMATION_DETAILS = (
        "brevo",
        "brevo_account_information_details",
        False,
    )
    BREVO_COMPANIES_CREATE_COMPANY = ("brevo", "brevo_companies_create_company", False)
    BREVO_COMPANIES_DELETE_COMPANY = ("brevo", "brevo_companies_delete_company", False)
    BREVO_COMPANIES_GET_ALL = ("brevo", "brevo_companies_get_all", False)
    BREVO_COMPANIES_GET_ATTRIBUTES = ("brevo", "brevo_companies_get_attributes", False)
    BREVO_COMPANIES_GET_COMPANY_BY_ID = (
        "brevo",
        "brevo_companies_get_company_by_id",
        False,
    )
    BREVO_COMPANIES_LINK_UN_LINK_WITH_CONTACT_DEAL = (
        "brevo",
        "brevo_companies_link_un_link_with_contact_deal",
        False,
    )
    BREVO_COMPANIES_UPDATE_COMPANY = ("brevo", "brevo_companies_update_company", False)
    BREVO_CONTACTS_ADD_TO_LIST = ("brevo", "brevo_contacts_add_to_list", False)
    BREVO_CONTACTS_CREATE_ATTRIBUTE = (
        "brevo",
        "brevo_contacts_create_attribute",
        False,
    )
    BREVO_CONTACTS_CREATE_DOUBLE_OPT_IN_CONTACT = (
        "brevo",
        "brevo_contacts_create_double_opt_in_contact",
        False,
    )
    BREVO_CONTACTS_CREATE_FOLDER = ("brevo", "brevo_contacts_create_folder", False)
    BREVO_CONTACTS_CREATE_LIST = ("brevo", "brevo_contacts_create_list", False)
    BREVO_CONTACTS_CREATE_NEW_CONTACT = (
        "brevo",
        "brevo_contacts_create_new_contact",
        False,
    )
    BREVO_CONTACTS_DELETE_CONTACT = ("brevo", "brevo_contacts_delete_contact", False)
    BREVO_CONTACTS_DELETE_FOLDER = ("brevo", "brevo_contacts_delete_folder", False)
    BREVO_CONTACTS_DELETE_LIST = ("brevo", "brevo_contacts_delete_list", False)
    BREVO_CONTACTS_EXPORT_PROCESS_ID = (
        "brevo",
        "brevo_contacts_export_process_id",
        False,
    )
    BREVO_CONTACTS_GET_ALL_CONTACTS = (
        "brevo",
        "brevo_contacts_get_all_contacts",
        False,
    )
    BREVO_CONTACTS_GET_ALL_FOLDERS = ("brevo", "brevo_contacts_get_all_folders", False)
    BREVO_CONTACTS_GET_ALL_LISTS = ("brevo", "brevo_contacts_get_all_lists", False)
    BREVO_CONTACTS_GET_ALL_SEGMENTS = (
        "brevo",
        "brevo_contacts_get_all_segments",
        False,
    )
    BREVO_CONTACTS_GET_DETAILS = ("brevo", "brevo_contacts_get_details", False)
    BREVO_CONTACTS_GET_EMAIL_CAMPAIGN_STATS = (
        "brevo",
        "brevo_contacts_get_email_campaign_stats",
        False,
    )
    BREVO_CONTACTS_GET_FOLDER_DETAILS = (
        "brevo",
        "brevo_contacts_get_folder_details",
        False,
    )
    BREVO_CONTACTS_GET_FOLDER_LISTS = (
        "brevo",
        "brevo_contacts_get_folder_lists",
        False,
    )
    BREVO_CONTACTS_GET_LIST_CONTACTS = (
        "brevo",
        "brevo_contacts_get_list_contacts",
        False,
    )
    BREVO_CONTACTS_GET_LIST_DETAILS = (
        "brevo",
        "brevo_contacts_get_list_details",
        False,
    )
    BREVO_CONTACTS_IMPORT_CONTACTS_PROCESS = (
        "brevo",
        "brevo_contacts_import_contacts_process",
        False,
    )
    BREVO_CONTACTS_LIST_ATTRIBUTES = ("brevo", "brevo_contacts_list_attributes", False)
    BREVO_CONTACTS_REMOVE_ATTRIBUTE = (
        "brevo",
        "brevo_contacts_remove_attribute",
        False,
    )
    BREVO_CONTACTS_REMOVE_CONTACT_FROM_LIST = (
        "brevo",
        "brevo_contacts_remove_contact_from_list",
        False,
    )
    BREVO_CONTACTS_UPDATE_ATTRIBUTE = (
        "brevo",
        "brevo_contacts_update_attribute",
        False,
    )
    BREVO_CONTACTS_UPDATE_CONTACT_BY_ID = (
        "brevo",
        "brevo_contacts_update_contact_by_id",
        False,
    )
    BREVO_CONTACTS_UPDATE_FOLDER = ("brevo", "brevo_contacts_update_folder", False)
    BREVO_CONTACTS_UPDATE_LIST = ("brevo", "brevo_contacts_update_list", False)
    BREVO_CONTACTS_UPDATE_MULTIPLE = ("brevo", "brevo_contacts_update_multiple", False)
    BREVO_CONVERSATIONS_DELETE_AUTOMATED_MESSAGE = (
        "brevo",
        "brevo_conversations_delete_automated_message",
        False,
    )
    BREVO_CONVERSATIONS_DELETE_MESSAGE_SENT_BY_AGENT = (
        "brevo",
        "brevo_conversations_delete_message_sent_by_agent",
        False,
    )
    BREVO_CONVERSATIONS_GET_AUTOMATED_MESSAGE = (
        "brevo",
        "brevo_conversations_get_automated_message",
        False,
    )
    BREVO_CONVERSATIONS_GET_MESSAGE_BY_ID = (
        "brevo",
        "brevo_conversations_get_message_by_id",
        False,
    )
    BREVO_CONVERSATIONS_SEND_AUTOMATED_MESSAGE = (
        "brevo",
        "brevo_conversations_send_automated_message",
        False,
    )
    BREVO_CONVERSATIONS_SEND_MESSAGE_AS_AGENT = (
        "brevo",
        "brevo_conversations_send_message_as_agent",
        False,
    )
    BREVO_CONVERSATIONS_SET_AGENT_ONLINE_STATUS = (
        "brevo",
        "brevo_conversations_set_agent_online_status",
        False,
    )
    BREVO_CONVERSATIONS_UPDATE_AGENT_MESSAGE = (
        "brevo",
        "brevo_conversations_update_agent_message",
        False,
    )
    BREVO_CONVERSATIONS_UPDATE_PUSHED_MESSAGE = (
        "brevo",
        "brevo_conversations_update_pushed_message",
        False,
    )
    BREVO_COUPONS_CREATE_COLLECTION = (
        "brevo",
        "brevo_coupons_create_collection",
        False,
    )
    BREVO_COUPONS_CREATE_COUPON_COLLECTION = (
        "brevo",
        "brevo_coupons_create_coupon_collection",
        False,
    )
    BREVO_COUPONS_GET_BY_ID = ("brevo", "brevo_coupons_get_by_id", False)
    BREVO_COUPONS_LIST_COUPON_COLLECTIONS = (
        "brevo",
        "brevo_coupons_list_coupon_collections",
        False,
    )
    BREVO_COUPONS_UPDATE_COUPON_COLLECTION_BY_ID = (
        "brevo",
        "brevo_coupons_update_coupon_collection_by_id",
        False,
    )
    BREVO_DEALS_CREATE_NEW_DEAL = ("brevo", "brevo_deals_create_new_deal", False)
    BREVO_DEALS_DELETE_DEAL = ("brevo", "brevo_deals_delete_deal", False)
    BREVO_DEALS_GET_ALL_DEALS = ("brevo", "brevo_deals_get_all_deals", False)
    BREVO_DEALS_GET_ALL_PIPELINES = ("brevo", "brevo_deals_get_all_pipelines", False)
    BREVO_DEALS_GET_ATTRIBUTES = ("brevo", "brevo_deals_get_attributes", False)
    BREVO_DEALS_GET_BY_ID = ("brevo", "brevo_deals_get_by_id", False)
    BREVO_DEALS_GET_DETAILS = ("brevo", "brevo_deals_get_details", False)
    BREVO_DEALS_GET_PIPELINE_STAGES = (
        "brevo",
        "brevo_deals_get_pipeline_stages",
        False,
    )
    BREVO_DEALS_LINK_UN_LINK_PATCH = ("brevo", "brevo_deals_link_un_link_patch", False)
    BREVO_DEALS_UPDATE_DEAL_BY_ID = ("brevo", "brevo_deals_update_deal_by_id", False)
    BREVO_DOMAINS_AUTHENTICATE_DOMAIN = (
        "brevo",
        "brevo_domains_authenticate_domain",
        False,
    )
    BREVO_DOMAINS_CREATE_NEW_DOMAIN = (
        "brevo",
        "brevo_domains_create_new_domain",
        False,
    )
    BREVO_DOMAINS_DELETE_DOMAIN = ("brevo", "brevo_domains_delete_domain", False)
    BREVO_DOMAINS_GET_ALL = ("brevo", "brevo_domains_get_all", False)
    BREVO_DOMAINS_VALIDATE_CONFIGURATION = (
        "brevo",
        "brevo_domains_validate_configuration",
        False,
    )
    BREVO_E_COMMERCE_ACTIVATE_APP = ("brevo", "brevo_e_commerce_activate_app", False)
    BREVO_E_COMMERCE_CREATE_CATEGORIES_BATCH = (
        "brevo",
        "brevo_e_commerce_create_categories_batch",
        False,
    )
    BREVO_E_COMMERCE_CREATE_CATEGORY = (
        "brevo",
        "brevo_e_commerce_create_category",
        False,
    )
    BREVO_E_COMMERCE_CREATE_ORDER_BATCH = (
        "brevo",
        "brevo_e_commerce_create_order_batch",
        False,
    )
    BREVO_E_COMMERCE_CREATE_PRODUCT = (
        "brevo",
        "brevo_e_commerce_create_product",
        False,
    )
    BREVO_E_COMMERCE_CREATE_PRODUCTS_BATCH = (
        "brevo",
        "brevo_e_commerce_create_products_batch",
        False,
    )
    BREVO_E_COMMERCE_GET_ALL_CATEGORIES = (
        "brevo",
        "brevo_e_commerce_get_all_categories",
        False,
    )
    BREVO_E_COMMERCE_GET_CATEGORY_DETAILS = (
        "brevo",
        "brevo_e_commerce_get_category_details",
        False,
    )
    BREVO_E_COMMERCE_GET_ORDERS = ("brevo", "brevo_e_commerce_get_orders", False)
    BREVO_E_COMMERCE_GET_PRODUCT_DETAILS = (
        "brevo",
        "brevo_e_commerce_get_product_details",
        False,
    )
    BREVO_E_COMMERCE_LIST_ALL_PRODUCTS = (
        "brevo",
        "brevo_e_commerce_list_all_products",
        False,
    )
    BREVO_E_COMMERCE_MANAGE_ORDER_STATUS = (
        "brevo",
        "brevo_e_commerce_manage_order_status",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_CREATE_CAMPAIGN = (
        "brevo",
        "brevo_email_campaigns_create_campaign",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_EXPORT_RECIPIENTS_POST = (
        "brevo",
        "brevo_email_campaigns_export_recipients_post",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_GET_AB_TEST_RESULT = (
        "brevo",
        "brevo_email_campaigns_get_ab_test_result",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_GET_ALL = ("brevo", "brevo_email_campaigns_get_all", False)
    BREVO_EMAIL_CAMPAIGNS_GET_REPORT = (
        "brevo",
        "brevo_email_campaigns_get_report",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_GET_SHARED_URL = (
        "brevo",
        "brevo_email_campaigns_get_shared_url",
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
    BREVO_EMAIL_CAMPAIGNS_SEND_REPORT = (
        "brevo",
        "brevo_email_campaigns_send_report",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_SEND_TEST_TO_TEST_LIST = (
        "brevo",
        "brevo_email_campaigns_send_test_to_test_list",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_UPDATE_CAMPAIGN = (
        "brevo",
        "brevo_email_campaigns_update_campaign",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_UPDATE_STATUS = (
        "brevo",
        "brevo_email_campaigns_update_status",
        False,
    )
    BREVO_EMAIL_CAMPAIGNS_UPLOAD_IMAGE_TO_GALLERY = (
        "brevo",
        "brevo_email_campaigns_upload_image_to_gallery",
        False,
    )
    BREVO_EVENT_TRACK_INTERACTION = ("brevo", "brevo_event_track_interaction", False)
    BREVO_EXTERNAL_FEEDS_CREATE_FEED = (
        "brevo",
        "brevo_external_feeds_create_feed",
        False,
    )
    BREVO_EXTERNAL_FEEDS_DELETE_FEED_BYU_U_ID = (
        "brevo",
        "brevo_external_feeds_delete_feed_byu_u_id",
        False,
    )
    BREVO_EXTERNAL_FEEDS_GET_ALL_FEEDS = (
        "brevo",
        "brevo_external_feeds_get_all_feeds",
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
    BREVO_FILES_DELETE_FILE = ("brevo", "brevo_files_delete_file", False)
    BREVO_FILES_DOWNLOAD_FILE = ("brevo", "brevo_files_download_file", False)
    BREVO_FILES_GET_ALL_FILES = ("brevo", "brevo_files_get_all_files", False)
    BREVO_FILES_GET_FILE_DETAILS = ("brevo", "brevo_files_get_file_details", False)
    BREVO_FILES_UPLOAD_FILE = ("brevo", "brevo_files_upload_file", False)
    BREVO_INBOUND_PARSING_GET_ALL_EVENTS = (
        "brevo",
        "brevo_inbound_parsing_get_all_events",
        False,
    )
    BREVO_INBOUND_PARSING_GET_ATTACHMENT_BY_TOKEN = (
        "brevo",
        "brevo_inbound_parsing_get_attachment_by_token",
        False,
    )
    BREVO_INBOUND_PARSING_GET_EMAIL_EVENTS = (
        "brevo",
        "brevo_inbound_parsing_get_email_events",
        False,
    )
    BREVO_MASTER_ACCOUNT_CHECK_ADMIN_USER_PERMISSIONS = (
        "brevo",
        "brevo_master_account_check_admin_user_permissions",
        False,
    )
    BREVO_MASTER_ACCOUNT_CREATE_GROUP_OF_SUB_ACCOUNTS = (
        "brevo",
        "brevo_master_account_create_group_of_sub_accounts",
        False,
    )
    BREVO_MASTER_ACCOUNT_CREATE_SUB_ACCOUNT = (
        "brevo",
        "brevo_master_account_create_sub_account",
        False,
    )
    BREVO_MASTER_ACCOUNT_CREATE_SUB_ACCOUNT_KEY = (
        "brevo",
        "brevo_master_account_create_sub_account_key",
        False,
    )
    BREVO_MASTER_ACCOUNT_DELETE_GROUP = (
        "brevo",
        "brevo_master_account_delete_group",
        False,
    )
    BREVO_MASTER_ACCOUNT_DELETE_SUB_ACCOUNT = (
        "brevo",
        "brevo_master_account_delete_sub_account",
        False,
    )
    BREVO_MASTER_ACCOUNT_ENABLE_DISABLE = (
        "brevo",
        "brevo_master_account_enable_disable",
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
    BREVO_MASTER_ACCOUNT_GET_GROUP_DETAILS = (
        "brevo",
        "brevo_master_account_get_group_details",
        False,
    )
    BREVO_MASTER_ACCOUNT_GET_SUB_ACCOUNT_DETAILS = (
        "brevo",
        "brevo_master_account_get_sub_account_details",
        False,
    )
    BREVO_MASTER_ACCOUNT_LIST_ADMIN_USERS = (
        "brevo",
        "brevo_master_account_list_admin_users",
        False,
    )
    BREVO_MASTER_ACCOUNT_LIST_GROUPS = (
        "brevo",
        "brevo_master_account_list_groups",
        False,
    )
    BREVO_MASTER_ACCOUNT_LIST_SUB_ACCOUNTS = (
        "brevo",
        "brevo_master_account_list_sub_accounts",
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
    BREVO_MASTER_ACCOUNT_UN_LINK_SUB_ACCOUNT_FROM_GROUP = (
        "brevo",
        "brevo_master_account_un_link_sub_account_from_group",
        False,
    )
    BREVO_MASTER_ACCOUNT_UPDATE_GROUP_SUB_ACCOUNTS = (
        "brevo",
        "brevo_master_account_update_group_sub_accounts",
        False,
    )
    BREVO_MASTER_ACCOUNT_UPDATE_SUB_ACCOUNT_PLAN = (
        "brevo",
        "brevo_master_account_update_sub_account_plan",
        False,
    )
    BREVO_MASTER_ACCOUNTS_END_INVITATION_TO_ADMIN_USER = (
        "brevo",
        "brevo_master_accounts_end_invitation_to_admin_user",
        False,
    )
    BREVO_NOTES_CREATE_NEW_NOTE = ("brevo", "brevo_notes_create_new_note", False)
    BREVO_NOTES_GET_ALL = ("brevo", "brevo_notes_get_all", False)
    BREVO_NOTES_GET_BY_ID = ("brevo", "brevo_notes_get_by_id", False)
    BREVO_NOTES_REMOVE_BY_ID = ("brevo", "brevo_notes_remove_by_id", False)
    BREVO_NOTES_UPDATE_NOTE_BY_ID = ("brevo", "brevo_notes_update_note_by_id", False)
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
    BREVO_RESELLER_ADD_CHILD_CREDITS = (
        "brevo",
        "brevo_reseller_add_child_credits",
        False,
    )
    BREVO_RESELLER_ASSOCIATE_DEDICATED_IP_TO_CHILD = (
        "brevo",
        "brevo_reseller_associate_dedicated_ip_to_child",
        False,
    )
    BREVO_RESELLER_CREATE_CHILD = ("brevo", "brevo_reseller_create_child", False)
    BREVO_RESELLER_CREATE_CHILD_DOMAIN = (
        "brevo",
        "brevo_reseller_create_child_domain",
        False,
    )
    BREVO_RESELLER_DELETE_CHILD_BY_IDENTIFIER = (
        "brevo",
        "brevo_reseller_delete_child_by_identifier",
        False,
    )
    BREVO_RESELLER_DELETE_SENDER_DOMAIN_BY_CHILD_IDENTIFIER_AND_DOMAIN_NAME = (
        "brevo",
        "brevo_reseller_delete_sender_domain_by_child_identifier_and_domain_name",
        False,
    )
    BREVO_RESELLER_DISSOCIATE_IP_TO_CHILD = (
        "brevo",
        "brevo_reseller_dissociate_ip_to_child",
        False,
    )
    BREVO_RESELLER_GET_CHILD_ACCOUNT_CREATION_STATUS = (
        "brevo",
        "brevo_reseller_get_child_account_creation_status",
        False,
    )
    BREVO_RESELLER_GET_CHILD_DETAILS = (
        "brevo",
        "brevo_reseller_get_child_details",
        False,
    )
    BREVO_RESELLER_GET_CHILD_DOMAINS = (
        "brevo",
        "brevo_reseller_get_child_domains",
        False,
    )
    BREVO_RESELLER_GET_SESSION_TOKEN = (
        "brevo",
        "brevo_reseller_get_session_token",
        False,
    )
    BREVO_RESELLER_LIST_CHILDREN_ACCOUNTS = (
        "brevo",
        "brevo_reseller_list_children_accounts",
        False,
    )
    BREVO_RESELLER_REMOVE_CREDITS_FROM_CHILD = (
        "brevo",
        "brevo_reseller_remove_credits_from_child",
        False,
    )
    BREVO_RESELLER_UPDATE_CHILD_ACCOUNT_STATUS = (
        "brevo",
        "brevo_reseller_update_child_account_status",
        False,
    )
    BREVO_RESELLER_UPDATE_CHILD_INFO = (
        "brevo",
        "brevo_reseller_update_child_info",
        False,
    )
    BREVO_RESELLER_UPDATE_SENDER_DOMAIN = (
        "brevo",
        "brevo_reseller_update_sender_domain",
        False,
    )
    BREVO_SENDERS_CREATE_NEW_SENDER = (
        "brevo",
        "brevo_senders_create_new_sender",
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
    BREVO_SENDERS_LIST_ALL = ("brevo", "brevo_senders_list_all", False)
    BREVO_SENDERS_REMOVE_SENDER = ("brevo", "brevo_senders_remove_sender", False)
    BREVO_SENDERS_UPDATES_ENDERBY_ID = (
        "brevo",
        "brevo_senders_updates_enderby_id",
        False,
    )
    BREVO_SENDERS_VALIDATE_SENDER_USING_OT_P = (
        "brevo",
        "brevo_senders_validate_sender_using_ot_p",
        False,
    )
    BREVO_SMS_CAMPAIGNS_CREATE_CAMPAIGN = (
        "brevo",
        "brevo_sms_campaigns_create_campaign",
        False,
    )
    BREVO_SMS_CAMPAIGNS_EXPORT_RECIPIENTS_PROCESS = (
        "brevo",
        "brevo_sms_campaigns_export_recipients_process",
        False,
    )
    BREVO_SMS_CAMPAIGNS_GET_ALL_INFORMATION = (
        "brevo",
        "brevo_sms_campaigns_get_all_information",
        False,
    )
    BREVO_SMS_CAMPAIGNS_GET_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_sms_campaigns_get_campaign_by_id",
        False,
    )
    BREVO_SMS_CAMPAIGNS_REMOVE_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_sms_campaigns_remove_campaign_by_id",
        False,
    )
    BREVO_SMS_CAMPAIGNS_SEND_CAMPAIGN_REPORT = (
        "brevo",
        "brevo_sms_campaigns_send_campaign_report",
        False,
    )
    BREVO_SMS_CAMPAIGNS_SEND_IMMEDIATELY = (
        "brevo",
        "brevo_sms_campaigns_send_immediately",
        False,
    )
    BREVO_SMS_CAMPAIGNS_SEND_TESTS_MS = (
        "brevo",
        "brevo_sms_campaigns_send_tests_ms",
        False,
    )
    BREVO_SMS_CAMPAIGNS_UPDATE_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_sms_campaigns_update_campaign_by_id",
        False,
    )
    BREVO_SMS_CAMPAIGNS_UPDATE_STATUS = (
        "brevo",
        "brevo_sms_campaigns_update_status",
        False,
    )
    BREVO_TASKS_CREATE_NEW_TASK = ("brevo", "brevo_tasks_create_new_task", False)
    BREVO_TASKS_GET_ALL = ("brevo", "brevo_tasks_get_all", False)
    BREVO_TASKS_GET_ALL_TASK_TYPES = ("brevo", "brevo_tasks_get_all_task_types", False)
    BREVO_TASKS_GET_TASK_BY_ID = ("brevo", "brevo_tasks_get_task_by_id", False)
    BREVO_TASKS_REMOVE_TASK = ("brevo", "brevo_tasks_remove_task", False)
    BREVO_TASKS_UPDATE_TASK = ("brevo", "brevo_tasks_update_task", False)
    BREVO_TRANSACTIONAL_EMAILS_ADD_BLOCKED_DOMAIN = (
        "brevo",
        "brevo_transactional_emails_add_blocked_domain",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_CREATE_TEMPLATE = (
        "brevo",
        "brevo_transactional_emails_create_template",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_DELETE_LOG = (
        "brevo",
        "brevo_transactional_emails_delete_log",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_DELETE_SCHEDULED_EMAILS = (
        "brevo",
        "brevo_transactional_emails_delete_scheduled_emails",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_DELETE_TEMPLATE_BY_ID = (
        "brevo",
        "brevo_transactional_emails_delete_template_by_id",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_ACTIVITY_PER_DAY = (
        "brevo",
        "brevo_transactional_emails_get_activity_per_day",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_AGGREGATED_REPORT = (
        "brevo",
        "brevo_transactional_emails_get_aggregated_report",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_ALL_ACTIVITY = (
        "brevo",
        "brevo_transactional_emails_get_all_activity",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_BLOCKED_DOMAINS = (
        "brevo",
        "brevo_transactional_emails_get_blocked_domains",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_CONTENT_BYU_U_ID = (
        "brevo",
        "brevo_transactional_emails_get_content_byu_u_id",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_EMAIL_STATUS_BY_ID = (
        "brevo",
        "brevo_transactional_emails_get_email_status_by_id",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_LIST = (
        "brevo",
        "brevo_transactional_emails_get_list",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_GET_TEMPLATE_INFO = (
        "brevo",
        "brevo_transactional_emails_get_template_info",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_LIST_BLOCKED_CONTACTS = (
        "brevo",
        "brevo_transactional_emails_list_blocked_contacts",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_LIST_TEMPLATES = (
        "brevo",
        "brevo_transactional_emails_list_templates",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_REMOVE_HARD_BOUNCES = (
        "brevo",
        "brevo_transactional_emails_remove_hard_bounces",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_SEND_TEST_TEMPLATE = (
        "brevo",
        "brevo_transactional_emails_send_test_template",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_SEND_TRANSACTIONAL_EMAIL = (
        "brevo",
        "brevo_transactional_emails_send_transactional_email",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_UNBLOCK_CONTACT = (
        "brevo",
        "brevo_transactional_emails_unblock_contact",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_UNBLOCK_DOMAIN = (
        "brevo",
        "brevo_transactional_emails_unblock_domain",
        False,
    )
    BREVO_TRANSACTIONAL_EMAILS_UPDATE_TEMPLATE = (
        "brevo",
        "brevo_transactional_emails_update_template",
        False,
    )
    BREVO_TRANSACTIONAL_SMS_GET_AGGREGATED_REPORT = (
        "brevo",
        "brevo_transactional_sms_get_aggregated_report",
        False,
    )
    BREVO_TRANSACTIONAL_SMS_GET_ALL_EVENTS = (
        "brevo",
        "brevo_transactional_sms_get_all_events",
        False,
    )
    BREVO_TRANSACTIONAL_SMS_GETS_MS_ACTIVITY_AGGREGATED_PER_DAY = (
        "brevo",
        "brevo_transactional_sms_gets_ms_activity_aggregated_per_day",
        False,
    )
    BREVO_TRANSACTIONAL_SMS_SENDS_MS_MESSAGE_TO_MOBILE = (
        "brevo",
        "brevo_transactional_sms_sends_ms_message_to_mobile",
        False,
    )
    BREVO_TRANSACTIONAL_WHAT_S_APP_GET_ACTIVITY = (
        "brevo",
        "brevo_transactional_what_s_app_get_activity",
        False,
    )
    BREVO_TRANSACTIONAL_WHAT_S_APPS_END_MESSAGE = (
        "brevo",
        "brevo_transactional_what_s_apps_end_message",
        False,
    )
    BREVO_USER_CHECK_PERMISSION = ("brevo", "brevo_user_check_permission", False)
    BREVO_USER_GET_ALL_USERS = ("brevo", "brevo_user_get_all_users", False)
    BREVO_USER_RESEND_INVITATION = ("brevo", "brevo_user_resend_invitation", False)
    BREVO_USER_REVOKE_PERMISSION_BY_EMAIL = (
        "brevo",
        "brevo_user_revoke_permission_by_email",
        False,
    )
    BREVO_USER_UPDATE_PERMISSIONS = ("brevo", "brevo_user_update_permissions", False)
    BREVO_USERS_END_INVITATION = ("brevo", "brevo_users_end_invitation", False)
    BREVO_WEB_HOOKS_CREATE_HOOK = ("brevo", "brevo_web_hooks_create_hook", False)
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
    BREVO_WEB_HOOKS_GET_ALL = ("brevo", "brevo_web_hooks_get_all", False)
    BREVO_WEB_HOOKS_GET_DETAILS = ("brevo", "brevo_web_hooks_get_details", False)
    BREVO_WEB_HOOKS_UPDATE_WEB_HOOK_BY_ID = (
        "brevo",
        "brevo_web_hooks_update_web_hook_by_id",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_CREATE_AND_SEND = (
        "brevo",
        "brevo_what_s_app_campaigns_create_and_send",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_CREATE_TEMPLATE = (
        "brevo",
        "brevo_what_s_app_campaigns_create_template",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_DELETE_CAMPAIGN = (
        "brevo",
        "brevo_what_s_app_campaigns_delete_campaign",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_GET_ACCOUNT_INFO = (
        "brevo",
        "brevo_what_s_app_campaigns_get_account_info",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_GET_ALL = (
        "brevo",
        "brevo_what_s_app_campaigns_get_all",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_GET_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_what_s_app_campaigns_get_campaign_by_id",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_GET_TEMPLATES = (
        "brevo",
        "brevo_what_s_app_campaigns_get_templates",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_SEND_TEMPLATE_FOR_APPROVAL = (
        "brevo",
        "brevo_what_s_app_campaigns_send_template_for_approval",
        False,
    )
    BREVO_WHAT_S_APP_CAMPAIGNS_UPDATE_CAMPAIGN_BY_ID = (
        "brevo",
        "brevo_what_s_app_campaigns_update_campaign_by_id",
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
    CLICKUP_AUTHORIZATION_GET_WORK_SPACE_LIST = (
        "clickup",
        "clickup_authorization_get_work_space_list",
        False,
    )
    CLICKUP_AUTHORIZATION_VIEW_ACCOUNT_DETAILS = (
        "clickup",
        "clickup_authorization_view_account_details",
        False,
    )
    CLICKUP_COMMENTS_ADD_TO_LIST_COMMENT = (
        "clickup",
        "clickup_comments_add_to_list_comment",
        False,
    )
    CLICKUP_COMMENTS_CREATE_CHAT_VIEW_COMMENT = (
        "clickup",
        "clickup_comments_create_chat_view_comment",
        False,
    )
    CLICKUP_COMMENTS_CREATE_NEW_TASK_COMMENT = (
        "clickup",
        "clickup_comments_create_new_task_comment",
        False,
    )
    CLICKUP_COMMENTS_DELETE_TASK_COMMENT = (
        "clickup",
        "clickup_comments_delete_task_comment",
        False,
    )
    CLICKUP_COMMENTS_GET_LIST_COMMENTS = (
        "clickup",
        "clickup_comments_get_list_comments",
        False,
    )
    CLICKUP_COMMENTS_GET_TASK_COMMENTS = (
        "clickup",
        "clickup_comments_get_task_comments",
        False,
    )
    CLICKUP_COMMENTS_GET_VIEW_COMMENTS = (
        "clickup",
        "clickup_comments_get_view_comments",
        False,
    )
    CLICKUP_COMMENTS_UPDATE_TASK_COMMENT = (
        "clickup",
        "clickup_comments_update_task_comment",
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
    CLICKUP_CUSTOM_TASK_TYPES_GET_AVAILABLE_TASK_TYPES = (
        "clickup",
        "clickup_custom_task_types_get_available_task_types",
        False,
    )
    CLICKUP_FOLDERS_CREATE_NEW_FOLDER = (
        "clickup",
        "clickup_folders_create_new_folder",
        False,
    )
    CLICKUP_FOLDERS_GET_CONTENTS_OF = (
        "clickup",
        "clickup_folders_get_contents_of",
        False,
    )
    CLICKUP_FOLDERS_GET_FOLDER_CONTENT = (
        "clickup",
        "clickup_folders_get_folder_content",
        False,
    )
    CLICKUP_FOLDERS_REMOVE_FOLDER = ("clickup", "clickup_folders_remove_folder", False)
    CLICKUP_FOLDERS_RENAME_FOLDER = ("clickup", "clickup_folders_rename_folder", False)
    CLICKUP_GOALS_ADD_KEY_RESULT = ("clickup", "clickup_goals_add_key_result", False)
    CLICKUP_GOALS_ADD_NEW_GOAL_TO_WORK_SPACE = (
        "clickup",
        "clickup_goals_add_new_goal_to_work_space",
        False,
    )
    CLICKUP_GOALS_GET_DETAILS = ("clickup", "clickup_goals_get_details", False)
    CLICKUP_GOALS_GET_WORK_SPACE_GOALS = (
        "clickup",
        "clickup_goals_get_work_space_goals",
        False,
    )
    CLICKUP_GOALS_REMOVE_GOAL = ("clickup", "clickup_goals_remove_goal", False)
    CLICKUP_GOALS_REMOVE_TARGET = ("clickup", "clickup_goals_remove_target", False)
    CLICKUP_GOALS_UPDATE_GOAL_DETAILS = (
        "clickup",
        "clickup_goals_update_goal_details",
        False,
    )
    CLICKUP_GOALS_UPDATE_KEY_RESULT = (
        "clickup",
        "clickup_goals_update_key_result",
        False,
    )
    CLICKUP_GUESTS_ADD_GUEST_TO_FOLDER = (
        "clickup",
        "clickup_guests_add_guest_to_folder",
        False,
    )
    CLICKUP_GUESTS_ADD_TO_TASK = ("clickup", "clickup_guests_add_to_task", False)
    CLICKUP_GUESTS_EDIT_GUEST_ON_WORK_SPACE = (
        "clickup",
        "clickup_guests_edit_guest_on_work_space",
        False,
    )
    CLICKUP_GUESTS_GET_GUEST_INFORMATION = (
        "clickup",
        "clickup_guests_get_guest_information",
        False,
    )
    CLICKUP_GUESTS_INVITE_TO_WORK_SPACE = (
        "clickup",
        "clickup_guests_invite_to_work_space",
        False,
    )
    CLICKUP_GUESTS_REMOVE_FROM_LIST = (
        "clickup",
        "clickup_guests_remove_from_list",
        False,
    )
    CLICKUP_GUESTS_REVOKE_ACCESS_FROM_FOLDER = (
        "clickup",
        "clickup_guests_revoke_access_from_folder",
        False,
    )
    CLICKUP_GUESTS_REVOKE_ACCESS_TO_TASK = (
        "clickup",
        "clickup_guests_revoke_access_to_task",
        False,
    )
    CLICKUP_GUESTS_REVOKE_GUEST_ACCESS_TO_WORK_SPACE = (
        "clickup",
        "clickup_guests_revoke_guest_access_to_work_space",
        False,
    )
    CLICKUP_GUESTS_SHARE_LIST_WITH = (
        "clickup",
        "clickup_guests_share_list_with",
        False,
    )
    CLICKUP_LISTS_ADD_TASK_TO_LIST = (
        "clickup",
        "clickup_lists_add_task_to_list",
        False,
    )
    CLICKUP_LISTS_ADD_TO_FOLDER = ("clickup", "clickup_lists_add_to_folder", False)
    CLICKUP_LISTS_CREATE_FOLDER_LESS_LIST = (
        "clickup",
        "clickup_lists_create_folder_less_list",
        False,
    )
    CLICKUP_LISTS_GET_FOLDER_LESS = ("clickup", "clickup_lists_get_folder_less", False)
    CLICKUP_LISTS_GET_FOLDER_LISTS = (
        "clickup",
        "clickup_lists_get_folder_lists",
        False,
    )
    CLICKUP_LISTS_GET_LIST_DETAILS = (
        "clickup",
        "clickup_lists_get_list_details",
        False,
    )
    CLICKUP_LISTS_REMOVE_LIST = ("clickup", "clickup_lists_remove_list", False)
    CLICKUP_LISTS_REMOVE_TASK_FROM_LIST = (
        "clickup",
        "clickup_lists_remove_task_from_list",
        False,
    )
    CLICKUP_LISTS_UPDATE_LIST_INFO_DUE_DATE_PRIORITY_ASSIGN_EE_COLOR = (
        "clickup",
        "clickup_lists_update_list_info_due_date_priority_assign_ee_color",
        False,
    )
    CLICKUP_MEMBERS_GET_LIST_USERS = (
        "clickup",
        "clickup_members_get_list_users",
        False,
    )
    CLICKUP_MEMBERS_GET_TASK_ACCESS = (
        "clickup",
        "clickup_members_get_task_access",
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
    CLICKUP_SPACES_ADD_NEW_SPACE_TO_WORK_SPACE = (
        "clickup",
        "clickup_spaces_add_new_space_to_work_space",
        False,
    )
    CLICKUP_SPACES_GET_DETAILS = ("clickup", "clickup_spaces_get_details", False)
    CLICKUP_SPACES_GET_SPACE_DETAILS = (
        "clickup",
        "clickup_spaces_get_space_details",
        False,
    )
    CLICKUP_SPACES_REMOVE_SPACE = ("clickup", "clickup_spaces_remove_space", False)
    CLICKUP_SPACES_UPDATE_DETAILS_AND_ENABLE_CLICK_APPS = (
        "clickup",
        "clickup_spaces_update_details_and_enable_click_apps",
        False,
    )
    CLICKUP_TAGS_ADD_TO_TASK = ("clickup", "clickup_tags_add_to_task", False)
    CLICKUP_TAGS_CREATE_SPACE_TAG = ("clickup", "clickup_tags_create_space_tag", False)
    CLICKUP_TAGS_GET_SPACE = ("clickup", "clickup_tags_get_space", False)
    CLICKUP_TAGS_REMOVE_FROM_TASK = ("clickup", "clickup_tags_remove_from_task", False)
    CLICKUP_TAGS_REMOVE_SPACE_TAG = ("clickup", "clickup_tags_remove_space_tag", False)
    CLICKUP_TAGS_UPDATE_SPACE_TAG = ("clickup", "clickup_tags_update_space_tag", False)
    CLICKUP_TASK_CHECKLISTS_ADD_LINE_ITEM = (
        "clickup",
        "clickup_task_checklists_add_line_item",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_CREATE_NEW_CHECKLIST = (
        "clickup",
        "clickup_task_checklists_create_new_checklist",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_REMOVE_CHECKLIST = (
        "clickup",
        "clickup_task_checklists_remove_checklist",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_REMOVE_CHECKLIST_ITEM = (
        "clickup",
        "clickup_task_checklists_remove_checklist_item",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_UPDATE_CHECKLIST = (
        "clickup",
        "clickup_task_checklists_update_checklist",
        False,
    )
    CLICKUP_TASK_CHECKLISTS_UPDATE_CHECKLIST_ITEM = (
        "clickup",
        "clickup_task_checklists_update_checklist_item",
        False,
    )
    CLICKUP_TASK_RELATIONSHIPS_ADD_DEPENDENCY = (
        "clickup",
        "clickup_task_relationships_add_dependency",
        False,
    )
    CLICKUP_TASK_RELATIONSHIPS_LINK_TASKS = (
        "clickup",
        "clickup_task_relationships_link_tasks",
        False,
    )
    CLICKUP_TASK_RELATIONSHIPS_REMOVE_DEPENDENCY = (
        "clickup",
        "clickup_task_relationships_remove_dependency",
        False,
    )
    CLICKUP_TASK_RELATIONSHIPS_REMOVE_LINK_BETWEEN_TASKS = (
        "clickup",
        "clickup_task_relationships_remove_link_between_tasks",
        False,
    )
    CLICKUP_TASK_TEMPLATES_CREATE_FROM_TEMPLATE = (
        "clickup",
        "clickup_task_templates_create_from_template",
        False,
    )
    CLICKUP_TASK_TEMPLATES_GET_TEMPLATES = (
        "clickup",
        "clickup_task_templates_get_templates",
        False,
    )
    CLICKUP_TASKS_CREATE_NEW_TASK = ("clickup", "clickup_tasks_create_new_task", False)
    CLICKUP_TASKS_FILTER_TEAM_TASKS = (
        "clickup",
        "clickup_tasks_filter_team_tasks",
        False,
    )
    CLICKUP_TASKS_GET_LIST_TASKS = ("clickup", "clickup_tasks_get_list_tasks", False)
    CLICKUP_TASKS_GET_TASK_DETAILS = (
        "clickup",
        "clickup_tasks_get_task_details",
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
    CLICKUP_TASKS_REMOVE_TASK_BY_ID = (
        "clickup",
        "clickup_tasks_remove_task_by_id",
        False,
    )
    CLICKUP_TASKS_UPDATE_TASK_FIELDS = (
        "clickup",
        "clickup_tasks_update_task_fields",
        False,
    )
    CLICKUP_TEAMS_USER_GROUPS_CREATE_TEAM = (
        "clickup",
        "clickup_teams_user_groups_create_team",
        False,
    )
    CLICKUP_TEAMS_USER_GROUPS_GET_USER_GROUPS = (
        "clickup",
        "clickup_teams_user_groups_get_user_groups",
        False,
    )
    CLICKUP_TEAMS_USER_GROUPS_REMOVE_GROUP = (
        "clickup",
        "clickup_teams_user_groups_remove_group",
        False,
    )
    CLICKUP_TEAMS_USER_GROUPS_UPDATE_USER_GROUP = (
        "clickup",
        "clickup_teams_user_groups_update_user_group",
        False,
    )
    CLICKUP_TEAMS_WORK_SPACES_GET_WORK_SPACE_PLAN = (
        "clickup",
        "clickup_teams_work_spaces_get_work_space_plan",
        False,
    )
    CLICKUP_TEAMS_WORK_SPACES_GET_WORK_SPACE_SEATS = (
        "clickup",
        "clickup_teams_work_spaces_get_work_space_seats",
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
    CLICKUP_TIME_TRACKING_CREATE_TIME_ENTRY = (
        "clickup",
        "clickup_time_tracking_create_time_entry",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_ALL_TAGS_FROM_TIME_ENTRIES = (
        "clickup",
        "clickup_time_tracking_get_all_tags_from_time_entries",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_CURRENT_TIME_ENTRY = (
        "clickup",
        "clickup_time_tracking_get_current_time_entry",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_SINGLE_TIME_ENTRY = (
        "clickup",
        "clickup_time_tracking_get_single_time_entry",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_TIME_ENTRIES_WITHIN_DATE_RANGE = (
        "clickup",
        "clickup_time_tracking_get_time_entries_within_date_range",
        False,
    )
    CLICKUP_TIME_TRACKING_GET_TIME_ENTRY_HISTORY = (
        "clickup",
        "clickup_time_tracking_get_time_entry_history",
        False,
    )
    CLICKUP_TIME_TRACKING_LEGACY_EDIT_TIME_TRACKED = (
        "clickup",
        "clickup_time_tracking_legacy_edit_time_tracked",
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
    CLICKUP_TIME_TRACKING_LEGACY_REMOVE_TRACKED_TIME = (
        "clickup",
        "clickup_time_tracking_legacy_remove_tracked_time",
        False,
    )
    CLICKUP_TIME_TRACKING_REMOVE_ENTRY = (
        "clickup",
        "clickup_time_tracking_remove_entry",
        False,
    )
    CLICKUP_TIME_TRACKING_REMOVE_TAGS_FROM_TIME_ENTRIES = (
        "clickup",
        "clickup_time_tracking_remove_tags_from_time_entries",
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
    CLICKUP_TIME_TRACKING_UPDATE_TIME_ENTRY_DETAILS = (
        "clickup",
        "clickup_time_tracking_update_time_entry_details",
        False,
    )
    CLICKUP_USERS_DEACTIVATE_FROM_WORK_SPACE = (
        "clickup",
        "clickup_users_deactivate_from_work_space",
        False,
    )
    CLICKUP_USERS_GET_USER_DETAILS = (
        "clickup",
        "clickup_users_get_user_details",
        False,
    )
    CLICKUP_USERS_INVITE_USER_TO_WORK_SPACE = (
        "clickup",
        "clickup_users_invite_user_to_work_space",
        False,
    )
    CLICKUP_USERS_UPDATE_USER_DETAILS = (
        "clickup",
        "clickup_users_update_user_details",
        False,
    )
    CLICKUP_VIEWS_DELETE_VIEW_BY_ID = (
        "clickup",
        "clickup_views_delete_view_by_id",
        False,
    )
    CLICKUP_VIEWS_FOLDER_VIEWS_GET = (
        "clickup",
        "clickup_views_folder_views_get",
        False,
    )
    CLICKUP_VIEWS_GET_EVERYTHING_LEVEL = (
        "clickup",
        "clickup_views_get_everything_level",
        False,
    )
    CLICKUP_VIEWS_GET_LIST_VIEWS = ("clickup", "clickup_views_get_list_views", False)
    CLICKUP_VIEWS_GET_TASKS_IN_VIEW = (
        "clickup",
        "clickup_views_get_tasks_in_view",
        False,
    )
    CLICKUP_VIEWS_GET_VIEW_INFO = ("clickup", "clickup_views_get_view_info", False)
    CLICKUP_VIEWS_SPACE_VIEWS_GET = ("clickup", "clickup_views_space_views_get", False)
    CLICKUP_WEB_HOOKS_CREATE_WEB_HOOK = (
        "clickup",
        "clickup_web_hooks_create_web_hook",
        False,
    )
    CLICKUP_WEB_HOOKS_REMOVE_WEB_HOOK_BY_ID = (
        "clickup",
        "clickup_web_hooks_remove_web_hook_by_id",
        False,
    )
    CLICKUP_WEB_HOOKS_UPDATE_EVENTS_TO_MONITOR = (
        "clickup",
        "clickup_web_hooks_update_events_to_monitor",
        False,
    )
    CLICKUP_WEB_HOOKS_WORK_SPACE_GET = (
        "clickup",
        "clickup_web_hooks_work_space_get",
        False,
    )
    CODEINTERPRETER_CREATE_SANDBOX = (
        "codeinterpreter",
        "codeinterpreter_create_sandbox",
        True,
    )
    CODEINTERPRETER_EXECUTE_CODE = (
        "codeinterpreter",
        "codeinterpreter_execute_code",
        True,
    )
    CODEINTERPRETER_GET_FILE_CMD = (
        "codeinterpreter",
        "codeinterpreter_get_file_cmd",
        True,
    )
    CODEINTERPRETER_RUN_TERMINAL_CMD = (
        "codeinterpreter",
        "codeinterpreter_run_terminal_cmd",
        True,
    )
    COMPOSIO_CHECK_ACTIVE_CONNECTION = (
        "composio",
        "composio_check_active_connection",
        True,
    )
    COMPOSIO_INITIATE_CONNECTION = ("composio", "composio_initiate_connection", True)
    COMPOSIO_RETRIEVE_ACTIONS = ("composio", "composio_retrieve_actions", True)
    COMPOSIO_RETRIEVE_APPS = ("composio", "composio_retrieve_apps", True)
    COMPOSIO_WAIT_FOR_CONNECTION = ("composio", "composio_wait_for_connection", True)
    DISCORD_ADDGROUPDMUSER = ("discord", "discord_addgroupdmuser", False)
    DISCORD_ADDGUILDMEMBER = ("discord", "discord_addguildmember", False)
    DISCORD_ADDGUILDMEMBERROLE = ("discord", "discord_addguildmemberrole", False)
    DISCORD_ADDMYMESSAGEREACTION = ("discord", "discord_addmymessagereaction", False)
    DISCORD_ADDTHREADMEMBER = ("discord", "discord_addthreadmember", False)
    DISCORD_BANUSERFROMGUILD = ("discord", "discord_banuserfromguild", False)
    DISCORD_BULKBANUSERSFROMGUILD = ("discord", "discord_bulkbanusersfromguild", False)
    DISCORD_BULKDELETEMESSAGES = ("discord", "discord_bulkdeletemessages", False)
    DISCORD_CREATEAPPLICATIONCOMMAND = (
        "discord",
        "discord_createapplicationcommand",
        False,
    )
    DISCORD_CREATEAUTOMODERATIONRULE = (
        "discord",
        "discord_createautomoderationrule",
        False,
    )
    DISCORD_CREATEDM = ("discord", "discord_createdm", False)
    DISCORD_CREATEGUILD = ("discord", "discord_createguild", False)
    DISCORD_CREATEGUILDAPPLICATIONCOMMAND = (
        "discord",
        "discord_createguildapplicationcommand",
        False,
    )
    DISCORD_CREATEGUILDCHANNEL = ("discord", "discord_createguildchannel", False)
    DISCORD_CREATEGUILDEMOJI = ("discord", "discord_createguildemoji", False)
    DISCORD_CREATEGUILDFROMTEMPLATE = (
        "discord",
        "discord_createguildfromtemplate",
        False,
    )
    DISCORD_CREATEGUILDROLE = ("discord", "discord_createguildrole", False)
    DISCORD_CREATEGUILDSCHEDULEDEVENT = (
        "discord",
        "discord_createguildscheduledevent",
        False,
    )
    DISCORD_CREATEGUILDSTICKER = ("discord", "discord_createguildsticker", False)
    DISCORD_CREATEGUILDTEMPLATE = ("discord", "discord_createguildtemplate", False)
    DISCORD_CREATEMESSAGE = ("discord", "discord_createmessage", False)
    DISCORD_CREATESTAGEINSTANCE = ("discord", "discord_createstageinstance", False)
    DISCORD_CREATETHREADFROMMESSAGE = (
        "discord",
        "discord_createthreadfrommessage",
        False,
    )
    DISCORD_CREATEWEBHOOK = ("discord", "discord_createwebhook", False)
    DISCORD_CROSSPOSTMESSAGE = ("discord", "discord_crosspostmessage", False)
    DISCORD_DELETEALLMESSAGEREACTIONS = (
        "discord",
        "discord_deleteallmessagereactions",
        False,
    )
    DISCORD_DELETEALLMESSAGEREACTIONSBYEMOJI = (
        "discord",
        "discord_deleteallmessagereactionsbyemoji",
        False,
    )
    DISCORD_DELETEAPPLICATIONCOMMAND = (
        "discord",
        "discord_deleteapplicationcommand",
        False,
    )
    DISCORD_DELETEAUTOMODERATIONRULE = (
        "discord",
        "discord_deleteautomoderationrule",
        False,
    )
    DISCORD_DELETECHANNEL = ("discord", "discord_deletechannel", False)
    DISCORD_DELETECHANNELPERMISSIONOVERWRITE = (
        "discord",
        "discord_deletechannelpermissionoverwrite",
        False,
    )
    DISCORD_DELETEGROUPDMUSER = ("discord", "discord_deletegroupdmuser", False)
    DISCORD_DELETEGUILD = ("discord", "discord_deleteguild", False)
    DISCORD_DELETEGUILDAPPLICATIONCOMMAND = (
        "discord",
        "discord_deleteguildapplicationcommand",
        False,
    )
    DISCORD_DELETEGUILDEMOJI = ("discord", "discord_deleteguildemoji", False)
    DISCORD_DELETEGUILDINTEGRATION = (
        "discord",
        "discord_deleteguildintegration",
        False,
    )
    DISCORD_DELETEGUILDMEMBER = ("discord", "discord_deleteguildmember", False)
    DISCORD_DELETEGUILDMEMBERROLE = ("discord", "discord_deleteguildmemberrole", False)
    DISCORD_DELETEGUILDROLE = ("discord", "discord_deleteguildrole", False)
    DISCORD_DELETEGUILDSCHEDULEDEVENT = (
        "discord",
        "discord_deleteguildscheduledevent",
        False,
    )
    DISCORD_DELETEGUILDSTICKER = ("discord", "discord_deleteguildsticker", False)
    DISCORD_DELETEGUILDTEMPLATE = ("discord", "discord_deleteguildtemplate", False)
    DISCORD_DELETEMESSAGE = ("discord", "discord_deletemessage", False)
    DISCORD_DELETEMYMESSAGEREACTION = (
        "discord",
        "discord_deletemymessagereaction",
        False,
    )
    DISCORD_DELETEORIGINALWEBHOOKMESSAGE = (
        "discord",
        "discord_deleteoriginalwebhookmessage",
        False,
    )
    DISCORD_DELETESTAGEINSTANCE = ("discord", "discord_deletestageinstance", False)
    DISCORD_DELETETHREADMEMBER = ("discord", "discord_deletethreadmember", False)
    DISCORD_DELETEUSERMESSAGEREACTION = (
        "discord",
        "discord_deleteusermessagereaction",
        False,
    )
    DISCORD_DELETEWEBHOOK = ("discord", "discord_deletewebhook", False)
    DISCORD_DELETEWEBHOOKBYTOKEN = ("discord", "discord_deletewebhookbytoken", False)
    DISCORD_DELETEWEBHOOKMESSAGE = ("discord", "discord_deletewebhookmessage", False)
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
    DISCORD_FOLLOWCHANNEL = ("discord", "discord_followchannel", False)
    DISCORD_GETACTIVEGUILDTHREADS = ("discord", "discord_getactiveguildthreads", False)
    DISCORD_GETAPPLICATION = ("discord", "discord_getapplication", False)
    DISCORD_GETAPPLICATIONCOMMAND = ("discord", "discord_getapplicationcommand", False)
    DISCORD_GETAPPLICATIONROLECONNECTIONSMETADATA = (
        "discord",
        "discord_getapplicationroleconnectionsmetadata",
        False,
    )
    DISCORD_GETAPPLICATIONUSERROLECONNECTION = (
        "discord",
        "discord_getapplicationuserroleconnection",
        False,
    )
    DISCORD_GETAUTOMODERATIONRULE = ("discord", "discord_getautomoderationrule", False)
    DISCORD_GETBOTGATEWAY = ("discord", "discord_getbotgateway", False)
    DISCORD_GETCHANNEL = ("discord", "discord_getchannel", False)
    DISCORD_GETGATEWAY = ("discord", "discord_getgateway", False)
    DISCORD_GETGUILD = ("discord", "discord_getguild", False)
    DISCORD_GETGUILDAPPLICATIONCOMMAND = (
        "discord",
        "discord_getguildapplicationcommand",
        False,
    )
    DISCORD_GETGUILDAPPLICATIONCOMMANDPERMISSIONS = (
        "discord",
        "discord_getguildapplicationcommandpermissions",
        False,
    )
    DISCORD_GETGUILDBAN = ("discord", "discord_getguildban", False)
    DISCORD_GETGUILDEMOJI = ("discord", "discord_getguildemoji", False)
    DISCORD_GETGUILDMEMBER = ("discord", "discord_getguildmember", False)
    DISCORD_GETGUILDNEWMEMBERWELCOME = (
        "discord",
        "discord_getguildnewmemberwelcome",
        False,
    )
    DISCORD_GETGUILDPREVIEW = ("discord", "discord_getguildpreview", False)
    DISCORD_GETGUILDSCHEDULEDEVENT = (
        "discord",
        "discord_getguildscheduledevent",
        False,
    )
    DISCORD_GETGUILDSONBOARDING = ("discord", "discord_getguildsonboarding", False)
    DISCORD_GETGUILDSTICKER = ("discord", "discord_getguildsticker", False)
    DISCORD_GETGUILDTEMPLATE = ("discord", "discord_getguildtemplate", False)
    DISCORD_GETGUILDVANITYURL = ("discord", "discord_getguildvanityurl", False)
    DISCORD_GETGUILDWEBHOOKS = ("discord", "discord_getguildwebhooks", False)
    DISCORD_GETGUILDWELCOMESCREEN = ("discord", "discord_getguildwelcomescreen", False)
    DISCORD_GETGUILDWIDGET = ("discord", "discord_getguildwidget", False)
    DISCORD_GETGUILDWIDGETPNG = ("discord", "discord_getguildwidgetpng", False)
    DISCORD_GETGUILDWIDGETSETTINGS = (
        "discord",
        "discord_getguildwidgetsettings",
        False,
    )
    DISCORD_GETMESSAGE = ("discord", "discord_getmessage", False)
    DISCORD_GETMYAPPLICATION = ("discord", "discord_getmyapplication", False)
    DISCORD_GETMYGUILDMEMBER = ("discord", "discord_getmyguildmember", False)
    DISCORD_GETMYOAUTH2APPLICATION = (
        "discord",
        "discord_getmyoauth2application",
        False,
    )
    DISCORD_GETMYOAUTH2AUTHORIZATION = (
        "discord",
        "discord_getmyoauth2authorization",
        False,
    )
    DISCORD_GETMYUSER = ("discord", "discord_getmyuser", False)
    DISCORD_GETORIGINALWEBHOOKMESSAGE = (
        "discord",
        "discord_getoriginalwebhookmessage",
        False,
    )
    DISCORD_GETPUBLICKEYS = ("discord", "discord_getpublickeys", False)
    DISCORD_GETSTAGEINSTANCE = ("discord", "discord_getstageinstance", False)
    DISCORD_GETSTICKER = ("discord", "discord_getsticker", False)
    DISCORD_GETTHREADMEMBER = ("discord", "discord_getthreadmember", False)
    DISCORD_GETUSER = ("discord", "discord_getuser", False)
    DISCORD_GETWEBHOOK = ("discord", "discord_getwebhook", False)
    DISCORD_GETWEBHOOKBYTOKEN = ("discord", "discord_getwebhookbytoken", False)
    DISCORD_GETWEBHOOKMESSAGE = ("discord", "discord_getwebhookmessage", False)
    DISCORD_INVITERESOLVE = ("discord", "discord_inviteresolve", False)
    DISCORD_INVITEREVOKE = ("discord", "discord_inviterevoke", False)
    DISCORD_JOINTHREAD = ("discord", "discord_jointhread", False)
    DISCORD_LEAVEGUILD = ("discord", "discord_leaveguild", False)
    DISCORD_LEAVETHREAD = ("discord", "discord_leavethread", False)
    DISCORD_LISTAPPLICATIONCOMMANDS = (
        "discord",
        "discord_listapplicationcommands",
        False,
    )
    DISCORD_LISTAUTOMODERATIONRULES = (
        "discord",
        "discord_listautomoderationrules",
        False,
    )
    DISCORD_LISTCHANNELINVITES = ("discord", "discord_listchannelinvites", False)
    DISCORD_LISTCHANNELWEBHOOKS = ("discord", "discord_listchannelwebhooks", False)
    DISCORD_LISTGUILDAPPLICATIONCOMMANDPERMISSIONS = (
        "discord",
        "discord_listguildapplicationcommandpermissions",
        False,
    )
    DISCORD_LISTGUILDAPPLICATIONCOMMANDS = (
        "discord",
        "discord_listguildapplicationcommands",
        False,
    )
    DISCORD_LISTGUILDAUDITLOGENTRIES = (
        "discord",
        "discord_listguildauditlogentries",
        False,
    )
    DISCORD_LISTGUILDBANS = ("discord", "discord_listguildbans", False)
    DISCORD_LISTGUILDCHANNELS = ("discord", "discord_listguildchannels", False)
    DISCORD_LISTGUILDEMOJIS = ("discord", "discord_listguildemojis", False)
    DISCORD_LISTGUILDINTEGRATIONS = ("discord", "discord_listguildintegrations", False)
    DISCORD_LISTGUILDINVITES = ("discord", "discord_listguildinvites", False)
    DISCORD_LISTGUILDMEMBERS = ("discord", "discord_listguildmembers", False)
    DISCORD_LISTGUILDROLES = ("discord", "discord_listguildroles", False)
    DISCORD_LISTGUILDSCHEDULEDEVENTS = (
        "discord",
        "discord_listguildscheduledevents",
        False,
    )
    DISCORD_LISTGUILDSCHEDULEDEVENTUSERS = (
        "discord",
        "discord_listguildscheduledeventusers",
        False,
    )
    DISCORD_LISTGUILDSTICKERS = ("discord", "discord_listguildstickers", False)
    DISCORD_LISTGUILDTEMPLATES = ("discord", "discord_listguildtemplates", False)
    DISCORD_LISTGUILDVOICEREGIONS = ("discord", "discord_listguildvoiceregions", False)
    DISCORD_LISTMESSAGEREACTIONSBYEMOJI = (
        "discord",
        "discord_listmessagereactionsbyemoji",
        False,
    )
    DISCORD_LISTMESSAGES = ("discord", "discord_listmessages", False)
    DISCORD_LISTMYCONNECTIONS = ("discord", "discord_listmyconnections", False)
    DISCORD_LISTMYGUILDS = ("discord", "discord_listmyguilds", False)
    DISCORD_LISTMYPRIVATEARCHIVEDTHREADS = (
        "discord",
        "discord_listmyprivatearchivedthreads",
        False,
    )
    DISCORD_LISTPINNEDMESSAGES = ("discord", "discord_listpinnedmessages", False)
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
    DISCORD_LISTSTICKERPACKS = ("discord", "discord_liststickerpacks", False)
    DISCORD_LISTTHREADMEMBERS = ("discord", "discord_listthreadmembers", False)
    DISCORD_LISTVOICEREGIONS = ("discord", "discord_listvoiceregions", False)
    DISCORD_PINMESSAGE = ("discord", "discord_pinmessage", False)
    DISCORD_PREVIEWPRUNEGUILD = ("discord", "discord_previewpruneguild", False)
    DISCORD_PRUNEGUILD = ("discord", "discord_pruneguild", False)
    DISCORD_PUTGUILDSONBOARDING = ("discord", "discord_putguildsonboarding", False)
    DISCORD_SEARCHGUILDMEMBERS = ("discord", "discord_searchguildmembers", False)
    DISCORD_SETCHANNELPERMISSIONOVERWRITE = (
        "discord",
        "discord_setchannelpermissionoverwrite",
        False,
    )
    DISCORD_SETGUILDAPPLICATIONCOMMANDPERMISSIONS = (
        "discord",
        "discord_setguildapplicationcommandpermissions",
        False,
    )
    DISCORD_SETGUILDMFALEVEL = ("discord", "discord_setguildmfalevel", False)
    DISCORD_SYNCGUILDTEMPLATE = ("discord", "discord_syncguildtemplate", False)
    DISCORD_TRIGGERTYPINGINDICATOR = (
        "discord",
        "discord_triggertypingindicator",
        False,
    )
    DISCORD_UNBANUSERFROMGUILD = ("discord", "discord_unbanuserfromguild", False)
    DISCORD_UNPINMESSAGE = ("discord", "discord_unpinmessage", False)
    DISCORD_UPDATEAPPLICATION = ("discord", "discord_updateapplication", False)
    DISCORD_UPDATEAPPLICATIONCOMMAND = (
        "discord",
        "discord_updateapplicationcommand",
        False,
    )
    DISCORD_UPDATEAPPLICATIONUSERROLECONNECTION = (
        "discord",
        "discord_updateapplicationuserroleconnection",
        False,
    )
    DISCORD_UPDATEGUILD = ("discord", "discord_updateguild", False)
    DISCORD_UPDATEGUILDAPPLICATIONCOMMAND = (
        "discord",
        "discord_updateguildapplicationcommand",
        False,
    )
    DISCORD_UPDATEGUILDEMOJI = ("discord", "discord_updateguildemoji", False)
    DISCORD_UPDATEGUILDMEMBER = ("discord", "discord_updateguildmember", False)
    DISCORD_UPDATEGUILDROLE = ("discord", "discord_updateguildrole", False)
    DISCORD_UPDATEGUILDSTICKER = ("discord", "discord_updateguildsticker", False)
    DISCORD_UPDATEGUILDTEMPLATE = ("discord", "discord_updateguildtemplate", False)
    DISCORD_UPDATEGUILDWELCOMESCREEN = (
        "discord",
        "discord_updateguildwelcomescreen",
        False,
    )
    DISCORD_UPDATEGUILDWIDGETSETTINGS = (
        "discord",
        "discord_updateguildwidgetsettings",
        False,
    )
    DISCORD_UPDATEMESSAGE = ("discord", "discord_updatemessage", False)
    DISCORD_UPDATEMYAPPLICATION = ("discord", "discord_updatemyapplication", False)
    DISCORD_UPDATEMYGUILDMEMBER = ("discord", "discord_updatemyguildmember", False)
    DISCORD_UPDATEMYUSER = ("discord", "discord_updatemyuser", False)
    DISCORD_UPDATEORIGINALWEBHOOKMESSAGE = (
        "discord",
        "discord_updateoriginalwebhookmessage",
        False,
    )
    DISCORD_UPDATESELFVOICESTATE = ("discord", "discord_updateselfvoicestate", False)
    DISCORD_UPDATESTAGEINSTANCE = ("discord", "discord_updatestageinstance", False)
    DISCORD_UPDATEVOICESTATE = ("discord", "discord_updatevoicestate", False)
    DISCORD_UPDATEWEBHOOK = ("discord", "discord_updatewebhook", False)
    DISCORD_UPDATEWEBHOOKBYTOKEN = ("discord", "discord_updatewebhookbytoken", False)
    DISCORD_UPDATEWEBHOOKMESSAGE = ("discord", "discord_updatewebhookmessage", False)
    DROPBOX_GET_ABOUT_ME = ("dropbox", "dropbox_get_about_me", False)
    ELEVENLABS_ADD_A_PRONUNCIATION_DICTIONARY_V_1_PRONUNCIATION_DICTIONARIES_ADD_FROM_FILE_POST = (
        "elevenlabs",
        "elevenlabs_add_a_pronunciation_dictionary_v_1_pronunciation_dictionaries_add_from_file_post",
        False,
    )
    ELEVENLABS_ADD_PROJECT_V_1_PROJECTS_ADD_POST = (
        "elevenlabs",
        "elevenlabs_add_project_v_1_projects_add_post",
        False,
    )
    ELEVENLABS_ADD_RULES_TO_THE_PRONUNCIATION_DICTIONARY_V_1_PRONUNCIATION_DICTIONARIES_PRONUNCIATION_DICTIONARY_ID_ADD_RULES_POST = (
        "elevenlabs",
        "elevenlabs_add_rules_to_the_pronunciation_dictionary_v_1_pronunciation_dictionaries_pronunciation_dictionary_id_add_rules_post",
        False,
    )
    ELEVENLABS_ADD_SHARING_VOICE_V_1_VOICES_ADD_PUBLIC_USE_RID_VOICE_ID_POST = (
        "elevenlabs",
        "elevenlabs_add_sharing_voice_v_1_voices_add_public_use_rid_voice_id_post",
        False,
    )
    ELEVENLABS_ADD_VOICE_V_1_VOICES_ADD_POST = (
        "elevenlabs",
        "elevenlabs_add_voice_v_1_voices_add_post",
        False,
    )
    ELEVENLABS_CONVERT_CHAPTER_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_CONVERT_POST = (
        "elevenlabs",
        "elevenlabs_convert_chapter_v_1_projects_project_id_chapters_chapter_id_convert_post",
        False,
    )
    ELEVENLABS_CONVERT_PROJECT_V_1_PROJECTS_PROJECT_ID_CONVERT_POST = (
        "elevenlabs",
        "elevenlabs_convert_project_v_1_projects_project_id_convert_post",
        False,
    )
    ELEVENLABS_CREATE_A_PREVIOUSLY_GENERATED_VOICE_V_1_VOICE_GENERATION_CREATE_VOICE_POST = (
        "elevenlabs",
        "elevenlabs_create_a_previously_generated_voice_v_1_voice_generation_create_voice_post",
        False,
    )
    ELEVENLABS_CREATES_AUDIO_NATIVE_ENABLED_PROJECT_V_1_AUDIO_NATIVE_POST = (
        "elevenlabs",
        "elevenlabs_creates_audio_native_enabled_project_v_1_audio_native_post",
        False,
    )
    ELEVENLABS_DELETE_CHAPTER_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_chapter_v_1_projects_project_id_chapters_chapter_id_delete",
        False,
    )
    ELEVENLABS_DELETE_DUBBING_PROJECT_V_1_DUBBING_DUBBING_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_dubbing_project_v_1_dubbing_dubbing_id_delete",
        False,
    )
    ELEVENLABS_DELETE_HISTORY_ITEM_V_1_HISTORY_HISTORY_ITEMID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_history_item_v_1_history_history_itemid_delete",
        False,
    )
    ELEVENLABS_DELETE_PROJECT_V_1_PROJECTS_PROJECT_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_project_v_1_projects_project_id_delete",
        False,
    )
    ELEVENLABS_DELETE_SAMPLE_V_1_VOICES_VOICE_ID_SAMPLES_SAMPLE_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_sample_v_1_voices_voice_id_samples_sample_id_delete",
        False,
    )
    ELEVENLABS_DELETE_VOICE_V_1_VOICES_VOICE_ID_DELETE = (
        "elevenlabs",
        "elevenlabs_delete_voice_v_1_voices_voice_id_delete",
        False,
    )
    ELEVENLABS_DOWNLOAD_HISTORY_ITEMS_V_1_HISTORY_DOWNLOAD_POST = (
        "elevenlabs",
        "elevenlabs_download_history_items_v_1_history_download_post",
        False,
    )
    ELEVENLABS_DUB_A_VIDEO_OR_AN_AUDIOFILE_V_1_DUBBING_POST = (
        "elevenlabs",
        "elevenlabs_dub_a_video_or_an_audiofile_v_1_dubbing_post",
        False,
    )
    ELEVENLABS_EDIT_VOICE_SETTINGS_V_1_VOICES_VOICE_ID_SETTINGS_EDIT_POST = (
        "elevenlabs",
        "elevenlabs_edit_voice_settings_v_1_voices_voice_id_settings_edit_post",
        False,
    )
    ELEVENLABS_EDIT_VOICE_V_1_VOICES_VOICE_ID_EDIT_POST = (
        "elevenlabs",
        "elevenlabs_edit_voice_v_1_voices_voice_id_edit_post",
        False,
    )
    ELEVENLABS_GENERATE_A_RANDOM_VOICE_V_1_VOICE_GENERATION_GENERATE_VOICE_POST = (
        "elevenlabs",
        "elevenlabs_generate_a_random_voice_v_1_voice_generation_generate_voice_post",
        False,
    )
    ELEVENLABS_GET_A_PROFILE_PAGE_PROFILE_HANDLE_GET = (
        "elevenlabs",
        "elevenlabs_get_a_profile_page_profile_handle_get",
        False,
    )
    ELEVENLABS_GET_AUDIO_FROM_HISTORY_ITEM_V_1_HISTORY_HISTORY_ITEMID_AUDIO_GET = (
        "elevenlabs",
        "elevenlabs_get_audio_from_history_item_v_1_history_history_itemid_audio_get",
        False,
    )
    ELEVENLABS_GET_AUDIO_FROM_SAMPLE_V_1_VOICES_VOICE_ID_SAMPLES_SAMPLE_ID_AUDIO_GET = (
        "elevenlabs",
        "elevenlabs_get_audio_from_sample_v_1_voices_voice_id_samples_sample_id_audio_get",
        False,
    )
    ELEVENLABS_GET_CHAPTER_BY_ID_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_chapter_by_id_v_1_projects_project_id_chapters_chapter_id_get",
        False,
    )
    ELEVENLABS_GET_CHAPTER_SNAPSHOTS_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_SNAPSHOTS_GET = (
        "elevenlabs",
        "elevenlabs_get_chapter_snapshots_v_1_projects_project_id_chapters_chapter_id_snapshots_get",
        False,
    )
    ELEVENLABS_GET_CHAPTERS_V_1_PROJECTS_PROJECT_ID_CHAPTERS_GET = (
        "elevenlabs",
        "elevenlabs_get_chapters_v_1_projects_project_id_chapters_get",
        False,
    )
    ELEVENLABS_GET_DEFAULT_VOICE_SETTINGS_V_1_VOICES_SETTINGS_DEFAULT_GET = (
        "elevenlabs",
        "elevenlabs_get_default_voice_settings_v_1_voices_settings_default_get",
        False,
    )
    ELEVENLABS_GET_DUBBED_FILE_V_1_DUBBING_DUBBING_ID_AUDIO_LANGUAGE_CODE_GET = (
        "elevenlabs",
        "elevenlabs_get_dubbed_file_v_1_dubbing_dubbing_id_audio_language_code_get",
        False,
    )
    ELEVENLABS_GET_DUBBING_PROJECT_METADATA_V_1_DUBBING_DUBBING_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_dubbing_project_metadata_v_1_dubbing_dubbing_id_get",
        False,
    )
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
    ELEVENLABS_GET_METADATA_FOR_A_PRONUNCIATION_DICTIONARY_V_1_PRONUNCIATION_DICTIONARIES_PRONUNCIATION_DICTIONARY_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_metadata_for_a_pronunciation_dictionary_v_1_pronunciation_dictionaries_pronunciation_dictionary_id_get",
        False,
    )
    ELEVENLABS_GET_MODELS_V_1_MODELS_GET = (
        "elevenlabs",
        "elevenlabs_get_models_v_1_models_get",
        False,
    )
    ELEVENLABS_GET_PL_S_FILE_WITH_A_PRONUNCIATION_DICTIONARY_VERSION_RULES_V_1_PRONUNCIATION_DICTIONARIES_DICTIONARY_ID_VERSION_ID_DOWNLOAD_GET = (
        "elevenlabs",
        "elevenlabs_get_pl_s_file_with_a_pronunciation_dictionary_version_rules_v_1_pronunciation_dictionaries_dictionary_id_version_id_download_get",
        False,
    )
    ELEVENLABS_GET_PROJECT_BY_ID_V_1_PROJECTS_PROJECT_ID_GET = (
        "elevenlabs",
        "elevenlabs_get_project_by_id_v_1_projects_project_id_get",
        False,
    )
    ELEVENLABS_GET_PROJECT_SNAPSHOTS_V_1_PROJECTS_PROJECT_ID_SNAPSHOTS_GET = (
        "elevenlabs",
        "elevenlabs_get_project_snapshots_v_1_projects_project_id_snapshots_get",
        False,
    )
    ELEVENLABS_GET_PROJECTS_V_1_PROJECTS_GET = (
        "elevenlabs",
        "elevenlabs_get_projects_v_1_projects_get",
        False,
    )
    ELEVENLABS_GET_PRONUNCIATION_DICTIONARIES_V_1_PRONUNCIATION_DICTIONARIES_GET = (
        "elevenlabs",
        "elevenlabs_get_pronunciation_dictionaries_v_1_pronunciation_dictionaries_get",
        False,
    )
    ELEVENLABS_GET_TRANSCRIPT_FOR_DUB_V_1_DUBBING_DUBBING_ID_TRANSCRIPT_LANGUAGE_CODE_GET = (
        "elevenlabs",
        "elevenlabs_get_transcript_for_dub_v_1_dubbing_dubbing_id_transcript_language_code_get",
        False,
    )
    ELEVENLABS_GET_USER_INFO_V_1_USER_GET = (
        "elevenlabs",
        "elevenlabs_get_user_info_v_1_user_get",
        False,
    )
    ELEVENLABS_GET_USER_SUBSCRIPTION_INFO_V_1_USER_SUBSCRIPTION_GET = (
        "elevenlabs",
        "elevenlabs_get_user_subscription_info_v_1_user_subscription_get",
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
    ELEVENLABS_GET_VOICES_V_1_SHARED_VOICES_GET = (
        "elevenlabs",
        "elevenlabs_get_voices_v_1_shared_voices_get",
        False,
    )
    ELEVENLABS_GET_VOICES_V_1_VOICES_GET = (
        "elevenlabs",
        "elevenlabs_get_voices_v_1_voices_get",
        False,
    )
    ELEVENLABS_GETS_SO_PROVIDER_ADMIN_ADMIN_ADMIN_URL_PREFIX_S_SO_PROVIDER_GET = (
        "elevenlabs",
        "elevenlabs_gets_so_provider_admin_admin_admin_url_prefix_s_so_provider_get",
        False,
    )
    ELEVENLABS_REDIRECT_TO_MINT_LI_FY_DOCS_GET = (
        "elevenlabs",
        "elevenlabs_redirect_to_mint_li_fy_docs_get",
        False,
    )
    ELEVENLABS_REMOVE_RULES_FROM_THE_PRONUNCIATION_DICTIONARY_V_1_PRONUNCIATION_DICTIONARIES_PRONUNCIATION_DICTIONARY_ID_REMOVE_RULES_POST = (
        "elevenlabs",
        "elevenlabs_remove_rules_from_the_pronunciation_dictionary_v_1_pronunciation_dictionaries_pronunciation_dictionary_id_remove_rules_post",
        False,
    )
    ELEVENLABS_SPEECH_TO_SPEECH_STREAMING_V_1_SPEECH_TO_SPEECH_VOICE_ID_STREAM_POST = (
        "elevenlabs",
        "elevenlabs_speech_to_speech_streaming_v_1_speech_to_speech_voice_id_stream_post",
        False,
    )
    ELEVENLABS_SPEECH_TO_SPEECH_V_1_SPEECH_TO_SPEECH_VOICE_ID_POST = (
        "elevenlabs",
        "elevenlabs_speech_to_speech_v_1_speech_to_speech_voice_id_post",
        False,
    )
    ELEVENLABS_STREAM_CHAPTER_AUDIO_V_1_PROJECTS_PROJECT_ID_CHAPTERS_CHAPTER_ID_SNAPSHOTS_CHAPTER_SNAPSHOT_ID_STREAM_POST = (
        "elevenlabs",
        "elevenlabs_stream_chapter_audio_v_1_projects_project_id_chapters_chapter_id_snapshots_chapter_snapshot_id_stream_post",
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
    ELEVENLABS_UPDATE_PRONUNCIATION_DICTIONARIES_V_1_PROJECTS_PROJECT_ID_UPDATE_PRONUNCIATION_DICTIONARIES_POST = (
        "elevenlabs",
        "elevenlabs_update_pronunciation_dictionaries_v_1_projects_project_id_update_pronunciation_dictionaries_post",
        False,
    )
    ELEVENLABS_VOICE_GENERATION_PARAMETERS_V_1_VOICE_GENERATION_GENERATE_VOICE_PARAMETERS_GET = (
        "elevenlabs",
        "elevenlabs_voice_generation_parameters_v_1_voice_generation_generate_voice_parameters_get",
        False,
    )
    EXA_SEARCH = ("exa", "exa_search", False)
    EXA_SIMILARLINK = ("exa", "exa_similarlink", False)
    FIGMA_DELETE_COMMENT = ("figma", "figma_delete_comment", False)
    FIGMA_DELETE_COMMENT_REACTION = ("figma", "figma_delete_comment_reaction", False)
    FIGMA_DELETE_WEB_HOOK = ("figma", "figma_delete_web_hook", False)
    FIGMA_DELETED_EV_RESOURCE = ("figma", "figma_deleted_ev_resource", False)
    FIGMA_GET_ACTIVITY_LOGS = ("figma", "figma_get_activity_logs", False)
    FIGMA_GET_COMMENT_REACTIONS = ("figma", "figma_get_comment_reactions", False)
    FIGMA_GET_COMMENTS = ("figma", "figma_get_comments", False)
    FIGMA_GET_COMPONENT = ("figma", "figma_get_component", False)
    FIGMA_GET_COMPONENT_SET = ("figma", "figma_get_component_set", False)
    FIGMA_GET_DEV_RESOURCES = ("figma", "figma_get_dev_resources", False)
    FIGMA_GET_FILE = ("figma", "figma_get_file", False)
    FIGMA_GET_FILE_COMPONENT_SETS = ("figma", "figma_get_file_component_sets", False)
    FIGMA_GET_FILE_COMPONENTS = ("figma", "figma_get_file_components", False)
    FIGMA_GET_FILE_NODES = ("figma", "figma_get_file_nodes", False)
    FIGMA_GET_FILE_STYLES = ("figma", "figma_get_file_styles", False)
    FIGMA_GET_FILE_VERSIONS = ("figma", "figma_get_file_versions", False)
    FIGMA_GET_IMAGE_FILLS = ("figma", "figma_get_image_fills", False)
    FIGMA_GET_IMAGES = ("figma", "figma_get_images", False)
    FIGMA_GET_LOCAL_VARIABLES = ("figma", "figma_get_local_variables", False)
    FIGMA_GET_ME = ("figma", "figma_get_me", False)
    FIGMA_GET_PAYMENTS = ("figma", "figma_get_payments", False)
    FIGMA_GET_PROJECT_FILES = ("figma", "figma_get_project_files", False)
    FIGMA_GET_PUBLISHED_VARIABLES = ("figma", "figma_get_published_variables", False)
    FIGMA_GET_STYLE = ("figma", "figma_get_style", False)
    FIGMA_GET_TEAM_COMPONENT_SETS = ("figma", "figma_get_team_component_sets", False)
    FIGMA_GET_TEAM_COMPONENTS = ("figma", "figma_get_team_components", False)
    FIGMA_GET_TEAM_PROJECTS = ("figma", "figma_get_team_projects", False)
    FIGMA_GET_TEAM_STYLES = ("figma", "figma_get_team_styles", False)
    FIGMA_GET_TEAM_WEB_HOOKS = ("figma", "figma_get_team_web_hooks", False)
    FIGMA_GET_WEB_HOOK = ("figma", "figma_get_web_hook", False)
    FIGMA_GET_WEB_HOOK_REQUESTS = ("figma", "figma_get_web_hook_requests", False)
    FIGMA_POST_COMMENT = ("figma", "figma_post_comment", False)
    FIGMA_POST_COMMENT_REACTION = ("figma", "figma_post_comment_reaction", False)
    FIGMA_POST_DEV_RESOURCES = ("figma", "figma_post_dev_resources", False)
    FIGMA_POST_VARIABLES = ("figma", "figma_post_variables", False)
    FIGMA_POST_WEB_HOOK = ("figma", "figma_post_web_hook", False)
    FIGMA_PUT_DEV_RESOURCES = ("figma", "figma_put_dev_resources", False)
    FIGMA_PUT_WEB_HOOK = ("figma", "figma_put_web_hook", False)
    FILEMANAGER_CLOSE_SHELL_ACTION = (
        "filemanager",
        "filemanager_close_shell_action",
        True,
    )
    FILEMANAGER_CREATE_FILE_ACTION = (
        "filemanager",
        "filemanager_create_file_action",
        True,
    )
    FILEMANAGER_CREATE_SHELL_ACTION = (
        "filemanager",
        "filemanager_create_shell_action",
        True,
    )
    FILEMANAGER_EDIT_FILE_ACTION = ("filemanager", "filemanager_edit_file_action", True)
    FILEMANAGER_GOTO_LINE_ACTION = ("filemanager", "filemanager_goto_line_action", True)
    FILEMANAGER_OPEN_FILE_ACTION = ("filemanager", "filemanager_open_file_action", True)
    FILEMANAGER_RUN_COMMAND_ACTION = (
        "filemanager",
        "filemanager_run_command_action",
        True,
    )
    FILEMANAGER_SCROLL_ACTION = ("filemanager", "filemanager_scroll_action", True)
    FILEMANAGER_SET_ENV_VAR_ACTION = (
        "filemanager",
        "filemanager_set_env_var_action",
        True,
    )
    FIRECRAWL_CHECK_CRAWL_STATUS = ("firecrawl", "firecrawl_check_crawl_status", False)
    FIRECRAWL_CRAWL = ("firecrawl", "firecrawl_crawl", False)
    FIRECRAWL_EXTRACT = ("firecrawl", "firecrawl_extract", False)
    FIRECRAWL_SCRAPE = ("firecrawl", "firecrawl_scrape", False)
    FIRECRAWL_SEARCH = ("firecrawl", "firecrawl_search", False)
    GITHUB_ACTIONS_ADD_CUSTOM_LABELS_TO_SELF_HOSTED_RUNNER_FOR_ORG = (
        "github",
        "github_actions_add_custom_labels_to_self_hosted_runner_for_org",
        False,
    )
    GITHUB_ACTIONS_ADD_CUSTOM_LABELS_TO_SELF_HOSTED_RUNNER_FOR_REPO = (
        "github",
        "github_actions_add_custom_labels_to_self_hosted_runner_for_repo",
        False,
    )
    GITHUB_ACTIONS_ADD_SELECTED_REPO_TO_ORG_SECRET = (
        "github",
        "github_actions_add_selected_repo_to_org_secret",
        False,
    )
    GITHUB_ACTIONS_ADD_SELECTED_REPO_TO_ORG_VARIABLE = (
        "github",
        "github_actions_add_selected_repo_to_org_variable",
        False,
    )
    GITHUB_ACTIONS_APPROVE_WORK_FLOW_RUN = (
        "github",
        "github_actions_approve_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_CANCEL_WORK_FLOW_RUN = (
        "github",
        "github_actions_cancel_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_CREATE_ENVIRONMENT_VARIABLE = (
        "github",
        "github_actions_create_environment_variable",
        False,
    )
    GITHUB_ACTIONS_CREATE_OR_UPDATE_ENVIRONMENT_SECRET = (
        "github",
        "github_actions_create_or_update_environment_secret",
        False,
    )
    GITHUB_ACTIONS_CREATE_OR_UPDATE_ORG_SECRET = (
        "github",
        "github_actions_create_or_update_org_secret",
        False,
    )
    GITHUB_ACTIONS_CREATE_OR_UPDATE_REPO_SECRET = (
        "github",
        "github_actions_create_or_update_repo_secret",
        False,
    )
    GITHUB_ACTIONS_CREATE_ORG_VARIABLE = (
        "github",
        "github_actions_create_org_variable",
        False,
    )
    GITHUB_ACTIONS_CREATE_REGISTRATION_TOKEN_FOR_ORG = (
        "github",
        "github_actions_create_registration_token_for_org",
        False,
    )
    GITHUB_ACTIONS_CREATE_REGISTRATION_TOKEN_FOR_REPO = (
        "github",
        "github_actions_create_registration_token_for_repo",
        False,
    )
    GITHUB_ACTIONS_CREATE_REMOVE_TOKEN_FOR_ORG = (
        "github",
        "github_actions_create_remove_token_for_org",
        False,
    )
    GITHUB_ACTIONS_CREATE_REMOVE_TOKEN_FOR_REPO = (
        "github",
        "github_actions_create_remove_token_for_repo",
        False,
    )
    GITHUB_ACTIONS_CREATE_REPO_VARIABLE = (
        "github",
        "github_actions_create_repo_variable",
        False,
    )
    GITHUB_ACTIONS_CREATE_WORK_FLOW_DISPATCH = (
        "github",
        "github_actions_create_work_flow_dispatch",
        False,
    )
    GITHUB_ACTIONS_DELETE_ACTIONS_CACHE_BY_ID = (
        "github",
        "github_actions_delete_actions_cache_by_id",
        False,
    )
    GITHUB_ACTIONS_DELETE_ACTIONS_CACHE_BY_KEY = (
        "github",
        "github_actions_delete_actions_cache_by_key",
        False,
    )
    GITHUB_ACTIONS_DELETE_ARTIFACT = ("github", "github_actions_delete_artifact", False)
    GITHUB_ACTIONS_DELETE_ENVIRONMENT_SECRET = (
        "github",
        "github_actions_delete_environment_secret",
        False,
    )
    GITHUB_ACTIONS_DELETE_ENVIRONMENT_VARIABLE = (
        "github",
        "github_actions_delete_environment_variable",
        False,
    )
    GITHUB_ACTIONS_DELETE_ORG_SECRET = (
        "github",
        "github_actions_delete_org_secret",
        False,
    )
    GITHUB_ACTIONS_DELETE_ORG_VARIABLE = (
        "github",
        "github_actions_delete_org_variable",
        False,
    )
    GITHUB_ACTIONS_DELETE_REPO_SECRET = (
        "github",
        "github_actions_delete_repo_secret",
        False,
    )
    GITHUB_ACTIONS_DELETE_REPO_VARIABLE = (
        "github",
        "github_actions_delete_repo_variable",
        False,
    )
    GITHUB_ACTIONS_DELETE_SELF_HOSTED_RUNNER_FROM_ORG = (
        "github",
        "github_actions_delete_self_hosted_runner_from_org",
        False,
    )
    GITHUB_ACTIONS_DELETE_SELF_HOSTED_RUNNER_FROM_REPO = (
        "github",
        "github_actions_delete_self_hosted_runner_from_repo",
        False,
    )
    GITHUB_ACTIONS_DELETE_WORK_FLOW_RUN = (
        "github",
        "github_actions_delete_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_DELETE_WORK_FLOW_RUN_LOGS = (
        "github",
        "github_actions_delete_work_flow_run_logs",
        False,
    )
    GITHUB_ACTIONS_DISABLE_SELECTED_REPOSITORY_G_IT_HUB_ACTIONS_ORGANIZATION = (
        "github",
        "github_actions_disable_selected_repository_g_it_hub_actions_organization",
        False,
    )
    GITHUB_ACTIONS_DISABLE_WORK_FLOW = (
        "github",
        "github_actions_disable_work_flow",
        False,
    )
    GITHUB_ACTIONS_DOWNLOAD_ARTIFACT = (
        "github",
        "github_actions_download_artifact",
        False,
    )
    GITHUB_ACTIONS_DOWNLOAD_JOB_LOGS_FOR_WORK_FLOW_RUN = (
        "github",
        "github_actions_download_job_logs_for_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_DOWNLOAD_WORK_FLOW_RUN_ATTEMPT_LOGS = (
        "github",
        "github_actions_download_work_flow_run_attempt_logs",
        False,
    )
    GITHUB_ACTIONS_DOWNLOAD_WORK_FLOW_RUN_LOGS = (
        "github",
        "github_actions_download_work_flow_run_logs",
        False,
    )
    GITHUB_ACTIONS_ENABLE_WORK_FLOW = (
        "github",
        "github_actions_enable_work_flow",
        False,
    )
    GITHUB_ACTIONS_ENABLES_ELECTED_REPOSITORY_G_IT_HUB_ACTIONS_ORGANIZATION = (
        "github",
        "github_actions_enables_elected_repository_g_it_hub_actions_organization",
        False,
    )
    GITHUB_ACTIONS_FORCE_CANCEL_WORK_FLOW_RUN = (
        "github",
        "github_actions_force_cancel_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_GENERATE_RUNNER_J_IT_CONFIG_FOR_ORG = (
        "github",
        "github_actions_generate_runner_j_it_config_for_org",
        False,
    )
    GITHUB_ACTIONS_GENERATE_RUNNER_J_IT_CONFIG_FOR_REPO = (
        "github",
        "github_actions_generate_runner_j_it_config_for_repo",
        False,
    )
    GITHUB_ACTIONS_GET_ACTIONS_CACHE_LIST = (
        "github",
        "github_actions_get_actions_cache_list",
        False,
    )
    GITHUB_ACTIONS_GET_ACTIONS_CACHE_USAGE = (
        "github",
        "github_actions_get_actions_cache_usage",
        False,
    )
    GITHUB_ACTIONS_GET_ACTIONS_CACHE_USAGE_BY_REPO_FOR_ORG = (
        "github",
        "github_actions_get_actions_cache_usage_by_repo_for_org",
        False,
    )
    GITHUB_ACTIONS_GET_ACTIONS_CACHE_USAGE_FOR_ORG = (
        "github",
        "github_actions_get_actions_cache_usage_for_org",
        False,
    )
    GITHUB_ACTIONS_GET_ALLOWED_ACTIONS_ORGANIZATION = (
        "github",
        "github_actions_get_allowed_actions_organization",
        False,
    )
    GITHUB_ACTIONS_GET_ALLOWED_ACTIONS_REPOSITORY = (
        "github",
        "github_actions_get_allowed_actions_repository",
        False,
    )
    GITHUB_ACTIONS_GET_ARTIFACT = ("github", "github_actions_get_artifact", False)
    GITHUB_ACTIONS_GET_CUSTOM_OID_C_SUB_CLAIM_FOR_REPO = (
        "github",
        "github_actions_get_custom_oid_c_sub_claim_for_repo",
        False,
    )
    GITHUB_ACTIONS_GET_ENVIRONMENT_PUBLIC_KEY = (
        "github",
        "github_actions_get_environment_public_key",
        False,
    )
    GITHUB_ACTIONS_GET_ENVIRONMENT_SECRET = (
        "github",
        "github_actions_get_environment_secret",
        False,
    )
    GITHUB_ACTIONS_GET_ENVIRONMENT_VARIABLE = (
        "github",
        "github_actions_get_environment_variable",
        False,
    )
    GITHUB_ACTIONS_GET_G_IT_HUB_ACTIONS_DEFAULT_WORK_FLOW_PERMISSIONS_ORGANIZATION = (
        "github",
        "github_actions_get_g_it_hub_actions_default_work_flow_permissions_organization",
        False,
    )
    GITHUB_ACTIONS_GET_G_IT_HUB_ACTIONS_DEFAULT_WORK_FLOW_PERMISSIONS_REPOSITORY = (
        "github",
        "github_actions_get_g_it_hub_actions_default_work_flow_permissions_repository",
        False,
    )
    GITHUB_ACTIONS_GET_G_IT_HUB_ACTIONS_PERMISSIONS_ORGANIZATION = (
        "github",
        "github_actions_get_g_it_hub_actions_permissions_organization",
        False,
    )
    GITHUB_ACTIONS_GET_G_IT_HUB_ACTIONS_PERMISSIONS_REPOSITORY = (
        "github",
        "github_actions_get_g_it_hub_actions_permissions_repository",
        False,
    )
    GITHUB_ACTIONS_GET_JOB_FOR_WORK_FLOW_RUN = (
        "github",
        "github_actions_get_job_for_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_GET_ORG_PUBLIC_KEY = (
        "github",
        "github_actions_get_org_public_key",
        False,
    )
    GITHUB_ACTIONS_GET_ORG_SECRET = ("github", "github_actions_get_org_secret", False)
    GITHUB_ACTIONS_GET_ORG_VARIABLE = (
        "github",
        "github_actions_get_org_variable",
        False,
    )
    GITHUB_ACTIONS_GET_PENDING_DEPLOYMENTS_FOR_RUN = (
        "github",
        "github_actions_get_pending_deployments_for_run",
        False,
    )
    GITHUB_ACTIONS_GET_REPO_PUBLIC_KEY = (
        "github",
        "github_actions_get_repo_public_key",
        False,
    )
    GITHUB_ACTIONS_GET_REPO_SECRET = ("github", "github_actions_get_repo_secret", False)
    GITHUB_ACTIONS_GET_REPO_VARIABLE = (
        "github",
        "github_actions_get_repo_variable",
        False,
    )
    GITHUB_ACTIONS_GET_REVIEWS_FOR_RUN = (
        "github",
        "github_actions_get_reviews_for_run",
        False,
    )
    GITHUB_ACTIONS_GET_SELF_HOSTED_RUNNER_FOR_ORG = (
        "github",
        "github_actions_get_self_hosted_runner_for_org",
        False,
    )
    GITHUB_ACTIONS_GET_SELF_HOSTED_RUNNER_FOR_REPO = (
        "github",
        "github_actions_get_self_hosted_runner_for_repo",
        False,
    )
    GITHUB_ACTIONS_GET_WORK_FLOW = ("github", "github_actions_get_work_flow", False)
    GITHUB_ACTIONS_GET_WORK_FLOW_ACCESS_TO_REPOSITORY = (
        "github",
        "github_actions_get_work_flow_access_to_repository",
        False,
    )
    GITHUB_ACTIONS_GET_WORK_FLOW_RUN = (
        "github",
        "github_actions_get_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_GET_WORK_FLOW_RUN_ATTEMPT = (
        "github",
        "github_actions_get_work_flow_run_attempt",
        False,
    )
    GITHUB_ACTIONS_GET_WORK_FLOW_RUN_USAGE = (
        "github",
        "github_actions_get_work_flow_run_usage",
        False,
    )
    GITHUB_ACTIONS_GET_WORK_FLOW_USAGE = (
        "github",
        "github_actions_get_work_flow_usage",
        False,
    )
    GITHUB_ACTIONS_LIST_ARTIFACTS_FOR_REPO = (
        "github",
        "github_actions_list_artifacts_for_repo",
        False,
    )
    GITHUB_ACTIONS_LIST_ENVIRONMENT_SECRETS = (
        "github",
        "github_actions_list_environment_secrets",
        False,
    )
    GITHUB_ACTIONS_LIST_ENVIRONMENT_VARIABLES = (
        "github",
        "github_actions_list_environment_variables",
        False,
    )
    GITHUB_ACTIONS_LIST_JOBS_FOR_WORK_FLOW_RUN = (
        "github",
        "github_actions_list_jobs_for_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_LIST_JOBS_FOR_WORK_FLOW_RUN_ATTEMPT = (
        "github",
        "github_actions_list_jobs_for_work_flow_run_attempt",
        False,
    )
    GITHUB_ACTIONS_LIST_LABELS_FOR_SELF_HOSTED_RUNNER_FOR_ORG = (
        "github",
        "github_actions_list_labels_for_self_hosted_runner_for_org",
        False,
    )
    GITHUB_ACTIONS_LIST_LABELS_FOR_SELF_HOSTED_RUNNER_FOR_REPO = (
        "github",
        "github_actions_list_labels_for_self_hosted_runner_for_repo",
        False,
    )
    GITHUB_ACTIONS_LIST_ORG_SECRETS = (
        "github",
        "github_actions_list_org_secrets",
        False,
    )
    GITHUB_ACTIONS_LIST_ORG_VARIABLES = (
        "github",
        "github_actions_list_org_variables",
        False,
    )
    GITHUB_ACTIONS_LIST_REPO_ORGANIZATION_SECRETS = (
        "github",
        "github_actions_list_repo_organization_secrets",
        False,
    )
    GITHUB_ACTIONS_LIST_REPO_ORGANIZATION_VARIABLES = (
        "github",
        "github_actions_list_repo_organization_variables",
        False,
    )
    GITHUB_ACTIONS_LIST_REPO_SECRETS = (
        "github",
        "github_actions_list_repo_secrets",
        False,
    )
    GITHUB_ACTIONS_LIST_REPO_VARIABLES = (
        "github",
        "github_actions_list_repo_variables",
        False,
    )
    GITHUB_ACTIONS_LIST_REPO_WORK_FLOWS = (
        "github",
        "github_actions_list_repo_work_flows",
        False,
    )
    GITHUB_ACTIONS_LIST_RUNNER_APPLICATIONS_FOR_ORG = (
        "github",
        "github_actions_list_runner_applications_for_org",
        False,
    )
    GITHUB_ACTIONS_LIST_RUNNER_APPLICATIONS_FOR_REPO = (
        "github",
        "github_actions_list_runner_applications_for_repo",
        False,
    )
    GITHUB_ACTIONS_LIST_SELECTED_REPO_S_FOR_ORG_SECRET = (
        "github",
        "github_actions_list_selected_repo_s_for_org_secret",
        False,
    )
    GITHUB_ACTIONS_LIST_SELECTED_REPO_S_FOR_ORG_VARIABLE = (
        "github",
        "github_actions_list_selected_repo_s_for_org_variable",
        False,
    )
    GITHUB_ACTIONS_LIST_SELECTED_REPOSITORIES_ENABLED_G_IT_HUB_ACTIONS_ORGANIZATION = (
        "github",
        "github_actions_list_selected_repositories_enabled_g_it_hub_actions_organization",
        False,
    )
    GITHUB_ACTIONS_LIST_SELF_HOSTED_RUNNERS_FOR_ORG = (
        "github",
        "github_actions_list_self_hosted_runners_for_org",
        False,
    )
    GITHUB_ACTIONS_LIST_SELF_HOSTED_RUNNERS_FOR_REPO = (
        "github",
        "github_actions_list_self_hosted_runners_for_repo",
        False,
    )
    GITHUB_ACTIONS_LIST_WORK_FLOW_RUN_ARTIFACTS = (
        "github",
        "github_actions_list_work_flow_run_artifacts",
        False,
    )
    GITHUB_ACTIONS_LIST_WORK_FLOW_RUNS = (
        "github",
        "github_actions_list_work_flow_runs",
        False,
    )
    GITHUB_ACTIONS_LIST_WORK_FLOW_RUNS_FOR_REPO = (
        "github",
        "github_actions_list_work_flow_runs_for_repo",
        False,
    )
    GITHUB_ACTIONS_REMOVE_ALL_CUSTOM_LABELS_FROM_SELF_HOSTED_RUNNER_FOR_ORG = (
        "github",
        "github_actions_remove_all_custom_labels_from_self_hosted_runner_for_org",
        False,
    )
    GITHUB_ACTIONS_REMOVE_ALL_CUSTOM_LABELS_FROM_SELF_HOSTED_RUNNER_FOR_REPO = (
        "github",
        "github_actions_remove_all_custom_labels_from_self_hosted_runner_for_repo",
        False,
    )
    GITHUB_ACTIONS_REMOVE_CUSTOM_LABEL_FROM_SELF_HOSTED_RUNNER_FOR_ORG = (
        "github",
        "github_actions_remove_custom_label_from_self_hosted_runner_for_org",
        False,
    )
    GITHUB_ACTIONS_REMOVE_CUSTOM_LABEL_FROM_SELF_HOSTED_RUNNER_FOR_REPO = (
        "github",
        "github_actions_remove_custom_label_from_self_hosted_runner_for_repo",
        False,
    )
    GITHUB_ACTIONS_REMOVE_SELECTED_REPO_FROM_ORG_SECRET = (
        "github",
        "github_actions_remove_selected_repo_from_org_secret",
        False,
    )
    GITHUB_ACTIONS_REMOVE_SELECTED_REPO_FROM_ORG_VARIABLE = (
        "github",
        "github_actions_remove_selected_repo_from_org_variable",
        False,
    )
    GITHUB_ACTIONS_RERUN_JOB_FOR_WORK_FLOW_RUN = (
        "github",
        "github_actions_rerun_job_for_work_flow_run",
        False,
    )
    GITHUB_ACTIONS_RERUN_WORK_FLOW = ("github", "github_actions_rerun_work_flow", False)
    GITHUB_ACTIONS_RERUN_WORK_FLOW_FAILED_JOBS = (
        "github",
        "github_actions_rerun_work_flow_failed_jobs",
        False,
    )
    GITHUB_ACTIONS_REVIEW_CUSTOM_GATES_FOR_RUN = (
        "github",
        "github_actions_review_custom_gates_for_run",
        False,
    )
    GITHUB_ACTIONS_REVIEW_PENDING_DEPLOYMENTS_FOR_RUN = (
        "github",
        "github_actions_review_pending_deployments_for_run",
        False,
    )
    GITHUB_ACTIONS_SET_ALLOWED_ACTIONS_ORGANIZATION = (
        "github",
        "github_actions_set_allowed_actions_organization",
        False,
    )
    GITHUB_ACTIONS_SET_ALLOWED_ACTIONS_REPOSITORY = (
        "github",
        "github_actions_set_allowed_actions_repository",
        False,
    )
    GITHUB_ACTIONS_SET_CUSTOM_LABELS_FOR_SELF_HOSTED_RUNNER_FOR_ORG = (
        "github",
        "github_actions_set_custom_labels_for_self_hosted_runner_for_org",
        False,
    )
    GITHUB_ACTIONS_SET_CUSTOM_LABELS_FOR_SELF_HOSTED_RUNNER_FOR_REPO = (
        "github",
        "github_actions_set_custom_labels_for_self_hosted_runner_for_repo",
        False,
    )
    GITHUB_ACTIONS_SET_CUSTOM_OID_C_SUB_CLAIM_FOR_REPO = (
        "github",
        "github_actions_set_custom_oid_c_sub_claim_for_repo",
        False,
    )
    GITHUB_ACTIONS_SET_G_IT_HUB_ACTIONS_DEFAULT_WORK_FLOW_PERMISSIONS_ORGANIZATION = (
        "github",
        "github_actions_set_g_it_hub_actions_default_work_flow_permissions_organization",
        False,
    )
    GITHUB_ACTIONS_SET_G_IT_HUB_ACTIONS_DEFAULT_WORK_FLOW_PERMISSIONS_REPOSITORY = (
        "github",
        "github_actions_set_g_it_hub_actions_default_work_flow_permissions_repository",
        False,
    )
    GITHUB_ACTIONS_SET_G_IT_HUB_ACTIONS_PERMISSIONS_ORGANIZATION = (
        "github",
        "github_actions_set_g_it_hub_actions_permissions_organization",
        False,
    )
    GITHUB_ACTIONS_SET_G_IT_HUB_ACTIONS_PERMISSIONS_REPOSITORY = (
        "github",
        "github_actions_set_g_it_hub_actions_permissions_repository",
        False,
    )
    GITHUB_ACTIONS_SET_SELECTED_REPO_S_FOR_ORG_SECRET = (
        "github",
        "github_actions_set_selected_repo_s_for_org_secret",
        False,
    )
    GITHUB_ACTIONS_SET_SELECTED_REPO_S_FOR_ORG_VARIABLE = (
        "github",
        "github_actions_set_selected_repo_s_for_org_variable",
        False,
    )
    GITHUB_ACTIONS_SET_SELECTED_REPOSITORIES_ENABLED_G_IT_HUB_ACTIONS_ORGANIZATION = (
        "github",
        "github_actions_set_selected_repositories_enabled_g_it_hub_actions_organization",
        False,
    )
    GITHUB_ACTIONS_SET_WORK_FLOW_ACCESS_TO_REPOSITORY = (
        "github",
        "github_actions_set_work_flow_access_to_repository",
        False,
    )
    GITHUB_ACTIONS_UPDATE_ENVIRONMENT_VARIABLE = (
        "github",
        "github_actions_update_environment_variable",
        False,
    )
    GITHUB_ACTIONS_UPDATE_ORG_VARIABLE = (
        "github",
        "github_actions_update_org_variable",
        False,
    )
    GITHUB_ACTIONS_UPDATE_REPO_VARIABLE = (
        "github",
        "github_actions_update_repo_variable",
        False,
    )
    GITHUB_ACTIVITY_CHECK_REPO_IS_STARRED_BY_AUTHENTICATED_USER = (
        "github",
        "github_activity_check_repo_is_starred_by_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_DELETE_REPO_SUBSCRIPTION = (
        "github",
        "github_activity_delete_repo_subscription",
        False,
    )
    GITHUB_ACTIVITY_DELETE_THREAD_SUBSCRIPTION = (
        "github",
        "github_activity_delete_thread_subscription",
        False,
    )
    GITHUB_ACTIVITY_GET_FEEDS = ("github", "github_activity_get_feeds", False)
    GITHUB_ACTIVITY_GET_REPO_SUBSCRIPTION = (
        "github",
        "github_activity_get_repo_subscription",
        False,
    )
    GITHUB_ACTIVITY_GET_THREAD = ("github", "github_activity_get_thread", False)
    GITHUB_ACTIVITY_GET_THREAD_SUBSCRIPTION_FOR_AUTHENTICATED_USER = (
        "github",
        "github_activity_get_thread_subscription_for_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_EVENTS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_activity_list_events_for_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_NOTIFICATIONS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_activity_list_notifications_for_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_ORG_EVENTS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_activity_list_org_events_for_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_PUBLIC_EVENTS = (
        "github",
        "github_activity_list_public_events",
        False,
    )
    GITHUB_ACTIVITY_LIST_PUBLIC_EVENTS_FOR_REPO_NETWORK = (
        "github",
        "github_activity_list_public_events_for_repo_network",
        False,
    )
    GITHUB_ACTIVITY_LIST_PUBLIC_EVENTS_FOR_USER = (
        "github",
        "github_activity_list_public_events_for_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_PUBLIC_ORG_EVENTS = (
        "github",
        "github_activity_list_public_org_events",
        False,
    )
    GITHUB_ACTIVITY_LIST_RECEIVED_EVENTS_FOR_USER = (
        "github",
        "github_activity_list_received_events_for_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_RECEIVED_PUBLIC_EVENTS_FOR_USER = (
        "github",
        "github_activity_list_received_public_events_for_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_REPO_EVENTS = (
        "github",
        "github_activity_list_repo_events",
        False,
    )
    GITHUB_ACTIVITY_LIST_REPO_NOTIFICATIONS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_activity_list_repo_notifications_for_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_AUTHENTICATED_USER = (
        "github",
        "github_activity_list_repo_s_starred_by_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_REPO_S_STARRED_BY_USER = (
        "github",
        "github_activity_list_repo_s_starred_by_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_REPO_S_WATCHED_BY_USER = (
        "github",
        "github_activity_list_repo_s_watched_by_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_STARGAZERS_FOR_REPO = (
        "github",
        "github_activity_list_stargazers_for_repo",
        False,
    )
    GITHUB_ACTIVITY_LIST_WATCHED_REPO_S_FOR_AUTHENTICATED_USER = (
        "github",
        "github_activity_list_watched_repo_s_for_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_LIST_WATCHERS_FOR_REPO = (
        "github",
        "github_activity_list_watchers_for_repo",
        False,
    )
    GITHUB_ACTIVITY_MARK_NOTIFICATIONS_AS_READ = (
        "github",
        "github_activity_mark_notifications_as_read",
        False,
    )
    GITHUB_ACTIVITY_MARK_REPO_NOTIFICATIONS_AS_READ = (
        "github",
        "github_activity_mark_repo_notifications_as_read",
        False,
    )
    GITHUB_ACTIVITY_MARK_THREAD_AS_DONE = (
        "github",
        "github_activity_mark_thread_as_done",
        False,
    )
    GITHUB_ACTIVITY_MARK_THREAD_AS_READ = (
        "github",
        "github_activity_mark_thread_as_read",
        False,
    )
    GITHUB_ACTIVITY_SET_REPO_SUBSCRIPTION = (
        "github",
        "github_activity_set_repo_subscription",
        False,
    )
    GITHUB_ACTIVITY_SET_THREAD_SUBSCRIPTION = (
        "github",
        "github_activity_set_thread_subscription",
        False,
    )
    GITHUB_ACTIVITY_STAR_REPO_FOR_AUTHENTICATED_USER = (
        "github",
        "github_activity_star_repo_for_authenticated_user",
        False,
    )
    GITHUB_ACTIVITY_UN_STAR_REPO_FOR_AUTHENTICATED_USER = (
        "github",
        "github_activity_un_star_repo_for_authenticated_user",
        False,
    )
    GITHUB_APP_SUN_SUSPEND_INSTALLATION = (
        "github",
        "github_app_sun_suspend_installation",
        False,
    )
    GITHUB_APPS_ADD_REPO_TO_INSTALLATION_FOR_AUTHENTICATED_USER = (
        "github",
        "github_apps_add_repo_to_installation_for_authenticated_user",
        False,
    )
    GITHUB_APPS_CHECK_TOKEN = ("github", "github_apps_check_token", False)
    GITHUB_APPS_CREATE_FROM_MANIFEST = (
        "github",
        "github_apps_create_from_manifest",
        False,
    )
    GITHUB_APPS_CREATE_INSTALLATION_ACCESS_TOKEN = (
        "github",
        "github_apps_create_installation_access_token",
        False,
    )
    GITHUB_APPS_DELETE_AUTHORIZATION = (
        "github",
        "github_apps_delete_authorization",
        False,
    )
    GITHUB_APPS_DELETE_INSTALLATION = (
        "github",
        "github_apps_delete_installation",
        False,
    )
    GITHUB_APPS_DELETE_TOKEN = ("github", "github_apps_delete_token", False)
    GITHUB_APPS_GET_AUTHENTICATED = ("github", "github_apps_get_authenticated", False)
    GITHUB_APPS_GET_BY_SLUG = ("github", "github_apps_get_by_slug", False)
    GITHUB_APPS_GET_INSTALLATION = ("github", "github_apps_get_installation", False)
    GITHUB_APPS_GET_ORG_INSTALLATION = (
        "github",
        "github_apps_get_org_installation",
        False,
    )
    GITHUB_APPS_GET_REPO_INSTALLATION = (
        "github",
        "github_apps_get_repo_installation",
        False,
    )
    GITHUB_APPS_GET_SUBSCRIPTION_PLAN_FOR_ACCOUNT = (
        "github",
        "github_apps_get_subscription_plan_for_account",
        False,
    )
    GITHUB_APPS_GET_SUBSCRIPTION_PLAN_FOR_ACCOUNT_STUBBED = (
        "github",
        "github_apps_get_subscription_plan_for_account_stubbed",
        False,
    )
    GITHUB_APPS_GET_USER_INSTALLATION = (
        "github",
        "github_apps_get_user_installation",
        False,
    )
    GITHUB_APPS_GET_WEB_HOOK_CONFIG_FOR_APP = (
        "github",
        "github_apps_get_web_hook_config_for_app",
        False,
    )
    GITHUB_APPS_GET_WEB_HOOK_DELIVERY = (
        "github",
        "github_apps_get_web_hook_delivery",
        False,
    )
    GITHUB_APPS_LIST_ACCOUNTS_FOR_PLAN = (
        "github",
        "github_apps_list_accounts_for_plan",
        False,
    )
    GITHUB_APPS_LIST_ACCOUNTS_FOR_PLAN_STUBBED = (
        "github",
        "github_apps_list_accounts_for_plan_stubbed",
        False,
    )
    GITHUB_APPS_LIST_INSTALLATION_REPO_S_FOR_AUTHENTICATED_USER = (
        "github",
        "github_apps_list_installation_repo_s_for_authenticated_user",
        False,
    )
    GITHUB_APPS_LIST_INSTALLATION_REQUESTS_FOR_AUTHENTICATED_APP = (
        "github",
        "github_apps_list_installation_requests_for_authenticated_app",
        False,
    )
    GITHUB_APPS_LIST_INSTALLATIONS = ("github", "github_apps_list_installations", False)
    GITHUB_APPS_LIST_INSTALLATIONS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_apps_list_installations_for_authenticated_user",
        False,
    )
    GITHUB_APPS_LIST_PLANS = ("github", "github_apps_list_plans", False)
    GITHUB_APPS_LIST_PLANS_STUBBED = ("github", "github_apps_list_plans_stubbed", False)
    GITHUB_APPS_LIST_REPO_S_ACCESSIBLE_TO_INSTALLATION = (
        "github",
        "github_apps_list_repo_s_accessible_to_installation",
        False,
    )
    GITHUB_APPS_LIST_SUBSCRIPTIONS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_apps_list_subscriptions_for_authenticated_user",
        False,
    )
    GITHUB_APPS_LIST_SUBSCRIPTIONS_FOR_AUTHENTICATED_USER_STUBBED = (
        "github",
        "github_apps_list_subscriptions_for_authenticated_user_stubbed",
        False,
    )
    GITHUB_APPS_LIST_WEB_HOOK_DELIVERIES = (
        "github",
        "github_apps_list_web_hook_deliveries",
        False,
    )
    GITHUB_APPS_RE_DELIVER_WEB_HOOK_DELIVERY = (
        "github",
        "github_apps_re_deliver_web_hook_delivery",
        False,
    )
    GITHUB_APPS_REMOVE_REPO_FROM_INSTALLATION_FOR_AUTHENTICATED_USER = (
        "github",
        "github_apps_remove_repo_from_installation_for_authenticated_user",
        False,
    )
    GITHUB_APPS_RESET_TOKEN = ("github", "github_apps_reset_token", False)
    GITHUB_APPS_REVOKE_INSTALLATION_ACCESS_TOKEN = (
        "github",
        "github_apps_revoke_installation_access_token",
        False,
    )
    GITHUB_APPS_SCOPE_TOKEN = ("github", "github_apps_scope_token", False)
    GITHUB_APPS_SUSPEND_INSTALLATION = (
        "github",
        "github_apps_suspend_installation",
        False,
    )
    GITHUB_APPS_UPDATE_WEB_HOOK_CONFIG_FOR_APP = (
        "github",
        "github_apps_update_web_hook_config_for_app",
        False,
    )
    GITHUB_BILLING_GET_G_IT_HUB_ACTIONS_BILLING_ORG = (
        "github",
        "github_billing_get_g_it_hub_actions_billing_org",
        False,
    )
    GITHUB_BILLING_GET_G_IT_HUB_ACTIONS_BILLING_USER = (
        "github",
        "github_billing_get_g_it_hub_actions_billing_user",
        False,
    )
    GITHUB_BILLING_GET_G_IT_HUB_PACKAGES_BILLING_ORG = (
        "github",
        "github_billing_get_g_it_hub_packages_billing_org",
        False,
    )
    GITHUB_BILLING_GET_G_IT_HUB_PACKAGES_BILLING_USER = (
        "github",
        "github_billing_get_g_it_hub_packages_billing_user",
        False,
    )
    GITHUB_BILLING_GET_SHARED_STORAGE_BILLING_ORG = (
        "github",
        "github_billing_get_shared_storage_billing_org",
        False,
    )
    GITHUB_BILLING_GET_SHARED_STORAGE_BILLING_USER = (
        "github",
        "github_billing_get_shared_storage_billing_user",
        False,
    )
    GITHUB_CHECKS_CREATE = ("github", "github_checks_create", False)
    GITHUB_CHECKS_CREATE_SUITE = ("github", "github_checks_create_suite", False)
    GITHUB_CHECKS_GET = ("github", "github_checks_get", False)
    GITHUB_CHECKS_GET_SUITE = ("github", "github_checks_get_suite", False)
    GITHUB_CHECKS_LIST_ANNOTATIONS = ("github", "github_checks_list_annotations", False)
    GITHUB_CHECKS_LIST_FOR_REF = ("github", "github_checks_list_for_ref", False)
    GITHUB_CHECKS_LIST_FOR_SUITE = ("github", "github_checks_list_for_suite", False)
    GITHUB_CHECKS_LIST_SUITES_FOR_REF = (
        "github",
        "github_checks_list_suites_for_ref",
        False,
    )
    GITHUB_CHECKS_RE_REQUEST_RUN = ("github", "github_checks_re_request_run", False)
    GITHUB_CHECKS_RE_REQUEST_SUITE = ("github", "github_checks_re_request_suite", False)
    GITHUB_CHECKS_SET_SUITES_PREFERENCES = (
        "github",
        "github_checks_set_suites_preferences",
        False,
    )
    GITHUB_CHECKS_UPDATE = ("github", "github_checks_update", False)
    GITHUB_CLASSROOM_GET_A_CLASSROOM = (
        "github",
        "github_classroom_get_a_classroom",
        False,
    )
    GITHUB_CLASSROOM_GET_AN_ASSIGNMENT = (
        "github",
        "github_classroom_get_an_assignment",
        False,
    )
    GITHUB_CLASSROOM_GET_ASSIGNMENT_GRADES = (
        "github",
        "github_classroom_get_assignment_grades",
        False,
    )
    GITHUB_CLASSROOM_LIST_ACCEPTED_AS_SIG_MENT_S_FOR_AN_ASSIGNMENT = (
        "github",
        "github_classroom_list_accepted_as_sig_ment_s_for_an_assignment",
        False,
    )
    GITHUB_CLASSROOM_LIST_ASSIGNMENTS_FOR_A_CLASSROOM = (
        "github",
        "github_classroom_list_assignments_for_a_classroom",
        False,
    )
    GITHUB_CLASSROOM_LIST_CLASSROOMS = (
        "github",
        "github_classroom_list_classrooms",
        False,
    )
    GITHUB_CODE_SCANNING_DELETE_ANALYSIS = (
        "github",
        "github_code_scanning_delete_analysis",
        False,
    )
    GITHUB_CODE_SCANNING_GET_ALERT = ("github", "github_code_scanning_get_alert", False)
    GITHUB_CODE_SCANNING_GET_ANALYSIS = (
        "github",
        "github_code_scanning_get_analysis",
        False,
    )
    GITHUB_CODE_SCANNING_GET_CODE_QL_DATABASE = (
        "github",
        "github_code_scanning_get_code_ql_database",
        False,
    )
    GITHUB_CODE_SCANNING_GET_DEFAULT_SETUP = (
        "github",
        "github_code_scanning_get_default_setup",
        False,
    )
    GITHUB_CODE_SCANNING_GETS_ARIF = ("github", "github_code_scanning_gets_arif", False)
    GITHUB_CODE_SCANNING_LIST_ALERT_INSTANCES = (
        "github",
        "github_code_scanning_list_alert_instances",
        False,
    )
    GITHUB_CODE_SCANNING_LIST_ALERTS_FOR_ORG = (
        "github",
        "github_code_scanning_list_alerts_for_org",
        False,
    )
    GITHUB_CODE_SCANNING_LIST_ALERTS_FOR_REPO = (
        "github",
        "github_code_scanning_list_alerts_for_repo",
        False,
    )
    GITHUB_CODE_SCANNING_LIST_CODE_QL_DATABASES = (
        "github",
        "github_code_scanning_list_code_ql_databases",
        False,
    )
    GITHUB_CODE_SCANNING_LIST_RECENT_ANALYSES = (
        "github",
        "github_code_scanning_list_recent_analyses",
        False,
    )
    GITHUB_CODE_SCANNING_UPDATE_ALERT = (
        "github",
        "github_code_scanning_update_alert",
        False,
    )
    GITHUB_CODE_SCANNING_UPDATE_DEFAULT_SETUP = (
        "github",
        "github_code_scanning_update_default_setup",
        False,
    )
    GITHUB_CODE_SCANNING_UPLOADS_ARIF = (
        "github",
        "github_code_scanning_uploads_arif",
        False,
    )
    GITHUB_CODE_SPACES_ADD_REPOSITORY_FOR_SECRET_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_add_repository_for_secret_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_ADD_SELECTED_REPO_TO_ORG_SECRET = (
        "github",
        "github_code_spaces_add_selected_repo_to_org_secret",
        False,
    )
    GITHUB_CODE_SPACES_CHECK_PERMISSIONS_FOR_DEV_CONTAINER = (
        "github",
        "github_code_spaces_check_permissions_for_dev_container",
        False,
    )
    GITHUB_CODE_SPACES_CODE_SPACE_MACHINES_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_code_space_machines_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_CREATE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_create_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_CREATE_OR_UPDATE_ORG_SECRET = (
        "github",
        "github_code_spaces_create_or_update_org_secret",
        False,
    )
    GITHUB_CODE_SPACES_CREATE_OR_UPDATE_REPO_SECRET = (
        "github",
        "github_code_spaces_create_or_update_repo_secret",
        False,
    )
    GITHUB_CODE_SPACES_CREATE_OR_UPDATE_SECRET_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_create_or_update_secret_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_CREATE_WITH_PR_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_create_with_pr_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_CREATE_WITH_REPO_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_create_with_repo_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_DELETE_CODE_SPACES_ACCESS_USERS = (
        "github",
        "github_code_spaces_delete_code_spaces_access_users",
        False,
    )
    GITHUB_CODE_SPACES_DELETE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_delete_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_DELETE_FROM_ORGANIZATION = (
        "github",
        "github_code_spaces_delete_from_organization",
        False,
    )
    GITHUB_CODE_SPACES_DELETE_ORG_SECRET = (
        "github",
        "github_code_spaces_delete_org_secret",
        False,
    )
    GITHUB_CODE_SPACES_DELETE_REPO_SECRET = (
        "github",
        "github_code_spaces_delete_repo_secret",
        False,
    )
    GITHUB_CODE_SPACES_DELETE_SECRET_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_delete_secret_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_EXPORT_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_export_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_GET_CODE_SPACES_FOR_USER_IN_ORG = (
        "github",
        "github_code_spaces_get_code_spaces_for_user_in_org",
        False,
    )
    GITHUB_CODE_SPACES_GET_EXPORT_DETAILS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_get_export_details_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_GET_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_get_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_GET_ORG_PUBLIC_KEY = (
        "github",
        "github_code_spaces_get_org_public_key",
        False,
    )
    GITHUB_CODE_SPACES_GET_ORG_SECRET = (
        "github",
        "github_code_spaces_get_org_secret",
        False,
    )
    GITHUB_CODE_SPACES_GET_PUBLIC_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_get_public_key_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_GET_REPO_PUBLIC_KEY = (
        "github",
        "github_code_spaces_get_repo_public_key",
        False,
    )
    GITHUB_CODE_SPACES_GET_REPO_SECRET = (
        "github",
        "github_code_spaces_get_repo_secret",
        False,
    )
    GITHUB_CODE_SPACES_GET_SECRET_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_get_secret_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_LIST_DEV_CONTAINERS_IN_REPOSITORY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_list_dev_containers_in_repository_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_LIST_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_list_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_LIST_IN_ORGANIZATION = (
        "github",
        "github_code_spaces_list_in_organization",
        False,
    )
    GITHUB_CODE_SPACES_LIST_IN_REPOSITORY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_list_in_repository_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_LIST_ORG_SECRETS = (
        "github",
        "github_code_spaces_list_org_secrets",
        False,
    )
    GITHUB_CODE_SPACES_LIST_REPO_SECRETS = (
        "github",
        "github_code_spaces_list_repo_secrets",
        False,
    )
    GITHUB_CODE_SPACES_LIST_REPOSITORIES_FOR_SECRET_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_list_repositories_for_secret_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_LIST_SECRETS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_list_secrets_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_LIST_SELECTED_REPO_S_FOR_ORG_SECRET = (
        "github",
        "github_code_spaces_list_selected_repo_s_for_org_secret",
        False,
    )
    GITHUB_CODE_SPACES_PRE_FLIGHT_WITH_REPO_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_pre_flight_with_repo_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_PUBLISH_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_publish_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_REMOVE_REPOSITORY_FOR_SECRET_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_remove_repository_for_secret_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_REMOVE_SELECTED_REPO_FROM_ORG_SECRET = (
        "github",
        "github_code_spaces_remove_selected_repo_from_org_secret",
        False,
    )
    GITHUB_CODE_SPACES_REPO_MACHINES_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_repo_machines_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_SET_CODE_SPACES_ACCESS = (
        "github",
        "github_code_spaces_set_code_spaces_access",
        False,
    )
    GITHUB_CODE_SPACES_SET_CODE_SPACES_ACCESS_USERS = (
        "github",
        "github_code_spaces_set_code_spaces_access_users",
        False,
    )
    GITHUB_CODE_SPACES_SET_REPOSITORIES_FOR_SECRET_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_set_repositories_for_secret_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_SET_SELECTED_REPO_S_FOR_ORG_SECRET = (
        "github",
        "github_code_spaces_set_selected_repo_s_for_org_secret",
        False,
    )
    GITHUB_CODE_SPACES_START_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_start_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_STOP_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_stop_for_authenticated_user",
        False,
    )
    GITHUB_CODE_SPACES_STOP_IN_ORGANIZATION = (
        "github",
        "github_code_spaces_stop_in_organization",
        False,
    )
    GITHUB_CODE_SPACES_UPDATE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_code_spaces_update_for_authenticated_user",
        False,
    )
    GITHUB_CODES_OF_CONDUCT_GET_ALL_CODES_OF_CONDUCT = (
        "github",
        "github_codes_of_conduct_get_all_codes_of_conduct",
        False,
    )
    GITHUB_CODES_OF_CONDUCT_GET_CONDUCT_CODE = (
        "github",
        "github_codes_of_conduct_get_conduct_code",
        False,
    )
    GITHUB_COPILOT_ADD_COPILOT_SEATS_FOR_TEAMS = (
        "github",
        "github_copilot_add_copilot_seats_for_teams",
        False,
    )
    GITHUB_COPILOT_ADD_COPILOT_SEATS_FOR_USERS = (
        "github",
        "github_copilot_add_copilot_seats_for_users",
        False,
    )
    GITHUB_COPILOT_CANCEL_COPILOTS_EAT_ASSIGNMENT_FOR_TEAMS = (
        "github",
        "github_copilot_cancel_copilots_eat_assignment_for_teams",
        False,
    )
    GITHUB_COPILOT_CANCEL_COPILOTS_EAT_ASSIGNMENT_FOR_USERS = (
        "github",
        "github_copilot_cancel_copilots_eat_assignment_for_users",
        False,
    )
    GITHUB_COPILOT_GET_COPILOT_ORGANIZATION_DETAILS = (
        "github",
        "github_copilot_get_copilot_organization_details",
        False,
    )
    GITHUB_COPILOT_GET_COPILOTS_EAT_DETAILS_FOR_USER = (
        "github",
        "github_copilot_get_copilots_eat_details_for_user",
        False,
    )
    GITHUB_COPILOT_LIST_COPILOT_SEATS = (
        "github",
        "github_copilot_list_copilot_seats",
        False,
    )
    GITHUB_DEPEND_A_BOT_ADD_SELECTED_REPO_TO_ORG_SECRET = (
        "github",
        "github_depend_a_bot_add_selected_repo_to_org_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_CREATE_OR_UPDATE_ORG_SECRET = (
        "github",
        "github_depend_a_bot_create_or_update_org_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_CREATE_OR_UPDATE_REPO_SECRET = (
        "github",
        "github_depend_a_bot_create_or_update_repo_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_DELETE_ORG_SECRET = (
        "github",
        "github_depend_a_bot_delete_org_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_DELETE_REPO_SECRET = (
        "github",
        "github_depend_a_bot_delete_repo_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_GET_ALERT = ("github", "github_depend_a_bot_get_alert", False)
    GITHUB_DEPEND_A_BOT_GET_ORG_PUBLIC_KEY = (
        "github",
        "github_depend_a_bot_get_org_public_key",
        False,
    )
    GITHUB_DEPEND_A_BOT_GET_ORG_SECRET = (
        "github",
        "github_depend_a_bot_get_org_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_GET_REPO_PUBLIC_KEY = (
        "github",
        "github_depend_a_bot_get_repo_public_key",
        False,
    )
    GITHUB_DEPEND_A_BOT_GET_REPO_SECRET = (
        "github",
        "github_depend_a_bot_get_repo_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_LIST_ALERTS_FOR_ENTERPRISE = (
        "github",
        "github_depend_a_bot_list_alerts_for_enterprise",
        False,
    )
    GITHUB_DEPEND_A_BOT_LIST_ALERTS_FOR_ORG = (
        "github",
        "github_depend_a_bot_list_alerts_for_org",
        False,
    )
    GITHUB_DEPEND_A_BOT_LIST_ALERTS_FOR_REPO = (
        "github",
        "github_depend_a_bot_list_alerts_for_repo",
        False,
    )
    GITHUB_DEPEND_A_BOT_LIST_ORG_SECRETS = (
        "github",
        "github_depend_a_bot_list_org_secrets",
        False,
    )
    GITHUB_DEPEND_A_BOT_LIST_REPO_SECRETS = (
        "github",
        "github_depend_a_bot_list_repo_secrets",
        False,
    )
    GITHUB_DEPEND_A_BOT_LIST_SELECTED_REPO_S_FOR_ORG_SECRET = (
        "github",
        "github_depend_a_bot_list_selected_repo_s_for_org_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_REMOVE_SELECTED_REPO_FROM_ORG_SECRET = (
        "github",
        "github_depend_a_bot_remove_selected_repo_from_org_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_SET_SELECTED_REPO_S_FOR_ORG_SECRET = (
        "github",
        "github_depend_a_bot_set_selected_repo_s_for_org_secret",
        False,
    )
    GITHUB_DEPEND_A_BOT_UPDATE_ALERT = (
        "github",
        "github_depend_a_bot_update_alert",
        False,
    )
    GITHUB_DEPENDENCY_GRAPH_CREATE_REPOSITORY_SNAPSHOT = (
        "github",
        "github_dependency_graph_create_repository_snapshot",
        False,
    )
    GITHUB_DEPENDENCY_GRAPH_DIFF_RANGE = (
        "github",
        "github_dependency_graph_diff_range",
        False,
    )
    GITHUB_DEPENDENCY_GRAPH_EXPORTS_BOM = (
        "github",
        "github_dependency_graph_exports_bom",
        False,
    )
    GITHUB_EMO_J_IS_GET = ("github", "github_emo_j_is_get", False)
    GITHUB_G_IT_CREATE_BLOB = ("github", "github_g_it_create_blob", False)
    GITHUB_G_IT_CREATE_COMMIT = ("github", "github_g_it_create_commit", False)
    GITHUB_G_IT_CREATE_REF = ("github", "github_g_it_create_ref", False)
    GITHUB_G_IT_CREATE_TAG = ("github", "github_g_it_create_tag", False)
    GITHUB_G_IT_CREATE_TREE = ("github", "github_g_it_create_tree", False)
    GITHUB_G_IT_DELETE_REF = ("github", "github_g_it_delete_ref", False)
    GITHUB_G_IT_GET_BLOB = ("github", "github_g_it_get_blob", False)
    GITHUB_G_IT_GET_COMMIT = ("github", "github_g_it_get_commit", False)
    GITHUB_G_IT_GET_REF = ("github", "github_g_it_get_ref", False)
    GITHUB_G_IT_GET_TAG = ("github", "github_g_it_get_tag", False)
    GITHUB_G_IT_GET_TREE = ("github", "github_g_it_get_tree", False)
    GITHUB_G_IT_IGNORE_GET_ALL_TEMPLATES = (
        "github",
        "github_g_it_ignore_get_all_templates",
        False,
    )
    GITHUB_G_IT_IGNORE_GET_TEMPLATE = (
        "github",
        "github_g_it_ignore_get_template",
        False,
    )
    GITHUB_G_IT_LIST_MATCHING_REFS = ("github", "github_g_it_list_matching_refs", False)
    GITHUB_G_IT_UPDATE_REF = ("github", "github_g_it_update_ref", False)
    GITHUB_GET_CODE_CHANGES_IN_PR = ("github", "github_get_code_changes_in_pr", False)
    GITHUB_GIST_S_CHECK_IS_STARRED = ("github", "github_gist_s_check_is_starred", False)
    GITHUB_GIST_S_CREATE = ("github", "github_gist_s_create", False)
    GITHUB_GIST_S_CREATE_COMMENT = ("github", "github_gist_s_create_comment", False)
    GITHUB_GIST_S_DELETE = ("github", "github_gist_s_delete", False)
    GITHUB_GIST_S_DELETE_COMMENT = ("github", "github_gist_s_delete_comment", False)
    GITHUB_GIST_S_FORK = ("github", "github_gist_s_fork", False)
    GITHUB_GIST_S_GET = ("github", "github_gist_s_get", False)
    GITHUB_GIST_S_GET_COMMENT = ("github", "github_gist_s_get_comment", False)
    GITHUB_GIST_S_GET_REVISION = ("github", "github_gist_s_get_revision", False)
    GITHUB_GIST_S_LIST = ("github", "github_gist_s_list", False)
    GITHUB_GIST_S_LIST_COMMENTS = ("github", "github_gist_s_list_comments", False)
    GITHUB_GIST_S_LIST_COMMITS = ("github", "github_gist_s_list_commits", False)
    GITHUB_GIST_S_LIST_FOR_USER = ("github", "github_gist_s_list_for_user", False)
    GITHUB_GIST_S_LIST_FORKS = ("github", "github_gist_s_list_forks", False)
    GITHUB_GIST_S_LIST_PUBLIC = ("github", "github_gist_s_list_public", False)
    GITHUB_GIST_S_LIST_STARRED = ("github", "github_gist_s_list_starred", False)
    GITHUB_GIST_S_STAR = ("github", "github_gist_s_star", False)
    GITHUB_GIST_S_UPDATE = ("github", "github_gist_s_update", False)
    GITHUB_GIST_S_UPDATE_COMMENT = ("github", "github_gist_s_update_comment", False)
    GITHUB_GIST_SUNSTAR = ("github", "github_gist_sunstar", False)
    GITHUB_INTERACTIONS_GET_RESTRICTIONS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_interactions_get_restrictions_for_authenticated_user",
        False,
    )
    GITHUB_INTERACTIONS_GET_RESTRICTIONS_FOR_ORG = (
        "github",
        "github_interactions_get_restrictions_for_org",
        False,
    )
    GITHUB_INTERACTIONS_GET_RESTRICTIONS_FOR_REPO = (
        "github",
        "github_interactions_get_restrictions_for_repo",
        False,
    )
    GITHUB_INTERACTIONS_REMOVE_RESTRICTIONS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_interactions_remove_restrictions_for_authenticated_user",
        False,
    )
    GITHUB_INTERACTIONS_REMOVE_RESTRICTIONS_FOR_ORG = (
        "github",
        "github_interactions_remove_restrictions_for_org",
        False,
    )
    GITHUB_INTERACTIONS_REMOVE_RESTRICTIONS_FOR_REPO = (
        "github",
        "github_interactions_remove_restrictions_for_repo",
        False,
    )
    GITHUB_INTERACTIONS_SET_RESTRICTIONS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_interactions_set_restrictions_for_authenticated_user",
        False,
    )
    GITHUB_INTERACTIONS_SET_RESTRICTIONS_FOR_ORG = (
        "github",
        "github_interactions_set_restrictions_for_org",
        False,
    )
    GITHUB_INTERACTIONS_SET_RESTRICTIONS_FOR_REPO = (
        "github",
        "github_interactions_set_restrictions_for_repo",
        False,
    )
    GITHUB_ISSUES_ADD_ASSIGN_EES = ("github", "github_issues_add_assign_ees", False)
    GITHUB_ISSUES_ADD_LABELS = ("github", "github_issues_add_labels", False)
    GITHUB_ISSUES_CHECKUSER_CAN_BE_ASSIGNED = (
        "github",
        "github_issues_checkuser_can_be_assigned",
        False,
    )
    GITHUB_ISSUES_CHECKUSER_CAN_BE_ASSIGNED_TO_ISSUE = (
        "github",
        "github_issues_checkuser_can_be_assigned_to_issue",
        False,
    )
    GITHUB_ISSUES_CREATE = ("github", "github_issues_create", False)
    GITHUB_ISSUES_CREATE_COMMENT = ("github", "github_issues_create_comment", False)
    GITHUB_ISSUES_CREATE_LABEL = ("github", "github_issues_create_label", False)
    GITHUB_ISSUES_CREATE_MILESTONE = ("github", "github_issues_create_milestone", False)
    GITHUB_ISSUES_DELETE_COMMENT = ("github", "github_issues_delete_comment", False)
    GITHUB_ISSUES_DELETE_LABEL = ("github", "github_issues_delete_label", False)
    GITHUB_ISSUES_DELETE_MILESTONE = ("github", "github_issues_delete_milestone", False)
    GITHUB_ISSUES_GET = ("github", "github_issues_get", False)
    GITHUB_ISSUES_GET_COMMENT = ("github", "github_issues_get_comment", False)
    GITHUB_ISSUES_GET_EVENT = ("github", "github_issues_get_event", False)
    GITHUB_ISSUES_GET_LABEL = ("github", "github_issues_get_label", False)
    GITHUB_ISSUES_GET_MILESTONE = ("github", "github_issues_get_milestone", False)
    GITHUB_ISSUES_LIST = ("github", "github_issues_list", False)
    GITHUB_ISSUES_LIST_ASSIGN_EES = ("github", "github_issues_list_assign_ees", False)
    GITHUB_ISSUES_LIST_COMMENTS = ("github", "github_issues_list_comments", False)
    GITHUB_ISSUES_LIST_COMMENTS_FOR_REPO = (
        "github",
        "github_issues_list_comments_for_repo",
        False,
    )
    GITHUB_ISSUES_LIST_EVENTS = ("github", "github_issues_list_events", False)
    GITHUB_ISSUES_LIST_EVENTS_FOR_REPO = (
        "github",
        "github_issues_list_events_for_repo",
        False,
    )
    GITHUB_ISSUES_LIST_EVENTS_FOR_TIMELINE = (
        "github",
        "github_issues_list_events_for_timeline",
        False,
    )
    GITHUB_ISSUES_LIST_FOR_AUTHENTICATED_USER = (
        "github",
        "github_issues_list_for_authenticated_user",
        False,
    )
    GITHUB_ISSUES_LIST_FOR_ORG = ("github", "github_issues_list_for_org", False)
    GITHUB_ISSUES_LIST_FOR_REPO = ("github", "github_issues_list_for_repo", False)
    GITHUB_ISSUES_LIST_LABELS_FOR_MILESTONE = (
        "github",
        "github_issues_list_labels_for_milestone",
        False,
    )
    GITHUB_ISSUES_LIST_LABELS_FOR_REPO = (
        "github",
        "github_issues_list_labels_for_repo",
        False,
    )
    GITHUB_ISSUES_LIST_LABELS_ON_ISSUE = (
        "github",
        "github_issues_list_labels_on_issue",
        False,
    )
    GITHUB_ISSUES_LIST_MILESTONES = ("github", "github_issues_list_milestones", False)
    GITHUB_ISSUES_LOCK = ("github", "github_issues_lock", False)
    GITHUB_ISSUES_REMOVE_ALL_LABELS = (
        "github",
        "github_issues_remove_all_labels",
        False,
    )
    GITHUB_ISSUES_REMOVE_ASSIGN_EES = (
        "github",
        "github_issues_remove_assign_ees",
        False,
    )
    GITHUB_ISSUES_REMOVE_LABEL = ("github", "github_issues_remove_label", False)
    GITHUB_ISSUES_SET_LABELS = ("github", "github_issues_set_labels", False)
    GITHUB_ISSUES_UNLOCK = ("github", "github_issues_unlock", False)
    GITHUB_ISSUES_UPDATE = ("github", "github_issues_update", False)
    GITHUB_ISSUES_UPDATE_COMMENT = ("github", "github_issues_update_comment", False)
    GITHUB_ISSUES_UPDATE_LABEL = ("github", "github_issues_update_label", False)
    GITHUB_ISSUES_UPDATE_MILESTONE = ("github", "github_issues_update_milestone", False)
    GITHUB_LICENSES_GET = ("github", "github_licenses_get", False)
    GITHUB_LICENSES_GET_ALL_COMMONLY_USED = (
        "github",
        "github_licenses_get_all_commonly_used",
        False,
    )
    GITHUB_LICENSES_GET_FOR_REPO = ("github", "github_licenses_get_for_repo", False)
    GITHUB_MARKDOWN_RENDER = ("github", "github_markdown_render", False)
    GITHUB_MARKDOWN_RENDER_RAW = ("github", "github_markdown_render_raw", False)
    GITHUB_META_GET = ("github", "github_meta_get", False)
    GITHUB_META_GET_ALL_VERSIONS = ("github", "github_meta_get_all_versions", False)
    GITHUB_META_GET_OCTO_CAT = ("github", "github_meta_get_octo_cat", False)
    GITHUB_META_GET_ZEN = ("github", "github_meta_get_zen", False)
    GITHUB_META_ROOT = ("github", "github_meta_root", False)
    GITHUB_MIGRATIONS_CANCEL_IMPORT = (
        "github",
        "github_migrations_cancel_import",
        False,
    )
    GITHUB_MIGRATIONS_DELETE_ARCHIVE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_migrations_delete_archive_for_authenticated_user",
        False,
    )
    GITHUB_MIGRATIONS_DELETE_ARCHIVE_FOR_ORG = (
        "github",
        "github_migrations_delete_archive_for_org",
        False,
    )
    GITHUB_MIGRATIONS_DOWNLOAD_ARCHIVE_FOR_ORG = (
        "github",
        "github_migrations_download_archive_for_org",
        False,
    )
    GITHUB_MIGRATIONS_GET_ARCHIVE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_migrations_get_archive_for_authenticated_user",
        False,
    )
    GITHUB_MIGRATIONS_GET_COMMIT_AUTHORS = (
        "github",
        "github_migrations_get_commit_authors",
        False,
    )
    GITHUB_MIGRATIONS_GET_IMPORT_STATUS = (
        "github",
        "github_migrations_get_import_status",
        False,
    )
    GITHUB_MIGRATIONS_GET_LARGE_FILES = (
        "github",
        "github_migrations_get_large_files",
        False,
    )
    GITHUB_MIGRATIONS_GET_STATUS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_migrations_get_status_for_authenticated_user",
        False,
    )
    GITHUB_MIGRATIONS_GET_STATUS_FOR_ORG = (
        "github",
        "github_migrations_get_status_for_org",
        False,
    )
    GITHUB_MIGRATIONS_LIST_FOR_AUTHENTICATED_USER = (
        "github",
        "github_migrations_list_for_authenticated_user",
        False,
    )
    GITHUB_MIGRATIONS_LIST_FOR_ORG = ("github", "github_migrations_list_for_org", False)
    GITHUB_MIGRATIONS_LIST_REPO_S_FOR_AUTHENTICATED_USER = (
        "github",
        "github_migrations_list_repo_s_for_authenticated_user",
        False,
    )
    GITHUB_MIGRATIONS_LIST_REPO_S_FOR_ORG = (
        "github",
        "github_migrations_list_repo_s_for_org",
        False,
    )
    GITHUB_MIGRATIONS_MAP_COMMIT_AUTHOR = (
        "github",
        "github_migrations_map_commit_author",
        False,
    )
    GITHUB_MIGRATIONS_SET_LF_S_PREFERENCE = (
        "github",
        "github_migrations_set_lf_s_preference",
        False,
    )
    GITHUB_MIGRATIONS_START_FOR_AUTHENTICATED_USER = (
        "github",
        "github_migrations_start_for_authenticated_user",
        False,
    )
    GITHUB_MIGRATIONS_START_FOR_ORG = (
        "github",
        "github_migrations_start_for_org",
        False,
    )
    GITHUB_MIGRATIONS_START_IMPORT = ("github", "github_migrations_start_import", False)
    GITHUB_MIGRATIONS_UNLOCK_REPO_FOR_AUTHENTICATED_USER = (
        "github",
        "github_migrations_unlock_repo_for_authenticated_user",
        False,
    )
    GITHUB_MIGRATIONS_UNLOCK_REPO_FOR_ORG = (
        "github",
        "github_migrations_unlock_repo_for_org",
        False,
    )
    GITHUB_MIGRATIONS_UPDATE_IMPORT = (
        "github",
        "github_migrations_update_import",
        False,
    )
    GITHUB_OID_CGE_TO_I_DC_CUSTOM_SUBTEMPLATE_FOR_ORG = (
        "github",
        "github_oid_cge_to_i_dc_custom_subtemplate_for_org",
        False,
    )
    GITHUB_OID_CUP_DATE_OID_C_CUSTOM_SUBTEMPLATE_FOR_ORG = (
        "github",
        "github_oid_cup_date_oid_c_custom_subtemplate_for_org",
        False,
    )
    GITHUB_ORG_S_ASSIGN_TEAM_TO_ORG_ROLE = (
        "github",
        "github_org_s_assign_team_to_org_role",
        False,
    )
    GITHUB_ORG_S_ASSIGN_USER_TO_ORG_ROLE = (
        "github",
        "github_org_s_assign_user_to_org_role",
        False,
    )
    GITHUB_ORG_S_BLOCK_USER = ("github", "github_org_s_block_user", False)
    GITHUB_ORG_S_CANCEL_INVITATION = ("github", "github_org_s_cancel_invitation", False)
    GITHUB_ORG_S_CHECK_BLOCKED_USER = (
        "github",
        "github_org_s_check_blocked_user",
        False,
    )
    GITHUB_ORG_S_CHECK_MEMBERSHIP_FOR_USER = (
        "github",
        "github_org_s_check_membership_for_user",
        False,
    )
    GITHUB_ORG_S_CHECK_PUBLIC_MEMBERSHIP_FOR_USER = (
        "github",
        "github_org_s_check_public_membership_for_user",
        False,
    )
    GITHUB_ORG_S_CONVERT_MEMBER_TO_OUTSIDE_COLLABORATOR = (
        "github",
        "github_org_s_convert_member_to_outside_collaborator",
        False,
    )
    GITHUB_ORG_S_CREATE_CUSTOM_ORGANIZATION_ROLE = (
        "github",
        "github_org_s_create_custom_organization_role",
        False,
    )
    GITHUB_ORG_S_CREATE_INVITATION = ("github", "github_org_s_create_invitation", False)
    GITHUB_ORG_S_CREATE_OR_UPDATE_CUSTOM_PROPERTIES = (
        "github",
        "github_org_s_create_or_update_custom_properties",
        False,
    )
    GITHUB_ORG_S_CREATE_OR_UPDATE_CUSTOM_PROPERTIES_VALUES_FOR_REPO_S = (
        "github",
        "github_org_s_create_or_update_custom_properties_values_for_repo_s",
        False,
    )
    GITHUB_ORG_S_CREATE_OR_UPDATE_CUSTOM_PROPERTY = (
        "github",
        "github_org_s_create_or_update_custom_property",
        False,
    )
    GITHUB_ORG_S_CREATE_WEB_HOOK = ("github", "github_org_s_create_web_hook", False)
    GITHUB_ORG_S_DELETE = ("github", "github_org_s_delete", False)
    GITHUB_ORG_S_DELETE_CUSTOM_ORGANIZATION_ROLE = (
        "github",
        "github_org_s_delete_custom_organization_role",
        False,
    )
    GITHUB_ORG_S_DELETE_WEB_HOOK = ("github", "github_org_s_delete_web_hook", False)
    GITHUB_ORG_S_ENABLE_OR_DISABLE_SECURITY_PRODUCT_ON_ALL_ORG_REPO_S = (
        "github",
        "github_org_s_enable_or_disable_security_product_on_all_org_repo_s",
        False,
    )
    GITHUB_ORG_S_GET = ("github", "github_org_s_get", False)
    GITHUB_ORG_S_GET_ALL_CUSTOM_PROPERTIES = (
        "github",
        "github_org_s_get_all_custom_properties",
        False,
    )
    GITHUB_ORG_S_GET_CUSTOM_PROPERTY = (
        "github",
        "github_org_s_get_custom_property",
        False,
    )
    GITHUB_ORG_S_GET_MEMBERSHIP_FOR_AUTHENTICATED_USER = (
        "github",
        "github_org_s_get_membership_for_authenticated_user",
        False,
    )
    GITHUB_ORG_S_GET_MEMBERSHIP_FOR_USER = (
        "github",
        "github_org_s_get_membership_for_user",
        False,
    )
    GITHUB_ORG_S_GET_ORG_ROLE = ("github", "github_org_s_get_org_role", False)
    GITHUB_ORG_S_GET_WEB_HOOK = ("github", "github_org_s_get_web_hook", False)
    GITHUB_ORG_S_GET_WEB_HOOK_CONFIG_FOR_ORG = (
        "github",
        "github_org_s_get_web_hook_config_for_org",
        False,
    )
    GITHUB_ORG_S_GET_WEB_HOOK_DELIVERY = (
        "github",
        "github_org_s_get_web_hook_delivery",
        False,
    )
    GITHUB_ORG_S_LIST = ("github", "github_org_s_list", False)
    GITHUB_ORG_S_LIST_APP_INSTALLATIONS = (
        "github",
        "github_org_s_list_app_installations",
        False,
    )
    GITHUB_ORG_S_LIST_BLOCKED_USERS = (
        "github",
        "github_org_s_list_blocked_users",
        False,
    )
    GITHUB_ORG_S_LIST_CUSTOM_PROPERTIES_VALUES_FOR_REPO_S = (
        "github",
        "github_org_s_list_custom_properties_values_for_repo_s",
        False,
    )
    GITHUB_ORG_S_LIST_FAILED_INVITATIONS = (
        "github",
        "github_org_s_list_failed_invitations",
        False,
    )
    GITHUB_ORG_S_LIST_FOR_AUTHENTICATED_USER = (
        "github",
        "github_org_s_list_for_authenticated_user",
        False,
    )
    GITHUB_ORG_S_LIST_FOR_USER = ("github", "github_org_s_list_for_user", False)
    GITHUB_ORG_S_LIST_INVITATION_TEAMS = (
        "github",
        "github_org_s_list_invitation_teams",
        False,
    )
    GITHUB_ORG_S_LIST_MEMBERS = ("github", "github_org_s_list_members", False)
    GITHUB_ORG_S_LIST_MEMBERSHIPS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_org_s_list_memberships_for_authenticated_user",
        False,
    )
    GITHUB_ORG_S_LIST_ORG_ROLE_TEAMS = (
        "github",
        "github_org_s_list_org_role_teams",
        False,
    )
    GITHUB_ORG_S_LIST_ORG_ROLE_USERS = (
        "github",
        "github_org_s_list_org_role_users",
        False,
    )
    GITHUB_ORG_S_LIST_ORG_ROLES = ("github", "github_org_s_list_org_roles", False)
    GITHUB_ORG_S_LIST_ORGANIZATION_FINE_GRAINED_PERMISSIONS = (
        "github",
        "github_org_s_list_organization_fine_grained_permissions",
        False,
    )
    GITHUB_ORG_S_LIST_OUTSIDE_COLLABORATORS = (
        "github",
        "github_org_s_list_outside_collaborators",
        False,
    )
    GITHUB_ORG_S_LIST_PAT_GRANT_REPOSITORIES = (
        "github",
        "github_org_s_list_pat_grant_repositories",
        False,
    )
    GITHUB_ORG_S_LIST_PAT_GRANT_REQUEST_REPOSITORIES = (
        "github",
        "github_org_s_list_pat_grant_request_repositories",
        False,
    )
    GITHUB_ORG_S_LIST_PAT_GRANT_REQUESTS = (
        "github",
        "github_org_s_list_pat_grant_requests",
        False,
    )
    GITHUB_ORG_S_LIST_PAT_GRANTS = ("github", "github_org_s_list_pat_grants", False)
    GITHUB_ORG_S_LIST_PENDING_INVITATIONS = (
        "github",
        "github_org_s_list_pending_invitations",
        False,
    )
    GITHUB_ORG_S_LIST_PUBLIC_MEMBERS = (
        "github",
        "github_org_s_list_public_members",
        False,
    )
    GITHUB_ORG_S_LIST_SECURITY_MANAGER_TEAMS = (
        "github",
        "github_org_s_list_security_manager_teams",
        False,
    )
    GITHUB_ORG_S_LIST_WEB_HOOK_DELIVERIES = (
        "github",
        "github_org_s_list_web_hook_deliveries",
        False,
    )
    GITHUB_ORG_S_LIST_WEB_HOOKS = ("github", "github_org_s_list_web_hooks", False)
    GITHUB_ORG_S_PATCH_CUSTOM_ORGANIZATION_ROLE = (
        "github",
        "github_org_s_patch_custom_organization_role",
        False,
    )
    GITHUB_ORG_S_PING_WEB_HOOK = ("github", "github_org_s_ping_web_hook", False)
    GITHUB_ORG_S_RE_DELIVER_WEB_HOOK_DELIVERY = (
        "github",
        "github_org_s_re_deliver_web_hook_delivery",
        False,
    )
    GITHUB_ORG_S_REMOVE_CUSTOM_PROPERTY = (
        "github",
        "github_org_s_remove_custom_property",
        False,
    )
    GITHUB_ORG_S_REMOVE_MEMBER = ("github", "github_org_s_remove_member", False)
    GITHUB_ORG_S_REMOVE_MEMBERSHIP_FOR_USER = (
        "github",
        "github_org_s_remove_membership_for_user",
        False,
    )
    GITHUB_ORG_S_REMOVE_OUTSIDE_COLLABORATOR = (
        "github",
        "github_org_s_remove_outside_collaborator",
        False,
    )
    GITHUB_ORG_S_REMOVE_PUBLIC_MEMBERSHIP_FOR_AUTHENTICATED_USER = (
        "github",
        "github_org_s_remove_public_membership_for_authenticated_user",
        False,
    )
    GITHUB_ORG_S_REMOVE_SECURITY_MANAGER_TEAM = (
        "github",
        "github_org_s_remove_security_manager_team",
        False,
    )
    GITHUB_ORG_S_REVIEW_PAT_GRANT_REQUEST = (
        "github",
        "github_org_s_review_pat_grant_request",
        False,
    )
    GITHUB_ORG_S_REVIEW_PAT_GRANT_REQUESTS_IN_BULK = (
        "github",
        "github_org_s_review_pat_grant_requests_in_bulk",
        False,
    )
    GITHUB_ORG_S_REVOKE_ALL_ORG_ROLES_TEAM = (
        "github",
        "github_org_s_revoke_all_org_roles_team",
        False,
    )
    GITHUB_ORG_S_REVOKE_ALL_ORG_ROLES_USER = (
        "github",
        "github_org_s_revoke_all_org_roles_user",
        False,
    )
    GITHUB_ORG_S_REVOKE_ORG_ROLE_TEAM = (
        "github",
        "github_org_s_revoke_org_role_team",
        False,
    )
    GITHUB_ORG_S_REVOKE_ORG_ROLE_USER = (
        "github",
        "github_org_s_revoke_org_role_user",
        False,
    )
    GITHUB_ORG_S_SET_MEMBERSHIP_FOR_USER = (
        "github",
        "github_org_s_set_membership_for_user",
        False,
    )
    GITHUB_ORG_S_SET_PUBLIC_MEMBERSHIP_FOR_AUTHENTICATED_USER = (
        "github",
        "github_org_s_set_public_membership_for_authenticated_user",
        False,
    )
    GITHUB_ORG_S_UPDATE = ("github", "github_org_s_update", False)
    GITHUB_ORG_S_UPDATE_MEMBERSHIP_FOR_AUTHENTICATED_USER = (
        "github",
        "github_org_s_update_membership_for_authenticated_user",
        False,
    )
    GITHUB_ORG_S_UPDATE_PAT_ACCESS = ("github", "github_org_s_update_pat_access", False)
    GITHUB_ORG_S_UPDATE_PAT_ACCESSES = (
        "github",
        "github_org_s_update_pat_accesses",
        False,
    )
    GITHUB_ORG_S_UPDATE_WEB_HOOK = ("github", "github_org_s_update_web_hook", False)
    GITHUB_ORG_S_UPDATE_WEB_HOOK_CONFIG_FOR_ORG = (
        "github",
        "github_org_s_update_web_hook_config_for_org",
        False,
    )
    GITHUB_ORG_SADD_SECURITY_MANAGER_TEAM = (
        "github",
        "github_org_sadd_security_manager_team",
        False,
    )
    GITHUB_ORG_SUNBLOCK_USER = ("github", "github_org_sunblock_user", False)
    GITHUB_PACKAGES_DELETE_PACKAGE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_packages_delete_package_for_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_DELETE_PACKAGE_FOR_ORG = (
        "github",
        "github_packages_delete_package_for_org",
        False,
    )
    GITHUB_PACKAGES_DELETE_PACKAGE_FOR_USER = (
        "github",
        "github_packages_delete_package_for_user",
        False,
    )
    GITHUB_PACKAGES_DELETE_PACKAGE_VERSION_FOR_AUTHENTICATED_USER = (
        "github",
        "github_packages_delete_package_version_for_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_DELETE_PACKAGE_VERSION_FOR_ORG = (
        "github",
        "github_packages_delete_package_version_for_org",
        False,
    )
    GITHUB_PACKAGES_DELETE_PACKAGE_VERSION_FOR_USER = (
        "github",
        "github_packages_delete_package_version_for_user",
        False,
    )
    GITHUB_PACKAGES_GET_ALL_PACKAGE_VERSIONS_FOR_PACKAGE_OWNED_BY_AUTHENTICATED_USER = (
        "github",
        "github_packages_get_all_package_versions_for_package_owned_by_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_GET_ALL_PACKAGE_VERSIONS_FOR_PACKAGE_OWNED_BY_ORG = (
        "github",
        "github_packages_get_all_package_versions_for_package_owned_by_org",
        False,
    )
    GITHUB_PACKAGES_GET_ALL_PACKAGE_VERSIONS_FOR_PACKAGE_OWNED_BY_USER = (
        "github",
        "github_packages_get_all_package_versions_for_package_owned_by_user",
        False,
    )
    GITHUB_PACKAGES_GET_PACKAGE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_packages_get_package_for_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_GET_PACKAGE_FOR_ORGANIZATION = (
        "github",
        "github_packages_get_package_for_organization",
        False,
    )
    GITHUB_PACKAGES_GET_PACKAGE_FOR_USER = (
        "github",
        "github_packages_get_package_for_user",
        False,
    )
    GITHUB_PACKAGES_GET_PACKAGE_VERSION_FOR_AUTHENTICATED_USER = (
        "github",
        "github_packages_get_package_version_for_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_GET_PACKAGE_VERSION_FOR_ORGANIZATION = (
        "github",
        "github_packages_get_package_version_for_organization",
        False,
    )
    GITHUB_PACKAGES_GET_PACKAGE_VERSION_FOR_USER = (
        "github",
        "github_packages_get_package_version_for_user",
        False,
    )
    GITHUB_PACKAGES_LIST_DOCKER_MIGRATION_CONFLICTING_PACKAGES_FOR_AUTHENTICATED_USER = (
        "github",
        "github_packages_list_docker_migration_conflicting_packages_for_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_LIST_DOCKER_MIGRATION_CONFLICTING_PACKAGES_FOR_ORGANIZATION = (
        "github",
        "github_packages_list_docker_migration_conflicting_packages_for_organization",
        False,
    )
    GITHUB_PACKAGES_LIST_DOCKER_MIGRATION_CONFLICTING_PACKAGES_FOR_USER = (
        "github",
        "github_packages_list_docker_migration_conflicting_packages_for_user",
        False,
    )
    GITHUB_PACKAGES_LIST_PACKAGES_FOR_AUTHENTICATED_USER = (
        "github",
        "github_packages_list_packages_for_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_LIST_PACKAGES_FOR_ORGANIZATION = (
        "github",
        "github_packages_list_packages_for_organization",
        False,
    )
    GITHUB_PACKAGES_LIST_PACKAGES_FOR_USER = (
        "github",
        "github_packages_list_packages_for_user",
        False,
    )
    GITHUB_PACKAGES_RESTORE_PACKAGE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_packages_restore_package_for_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_RESTORE_PACKAGE_FOR_ORG = (
        "github",
        "github_packages_restore_package_for_org",
        False,
    )
    GITHUB_PACKAGES_RESTORE_PACKAGE_FOR_USER = (
        "github",
        "github_packages_restore_package_for_user",
        False,
    )
    GITHUB_PACKAGES_RESTORE_PACKAGE_VERSION_FOR_AUTHENTICATED_USER = (
        "github",
        "github_packages_restore_package_version_for_authenticated_user",
        False,
    )
    GITHUB_PACKAGES_RESTORE_PACKAGE_VERSION_FOR_ORG = (
        "github",
        "github_packages_restore_package_version_for_org",
        False,
    )
    GITHUB_PACKAGES_RESTORE_PACKAGE_VERSION_FOR_USER = (
        "github",
        "github_packages_restore_package_version_for_user",
        False,
    )
    GITHUB_PROJECTS_ADD_COLLABORATOR = (
        "github",
        "github_projects_add_collaborator",
        False,
    )
    GITHUB_PROJECTS_CREATE_CARD = ("github", "github_projects_create_card", False)
    GITHUB_PROJECTS_CREATE_COLUMN = ("github", "github_projects_create_column", False)
    GITHUB_PROJECTS_CREATE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_projects_create_for_authenticated_user",
        False,
    )
    GITHUB_PROJECTS_CREATE_FOR_ORG = ("github", "github_projects_create_for_org", False)
    GITHUB_PROJECTS_CREATE_FOR_REPO = (
        "github",
        "github_projects_create_for_repo",
        False,
    )
    GITHUB_PROJECTS_DELETE = ("github", "github_projects_delete", False)
    GITHUB_PROJECTS_DELETE_CARD = ("github", "github_projects_delete_card", False)
    GITHUB_PROJECTS_DELETE_COLUMN = ("github", "github_projects_delete_column", False)
    GITHUB_PROJECTS_GET = ("github", "github_projects_get", False)
    GITHUB_PROJECTS_GET_CARD = ("github", "github_projects_get_card", False)
    GITHUB_PROJECTS_GET_COLUMN = ("github", "github_projects_get_column", False)
    GITHUB_PROJECTS_GET_PERMISSION_FOR_USER = (
        "github",
        "github_projects_get_permission_for_user",
        False,
    )
    GITHUB_PROJECTS_LIST_CARDS = ("github", "github_projects_list_cards", False)
    GITHUB_PROJECTS_LIST_COLLABORATORS = (
        "github",
        "github_projects_list_collaborators",
        False,
    )
    GITHUB_PROJECTS_LIST_COLUMNS = ("github", "github_projects_list_columns", False)
    GITHUB_PROJECTS_LIST_FOR_ORG = ("github", "github_projects_list_for_org", False)
    GITHUB_PROJECTS_LIST_FOR_REPO = ("github", "github_projects_list_for_repo", False)
    GITHUB_PROJECTS_LIST_FOR_USER = ("github", "github_projects_list_for_user", False)
    GITHUB_PROJECTS_MOVE_CARD = ("github", "github_projects_move_card", False)
    GITHUB_PROJECTS_MOVE_COLUMN = ("github", "github_projects_move_column", False)
    GITHUB_PROJECTS_REMOVE_COLLABORATOR = (
        "github",
        "github_projects_remove_collaborator",
        False,
    )
    GITHUB_PROJECTS_UPDATE = ("github", "github_projects_update", False)
    GITHUB_PROJECTS_UPDATE_CARD = ("github", "github_projects_update_card", False)
    GITHUB_PROJECTS_UPDATE_COLUMN = ("github", "github_projects_update_column", False)
    GITHUB_PULLS_CHECK_IF_MERGED = ("github", "github_pulls_check_if_merged", False)
    GITHUB_PULLS_CREATE = ("github", "github_pulls_create", False)
    GITHUB_PULLS_CREATE_REPLY_FOR_REVIEW_COMMENT = (
        "github",
        "github_pulls_create_reply_for_review_comment",
        False,
    )
    GITHUB_PULLS_CREATE_REVIEW = ("github", "github_pulls_create_review", False)
    GITHUB_PULLS_CREATE_REVIEW_COMMENT = (
        "github",
        "github_pulls_create_review_comment",
        False,
    )
    GITHUB_PULLS_DELETE_PENDING_REVIEW = (
        "github",
        "github_pulls_delete_pending_review",
        False,
    )
    GITHUB_PULLS_DELETE_REVIEW_COMMENT = (
        "github",
        "github_pulls_delete_review_comment",
        False,
    )
    GITHUB_PULLS_DISMISS_REVIEW = ("github", "github_pulls_dismiss_review", False)
    GITHUB_PULLS_GET = ("github", "github_pulls_get", False)
    GITHUB_PULLS_GET_REVIEW = ("github", "github_pulls_get_review", False)
    GITHUB_PULLS_GET_REVIEW_COMMENT = (
        "github",
        "github_pulls_get_review_comment",
        False,
    )
    GITHUB_PULLS_LIST = ("github", "github_pulls_list", False)
    GITHUB_PULLS_LIST_COMMENTS_FOR_REVIEW = (
        "github",
        "github_pulls_list_comments_for_review",
        False,
    )
    GITHUB_PULLS_LIST_COMMITS = ("github", "github_pulls_list_commits", False)
    GITHUB_PULLS_LIST_FILES = ("github", "github_pulls_list_files", False)
    GITHUB_PULLS_LIST_REQUESTED_REVIEWERS = (
        "github",
        "github_pulls_list_requested_reviewers",
        False,
    )
    GITHUB_PULLS_LIST_REVIEW_COMMENTS = (
        "github",
        "github_pulls_list_review_comments",
        False,
    )
    GITHUB_PULLS_LIST_REVIEW_COMMENTS_FOR_REPO = (
        "github",
        "github_pulls_list_review_comments_for_repo",
        False,
    )
    GITHUB_PULLS_LIST_REVIEWS = ("github", "github_pulls_list_reviews", False)
    GITHUB_PULLS_MERGE = ("github", "github_pulls_merge", False)
    GITHUB_PULLS_REMOVE_REQUESTED_REVIEWERS = (
        "github",
        "github_pulls_remove_requested_reviewers",
        False,
    )
    GITHUB_PULLS_REQUEST_REVIEWERS = ("github", "github_pulls_request_reviewers", False)
    GITHUB_PULLS_SUBMIT_REVIEW = ("github", "github_pulls_submit_review", False)
    GITHUB_PULLS_UPDATE = ("github", "github_pulls_update", False)
    GITHUB_PULLS_UPDATE_BRANCH = ("github", "github_pulls_update_branch", False)
    GITHUB_PULLS_UPDATE_REVIEW = ("github", "github_pulls_update_review", False)
    GITHUB_PULLS_UPDATE_REVIEW_COMMENT = (
        "github",
        "github_pulls_update_review_comment",
        False,
    )
    GITHUB_RATE_LIMIT_GET = ("github", "github_rate_limit_get", False)
    GITHUB_REACTIONS_CREATE_FOR_COMMIT_COMMENT = (
        "github",
        "github_reactions_create_for_commit_comment",
        False,
    )
    GITHUB_REACTIONS_CREATE_FOR_ISSUE = (
        "github",
        "github_reactions_create_for_issue",
        False,
    )
    GITHUB_REACTIONS_CREATE_FOR_ISSUE_COMMENT = (
        "github",
        "github_reactions_create_for_issue_comment",
        False,
    )
    GITHUB_REACTIONS_CREATE_FOR_PULL_REQUEST_REVIEW_COMMENT = (
        "github",
        "github_reactions_create_for_pull_request_review_comment",
        False,
    )
    GITHUB_REACTIONS_CREATE_FOR_RELEASE = (
        "github",
        "github_reactions_create_for_release",
        False,
    )
    GITHUB_REACTIONS_CREATE_FOR_TEAM_DISCUSSION_COMMENT_IN_ORG = (
        "github",
        "github_reactions_create_for_team_discussion_comment_in_org",
        False,
    )
    GITHUB_REACTIONS_CREATE_FOR_TEAM_DISCUSSION_COMMENT_LEGACY = (
        "github",
        "github_reactions_create_for_team_discussion_comment_legacy",
        False,
    )
    GITHUB_REACTIONS_CREATE_FOR_TEAM_DISCUSSION_IN_ORG = (
        "github",
        "github_reactions_create_for_team_discussion_in_org",
        False,
    )
    GITHUB_REACTIONS_CREATE_FOR_TEAM_DISCUSSION_LEGACY = (
        "github",
        "github_reactions_create_for_team_discussion_legacy",
        False,
    )
    GITHUB_REACTIONS_DELETE_FOR_COMMIT_COMMENT = (
        "github",
        "github_reactions_delete_for_commit_comment",
        False,
    )
    GITHUB_REACTIONS_DELETE_FOR_ISSUE = (
        "github",
        "github_reactions_delete_for_issue",
        False,
    )
    GITHUB_REACTIONS_DELETE_FOR_ISSUE_COMMENT = (
        "github",
        "github_reactions_delete_for_issue_comment",
        False,
    )
    GITHUB_REACTIONS_DELETE_FOR_PULL_REQUEST_COMMENT = (
        "github",
        "github_reactions_delete_for_pull_request_comment",
        False,
    )
    GITHUB_REACTIONS_DELETE_FOR_RELEASE = (
        "github",
        "github_reactions_delete_for_release",
        False,
    )
    GITHUB_REACTIONS_DELETE_FOR_TEAM_DISCUSSION = (
        "github",
        "github_reactions_delete_for_team_discussion",
        False,
    )
    GITHUB_REACTIONS_DELETE_FOR_TEAM_DISCUSSION_COMMENT = (
        "github",
        "github_reactions_delete_for_team_discussion_comment",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_COMMIT_COMMENT = (
        "github",
        "github_reactions_list_for_commit_comment",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_ISSUE = (
        "github",
        "github_reactions_list_for_issue",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_ISSUE_COMMENT = (
        "github",
        "github_reactions_list_for_issue_comment",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_PULL_REQUEST_REVIEW_COMMENT = (
        "github",
        "github_reactions_list_for_pull_request_review_comment",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_RELEASE = (
        "github",
        "github_reactions_list_for_release",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_TEAM_DISCUSSION_COMMENT_IN_ORG = (
        "github",
        "github_reactions_list_for_team_discussion_comment_in_org",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_TEAM_DISCUSSION_COMMENT_LEGACY = (
        "github",
        "github_reactions_list_for_team_discussion_comment_legacy",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_TEAM_DISCUSSION_IN_ORG = (
        "github",
        "github_reactions_list_for_team_discussion_in_org",
        False,
    )
    GITHUB_REACTIONS_LIST_FOR_TEAM_DISCUSSION_LEGACY = (
        "github",
        "github_reactions_list_for_team_discussion_legacy",
        False,
    )
    GITHUB_REPO_S_ACCEPT_INVITATION_FOR_AUTHENTICATED_USER = (
        "github",
        "github_repo_s_accept_invitation_for_authenticated_user",
        False,
    )
    GITHUB_REPO_S_CANCEL_PAGES_DEPLOYMENT = (
        "github",
        "github_repo_s_cancel_pages_deployment",
        False,
    )
    GITHUB_REPO_S_CHECK_AUTOMATED_SECURITY_FIXES = (
        "github",
        "github_repo_s_check_automated_security_fixes",
        False,
    )
    GITHUB_REPO_S_CHECK_COLLABORATOR = (
        "github",
        "github_repo_s_check_collaborator",
        False,
    )
    GITHUB_REPO_S_CHECK_PRIVATE_VULNERABILITY_REPORTING = (
        "github",
        "github_repo_s_check_private_vulnerability_reporting",
        False,
    )
    GITHUB_REPO_S_CHECK_VULNERABILITY_ALERTS = (
        "github",
        "github_repo_s_check_vulnerability_alerts",
        False,
    )
    GITHUB_REPO_S_CODE_OWNERS_ERRORS = (
        "github",
        "github_repo_s_code_owners_errors",
        False,
    )
    GITHUB_REPO_S_COMPARE_COMMITS = ("github", "github_repo_s_compare_commits", False)
    GITHUB_REPO_S_CREATE_AUTO_LINK = ("github", "github_repo_s_create_auto_link", False)
    GITHUB_REPO_S_CREATE_COMMIT_COMMENT = (
        "github",
        "github_repo_s_create_commit_comment",
        False,
    )
    GITHUB_REPO_S_CREATE_COMMIT_SIGNATURE_PROTECTION = (
        "github",
        "github_repo_s_create_commit_signature_protection",
        False,
    )
    GITHUB_REPO_S_CREATE_COMMIT_STATUS = (
        "github",
        "github_repo_s_create_commit_status",
        False,
    )
    GITHUB_REPO_S_CREATE_DEPLOY_KEY = (
        "github",
        "github_repo_s_create_deploy_key",
        False,
    )
    GITHUB_REPO_S_CREATE_DEPLOYMENT = (
        "github",
        "github_repo_s_create_deployment",
        False,
    )
    GITHUB_REPO_S_CREATE_DEPLOYMENT_BRANCH_POLICY = (
        "github",
        "github_repo_s_create_deployment_branch_policy",
        False,
    )
    GITHUB_REPO_S_CREATE_DEPLOYMENT_PROTECTION_RULE = (
        "github",
        "github_repo_s_create_deployment_protection_rule",
        False,
    )
    GITHUB_REPO_S_CREATE_DEPLOYMENT_STATUS = (
        "github",
        "github_repo_s_create_deployment_status",
        False,
    )
    GITHUB_REPO_S_CREATE_DISPATCH_EVENT = (
        "github",
        "github_repo_s_create_dispatch_event",
        False,
    )
    GITHUB_REPO_S_CREATE_FOR_AUTHENTICATED_USER = (
        "github",
        "github_repo_s_create_for_authenticated_user",
        False,
    )
    GITHUB_REPO_S_CREATE_FORK = ("github", "github_repo_s_create_fork", False)
    GITHUB_REPO_S_CREATE_IN_ORG = ("github", "github_repo_s_create_in_org", False)
    GITHUB_REPO_S_CREATE_OR_UPDATE_CUSTOM_PROPERTIES_VALUES = (
        "github",
        "github_repo_s_create_or_update_custom_properties_values",
        False,
    )
    GITHUB_REPO_S_CREATE_OR_UPDATE_ENVIRONMENT = (
        "github",
        "github_repo_s_create_or_update_environment",
        False,
    )
    GITHUB_REPO_S_CREATE_OR_UPDATE_FILE_CONTENTS = (
        "github",
        "github_repo_s_create_or_update_file_contents",
        False,
    )
    GITHUB_REPO_S_CREATE_ORG_RULE_SET = (
        "github",
        "github_repo_s_create_org_rule_set",
        False,
    )
    GITHUB_REPO_S_CREATE_PAGES_DEPLOYMENT = (
        "github",
        "github_repo_s_create_pages_deployment",
        False,
    )
    GITHUB_REPO_S_CREATE_PAGES_SITE = (
        "github",
        "github_repo_s_create_pages_site",
        False,
    )
    GITHUB_REPO_S_CREATE_RELEASE = ("github", "github_repo_s_create_release", False)
    GITHUB_REPO_S_CREATE_REPO_RULE_SET = (
        "github",
        "github_repo_s_create_repo_rule_set",
        False,
    )
    GITHUB_REPO_S_CREATE_TAG_PROTECTION = (
        "github",
        "github_repo_s_create_tag_protection",
        False,
    )
    GITHUB_REPO_S_CREATE_USING_TEMPLATE = (
        "github",
        "github_repo_s_create_using_template",
        False,
    )
    GITHUB_REPO_S_CREATE_WEB_HOOK = ("github", "github_repo_s_create_web_hook", False)
    GITHUB_REPO_S_DECLINE_INVITATION_FOR_AUTHENTICATED_USER = (
        "github",
        "github_repo_s_decline_invitation_for_authenticated_user",
        False,
    )
    GITHUB_REPO_S_DELETE = ("github", "github_repo_s_delete", False)
    GITHUB_REPO_S_DELETE_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_s_delete_access_restrictions",
        False,
    )
    GITHUB_REPO_S_DELETE_ADMIN_BRANCH_PROTECTION = (
        "github",
        "github_repo_s_delete_admin_branch_protection",
        False,
    )
    GITHUB_REPO_S_DELETE_AN_ENVIRONMENT = (
        "github",
        "github_repo_s_delete_an_environment",
        False,
    )
    GITHUB_REPO_S_DELETE_AUTO_LINK = ("github", "github_repo_s_delete_auto_link", False)
    GITHUB_REPO_S_DELETE_BRANCH_PROTECTION = (
        "github",
        "github_repo_s_delete_branch_protection",
        False,
    )
    GITHUB_REPO_S_DELETE_COMMIT_COMMENT = (
        "github",
        "github_repo_s_delete_commit_comment",
        False,
    )
    GITHUB_REPO_S_DELETE_COMMIT_SIGNATURE_PROTECTION = (
        "github",
        "github_repo_s_delete_commit_signature_protection",
        False,
    )
    GITHUB_REPO_S_DELETE_DEPLOY_KEY = (
        "github",
        "github_repo_s_delete_deploy_key",
        False,
    )
    GITHUB_REPO_S_DELETE_DEPLOYMENT = (
        "github",
        "github_repo_s_delete_deployment",
        False,
    )
    GITHUB_REPO_S_DELETE_DEPLOYMENT_BRANCH_POLICY = (
        "github",
        "github_repo_s_delete_deployment_branch_policy",
        False,
    )
    GITHUB_REPO_S_DELETE_FILE = ("github", "github_repo_s_delete_file", False)
    GITHUB_REPO_S_DELETE_INVITATION = (
        "github",
        "github_repo_s_delete_invitation",
        False,
    )
    GITHUB_REPO_S_DELETE_ORG_RULE_SET = (
        "github",
        "github_repo_s_delete_org_rule_set",
        False,
    )
    GITHUB_REPO_S_DELETE_PAGES_SITE = (
        "github",
        "github_repo_s_delete_pages_site",
        False,
    )
    GITHUB_REPO_S_DELETE_PULL_REQUEST_REVIEW_PROTECTION = (
        "github",
        "github_repo_s_delete_pull_request_review_protection",
        False,
    )
    GITHUB_REPO_S_DELETE_RELEASE = ("github", "github_repo_s_delete_release", False)
    GITHUB_REPO_S_DELETE_RELEASE_ASSET = (
        "github",
        "github_repo_s_delete_release_asset",
        False,
    )
    GITHUB_REPO_S_DELETE_REPO_RULE_SET = (
        "github",
        "github_repo_s_delete_repo_rule_set",
        False,
    )
    GITHUB_REPO_S_DELETE_TAG_PROTECTION = (
        "github",
        "github_repo_s_delete_tag_protection",
        False,
    )
    GITHUB_REPO_S_DELETE_WEB_HOOK = ("github", "github_repo_s_delete_web_hook", False)
    GITHUB_REPO_S_DISABLE_AUTOMATED_SECURITY_FIXES = (
        "github",
        "github_repo_s_disable_automated_security_fixes",
        False,
    )
    GITHUB_REPO_S_DISABLE_DEPLOYMENT_PROTECTION_RULE = (
        "github",
        "github_repo_s_disable_deployment_protection_rule",
        False,
    )
    GITHUB_REPO_S_DISABLE_PRIVATE_VULNERABILITY_REPORTING = (
        "github",
        "github_repo_s_disable_private_vulnerability_reporting",
        False,
    )
    GITHUB_REPO_S_DISABLE_VULNERABILITY_ALERTS = (
        "github",
        "github_repo_s_disable_vulnerability_alerts",
        False,
    )
    GITHUB_REPO_S_DOWNLOAD_TAR_BALL_ARCHIVE = (
        "github",
        "github_repo_s_download_tar_ball_archive",
        False,
    )
    GITHUB_REPO_S_DOWNLOAD_ZIP_BALL_ARCHIVE = (
        "github",
        "github_repo_s_download_zip_ball_archive",
        False,
    )
    GITHUB_REPO_S_ENABLE_AUTOMATED_SECURITY_FIXES = (
        "github",
        "github_repo_s_enable_automated_security_fixes",
        False,
    )
    GITHUB_REPO_S_ENABLE_PRIVATE_VULNERABILITY_REPORTING = (
        "github",
        "github_repo_s_enable_private_vulnerability_reporting",
        False,
    )
    GITHUB_REPO_S_ENABLE_VULNERABILITY_ALERTS = (
        "github",
        "github_repo_s_enable_vulnerability_alerts",
        False,
    )
    GITHUB_REPO_S_GENERATE_RELEASE_NOTES = (
        "github",
        "github_repo_s_generate_release_notes",
        False,
    )
    GITHUB_REPO_S_GET = ("github", "github_repo_s_get", False)
    GITHUB_REPO_S_GET_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_s_get_access_restrictions",
        False,
    )
    GITHUB_REPO_S_GET_ADMIN_BRANCH_PROTECTION = (
        "github",
        "github_repo_s_get_admin_branch_protection",
        False,
    )
    GITHUB_REPO_S_GET_ALL_DEPLOYMENT_PROTECTION_RULES = (
        "github",
        "github_repo_s_get_all_deployment_protection_rules",
        False,
    )
    GITHUB_REPO_S_GET_ALL_ENVIRONMENTS = (
        "github",
        "github_repo_s_get_all_environments",
        False,
    )
    GITHUB_REPO_S_GET_ALL_STATUS_CHECK_CONTEXTS = (
        "github",
        "github_repo_s_get_all_status_check_contexts",
        False,
    )
    GITHUB_REPO_S_GET_ALL_TOPICS = ("github", "github_repo_s_get_all_topics", False)
    GITHUB_REPO_S_GET_APPS_WITH_ACCESS_TO_PROTECTED_BRANCH = (
        "github",
        "github_repo_s_get_apps_with_access_to_protected_branch",
        False,
    )
    GITHUB_REPO_S_GET_AUTO_LINK = ("github", "github_repo_s_get_auto_link", False)
    GITHUB_REPO_S_GET_BRANCH = ("github", "github_repo_s_get_branch", False)
    GITHUB_REPO_S_GET_BRANCH_PROTECTION = (
        "github",
        "github_repo_s_get_branch_protection",
        False,
    )
    GITHUB_REPO_S_GET_BRANCH_RULES = ("github", "github_repo_s_get_branch_rules", False)
    GITHUB_REPO_S_GET_CLONES = ("github", "github_repo_s_get_clones", False)
    GITHUB_REPO_S_GET_CODE_FREQUENCY_STATS = (
        "github",
        "github_repo_s_get_code_frequency_stats",
        False,
    )
    GITHUB_REPO_S_GET_COLLABORATOR_PERMISSION_LEVEL = (
        "github",
        "github_repo_s_get_collaborator_permission_level",
        False,
    )
    GITHUB_REPO_S_GET_COMBINED_STATUS_FOR_REF = (
        "github",
        "github_repo_s_get_combined_status_for_ref",
        False,
    )
    GITHUB_REPO_S_GET_COMMIT = ("github", "github_repo_s_get_commit", False)
    GITHUB_REPO_S_GET_COMMIT_ACTIVITY_STATS = (
        "github",
        "github_repo_s_get_commit_activity_stats",
        False,
    )
    GITHUB_REPO_S_GET_COMMIT_COMMENT = (
        "github",
        "github_repo_s_get_commit_comment",
        False,
    )
    GITHUB_REPO_S_GET_COMMIT_SIGNATURE_PROTECTION = (
        "github",
        "github_repo_s_get_commit_signature_protection",
        False,
    )
    GITHUB_REPO_S_GET_COMMUNITY_PROFILE_METRICS = (
        "github",
        "github_repo_s_get_community_profile_metrics",
        False,
    )
    GITHUB_REPO_S_GET_CONTENT = ("github", "github_repo_s_get_content", False)
    GITHUB_REPO_S_GET_CONTRIBUTORS_STATS = (
        "github",
        "github_repo_s_get_contributors_stats",
        False,
    )
    GITHUB_REPO_S_GET_CUSTOM_DEPLOYMENT_PROTECTION_RULE = (
        "github",
        "github_repo_s_get_custom_deployment_protection_rule",
        False,
    )
    GITHUB_REPO_S_GET_CUSTOM_PROPERTIES_VALUES = (
        "github",
        "github_repo_s_get_custom_properties_values",
        False,
    )
    GITHUB_REPO_S_GET_DEPLOY_KEY = ("github", "github_repo_s_get_deploy_key", False)
    GITHUB_REPO_S_GET_DEPLOYMENT = ("github", "github_repo_s_get_deployment", False)
    GITHUB_REPO_S_GET_DEPLOYMENT_BRANCH_POLICY = (
        "github",
        "github_repo_s_get_deployment_branch_policy",
        False,
    )
    GITHUB_REPO_S_GET_DEPLOYMENT_STATUS = (
        "github",
        "github_repo_s_get_deployment_status",
        False,
    )
    GITHUB_REPO_S_GET_ENVIRONMENT = ("github", "github_repo_s_get_environment", False)
    GITHUB_REPO_S_GET_LATEST_PAGES_BUILD = (
        "github",
        "github_repo_s_get_latest_pages_build",
        False,
    )
    GITHUB_REPO_S_GET_LATEST_RELEASE = (
        "github",
        "github_repo_s_get_latest_release",
        False,
    )
    GITHUB_REPO_S_GET_ORG_RULE_SET = ("github", "github_repo_s_get_org_rule_set", False)
    GITHUB_REPO_S_GET_ORG_RULE_SETS = (
        "github",
        "github_repo_s_get_org_rule_sets",
        False,
    )
    GITHUB_REPO_S_GET_ORG_RULE_SUITE = (
        "github",
        "github_repo_s_get_org_rule_suite",
        False,
    )
    GITHUB_REPO_S_GET_ORG_RULE_SUITES = (
        "github",
        "github_repo_s_get_org_rule_suites",
        False,
    )
    GITHUB_REPO_S_GET_PAGES = ("github", "github_repo_s_get_pages", False)
    GITHUB_REPO_S_GET_PAGES_BUILD = ("github", "github_repo_s_get_pages_build", False)
    GITHUB_REPO_S_GET_PAGES_DEPLOYMENT = (
        "github",
        "github_repo_s_get_pages_deployment",
        False,
    )
    GITHUB_REPO_S_GET_PAGES_HEALTH_CHECK = (
        "github",
        "github_repo_s_get_pages_health_check",
        False,
    )
    GITHUB_REPO_S_GET_PARTICIPATION_STATS = (
        "github",
        "github_repo_s_get_participation_stats",
        False,
    )
    GITHUB_REPO_S_GET_PULL_REQUEST_REVIEW_PROTECTION = (
        "github",
        "github_repo_s_get_pull_request_review_protection",
        False,
    )
    GITHUB_REPO_S_GET_PUNCH_CARD_STATS = (
        "github",
        "github_repo_s_get_punch_card_stats",
        False,
    )
    GITHUB_REPO_S_GET_README = ("github", "github_repo_s_get_readme", False)
    GITHUB_REPO_S_GET_README_IN_DIRECTORY = (
        "github",
        "github_repo_s_get_readme_in_directory",
        False,
    )
    GITHUB_REPO_S_GET_RELEASE = ("github", "github_repo_s_get_release", False)
    GITHUB_REPO_S_GET_RELEASE_ASSET = (
        "github",
        "github_repo_s_get_release_asset",
        False,
    )
    GITHUB_REPO_S_GET_RELEASE_BY_TAG = (
        "github",
        "github_repo_s_get_release_by_tag",
        False,
    )
    GITHUB_REPO_S_GET_REPO_RULE_SET = (
        "github",
        "github_repo_s_get_repo_rule_set",
        False,
    )
    GITHUB_REPO_S_GET_REPO_RULE_SETS = (
        "github",
        "github_repo_s_get_repo_rule_sets",
        False,
    )
    GITHUB_REPO_S_GET_REPO_RULE_SUITE = (
        "github",
        "github_repo_s_get_repo_rule_suite",
        False,
    )
    GITHUB_REPO_S_GET_REPO_RULE_SUITES = (
        "github",
        "github_repo_s_get_repo_rule_suites",
        False,
    )
    GITHUB_REPO_S_GET_STATUS_CHECKS_PROTECTION = (
        "github",
        "github_repo_s_get_status_checks_protection",
        False,
    )
    GITHUB_REPO_S_GET_TEAMS_WITH_ACCESS_TO_PROTECTED_BRANCH = (
        "github",
        "github_repo_s_get_teams_with_access_to_protected_branch",
        False,
    )
    GITHUB_REPO_S_GET_TOP_PATHS = ("github", "github_repo_s_get_top_paths", False)
    GITHUB_REPO_S_GET_TOP_REFERRER_S = (
        "github",
        "github_repo_s_get_top_referrer_s",
        False,
    )
    GITHUB_REPO_S_GET_USERS_WITH_ACCESS_TO_PROTECTED_BRANCH = (
        "github",
        "github_repo_s_get_users_with_access_to_protected_branch",
        False,
    )
    GITHUB_REPO_S_GET_VIEWS = ("github", "github_repo_s_get_views", False)
    GITHUB_REPO_S_GET_WEB_HOOK = ("github", "github_repo_s_get_web_hook", False)
    GITHUB_REPO_S_GET_WEB_HOOK_CONFIG_FOR_REPO = (
        "github",
        "github_repo_s_get_web_hook_config_for_repo",
        False,
    )
    GITHUB_REPO_S_GET_WEB_HOOK_DELIVERY = (
        "github",
        "github_repo_s_get_web_hook_delivery",
        False,
    )
    GITHUB_REPO_S_LIST_ACTIVITIES = ("github", "github_repo_s_list_activities", False)
    GITHUB_REPO_S_LIST_AUTO_LINKS = ("github", "github_repo_s_list_auto_links", False)
    GITHUB_REPO_S_LIST_BRANCHES = ("github", "github_repo_s_list_branches", False)
    GITHUB_REPO_S_LIST_BRANCHES_FOR_HEAD_COMMIT = (
        "github",
        "github_repo_s_list_branches_for_head_commit",
        False,
    )
    GITHUB_REPO_S_LIST_COLLABORATORS = (
        "github",
        "github_repo_s_list_collaborators",
        False,
    )
    GITHUB_REPO_S_LIST_COMMENTS_FOR_COMMIT = (
        "github",
        "github_repo_s_list_comments_for_commit",
        False,
    )
    GITHUB_REPO_S_LIST_COMMIT_COMMENTS_FOR_REPO = (
        "github",
        "github_repo_s_list_commit_comments_for_repo",
        False,
    )
    GITHUB_REPO_S_LIST_COMMIT_STATUSES_FOR_REF = (
        "github",
        "github_repo_s_list_commit_statuses_for_ref",
        False,
    )
    GITHUB_REPO_S_LIST_COMMITS = ("github", "github_repo_s_list_commits", False)
    GITHUB_REPO_S_LIST_CONTRIBUTORS = (
        "github",
        "github_repo_s_list_contributors",
        False,
    )
    GITHUB_REPO_S_LIST_CUSTOM_DEPLOYMENT_RULE_INTEGRATION_S = (
        "github",
        "github_repo_s_list_custom_deployment_rule_integration_s",
        False,
    )
    GITHUB_REPO_S_LIST_DEPLOY_KEYS = ("github", "github_repo_s_list_deploy_keys", False)
    GITHUB_REPO_S_LIST_DEPLOYMENT_BRANCH_POLICIES = (
        "github",
        "github_repo_s_list_deployment_branch_policies",
        False,
    )
    GITHUB_REPO_S_LIST_DEPLOYMENT_STATUSES = (
        "github",
        "github_repo_s_list_deployment_statuses",
        False,
    )
    GITHUB_REPO_S_LIST_DEPLOYMENTS = ("github", "github_repo_s_list_deployments", False)
    GITHUB_REPO_S_LIST_FOR_AUTHENTICATED_USER = (
        "github",
        "github_repo_s_list_for_authenticated_user",
        False,
    )
    GITHUB_REPO_S_LIST_FOR_ORG = ("github", "github_repo_s_list_for_org", False)
    GITHUB_REPO_S_LIST_FOR_USER = ("github", "github_repo_s_list_for_user", False)
    GITHUB_REPO_S_LIST_FORKS = ("github", "github_repo_s_list_forks", False)
    GITHUB_REPO_S_LIST_INVITATIONS = ("github", "github_repo_s_list_invitations", False)
    GITHUB_REPO_S_LIST_INVITATIONS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_repo_s_list_invitations_for_authenticated_user",
        False,
    )
    GITHUB_REPO_S_LIST_LANGUAGES = ("github", "github_repo_s_list_languages", False)
    GITHUB_REPO_S_LIST_PAGES_BUILDS = (
        "github",
        "github_repo_s_list_pages_builds",
        False,
    )
    GITHUB_REPO_S_LIST_PUBLIC = ("github", "github_repo_s_list_public", False)
    GITHUB_REPO_S_LIST_PULL_REQUESTS_ASSOCIATED_WITH_COMMIT = (
        "github",
        "github_repo_s_list_pull_requests_associated_with_commit",
        False,
    )
    GITHUB_REPO_S_LIST_RELEASE_ASSETS = (
        "github",
        "github_repo_s_list_release_assets",
        False,
    )
    GITHUB_REPO_S_LIST_RELEASES = ("github", "github_repo_s_list_releases", False)
    GITHUB_REPO_S_LIST_TAG_PROTECTION = (
        "github",
        "github_repo_s_list_tag_protection",
        False,
    )
    GITHUB_REPO_S_LIST_TAGS = ("github", "github_repo_s_list_tags", False)
    GITHUB_REPO_S_LIST_TEAMS = ("github", "github_repo_s_list_teams", False)
    GITHUB_REPO_S_LIST_WEB_HOOK_DELIVERIES = (
        "github",
        "github_repo_s_list_web_hook_deliveries",
        False,
    )
    GITHUB_REPO_S_LIST_WEB_HOOKS = ("github", "github_repo_s_list_web_hooks", False)
    GITHUB_REPO_S_MERGE = ("github", "github_repo_s_merge", False)
    GITHUB_REPO_S_MERGE_UPSTREAM = ("github", "github_repo_s_merge_upstream", False)
    GITHUB_REPO_S_PING_WEB_HOOK = ("github", "github_repo_s_ping_web_hook", False)
    GITHUB_REPO_S_RE_DELIVER_WEB_HOOK_DELIVERY = (
        "github",
        "github_repo_s_re_deliver_web_hook_delivery",
        False,
    )
    GITHUB_REPO_S_REMOVE_APP_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_s_remove_app_access_restrictions",
        False,
    )
    GITHUB_REPO_S_REMOVE_COLLABORATOR = (
        "github",
        "github_repo_s_remove_collaborator",
        False,
    )
    GITHUB_REPO_S_REMOVE_STATUS_CHECK_CONTEXTS = (
        "github",
        "github_repo_s_remove_status_check_contexts",
        False,
    )
    GITHUB_REPO_S_REMOVE_STATUS_CHECK_PROTECTION = (
        "github",
        "github_repo_s_remove_status_check_protection",
        False,
    )
    GITHUB_REPO_S_REMOVE_TEAM_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_s_remove_team_access_restrictions",
        False,
    )
    GITHUB_REPO_S_REMOVE_USER_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_s_remove_user_access_restrictions",
        False,
    )
    GITHUB_REPO_S_RENAME_BRANCH = ("github", "github_repo_s_rename_branch", False)
    GITHUB_REPO_S_REPLACE_ALL_TOPICS = (
        "github",
        "github_repo_s_replace_all_topics",
        False,
    )
    GITHUB_REPO_S_REQUEST_PAGES_BUILD = (
        "github",
        "github_repo_s_request_pages_build",
        False,
    )
    GITHUB_REPO_S_SET_ADMIN_BRANCH_PROTECTION = (
        "github",
        "github_repo_s_set_admin_branch_protection",
        False,
    )
    GITHUB_REPO_S_SET_APP_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_s_set_app_access_restrictions",
        False,
    )
    GITHUB_REPO_S_SET_STATUS_CHECK_CONTEXTS = (
        "github",
        "github_repo_s_set_status_check_contexts",
        False,
    )
    GITHUB_REPO_S_SET_TEAM_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_s_set_team_access_restrictions",
        False,
    )
    GITHUB_REPO_S_SET_USER_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_s_set_user_access_restrictions",
        False,
    )
    GITHUB_REPO_S_TEST_PUSH_WEB_HOOK = (
        "github",
        "github_repo_s_test_push_web_hook",
        False,
    )
    GITHUB_REPO_S_TRANSFER = ("github", "github_repo_s_transfer", False)
    GITHUB_REPO_S_UPDATE = ("github", "github_repo_s_update", False)
    GITHUB_REPO_S_UPDATE_BRANCH_PROTECTION = (
        "github",
        "github_repo_s_update_branch_protection",
        False,
    )
    GITHUB_REPO_S_UPDATE_COMMIT_COMMENT = (
        "github",
        "github_repo_s_update_commit_comment",
        False,
    )
    GITHUB_REPO_S_UPDATE_DEPLOYMENT_BRANCH_POLICY = (
        "github",
        "github_repo_s_update_deployment_branch_policy",
        False,
    )
    GITHUB_REPO_S_UPDATE_INFORMATION_ABOUT_PAGES_SITE = (
        "github",
        "github_repo_s_update_information_about_pages_site",
        False,
    )
    GITHUB_REPO_S_UPDATE_INVITATION = (
        "github",
        "github_repo_s_update_invitation",
        False,
    )
    GITHUB_REPO_S_UPDATE_ORG_RULE_SET = (
        "github",
        "github_repo_s_update_org_rule_set",
        False,
    )
    GITHUB_REPO_S_UPDATE_PULL_REQUEST_REVIEW_PROTECTION = (
        "github",
        "github_repo_s_update_pull_request_review_protection",
        False,
    )
    GITHUB_REPO_S_UPDATE_RELEASE = ("github", "github_repo_s_update_release", False)
    GITHUB_REPO_S_UPDATE_RELEASE_ASSET = (
        "github",
        "github_repo_s_update_release_asset",
        False,
    )
    GITHUB_REPO_S_UPDATE_REPO_RULE_SET = (
        "github",
        "github_repo_s_update_repo_rule_set",
        False,
    )
    GITHUB_REPO_S_UPDATE_STATUS_CHECK_PROTECTION = (
        "github",
        "github_repo_s_update_status_check_protection",
        False,
    )
    GITHUB_REPO_S_UPDATE_WEB_HOOK = ("github", "github_repo_s_update_web_hook", False)
    GITHUB_REPO_S_UPDATE_WEB_HOOK_CONFIG_FOR_REPO = (
        "github",
        "github_repo_s_update_web_hook_config_for_repo",
        False,
    )
    GITHUB_REPO_S_UPLOAD_RELEASE_ASSET = (
        "github",
        "github_repo_s_upload_release_asset",
        False,
    )
    GITHUB_REPO_SADD_APP_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_sadd_app_access_restrictions",
        False,
    )
    GITHUB_REPO_SADD_COLLABORATOR = ("github", "github_repo_sadd_collaborator", False)
    GITHUB_REPO_SADD_STATUS_CHECK_CONTEXTS = (
        "github",
        "github_repo_sadd_status_check_contexts",
        False,
    )
    GITHUB_REPO_SADD_TEAM_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_sadd_team_access_restrictions",
        False,
    )
    GITHUB_REPO_SADD_USER_ACCESS_RESTRICTIONS = (
        "github",
        "github_repo_sadd_user_access_restrictions",
        False,
    )
    GITHUB_SEARCH_CODE = ("github", "github_search_code", False)
    GITHUB_SEARCH_COMMITS = ("github", "github_search_commits", False)
    GITHUB_SEARCH_ISSUES_AND_PULL_REQUESTS = (
        "github",
        "github_search_issues_and_pull_requests",
        False,
    )
    GITHUB_SEARCH_LABELS = ("github", "github_search_labels", False)
    GITHUB_SEARCH_REPO_S = ("github", "github_search_repo_s", False)
    GITHUB_SEARCH_TOPICS = ("github", "github_search_topics", False)
    GITHUB_SEARCH_USERS = ("github", "github_search_users", False)
    GITHUB_SECRET_SCANNING_GET_ALERT = (
        "github",
        "github_secret_scanning_get_alert",
        False,
    )
    GITHUB_SECRET_SCANNING_LIST_ALERTS_FOR_ENTERPRISE = (
        "github",
        "github_secret_scanning_list_alerts_for_enterprise",
        False,
    )
    GITHUB_SECRET_SCANNING_LIST_ALERTS_FOR_ORG = (
        "github",
        "github_secret_scanning_list_alerts_for_org",
        False,
    )
    GITHUB_SECRET_SCANNING_LIST_ALERTS_FOR_REPO = (
        "github",
        "github_secret_scanning_list_alerts_for_repo",
        False,
    )
    GITHUB_SECRET_SCANNING_LIST_LOCATIONS_FOR_ALERT = (
        "github",
        "github_secret_scanning_list_locations_for_alert",
        False,
    )
    GITHUB_SECRET_SCANNING_UPDATE_ALERT = (
        "github",
        "github_secret_scanning_update_alert",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_CREATE_FORK = (
        "github",
        "github_security_advisories_create_fork",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_CREATE_PRIVATE_VULNERABILITY_REPORT = (
        "github",
        "github_security_advisories_create_private_vulnerability_report",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_CREATE_REPOSITORY_ADVISORY = (
        "github",
        "github_security_advisories_create_repository_advisory",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_CREATE_REPOSITORY_ADVISORY_CVE_REQUEST = (
        "github",
        "github_security_advisories_create_repository_advisory_cve_request",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_GET_GLOBAL_ADVISORY = (
        "github",
        "github_security_advisories_get_global_advisory",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_GET_REPOSITORY_ADVISORY = (
        "github",
        "github_security_advisories_get_repository_advisory",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_LIST_GLOBAL_ADVISORIES = (
        "github",
        "github_security_advisories_list_global_advisories",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_LIST_ORG_REPOSITORY_ADVISORIES = (
        "github",
        "github_security_advisories_list_org_repository_advisories",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_LIST_REPOSITORY_ADVISORIES = (
        "github",
        "github_security_advisories_list_repository_advisories",
        False,
    )
    GITHUB_SECURITY_ADVISORIES_UPDATE_REPOSITORY_ADVISORY = (
        "github",
        "github_security_advisories_update_repository_advisory",
        False,
    )
    GITHUB_TEAMS_ADD_MEMBER_LEGACY = ("github", "github_teams_add_member_legacy", False)
    GITHUB_TEAMS_ADD_OR_UPDATE_MEMBERSHIP_FOR_USER_IN_ORG = (
        "github",
        "github_teams_add_or_update_membership_for_user_in_org",
        False,
    )
    GITHUB_TEAMS_ADD_OR_UPDATE_MEMBERSHIP_FOR_USER_LEGACY = (
        "github",
        "github_teams_add_or_update_membership_for_user_legacy",
        False,
    )
    GITHUB_TEAMS_ADD_OR_UPDATE_PROJECT_PERMISSIONS_IN_ORG = (
        "github",
        "github_teams_add_or_update_project_permissions_in_org",
        False,
    )
    GITHUB_TEAMS_ADD_OR_UPDATE_PROJECT_PERMISSIONS_LEGACY = (
        "github",
        "github_teams_add_or_update_project_permissions_legacy",
        False,
    )
    GITHUB_TEAMS_ADD_OR_UPDATE_REPO_PERMISSIONS_IN_ORG = (
        "github",
        "github_teams_add_or_update_repo_permissions_in_org",
        False,
    )
    GITHUB_TEAMS_ADD_OR_UPDATE_REPO_PERMISSIONS_LEGACY = (
        "github",
        "github_teams_add_or_update_repo_permissions_legacy",
        False,
    )
    GITHUB_TEAMS_CHECK_PERMISSIONS_FOR_PROJECT_IN_ORG = (
        "github",
        "github_teams_check_permissions_for_project_in_org",
        False,
    )
    GITHUB_TEAMS_CHECK_PERMISSIONS_FOR_PROJECT_LEGACY = (
        "github",
        "github_teams_check_permissions_for_project_legacy",
        False,
    )
    GITHUB_TEAMS_CHECK_PERMISSIONS_FOR_REPO_IN_ORG = (
        "github",
        "github_teams_check_permissions_for_repo_in_org",
        False,
    )
    GITHUB_TEAMS_CHECK_PERMISSIONS_FOR_REPO_LEGACY = (
        "github",
        "github_teams_check_permissions_for_repo_legacy",
        False,
    )
    GITHUB_TEAMS_CREATE = ("github", "github_teams_create", False)
    GITHUB_TEAMS_CREATE_DISCUSSION_COMMENT_IN_ORG = (
        "github",
        "github_teams_create_discussion_comment_in_org",
        False,
    )
    GITHUB_TEAMS_CREATE_DISCUSSION_COMMENT_LEGACY = (
        "github",
        "github_teams_create_discussion_comment_legacy",
        False,
    )
    GITHUB_TEAMS_CREATE_DISCUSSION_IN_ORG = (
        "github",
        "github_teams_create_discussion_in_org",
        False,
    )
    GITHUB_TEAMS_CREATE_DISCUSSION_LEGACY = (
        "github",
        "github_teams_create_discussion_legacy",
        False,
    )
    GITHUB_TEAMS_DELETE_DISCUSSION_COMMENT_IN_ORG = (
        "github",
        "github_teams_delete_discussion_comment_in_org",
        False,
    )
    GITHUB_TEAMS_DELETE_DISCUSSION_COMMENT_LEGACY = (
        "github",
        "github_teams_delete_discussion_comment_legacy",
        False,
    )
    GITHUB_TEAMS_DELETE_DISCUSSION_IN_ORG = (
        "github",
        "github_teams_delete_discussion_in_org",
        False,
    )
    GITHUB_TEAMS_DELETE_DISCUSSION_LEGACY = (
        "github",
        "github_teams_delete_discussion_legacy",
        False,
    )
    GITHUB_TEAMS_DELETE_IN_ORG = ("github", "github_teams_delete_in_org", False)
    GITHUB_TEAMS_DELETE_LEGACY = ("github", "github_teams_delete_legacy", False)
    GITHUB_TEAMS_GET_BY_NAME = ("github", "github_teams_get_by_name", False)
    GITHUB_TEAMS_GET_DISCUSSION_COMMENT_IN_ORG = (
        "github",
        "github_teams_get_discussion_comment_in_org",
        False,
    )
    GITHUB_TEAMS_GET_DISCUSSION_COMMENT_LEGACY = (
        "github",
        "github_teams_get_discussion_comment_legacy",
        False,
    )
    GITHUB_TEAMS_GET_DISCUSSION_IN_ORG = (
        "github",
        "github_teams_get_discussion_in_org",
        False,
    )
    GITHUB_TEAMS_GET_DISCUSSION_LEGACY = (
        "github",
        "github_teams_get_discussion_legacy",
        False,
    )
    GITHUB_TEAMS_GET_LEGACY = ("github", "github_teams_get_legacy", False)
    GITHUB_TEAMS_GET_MEMBER_LEGACY = ("github", "github_teams_get_member_legacy", False)
    GITHUB_TEAMS_GET_MEMBERSHIP_FOR_USER_IN_ORG = (
        "github",
        "github_teams_get_membership_for_user_in_org",
        False,
    )
    GITHUB_TEAMS_GET_MEMBERSHIP_FOR_USER_LEGACY = (
        "github",
        "github_teams_get_membership_for_user_legacy",
        False,
    )
    GITHUB_TEAMS_LIST = ("github", "github_teams_list", False)
    GITHUB_TEAMS_LIST_CHILD_IN_ORG = ("github", "github_teams_list_child_in_org", False)
    GITHUB_TEAMS_LIST_CHILD_LEGACY = ("github", "github_teams_list_child_legacy", False)
    GITHUB_TEAMS_LIST_DISCUSSION_COMMENTS_IN_ORG = (
        "github",
        "github_teams_list_discussion_comments_in_org",
        False,
    )
    GITHUB_TEAMS_LIST_DISCUSSION_COMMENTS_LEGACY = (
        "github",
        "github_teams_list_discussion_comments_legacy",
        False,
    )
    GITHUB_TEAMS_LIST_DISCUSSIONS_IN_ORG = (
        "github",
        "github_teams_list_discussions_in_org",
        False,
    )
    GITHUB_TEAMS_LIST_DISCUSSIONS_LEGACY = (
        "github",
        "github_teams_list_discussions_legacy",
        False,
    )
    GITHUB_TEAMS_LIST_FOR_AUTHENTICATED_USER = (
        "github",
        "github_teams_list_for_authenticated_user",
        False,
    )
    GITHUB_TEAMS_LIST_MEMBERS_IN_ORG = (
        "github",
        "github_teams_list_members_in_org",
        False,
    )
    GITHUB_TEAMS_LIST_MEMBERS_LEGACY = (
        "github",
        "github_teams_list_members_legacy",
        False,
    )
    GITHUB_TEAMS_LIST_PENDING_INVITATIONS_IN_ORG = (
        "github",
        "github_teams_list_pending_invitations_in_org",
        False,
    )
    GITHUB_TEAMS_LIST_PENDING_INVITATIONS_LEGACY = (
        "github",
        "github_teams_list_pending_invitations_legacy",
        False,
    )
    GITHUB_TEAMS_LIST_PROJECTS_IN_ORG = (
        "github",
        "github_teams_list_projects_in_org",
        False,
    )
    GITHUB_TEAMS_LIST_PROJECTS_LEGACY = (
        "github",
        "github_teams_list_projects_legacy",
        False,
    )
    GITHUB_TEAMS_LIST_REPO_S_IN_ORG = (
        "github",
        "github_teams_list_repo_s_in_org",
        False,
    )
    GITHUB_TEAMS_LIST_REPO_S_LEGACY = (
        "github",
        "github_teams_list_repo_s_legacy",
        False,
    )
    GITHUB_TEAMS_REMOVE_MEMBER_LEGACY = (
        "github",
        "github_teams_remove_member_legacy",
        False,
    )
    GITHUB_TEAMS_REMOVE_MEMBERSHIP_FOR_USER_IN_ORG = (
        "github",
        "github_teams_remove_membership_for_user_in_org",
        False,
    )
    GITHUB_TEAMS_REMOVE_MEMBERSHIP_FOR_USER_LEGACY = (
        "github",
        "github_teams_remove_membership_for_user_legacy",
        False,
    )
    GITHUB_TEAMS_REMOVE_PROJECT_IN_ORG = (
        "github",
        "github_teams_remove_project_in_org",
        False,
    )
    GITHUB_TEAMS_REMOVE_PROJECT_LEGACY = (
        "github",
        "github_teams_remove_project_legacy",
        False,
    )
    GITHUB_TEAMS_REMOVE_REPO_IN_ORG = (
        "github",
        "github_teams_remove_repo_in_org",
        False,
    )
    GITHUB_TEAMS_REMOVE_REPO_LEGACY = (
        "github",
        "github_teams_remove_repo_legacy",
        False,
    )
    GITHUB_TEAMS_UPDATE_DISCUSSION_COMMENT_IN_ORG = (
        "github",
        "github_teams_update_discussion_comment_in_org",
        False,
    )
    GITHUB_TEAMS_UPDATE_DISCUSSION_COMMENT_LEGACY = (
        "github",
        "github_teams_update_discussion_comment_legacy",
        False,
    )
    GITHUB_TEAMS_UPDATE_DISCUSSION_IN_ORG = (
        "github",
        "github_teams_update_discussion_in_org",
        False,
    )
    GITHUB_TEAMS_UPDATE_DISCUSSION_LEGACY = (
        "github",
        "github_teams_update_discussion_legacy",
        False,
    )
    GITHUB_TEAMS_UPDATE_IN_ORG = ("github", "github_teams_update_in_org", False)
    GITHUB_TEAMS_UPDATE_LEGACY = ("github", "github_teams_update_legacy", False)
    GITHUB_USER_SUN_FOLLOW = ("github", "github_user_sun_follow", False)
    GITHUB_USERS_ADD_EMAIL_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_add_email_for_authenticated_user",
        False,
    )
    GITHUB_USERS_ADD_SOCIAL_ACCOUNT_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_add_social_account_for_authenticated_user",
        False,
    )
    GITHUB_USERS_BLOCK = ("github", "github_users_block", False)
    GITHUB_USERS_CHECK_BLOCKED = ("github", "github_users_check_blocked", False)
    GITHUB_USERS_CHECK_FOLLOWING_FOR_USER = (
        "github",
        "github_users_check_following_for_user",
        False,
    )
    GITHUB_USERS_CHECK_PERSON_IS_FOLLOWED_BY_AUTHENTICATED = (
        "github",
        "github_users_check_person_is_followed_by_authenticated",
        False,
    )
    GITHUB_USERS_CREATE_GPG_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_create_gpg_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_CREATE_PUBLIC_SSH_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_create_public_ssh_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_CREATES_SH_SIGNING_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_creates_sh_signing_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_DELETE_EMAIL_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_delete_email_for_authenticated_user",
        False,
    )
    GITHUB_USERS_DELETE_GPG_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_delete_gpg_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_DELETE_PUBLIC_SSH_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_delete_public_ssh_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_DELETE_SOCIAL_ACCOUNT_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_delete_social_account_for_authenticated_user",
        False,
    )
    GITHUB_USERS_DELETE_SSH_SIGNING_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_delete_ssh_signing_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_FOLLOW = ("github", "github_users_follow", False)
    GITHUB_USERS_GET_AUTHENTICATED = ("github", "github_users_get_authenticated", False)
    GITHUB_USERS_GET_BY_USERNAME = ("github", "github_users_get_by_username", False)
    GITHUB_USERS_GET_CONTEXT_FOR_USER = (
        "github",
        "github_users_get_context_for_user",
        False,
    )
    GITHUB_USERS_GET_GPG_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_get_gpg_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_GET_PUBLIC_SSH_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_get_public_ssh_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_GETS_SH_SIGNING_KEY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_gets_sh_signing_key_for_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST = ("github", "github_users_list", False)
    GITHUB_USERS_LIST_BLOCKED_BY_AUTHENTICATED_USER = (
        "github",
        "github_users_list_blocked_by_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_EMAILS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_list_emails_for_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_FOLLOWED_BY_AUTHENTICATED_USER = (
        "github",
        "github_users_list_followed_by_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_FOLLOWERS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_list_followers_for_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_FOLLOWERS_FOR_USER = (
        "github",
        "github_users_list_followers_for_user",
        False,
    )
    GITHUB_USERS_LIST_FOLLOWING_FOR_USER = (
        "github",
        "github_users_list_following_for_user",
        False,
    )
    GITHUB_USERS_LIST_GPG_KEYS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_list_gpg_keys_for_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_GPG_KEYS_FOR_USER = (
        "github",
        "github_users_list_gpg_keys_for_user",
        False,
    )
    GITHUB_USERS_LIST_PUBLIC_EMAILS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_list_public_emails_for_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_PUBLIC_KEYS_FOR_USER = (
        "github",
        "github_users_list_public_keys_for_user",
        False,
    )
    GITHUB_USERS_LIST_PUBLIC_SSH_KEYS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_list_public_ssh_keys_for_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_SOCIAL_ACCOUNTS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_list_social_accounts_for_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_SOCIAL_ACCOUNTS_FOR_USER = (
        "github",
        "github_users_list_social_accounts_for_user",
        False,
    )
    GITHUB_USERS_LIST_SSH_SIGNING_KEYS_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_list_ssh_signing_keys_for_authenticated_user",
        False,
    )
    GITHUB_USERS_LIST_SSH_SIGNING_KEYS_FOR_USER = (
        "github",
        "github_users_list_ssh_signing_keys_for_user",
        False,
    )
    GITHUB_USERS_SET_PRIMARY_EMAIL_VISIBILITY_FOR_AUTHENTICATED_USER = (
        "github",
        "github_users_set_primary_email_visibility_for_authenticated_user",
        False,
    )
    GITHUB_USERS_UNBLOCK = ("github", "github_users_unblock", False)
    GITHUB_USERS_UPDATE_AUTHENTICATED = (
        "github",
        "github_users_update_authenticated",
        False,
    )
    GMAIL_ADD_LABEL_TO_EMAIL = ("gmail", "gmail_add_label_to_email", False)
    GMAIL_CREATE_EMAIL_DRAFT = ("gmail", "gmail_create_email_draft", False)
    GMAIL_FETCH_EMAILS_WITH_LABEL = ("gmail", "gmail_fetch_emails_with_label", False)
    GMAIL_FETCH_LAST_THREE_MESSAGES = (
        "gmail",
        "gmail_fetch_last_three_messages",
        False,
    )
    GMAIL_FETCH_MESSAGE_BY_THREAD_ID = (
        "gmail",
        "gmail_fetch_message_by_thread_id",
        False,
    )
    GMAIL_FIND_EMAIL_ID = ("gmail", "gmail_find_email_id", False)
    GMAIL_LIST_LABELS = ("gmail", "gmail_list_labels", False)
    GMAIL_REPLY_TO_THREAD = ("gmail", "gmail_reply_to_thread", False)
    GMAIL_SEND_EMAIL = ("gmail", "gmail_send_email", False)
    GOOGLECALENDAR_CREATE_EVENT = (
        "googlecalendar",
        "googlecalendar_create_event",
        False,
    )
    GOOGLECALENDAR_DELETE_EVENT = (
        "googlecalendar",
        "googlecalendar_delete_event",
        False,
    )
    GOOGLECALENDAR_DUPLICATE_CALENDAR = (
        "googlecalendar",
        "googlecalendar_duplicate_calendar",
        False,
    )
    GOOGLECALENDAR_FIND_EVENT = ("googlecalendar", "googlecalendar_find_event", False)
    GOOGLECALENDAR_FIND_FREE_SLOTS = (
        "googlecalendar",
        "googlecalendar_find_free_slots",
        False,
    )
    GOOGLECALENDAR_GET_CURRENT_DATE_TIME = (
        "googlecalendar",
        "googlecalendar_get_current_date_time",
        False,
    )
    GOOGLECALENDAR_LIST_CALENDARS = (
        "googlecalendar",
        "googlecalendar_list_calendars",
        False,
    )
    GOOGLECALENDAR_PATCH_CALENDAR = (
        "googlecalendar",
        "googlecalendar_patch_calendar",
        False,
    )
    GOOGLECALENDAR_QUICK_ADD = ("googlecalendar", "googlecalendar_quick_add", False)
    GOOGLECALENDAR_REMOVE_ATTENDEE = (
        "googlecalendar",
        "googlecalendar_remove_attendee",
        False,
    )
    GOOGLECALENDAR_UPDATE_EVENT = (
        "googlecalendar",
        "googlecalendar_update_event",
        False,
    )
    GOOGLEDOCS_CREATE_DOCUMENT = ("googledocs", "googledocs_create_document", False)
    GOOGLEDOCS_GET_DOCUMENT_BY_ID = (
        "googledocs",
        "googledocs_get_document_by_id",
        False,
    )
    GOOGLEDOCS_UPDATE_EXISTING_DOCUMENT = (
        "googledocs",
        "googledocs_update_existing_document",
        False,
    )
    GOOGLEDRIVE_ADD_FILE_SHARING_PREFERENCE = (
        "googledrive",
        "googledrive_add_file_sharing_preference",
        False,
    )
    GOOGLEDRIVE_COPY_FILE = ("googledrive", "googledrive_copy_file", False)
    GOOGLEDRIVE_CREATE_FILE_FROM_TEXT = (
        "googledrive",
        "googledrive_create_file_from_text",
        False,
    )
    GOOGLEDRIVE_CREATE_FOLDER = ("googledrive", "googledrive_create_folder", False)
    GOOGLEDRIVE_DELETE_FOLDER_OR_FILE = (
        "googledrive",
        "googledrive_delete_folder_or_file",
        False,
    )
    GOOGLEDRIVE_EDIT_FILE = ("googledrive", "googledrive_edit_file", False)
    GOOGLEDRIVE_EXPORT_FILE = ("googledrive", "googledrive_export_file", False)
    GOOGLEDRIVE_FIND_FILE = ("googledrive", "googledrive_find_file", False)
    GOOGLEDRIVE_FIND_FOLDER = ("googledrive", "googledrive_find_folder", False)
    GOOGLEMEET_CREATE_MEET = ("googlemeet", "googlemeet_create_meet", False)
    GOOGLEMEET_GET_CONFERENCE_RECORD_FOR_MEET = (
        "googlemeet",
        "googlemeet_get_conference_record_for_meet",
        False,
    )
    GOOGLEMEET_GET_MEET = ("googlemeet", "googlemeet_get_meet", False)
    GOOGLEMEET_GET_RECORDINGS_BY_CONFERENCE_RECORD_ID = (
        "googlemeet",
        "googlemeet_get_recordings_by_conference_record_id",
        False,
    )
    GOOGLEMEET_GET_TRANSCRIPTS_BY_CONFERENCE_RECORD_ID = (
        "googlemeet",
        "googlemeet_get_transcripts_by_conference_record_id",
        False,
    )
    GOOGLESHEETS_BATCH_GET = ("googlesheets", "googlesheets_batch_get", False)
    GOOGLESHEETS_BATCH_UPDATE = ("googlesheets", "googlesheets_batch_update", False)
    GOOGLESHEETS_CLEAR_VALUES = ("googlesheets", "googlesheets_clear_values", False)
    GOOGLESHEETS_CREATE_GOOGLE_SHEET1 = (
        "googlesheets",
        "googlesheets_create_google_sheet1",
        False,
    )
    GOOGLESHEETS_GET_SPREADSHEET_INFO = (
        "googlesheets",
        "googlesheets_get_spreadsheet_info",
        False,
    )
    GOOGLESHEETS_LOOKUP_SPREADSHEET_ROW = (
        "googlesheets",
        "googlesheets_lookup_spreadsheet_row",
        False,
    )
    GOOGLETASKS_CLEAR_TASKS = ("googletasks", "googletasks_clear_tasks", False)
    GOOGLETASKS_CREATE_TASK_LIST = (
        "googletasks",
        "googletasks_create_task_list",
        False,
    )
    GOOGLETASKS_DELETE_TASK = ("googletasks", "googletasks_delete_task", False)
    GOOGLETASKS_DELETE_TASK_LIST = (
        "googletasks",
        "googletasks_delete_task_list",
        False,
    )
    GOOGLETASKS_GET_TASK = ("googletasks", "googletasks_get_task", False)
    GOOGLETASKS_GET_TASK_LIST = ("googletasks", "googletasks_get_task_list", False)
    GOOGLETASKS_INSERT_TASK = ("googletasks", "googletasks_insert_task", False)
    GOOGLETASKS_LIST_TASK_LISTS = ("googletasks", "googletasks_list_task_lists", False)
    GOOGLETASKS_PATCH_TASK = ("googletasks", "googletasks_patch_task", False)
    GOOGLETASKS_PATCH_TASK_LIST = ("googletasks", "googletasks_patch_task_list", False)
    HACKERNEWS_GET_FRONTPAGE = ("hackernews", "hackernews_get_frontpage", True)
    HACKERNEWS_GET_TODAYS_POSTS = ("hackernews", "hackernews_get_todays_posts", True)
    HEROKU_CREATE_HEROKU_APP = ("heroku", "heroku_create_heroku_app", False)
    HEROKU_DELETE_HEROKU_APP = ("heroku", "heroku_delete_heroku_app", False)
    HEROKU_GET_ACCOUNT_DELINQUENCY_INFO = (
        "heroku",
        "heroku_get_account_delinquency_info",
        False,
    )
    HEROKU_GET_ACCOUNT_FEATURE_INFO = (
        "heroku",
        "heroku_get_account_feature_info",
        False,
    )
    HEROKU_GET_ACCOUNT_FEATURE_LIST = (
        "heroku",
        "heroku_get_account_feature_list",
        False,
    )
    HEROKU_GET_ACCOUNT_INFO = ("heroku", "heroku_get_account_info", False)
    HEROKU_GET_HEROKU_APP_INFO = ("heroku", "heroku_get_heroku_app_info", False)
    HEROKU_GET_HEROKU_APP_LIST = ("heroku", "heroku_get_heroku_app_list", False)
    HEROKU_UPDATE_ACCOUNT_FEATURE = ("heroku", "heroku_update_account_feature", False)
    HEROKU_UPDATE_ACCOUNT_INFO = ("heroku", "heroku_update_account_info", False)
    INDUCEDAI_EXTRACT_DATA = ("inducedai", "inducedai_extract_data", False)
    INDUCEDAI_GET_AUTONOMOUS_TASK_STATUS = (
        "inducedai",
        "inducedai_get_autonomous_task_status",
        False,
    )
    INDUCEDAI_GET_DATA_EXTRACTION_STATUS = (
        "inducedai",
        "inducedai_get_data_extraction_status",
        False,
    )
    INDUCEDAI_PERFORM_AUTONOMOUS_TASK = (
        "inducedai",
        "inducedai_perform_autonomous_task",
        False,
    )
    INDUCEDAI_STOP_AUTONOMOUS_TASK = (
        "inducedai",
        "inducedai_stop_autonomous_task",
        False,
    )
    LINEAR_CREATE_LINEAR_ISSUE = ("linear", "linear_create_linear_issue", False)
    LINEAR_LIST_LINEAR_PROJECTS = ("linear", "linear_list_linear_projects", False)
    LINEAR_LIST_LINEAR_TEAMS = ("linear", "linear_list_linear_teams", False)
    LISTENNOTES_DELETE_PODCAST_BY_ID = (
        "listennotes",
        "listennotes_delete_podcast_by_id",
        False,
    )
    LISTENNOTES_GET_BEST_PODCASTS = (
        "listennotes",
        "listennotes_get_best_podcasts",
        False,
    )
    LISTENNOTES_GET_CURATE_D_PODCAST_BY_ID = (
        "listennotes",
        "listennotes_get_curate_d_podcast_by_id",
        False,
    )
    LISTENNOTES_GET_CURATE_D_PODCASTS = (
        "listennotes",
        "listennotes_get_curate_d_podcasts",
        False,
    )
    LISTENNOTES_GET_EPISODE_BY_ID = (
        "listennotes",
        "listennotes_get_episode_by_id",
        False,
    )
    LISTENNOTES_GET_EPISODE_RECOMMENDATIONS = (
        "listennotes",
        "listennotes_get_episode_recommendations",
        False,
    )
    LISTENNOTES_GET_EPISODES_IN_BATCH = (
        "listennotes",
        "listennotes_get_episodes_in_batch",
        False,
    )
    LISTENNOTES_GET_GENRES = ("listennotes", "listennotes_get_genres", False)
    LISTENNOTES_GET_LANGUAGES = ("listennotes", "listennotes_get_languages", False)
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
    LISTENNOTES_GET_PODCAST_BY_ID = (
        "listennotes",
        "listennotes_get_podcast_by_id",
        False,
    )
    LISTENNOTES_GET_PODCAST_RECOMMENDATIONS = (
        "listennotes",
        "listennotes_get_podcast_recommendations",
        False,
    )
    LISTENNOTES_GET_PODCASTS_BY_DOMAIN_NAME = (
        "listennotes",
        "listennotes_get_podcasts_by_domain_name",
        False,
    )
    LISTENNOTES_GET_PODCASTS_IN_BATCH = (
        "listennotes",
        "listennotes_get_podcasts_in_batch",
        False,
    )
    LISTENNOTES_GET_REGIONS = ("listennotes", "listennotes_get_regions", False)
    LISTENNOTES_GET_RELATED_SEARCHES = (
        "listennotes",
        "listennotes_get_related_searches",
        False,
    )
    LISTENNOTES_GET_TRENDING_SEARCHES = (
        "listennotes",
        "listennotes_get_trending_searches",
        False,
    )
    LISTENNOTES_JUST_LISTEN = ("listennotes", "listennotes_just_listen", False)
    LISTENNOTES_REFRESH_RSS = ("listennotes", "listennotes_refresh_rss", False)
    LISTENNOTES_SEARCH = ("listennotes", "listennotes_search", False)
    LISTENNOTES_SEARCH_EPISODE_TITLES = (
        "listennotes",
        "listennotes_search_episode_titles",
        False,
    )
    LISTENNOTES_SPELL_CHECK = ("listennotes", "listennotes_spell_check", False)
    LISTENNOTES_SUBMIT_PODCAST = ("listennotes", "listennotes_submit_podcast", False)
    LISTENNOTES_TYPE_AHEAD = ("listennotes", "listennotes_type_ahead", False)
    MULTIONAI_CREATE_SESSION = ("multionai", "multionai_create_session", False)
    MULTIONAI_DELETE_SESSION = ("multionai", "multionai_delete_session", False)
    MULTIONAI_LIST_SESSIONS = ("multionai", "multionai_list_sessions", False)
    MULTIONAI_RETRIEVE_DATA = ("multionai", "multionai_retrieve_data", False)
    MULTIONAI_SCREENSHOT = ("multionai", "multionai_screenshot", False)
    MULTIONAI_STEP_SESSION = ("multionai", "multionai_step_session", False)
    MULTIONAI_WEB_BROWSE = ("multionai", "multionai_web_browse", False)
    NASA_ORGANIZATION_GET_INFORMATION = (
        "nasa",
        "nasa_organization_get_information",
        False,
    )
    NASA_ORGANIZATION_GET_LIST_BY_NAME = (
        "nasa",
        "nasa_organization_get_list_by_name",
        False,
    )
    NASA_ORGANIZATION_LIST_TYPES = ("nasa", "nasa_organization_list_types", False)
    NASA_PROJECT_FIND_MATCHING_PROJECTS = (
        "nasa",
        "nasa_project_find_matching_projects",
        False,
    )
    NASA_PROJECT_GET_INFO = ("nasa", "nasa_project_get_info", False)
    NASA_PROJECT_LIST_AVAILABLE_IDS = ("nasa", "nasa_project_list_available_ids", False)
    NASA_RESOURCE_GET_SPECIFICATION = ("nasa", "nasa_resource_get_specification", False)
    NOTION_ADD_PAGE_CONTENT = ("notion", "notion_add_page_content", False)
    NOTION_ARCHIVE_NOTION_PAGE = ("notion", "notion_archive_notion_page", False)
    NOTION_CREATE_COMMENT = ("notion", "notion_create_comment", False)
    NOTION_CREATE_DATABASE = ("notion", "notion_create_database", False)
    NOTION_CREATE_NOTION_PAGE = ("notion", "notion_create_notion_page", False)
    NOTION_DELETE_BLOCK = ("notion", "notion_delete_block", False)
    NOTION_FETCH_COMMENTS = ("notion", "notion_fetch_comments", False)
    NOTION_FETCH_DATABASE = ("notion", "notion_fetch_database", False)
    NOTION_FETCH_NOTION_BLOCK = ("notion", "notion_fetch_notion_block", False)
    NOTION_FETCH_NOTION_CHILD_BLOCK = (
        "notion",
        "notion_fetch_notion_child_block",
        False,
    )
    NOTION_FETCH_ROW = ("notion", "notion_fetch_row", False)
    NOTION_GET_ABOUT_ME = ("notion", "notion_get_about_me", False)
    NOTION_GET_ABOUT_USER = ("notion", "notion_get_about_user", False)
    NOTION_INSERT_ROW_DATABASE = ("notion", "notion_insert_row_database", False)
    NOTION_LIST_USERS = ("notion", "notion_list_users", False)
    NOTION_QUERY_DATABASE = ("notion", "notion_query_database", False)
    NOTION_SEARCH_NOTION_PAGE = ("notion", "notion_search_notion_page", False)
    NOTION_UPDATE_ROW_DATABASE = ("notion", "notion_update_row_database", False)
    NOTION_UPDATE_SCHEMA_DATABASE = ("notion", "notion_update_schema_database", False)
    OKTA_APPLICATION_ACTIVATE_CLIENT_SECRET = (
        "okta",
        "okta_application_activate_client_secret",
        False,
    )
    OKTA_APPLICATION_ACTIVATE_DEFAULT_PROVISIONING_CONNECTION = (
        "okta",
        "okta_application_activate_default_provisioning_connection",
        False,
    )
    OKTA_APPLICATION_ACTIVATE_INACTIVE = (
        "okta",
        "okta_application_activate_inactive",
        False,
    )
    OKTA_APPLICATION_ADD_CLIENT_SECRET = (
        "okta",
        "okta_application_add_client_secret",
        False,
    )
    OKTA_APPLICATION_ASSIGN_GROUP_TO = (
        "okta",
        "okta_application_assign_group_to",
        False,
    )
    OKTA_APPLICATION_ASSIGN_POLICY_TO_APPLICATION = (
        "okta",
        "okta_application_assign_policy_to_application",
        False,
    )
    OKTA_APPLICATION_ASSIGN_USER_TO_APPLICATION = (
        "okta",
        "okta_application_assign_user_to_application",
        False,
    )
    OKTA_APPLICATION_CLONE_APPLICATION_KEY_CREDENTIAL = (
        "okta",
        "okta_application_clone_application_key_credential",
        False,
    )
    OKTA_APPLICATION_CREATE_NEW = ("okta", "okta_application_create_new", False)
    OKTA_APPLICATION_DEACTIVATE_CLIENT_SECRET_BY_ID = (
        "okta",
        "okta_application_deactivate_client_secret_by_id",
        False,
    )
    OKTA_APPLICATION_DEACTIVATE_DEFAULT_PROVISIONING_CONNECTION = (
        "okta",
        "okta_application_deactivate_default_provisioning_connection",
        False,
    )
    OKTA_APPLICATION_DEACTIVATE_LIFECYCLE = (
        "okta",
        "okta_application_deactivate_lifecycle",
        False,
    )
    OKTA_APPLICATION_DELETE_CSR_BY_ID = (
        "okta",
        "okta_application_delete_csr_by_id",
        False,
    )
    OKTA_APPLICATION_GENERATE_CSR_FOR_APPLICATION = (
        "okta",
        "okta_application_generate_csr_for_application",
        False,
    )
    OKTA_APPLICATION_GENERATE_X_509_CERTIFICATE = (
        "okta",
        "okta_application_generate_x_509_certificate",
        False,
    )
    OKTA_APPLICATION_GET_BY_ID = ("okta", "okta_application_get_by_id", False)
    OKTA_APPLICATION_GET_CLIENT_SECRET = (
        "okta",
        "okta_application_get_client_secret",
        False,
    )
    OKTA_APPLICATION_GET_CREDENTIALS_CSR_S = (
        "okta",
        "okta_application_get_credentials_csr_s",
        False,
    )
    OKTA_APPLICATION_GET_DEFAULT_PROVISIONING_CONNECTION = (
        "okta",
        "okta_application_get_default_provisioning_connection",
        False,
    )
    OKTA_APPLICATION_GET_FEATURE = ("okta", "okta_application_get_feature", False)
    OKTA_APPLICATION_GET_GROUP_ASSIGNMENT = (
        "okta",
        "okta_application_get_group_assignment",
        False,
    )
    OKTA_APPLICATION_GET_KEY_CREDENTIAL = (
        "okta",
        "okta_application_get_key_credential",
        False,
    )
    OKTA_APPLICATION_GET_SINGLE_SCOPE_CONSENT_GRANT = (
        "okta",
        "okta_application_get_single_scope_consent_grant",
        False,
    )
    OKTA_APPLICATION_GET_SPECIFIC_USER_ASSIGNMENT = (
        "okta",
        "okta_application_get_specific_user_assignment",
        False,
    )
    OKTA_APPLICATION_GET_TOKEN = ("okta", "okta_application_get_token", False)
    OKTA_APPLICATION_GRANT_CONSENT_TO_SCOPE = (
        "okta",
        "okta_application_grant_consent_to_scope",
        False,
    )
    OKTA_APPLICATION_LIST_APPS = ("okta", "okta_application_list_apps", False)
    OKTA_APPLICATION_LIST_ASSIGNED_USERS = (
        "okta",
        "okta_application_list_assigned_users",
        False,
    )
    OKTA_APPLICATION_LIST_CLIENT_SECRETS = (
        "okta",
        "okta_application_list_client_secrets",
        False,
    )
    OKTA_APPLICATION_LIST_CSR_S_FOR_APPLICATION = (
        "okta",
        "okta_application_list_csr_s_for_application",
        False,
    )
    OKTA_APPLICATION_LIST_FEATURES = ("okta", "okta_application_list_features", False)
    OKTA_APPLICATION_LIST_GROUPS_ASSIGNED = (
        "okta",
        "okta_application_list_groups_assigned",
        False,
    )
    OKTA_APPLICATION_LIST_KEY_CREDENTIALS = (
        "okta",
        "okta_application_list_key_credentials",
        False,
    )
    OKTA_APPLICATION_LIST_SCOPE_CONSENT_GRANTS = (
        "okta",
        "okta_application_list_scope_consent_grants",
        False,
    )
    OKTA_APPLICATION_LIST_TOKENS = ("okta", "okta_application_list_tokens", False)
    OKTA_APPLICATION_PREVIEWS_AM_LAPP_METADATA = (
        "okta",
        "okta_application_previews_am_lapp_metadata",
        False,
    )
    OKTA_APPLICATION_PUBLISH_CSR_LIFECYCLE = (
        "okta",
        "okta_application_publish_csr_lifecycle",
        False,
    )
    OKTA_APPLICATION_REMOVE_GROUP_ASSIGNMENT = (
        "okta",
        "okta_application_remove_group_assignment",
        False,
    )
    OKTA_APPLICATION_REMOVE_INACTIVE = (
        "okta",
        "okta_application_remove_inactive",
        False,
    )
    OKTA_APPLICATION_REMOVE_SECRET = ("okta", "okta_application_remove_secret", False)
    OKTA_APPLICATION_REMOVE_USER_FROM = (
        "okta",
        "okta_application_remove_user_from",
        False,
    )
    OKTA_APPLICATION_REVOKE_ALL_TOKENS = (
        "okta",
        "okta_application_revoke_all_tokens",
        False,
    )
    OKTA_APPLICATION_REVOKE_PERMISSION = (
        "okta",
        "okta_application_revoke_permission",
        False,
    )
    OKTA_APPLICATION_REVOKE_TOKEN = ("okta", "okta_application_revoke_token", False)
    OKTA_APPLICATION_SET_DEFAULT_PROVISIONING_CONNECTION = (
        "okta",
        "okta_application_set_default_provisioning_connection",
        False,
    )
    OKTA_APPLICATION_UPDATE_APPLICATION_IN_ORG = (
        "okta",
        "okta_application_update_application_in_org",
        False,
    )
    OKTA_APPLICATION_UPDATE_FEATURE = ("okta", "okta_application_update_feature", False)
    OKTA_APPLICATION_UPDATE_LOGO = ("okta", "okta_application_update_logo", False)
    OKTA_APPLICATION_UPDATE_PROFILE_FOR_USER = (
        "okta",
        "okta_application_update_profile_for_user",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_ACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_authentic_at_or_activate_lifecycle_success",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_CREATE_NEW = ("okta", "okta_authentic_at_or_create_new", False)
    OKTA_AUTHENTIC_AT_OR_DEACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_authentic_at_or_deactivate_lifecycle_success",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_GET_SUCCESS = (
        "okta",
        "okta_authentic_at_or_get_success",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_LIST_ALL_AVAILABLE = (
        "okta",
        "okta_authentic_at_or_list_all_available",
        False,
    )
    OKTA_AUTHENTIC_AT_OR_UPDATE_AUTHENTIC_AT_OR = (
        "okta",
        "okta_authentic_at_or_update_authentic_at_or",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_authorization_server_activate_lifecycle_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ACTIVATE_POLICY_LIFECYCLE = (
        "okta",
        "okta_authorization_server_activate_policy_lifecycle",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ACTIVATE_POLICY_RULE = (
        "okta",
        "okta_authorization_server_activate_policy_rule",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_CLAIMS = (
        "okta",
        "okta_authorization_server_create_claims",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_NEW_SERVER = (
        "okta",
        "okta_authorization_server_create_new_server",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_POLICY = (
        "okta",
        "okta_authorization_server_create_policy",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_POLICY_RULE = (
        "okta",
        "okta_authorization_server_create_policy_rule",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_CREATE_SCOPE = (
        "okta",
        "okta_authorization_server_create_scope",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DEACTIVATE_LIFECYCLE = (
        "okta",
        "okta_authorization_server_deactivate_lifecycle",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DEACTIVATE_POLICY_LIFECYCLE = (
        "okta",
        "okta_authorization_server_deactivate_policy_lifecycle",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DEACTIVATE_POLICY_RULE = (
        "okta",
        "okta_authorization_server_deactivate_policy_rule",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_AU_TH_TOKEN = (
        "okta",
        "okta_authorization_server_delete_au_th_token",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_CLAIM = (
        "okta",
        "okta_authorization_server_delete_claim",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_CLIENT_TOKEN = (
        "okta",
        "okta_authorization_server_delete_client_token",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_POLICY_BY_ID = (
        "okta",
        "okta_authorization_server_delete_policy_by_id",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_POLICY_RULE = (
        "okta",
        "okta_authorization_server_delete_policy_rule",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_SCOPE = (
        "okta",
        "okta_authorization_server_delete_scope",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_DELETE_SUCCESS = (
        "okta",
        "okta_authorization_server_delete_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ENUMERATE_POLICY_RULES = (
        "okta",
        "okta_authorization_server_enumerate_policy_rules",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_BY_ID = (
        "okta",
        "okta_authorization_server_get_by_id",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_CLAIMS = (
        "okta",
        "okta_authorization_server_get_claims",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_CLAIMS_2 = (
        "okta",
        "okta_authorization_server_get_claims_2",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_CLIENT_AU_TH_TOKEN = (
        "okta",
        "okta_authorization_server_get_client_au_th_token",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_CLIENT_TOKENS = (
        "okta",
        "okta_authorization_server_get_client_tokens",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_POLICIES = (
        "okta",
        "okta_authorization_server_get_policies",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_POLICIES_SUCCESS = (
        "okta",
        "okta_authorization_server_get_policies_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_POLICY_RULE_BY_ID = (
        "okta",
        "okta_authorization_server_get_policy_rule_by_id",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_SCOPES = (
        "okta",
        "okta_authorization_server_get_scopes",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_GET_SCOPES_2 = (
        "okta",
        "okta_authorization_server_get_scopes_2",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_LIST_CLIENTS = (
        "okta",
        "okta_authorization_server_list_clients",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_LIST_CREDENTIALS_KEYS = (
        "okta",
        "okta_authorization_server_list_credentials_keys",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_LIST_SERVERS = (
        "okta",
        "okta_authorization_server_list_servers",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_ROTATE_KEY_LIFECYCLE = (
        "okta",
        "okta_authorization_server_rotate_key_lifecycle",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_BY_ID = (
        "okta",
        "okta_authorization_server_update_by_id",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_CLAIM_SUCCESS = (
        "okta",
        "okta_authorization_server_update_claim_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_POLICY_RULE_CONFIGURATION = (
        "okta",
        "okta_authorization_server_update_policy_rule_configuration",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_POLICY_SUCCESS = (
        "okta",
        "okta_authorization_server_update_policy_success",
        False,
    )
    OKTA_AUTHORIZATION_SERVER_UPDATE_SCOPE_SUCCESS = (
        "okta",
        "okta_authorization_server_update_scope_success",
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
    OKTA_BRAND_DELETE_EMAIL_TEMPLATE_CUSTOMIZATION_S = (
        "okta",
        "okta_brand_delete_email_template_customization_s",
        False,
    )
    OKTA_BRAND_DELETE_THEME_BACKGROUND_IMAGE = (
        "okta",
        "okta_brand_delete_theme_background_image",
        False,
    )
    OKTA_BRAND_DELETE_THEME_FAVICON = ("okta", "okta_brand_delete_theme_favicon", False)
    OKTA_BRAND_DELETE_THEME_LOGO = ("okta", "okta_brand_delete_theme_logo", False)
    OKTA_BRAND_GET_ALL_BRANDS = ("okta", "okta_brand_get_all_brands", False)
    OKTA_BRAND_GET_BY_ID = ("okta", "okta_brand_get_by_id", False)
    OKTA_BRAND_GET_EMAIL_CUSTOMIZATION_PREVIEW = (
        "okta",
        "okta_brand_get_email_customization_preview",
        False,
    )
    OKTA_BRAND_GET_EMAIL_TEMPLATE = ("okta", "okta_brand_get_email_template", False)
    OKTA_BRAND_GET_EMAIL_TEMPLATE_CUSTOMIZATION_BY_ID = (
        "okta",
        "okta_brand_get_email_template_customization_by_id",
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
    OKTA_BRAND_GET_THEME_BY_ID = ("okta", "okta_brand_get_theme_by_id", False)
    OKTA_BRAND_GET_THEMES = ("okta", "okta_brand_get_themes", False)
    OKTA_BRAND_LIST_EMAIL_TEMPLATE_CUSTOMIZATION_S = (
        "okta",
        "okta_brand_list_email_template_customization_s",
        False,
    )
    OKTA_BRAND_LIST_EMAIL_TEMPLATES = ("okta", "okta_brand_list_email_templates", False)
    OKTA_BRAND_UPDATE_BY_BRAN_DID = ("okta", "okta_brand_update_by_bran_did", False)
    OKTA_BRAND_UPDATE_EMAIL_CUSTOMIZATION = (
        "okta",
        "okta_brand_update_email_customization",
        False,
    )
    OKTA_BRAND_UPDATE_THEME = ("okta", "okta_brand_update_theme", False)
    OKTA_BRAND_UPDATE_THEME_BACKGROUND_IMAGE = (
        "okta",
        "okta_brand_update_theme_background_image",
        False,
    )
    OKTA_BRAND_UPDATE_THEME_FAVICON = ("okta", "okta_brand_update_theme_favicon", False)
    OKTA_BRAND_UPDATE_THEME_LOGO = ("okta", "okta_brand_update_theme_logo", False)
    OKTA_DOMAIN_CREATE_CERTIFICATE = ("okta", "okta_domain_create_certificate", False)
    OKTA_DOMAIN_CREATE_NEW_DOMAIN = ("okta", "okta_domain_create_new_domain", False)
    OKTA_DOMAIN_GET_BY_ID = ("okta", "okta_domain_get_by_id", False)
    OKTA_DOMAIN_LIST_VERIFIED_CUSTOM = (
        "okta",
        "okta_domain_list_verified_custom",
        False,
    )
    OKTA_DOMAIN_REMOVE_BY_ID = ("okta", "okta_domain_remove_by_id", False)
    OKTA_DOMAIN_VERIFY_BY_ID = ("okta", "okta_domain_verify_by_id", False)
    OKTA_EVENT_HOOK_ACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_event_hook_activate_lifecycle_success",
        False,
    )
    OKTA_EVENT_HOOK_CREATE_SUCCESS = ("okta", "okta_event_hook_create_success", False)
    OKTA_EVENT_HOOK_DEACTIVATE_LIFECYCLE_EVENT = (
        "okta",
        "okta_event_hook_deactivate_lifecycle_event",
        False,
    )
    OKTA_EVENT_HOOK_GET_SUCCESS_EVENT = (
        "okta",
        "okta_event_hook_get_success_event",
        False,
    )
    OKTA_EVENT_HOOK_LIST_SUCCESS_EVENTS = (
        "okta",
        "okta_event_hook_list_success_events",
        False,
    )
    OKTA_EVENT_HOOK_REMOVE_SUCCESS_EVENT = (
        "okta",
        "okta_event_hook_remove_success_event",
        False,
    )
    OKTA_EVENT_HOOK_UPDATE_SUCCESS_EVENT = (
        "okta",
        "okta_event_hook_update_success_event",
        False,
    )
    OKTA_EVENT_HOOK_VERIFY_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_event_hook_verify_lifecycle_success",
        False,
    )
    OKTA_FEATURE_CREATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_feature_create_lifecycle_success",
        False,
    )
    OKTA_FEATURE_GET_SUCCESS = ("okta", "okta_feature_get_success", False)
    OKTA_FEATURE_GET_SUCCESS_BY_ID = ("okta", "okta_feature_get_success_by_id", False)
    OKTA_FEATURE_LIST_DEPENDENCIES = ("okta", "okta_feature_list_dependencies", False)
    OKTA_FEATURE_LIST_DEPENDENTS = ("okta", "okta_feature_list_dependents", False)
    OKTA_GROUP_ACTIVATE_RULE_LIFECYCLE = (
        "okta",
        "okta_group_activate_rule_lifecycle",
        False,
    )
    OKTA_GROUP_ADD_APP_INSTANCE_TARGET_TO_APP_ADMIN_ROLE_GIVEN_TO_GROUP = (
        "okta",
        "okta_group_add_app_instance_target_to_app_admin_role_given_to_group",
        False,
    )
    OKTA_GROUP_ADD_RULE = ("okta", "okta_group_add_rule", False)
    OKTA_GROUP_ADD_USER_TO_GROUP = ("okta", "okta_group_add_user_to_group", False)
    OKTA_GROUP_ASSIGN_ROLE_TO_GROUP = ("okta", "okta_group_assign_role_to_group", False)
    OKTA_GROUP_CREATE_NEW_GROUP = ("okta", "okta_group_create_new_group", False)
    OKTA_GROUP_DEACTIVATE_RULE_LIFECYCLE = (
        "okta",
        "okta_group_deactivate_rule_lifecycle",
        False,
    )
    OKTA_GROUP_DELETE_TARGET_GROUP_ROLES_CATALOG_APPS = (
        "okta",
        "okta_group_delete_target_group_roles_catalog_apps",
        False,
    )
    OKTA_GROUP_ENUMERATE_GROUP_MEMBERS = (
        "okta",
        "okta_group_enumerate_group_members",
        False,
    )
    OKTA_GROUP_GET_ALL_RULES = ("okta", "okta_group_get_all_rules", False)
    OKTA_GROUP_GET_GROUP_RULE_BY_ID = ("okta", "okta_group_get_group_rule_by_id", False)
    OKTA_GROUP_GET_ROLE_LIST = ("okta", "okta_group_get_role_list", False)
    OKTA_GROUP_GET_ROLE_SUCCESS = ("okta", "okta_group_get_role_success", False)
    OKTA_GROUP_GET_ROLE_TARGETS_CATALOG_APPS = (
        "okta",
        "okta_group_get_role_targets_catalog_apps",
        False,
    )
    OKTA_GROUP_GET_RULES = ("okta", "okta_group_get_rules", False)
    OKTA_GROUP_LIST = ("okta", "okta_group_list", False)
    OKTA_GROUP_LIST_ASSIGNED_APPS = ("okta", "okta_group_list_assigned_apps", False)
    OKTA_GROUP_LIST_ROLE_TARGETS_GROUPS = (
        "okta",
        "okta_group_list_role_targets_groups",
        False,
    )
    OKTA_GROUP_REMOVE_APP_INSTANCE_TARGET_TO_APP_ADMIN_ROLE_GIVEN_TO_GROUP = (
        "okta",
        "okta_group_remove_app_instance_target_to_app_admin_role_given_to_group",
        False,
    )
    OKTA_GROUP_REMOVE_OPERATION = ("okta", "okta_group_remove_operation", False)
    OKTA_GROUP_REMOVE_RULE_BY_ID = ("okta", "okta_group_remove_rule_by_id", False)
    OKTA_GROUP_REMOVE_TARGET_GROUP = ("okta", "okta_group_remove_target_group", False)
    OKTA_GROUP_REMOVE_USER_FROM = ("okta", "okta_group_remove_user_from", False)
    OKTA_GROUP_SCHEMA_GET = ("okta", "okta_group_schema_get", False)
    OKTA_GROUP_UN_ASSIGN_ROLE = ("okta", "okta_group_un_assign_role", False)
    OKTA_GROUP_UPDATE_PROFILE = ("okta", "okta_group_update_profile", False)
    OKTA_GROUP_UPDATE_ROLES_CATALOG_APPS = (
        "okta",
        "okta_group_update_roles_catalog_apps",
        False,
    )
    OKTA_GROUP_UPDATE_RULE = ("okta", "okta_group_update_rule", False)
    OKTA_GROUP_UPDATE_TARGET_GROUPS_ROLE = (
        "okta",
        "okta_group_update_target_groups_role",
        False,
    )
    OKTA_IDENTITY_PROVIDE_RUN_LINK_USER = (
        "okta",
        "okta_identity_provide_run_link_user",
        False,
    )
    OKTA_IDENTITY_PROVIDER_ACTIVATE_IDP_LIFECYCLE = (
        "okta",
        "okta_identity_provider_activate_idp_lifecycle",
        False,
    )
    OKTA_IDENTITY_PROVIDER_ADD_NEW_IDP = (
        "okta",
        "okta_identity_provider_add_new_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_ADD_X_509_CERTIFICATE_PUBLIC_KEY = (
        "okta",
        "okta_identity_provider_add_x_509_certificate_public_key",
        False,
    )
    OKTA_IDENTITY_PROVIDER_CLONE_SIGNING_KEY_CREDENTIAL = (
        "okta",
        "okta_identity_provider_clone_signing_key_credential",
        False,
    )
    OKTA_IDENTITY_PROVIDER_DEACTIVATE_IDP = (
        "okta",
        "okta_identity_provider_deactivate_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_DELETE_KEY_CREDENTIAL = (
        "okta",
        "okta_identity_provider_delete_key_credential",
        False,
    )
    OKTA_IDENTITY_PROVIDER_ENUMERATE_IDP_KEYS = (
        "okta",
        "okta_identity_provider_enumerate_idp_keys",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GENERATE_CSR = (
        "okta",
        "okta_identity_provider_generate_csr",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GENERATE_NEW_SIGNING_KEY_CREDENTIAL = (
        "okta",
        "okta_identity_provider_generate_new_signing_key_credential",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_BY_IDP = (
        "okta",
        "okta_identity_provider_get_by_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_CSR_BY_IDP = (
        "okta",
        "okta_identity_provider_get_csr_by_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_KEY_CREDENTIAL_BY_IDP = (
        "okta",
        "okta_identity_provider_get_key_credential_by_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_LINKED_USER_BY_ID = (
        "okta",
        "okta_identity_provider_get_linked_user_by_id",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_SIGNING_KEY_CREDENTIAL_BY_IDP = (
        "okta",
        "okta_identity_provider_get_signing_key_credential_by_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_SOCIAL_AU_TH_TOKENS = (
        "okta",
        "okta_identity_provider_get_social_au_th_tokens",
        False,
    )
    OKTA_IDENTITY_PROVIDER_GET_USER = ("okta", "okta_identity_provider_get_user", False)
    OKTA_IDENTITY_PROVIDER_LINK_USER_TO_IDP_WITHOUT_TRANSACTION = (
        "okta",
        "okta_identity_provider_link_user_to_idp_without_transaction",
        False,
    )
    OKTA_IDENTITY_PROVIDER_LIST = ("okta", "okta_identity_provider_list", False)
    OKTA_IDENTITY_PROVIDER_LIST_CSR_S_FOR_CERTIFICATE_SIGNING_REQUESTS = (
        "okta",
        "okta_identity_provider_list_csr_s_for_certificate_signing_requests",
        False,
    )
    OKTA_IDENTITY_PROVIDER_LIST_SIGNING_KEY_CREDENTIALS = (
        "okta",
        "okta_identity_provider_list_signing_key_credentials",
        False,
    )
    OKTA_IDENTITY_PROVIDER_REMOVE_IDP = (
        "okta",
        "okta_identity_provider_remove_idp",
        False,
    )
    OKTA_IDENTITY_PROVIDER_REVOKE_CSR_FOR_IDENTITY_PROVIDER = (
        "okta",
        "okta_identity_provider_revoke_csr_for_identity_provider",
        False,
    )
    OKTA_IDENTITY_PROVIDER_UPDATE_CONFIGURATION = (
        "okta",
        "okta_identity_provider_update_configuration",
        False,
    )
    OKTA_IDENTITY_PROVIDER_UPDATE_CSR_LIFECYCLE_PUBLISH = (
        "okta",
        "okta_identity_provider_update_csr_lifecycle_publish",
        False,
    )
    OKTA_INLINE_HOOK_ACTIVATE_LIFECYCLE = (
        "okta",
        "okta_inline_hook_activate_lifecycle",
        False,
    )
    OKTA_INLINE_HOOK_CREATE_SUCCESS = ("okta", "okta_inline_hook_create_success", False)
    OKTA_INLINE_HOOK_DEACTIVATE_LIFECYCLE = (
        "okta",
        "okta_inline_hook_deactivate_lifecycle",
        False,
    )
    OKTA_INLINE_HOOK_DELETE_MATCHING_BY_ID = (
        "okta",
        "okta_inline_hook_delete_matching_by_id",
        False,
    )
    OKTA_INLINE_HOOK_GET_BY_ID = ("okta", "okta_inline_hook_get_by_id", False)
    OKTA_INLINE_HOOK_GET_SUCCESS = ("okta", "okta_inline_hook_get_success", False)
    OKTA_INLINE_HOOK_UPDATE_BY_ID = ("okta", "okta_inline_hook_update_by_id", False)
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
    OKTA_LINKED_OBJECT_GET_USER_LINKED_OBJECTS = (
        "okta",
        "okta_linked_object_get_user_linked_objects",
        False,
    )
    OKTA_LINKED_OBJECT_GET_USER_LINKED_OBJECTS_2 = (
        "okta",
        "okta_linked_object_get_user_linked_objects_2",
        False,
    )
    OKTA_LOG_GET_LIST_EVENTS = ("okta", "okta_log_get_list_events", False)
    OKTA_NETWORK_ZONE_ACTIVATE_LIFECYCLE = (
        "okta",
        "okta_network_zone_activate_lifecycle",
        False,
    )
    OKTA_NETWORK_ZONE_CREATE_NEW = ("okta", "okta_network_zone_create_new", False)
    OKTA_NETWORK_ZONE_DEACTIVATE_ZONE_LIFECYCLE = (
        "okta",
        "okta_network_zone_deactivate_zone_lifecycle",
        False,
    )
    OKTA_NETWORK_ZONE_GET_BY_ID = ("okta", "okta_network_zone_get_by_id", False)
    OKTA_NETWORK_ZONE_LIST_ZONES = ("okta", "okta_network_zone_list_zones", False)
    OKTA_NETWORK_ZONE_REMOVE_ZONE = ("okta", "okta_network_zone_remove_zone", False)
    OKTA_NETWORK_ZONE_UPDATE_ZONE = ("okta", "okta_network_zone_update_zone", False)
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
    OKTA_ORG_EXTENDO_KTA_SUPPORT = ("okta", "okta_org_extendo_kta_support", False)
    OKTA_ORG_EXTENDO_KTA_SUPPORT_2 = ("okta", "okta_org_extendo_kta_support_2", False)
    OKTA_ORG_GET_CONTACT_USER = ("okta", "okta_org_get_contact_user", False)
    OKTA_ORG_GET_ORG_PREFERENCES = ("okta", "okta_org_get_org_preferences", False)
    OKTA_ORG_GET_SETTINGS = ("okta", "okta_org_get_settings", False)
    OKTA_ORG_GETO_KTA_COMMUNICATION_SETTINGS = (
        "okta",
        "okta_org_geto_kta_communication_settings",
        False,
    )
    OKTA_ORG_GETO_KTA_SUPPORT_SETTINGS = (
        "okta",
        "okta_org_geto_kta_support_settings",
        False,
    )
    OKTA_ORG_GRAN_TO_KTA_SUPPORT_ACCESS = (
        "okta",
        "okta_org_gran_to_kta_support_access",
        False,
    )
    OKTA_ORG_HIDE_END_USER_FOOTER = ("okta", "okta_org_hide_end_user_footer", False)
    OKTA_ORG_LIST_CONTACT_TYPES = ("okta", "okta_org_list_contact_types", False)
    OKTA_ORG_MAKE_OK_TAU_I_FOOTER_VISIBLE = (
        "okta",
        "okta_org_make_ok_tau_i_footer_visible",
        False,
    )
    OKTA_ORG_UPDATE_CONTACT_USER = ("okta", "okta_org_update_contact_user", False)
    OKTA_ORG_UPDATE_ORGANIZATION_LOGO = (
        "okta",
        "okta_org_update_organization_logo",
        False,
    )
    OKTA_ORG_UPDATE_SETTING = ("okta", "okta_org_update_setting", False)
    OKTA_ORG_UPDATE_SETTINGS = ("okta", "okta_org_update_settings", False)
    OKTA_POLICY_ACTIVATE_LIFECYCLE = ("okta", "okta_policy_activate_lifecycle", False)
    OKTA_POLICY_ACTIVATE_RULE_LIFECYCLE = (
        "okta",
        "okta_policy_activate_rule_lifecycle",
        False,
    )
    OKTA_POLICY_CREATE_NEW_POLICY = ("okta", "okta_policy_create_new_policy", False)
    OKTA_POLICY_CREATE_RULE = ("okta", "okta_policy_create_rule", False)
    OKTA_POLICY_DEACTIVATE_LIFECYCLE = (
        "okta",
        "okta_policy_deactivate_lifecycle",
        False,
    )
    OKTA_POLICY_DEACTIVATE_RULE_LIFECYCLE = (
        "okta",
        "okta_policy_deactivate_rule_lifecycle",
        False,
    )
    OKTA_POLICY_ENUMERATE_RULES = ("okta", "okta_policy_enumerate_rules", False)
    OKTA_POLICY_GET_ALL_WITH_TYPE = ("okta", "okta_policy_get_all_with_type", False)
    OKTA_POLICY_GET_POLICY = ("okta", "okta_policy_get_policy", False)
    OKTA_POLICY_GET_POLICY_RULE = ("okta", "okta_policy_get_policy_rule", False)
    OKTA_POLICY_REMOVE_POLICY_OPERATION = (
        "okta",
        "okta_policy_remove_policy_operation",
        False,
    )
    OKTA_POLICY_REMOVE_RULE = ("okta", "okta_policy_remove_rule", False)
    OKTA_POLICY_UPDATE_OPERATION = ("okta", "okta_policy_update_operation", False)
    OKTA_POLICY_UPDATE_RULE = ("okta", "okta_policy_update_rule", False)
    OKTA_PROFILE_MAPPING_GET_BY_ID = ("okta", "okta_profile_mapping_get_by_id", False)
    OKTA_PROFILE_MAPPING_LIST_WITH_PAGINATION = (
        "okta",
        "okta_profile_mapping_list_with_pagination",
        False,
    )
    OKTA_PROFILE_MAPPING_UPDATE_PROPERTY_MAPPINGS = (
        "okta",
        "okta_profile_mapping_update_property_mappings",
        False,
    )
    OKTA_SESSION_CLOSE = ("okta", "okta_session_close", False)
    OKTA_SESSION_CREATE_SESSION_WITH_TOKEN = (
        "okta",
        "okta_session_create_session_with_token",
        False,
    )
    OKTA_SESSION_GET_DETAILS = ("okta", "okta_session_get_details", False)
    OKTA_SESSION_REFRESH_LIFECYCLE = ("okta", "okta_session_refresh_lifecycle", False)
    OKTA_SUBSCRIPTION_CUSTOM_ROLE_NOTIFICATION_UNSUBSCRIBE = (
        "okta",
        "okta_subscription_custom_role_notification_unsubscribe",
        False,
    )
    OKTA_SUBSCRIPTION_GET_ROLE_SUBSCRIPTIONS_BY_NOTIFICATION_TYPE = (
        "okta",
        "okta_subscription_get_role_subscriptions_by_notification_type",
        False,
    )
    OKTA_SUBSCRIPTION_LIST_ROLE_SUBSCRIPTIONS = (
        "okta",
        "okta_subscription_list_role_subscriptions",
        False,
    )
    OKTA_SUBSCRIPTION_ROLE_NOTIFICATION_SUBSCRIBE = (
        "okta",
        "okta_subscription_role_notification_subscribe",
        False,
    )
    OKTA_SUBSCRIPTION_UNSUBSCRIBE_USER_SUBSCRIPTION_BY_NOTIFICATION_TYPE = (
        "okta",
        "okta_subscription_unsubscribe_user_subscription_by_notification_type",
        False,
    )
    OKTA_SUBSCRIPTION_USER_NOTIFICATION_SUBSCRIBE = (
        "okta",
        "okta_subscription_user_notification_subscribe",
        False,
    )
    OKTA_TEMPLATE_ADD_NEW_CUSTOMS_MS = (
        "okta",
        "okta_template_add_new_customs_ms",
        False,
    )
    OKTA_TEMPLATE_ENUMERATES_MS_TEMPLATES = (
        "okta",
        "okta_template_enumerates_ms_templates",
        False,
    )
    OKTA_TEMPLATE_GET_BY_ID = ("okta", "okta_template_get_by_id", False)
    OKTA_TEMPLATE_PARTIAL_SMS_UPDATE = (
        "okta",
        "okta_template_partial_sms_update",
        False,
    )
    OKTA_TEMPLATE_REMOVES_MS = ("okta", "okta_template_removes_ms", False)
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
    OKTA_TRUSTED_ORIGIN_ACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_trusted_origin_activate_lifecycle_success",
        False,
    )
    OKTA_TRUSTED_ORIGIN_CREATE_SUCCESS = (
        "okta",
        "okta_trusted_origin_create_success",
        False,
    )
    OKTA_TRUSTED_ORIGIN_DEACTIVATE_LIFECYCLE_SUCCESS = (
        "okta",
        "okta_trusted_origin_deactivate_lifecycle_success",
        False,
    )
    OKTA_TRUSTED_ORIGIN_DELETE_SUCCESS = (
        "okta",
        "okta_trusted_origin_delete_success",
        False,
    )
    OKTA_TRUSTED_ORIGIN_GET_LIST = ("okta", "okta_trusted_origin_get_list", False)
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
    OKTA_USE_RUN_ASSIGN_ROLE = ("okta", "okta_use_run_assign_role", False)
    OKTA_USE_RUN_SUSPEND_LIFECYCLE = ("okta", "okta_use_run_suspend_lifecycle", False)
    OKTA_USER_ACTIVATE_LIFECYCLE = ("okta", "okta_user_activate_lifecycle", False)
    OKTA_USER_ADD_APP_INSTANCE_TARGET_TO_APP_ADMINISTRATOR_ROLE_GIVEN_TO_USER = (
        "okta",
        "okta_user_add_app_instance_target_to_app_administrator_role_given_to_user",
        False,
    )
    OKTA_USER_ASSIGN_ROLE = ("okta", "okta_user_assign_role", False)
    OKTA_USER_CHANGE_PASSWORD_VALIDATION = (
        "okta",
        "okta_user_change_password_validation",
        False,
    )
    OKTA_USER_CREATE_NEW_USER = ("okta", "okta_user_create_new_user", False)
    OKTA_USER_DEACTIVATE_LIFECYCLE = ("okta", "okta_user_deactivate_lifecycle", False)
    OKTA_USER_DELETE_LINKED_OBJECTS = ("okta", "okta_user_delete_linked_objects", False)
    OKTA_USER_DELETE_PERMANENTLY = ("okta", "okta_user_delete_permanently", False)
    OKTA_USER_DELETE_TARGET_APP = ("okta", "okta_user_delete_target_app", False)
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
    OKTA_USER_FACTO_RUN_ENROLL_FACTOR = (
        "okta",
        "okta_user_facto_run_enroll_factor",
        False,
    )
    OKTA_USER_FACTOR_ACTIVATE_FACTOR_LIFECYCLE = (
        "okta",
        "okta_user_factor_activate_factor_lifecycle",
        False,
    )
    OKTA_USER_FACTOR_ENROLL_SUPPORTED_FACTOR = (
        "okta",
        "okta_user_factor_enroll_supported_factor",
        False,
    )
    OKTA_USER_FACTOR_ENUMERATE_ENROLLED = (
        "okta",
        "okta_user_factor_enumerate_enrolled",
        False,
    )
    OKTA_USER_FACTOR_ENUMERATE_SECURITY_QUESTIONS = (
        "okta",
        "okta_user_factor_enumerate_security_questions",
        False,
    )
    OKTA_USER_FACTOR_ENUMERATE_SUPPORTED_FACTORS = (
        "okta",
        "okta_user_factor_enumerate_supported_factors",
        False,
    )
    OKTA_USER_FACTOR_GET_FACTOR = ("okta", "okta_user_factor_get_factor", False)
    OKTA_USER_FACTOR_POLL_FACTOR_TRANSACTION_STATUS = (
        "okta",
        "okta_user_factor_poll_factor_transaction_status",
        False,
    )
    OKTA_USER_FACTOR_VERIFY_OT_P = ("okta", "okta_user_factor_verify_ot_p", False)
    OKTA_USER_FORGOT_PASSWORD = ("okta", "okta_user_forgot_password", False)
    OKTA_USER_GENERATE_PASSWORD_RESET_TOKEN = (
        "okta",
        "okta_user_generate_password_reset_token",
        False,
    )
    OKTA_USER_GET_ASSIGNED_ROLE = ("okta", "okta_user_get_assigned_role", False)
    OKTA_USER_GET_CLIENT_REFRESH_TOKEN = (
        "okta",
        "okta_user_get_client_refresh_token",
        False,
    )
    OKTA_USER_GET_GRANT_BY_ID = ("okta", "okta_user_get_grant_by_id", False)
    OKTA_USER_GET_LINKED_OBJECTS = ("okta", "okta_user_get_linked_objects", False)
    OKTA_USER_GET_MEMBER_GROUPS = ("okta", "okta_user_get_member_groups", False)
    OKTA_USER_GET_SUBSCRIPTION_BY_NOTIFICATION = (
        "okta",
        "okta_user_get_subscription_by_notification",
        False,
    )
    OKTA_USER_GETO_KTA_USER = ("okta", "okta_user_geto_kta_user", False)
    OKTA_USER_LIST_ACTIVE_USERS = ("okta", "okta_user_list_active_users", False)
    OKTA_USER_LIST_APP_TARGETS_FOR_ROLE = (
        "okta",
        "okta_user_list_app_targets_for_role",
        False,
    )
    OKTA_USER_LIST_ASSIGNED_APP_LINKS = (
        "okta",
        "okta_user_list_assigned_app_links",
        False,
    )
    OKTA_USER_LIST_ASSIGNED_ROLES = ("okta", "okta_user_list_assigned_roles", False)
    OKTA_USER_LIST_CLIENTS = ("okta", "okta_user_list_clients", False)
    OKTA_USER_LIST_GRANTS = ("okta", "okta_user_list_grants", False)
    OKTA_USER_LIST_GRANTS_FOR_CLIENT = (
        "okta",
        "okta_user_list_grants_for_client",
        False,
    )
    OKTA_USER_LIST_I_DPS_FOR_USER = ("okta", "okta_user_list_i_dps_for_user", False)
    OKTA_USER_LIST_REFRESH_TOKENS_FOR_USER_AND_CLIENT = (
        "okta",
        "okta_user_list_refresh_tokens_for_user_and_client",
        False,
    )
    OKTA_USER_LIST_ROLE_TARGETS_GROUPS = (
        "okta",
        "okta_user_list_role_targets_groups",
        False,
    )
    OKTA_USER_LIST_SUBSCRIPTIONS = ("okta", "okta_user_list_subscriptions", False)
    OKTA_USER_REACTIVATE_USER = ("okta", "okta_user_reactivate_user", False)
    OKTA_USER_REMOVE_APP_INSTANCE_TARGET_TO_APP_ADMINISTRATOR_ROLE_GIVEN_TO = (
        "okta",
        "okta_user_remove_app_instance_target_to_app_administrator_role_given_to",
        False,
    )
    OKTA_USER_REMOVE_TARGET_GROUP = ("okta", "okta_user_remove_target_group", False)
    OKTA_USER_RESET_FACTORS_OPERATION = (
        "okta",
        "okta_user_reset_factors_operation",
        False,
    )
    OKTA_USER_REVOKE_ALL_SESSIONS = ("okta", "okta_user_revoke_all_sessions", False)
    OKTA_USER_REVOKE_ALL_TOKENS = ("okta", "okta_user_revoke_all_tokens", False)
    OKTA_USER_REVOKE_GRANT = ("okta", "okta_user_revoke_grant", False)
    OKTA_USER_REVOKE_GRANTS = ("okta", "okta_user_revoke_grants", False)
    OKTA_USER_REVOKE_GRANTS_FOR_USER_AND_CLIENT = (
        "okta",
        "okta_user_revoke_grants_for_user_and_client",
        False,
    )
    OKTA_USER_REVOKE_TOKEN_FOR_CLIENT = (
        "okta",
        "okta_user_revoke_token_for_client",
        False,
    )
    OKTA_USER_SCHEMA_GET_SCHEMA_BY_ID = (
        "okta",
        "okta_user_schema_get_schema_by_id",
        False,
    )
    OKTA_USER_SCHEMA_GET_USER_SCHEMA = (
        "okta",
        "okta_user_schema_get_user_schema",
        False,
    )
    OKTA_USER_SUSPEND_LIFECYCLE = ("okta", "okta_user_suspend_lifecycle", False)
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
    OKTA_USER_TYPE_GET_ALL_USER_TYPES = (
        "okta",
        "okta_user_type_get_all_user_types",
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
    OKTA_USER_UNLOCK_USER_STATUS = ("okta", "okta_user_unlock_user_status", False)
    OKTA_USER_UPDATE_LINKED_OBJECT = ("okta", "okta_user_update_linked_object", False)
    OKTA_USER_UPDATE_PROFILE = ("okta", "okta_user_update_profile", False)
    OKTA_USER_UPDATE_PROFILE_2 = ("okta", "okta_user_update_profile_2", False)
    OKTA_USER_UPDATE_RECOVERY_QUESTION = (
        "okta",
        "okta_user_update_recovery_question",
        False,
    )
    OKTA_USER_UPDATE_ROLES_CATALOG_APPS = (
        "okta",
        "okta_user_update_roles_catalog_apps",
        False,
    )
    OKTA_USER_UPDATE_ROLES_CATALOG_APPS_2 = (
        "okta",
        "okta_user_update_roles_catalog_apps_2",
        False,
    )
    OKTA_USER_UPDATE_ROLES_CATALOG_APPS_3 = (
        "okta",
        "okta_user_update_roles_catalog_apps_3",
        False,
    )
    PAGERDUTY_ASSOCIATE_SERVICE_TO_INCIDENT_WORK_FLOW_TRIGGER = (
        "pagerduty",
        "pagerduty_associate_service_to_incident_work_flow_trigger",
        False,
    )
    PAGERDUTY_CONVERT_SERVICE_EVENT_RULES_TO_EVENT_ORCHESTRATION = (
        "pagerduty",
        "pagerduty_convert_service_event_rules_to_event_orchestration",
        False,
    )
    PAGERDUTY_CREATE_ADDON = ("pagerduty", "pagerduty_create_addon", False)
    PAGERDUTY_CREATE_AUTOMATION_ACTION = (
        "pagerduty",
        "pagerduty_create_automation_action",
        False,
    )
    PAGERDUTY_CREATE_AUTOMATION_ACTION_INVOCATION = (
        "pagerduty",
        "pagerduty_create_automation_action_invocation",
        False,
    )
    PAGERDUTY_CREATE_AUTOMATION_ACTION_SERVICE_AS_SO_CATION = (
        "pagerduty",
        "pagerduty_create_automation_action_service_as_so_cation",
        False,
    )
    PAGERDUTY_CREATE_AUTOMATION_ACTION_TEAM_ASSOCIATION = (
        "pagerduty",
        "pagerduty_create_automation_action_team_association",
        False,
    )
    PAGERDUTY_CREATE_AUTOMATION_ACTIONS_RUNNER = (
        "pagerduty",
        "pagerduty_create_automation_actions_runner",
        False,
    )
    PAGERDUTY_CREATE_AUTOMATION_ACTIONS_RUNNER_TEAM_ASSOCIATION = (
        "pagerduty",
        "pagerduty_create_automation_actions_runner_team_association",
        False,
    )
    PAGERDUTY_CREATE_BUSINESS_SERVICE = (
        "pagerduty",
        "pagerduty_create_business_service",
        False,
    )
    PAGERDUTY_CREATE_BUSINESS_SERVICE_ACCOUNT_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_create_business_service_account_subscription",
        False,
    )
    PAGERDUTY_CREATE_BUSINESS_SERVICE_NOTIFICATION_SUBSCRIBERS = (
        "pagerduty",
        "pagerduty_create_business_service_notification_subscribers",
        False,
    )
    PAGERDUTY_CREATE_CACHE_VAR_ON_GLOBAL_OR_CH = (
        "pagerduty",
        "pagerduty_create_cache_var_on_global_or_ch",
        False,
    )
    PAGERDUTY_CREATE_CACHE_VAR_ON_SERVICE_OR_CH = (
        "pagerduty",
        "pagerduty_create_cache_var_on_service_or_ch",
        False,
    )
    PAGERDUTY_CREATE_CHANGE_EVENT = (
        "pagerduty",
        "pagerduty_create_change_event",
        False,
    )
    PAGERDUTY_CREATE_CUSTOM_FIELDS_FIELD = (
        "pagerduty",
        "pagerduty_create_custom_fields_field",
        False,
    )
    PAGERDUTY_CREATE_CUSTOM_FIELDS_FIELD_OPTION = (
        "pagerduty",
        "pagerduty_create_custom_fields_field_option",
        False,
    )
    PAGERDUTY_CREATE_ENTITY_TYPE_BY_ID_CHANGE_TAGS = (
        "pagerduty",
        "pagerduty_create_entity_type_by_id_change_tags",
        False,
    )
    PAGERDUTY_CREATE_ESCALATION_POLICY = (
        "pagerduty",
        "pagerduty_create_escalation_policy",
        False,
    )
    PAGERDUTY_CREATE_EXTENSION = ("pagerduty", "pagerduty_create_extension", False)
    PAGERDUTY_CREATE_INCIDENT = ("pagerduty", "pagerduty_create_incident", False)
    PAGERDUTY_CREATE_INCIDENT_NOTE = (
        "pagerduty",
        "pagerduty_create_incident_note",
        False,
    )
    PAGERDUTY_CREATE_INCIDENT_NOTIFICATION_SUBSCRIBERS = (
        "pagerduty",
        "pagerduty_create_incident_notification_subscribers",
        False,
    )
    PAGERDUTY_CREATE_INCIDENT_RESPONDER_REQUEST = (
        "pagerduty",
        "pagerduty_create_incident_responder_request",
        False,
    )
    PAGERDUTY_CREATE_INCIDENT_SNOOZE = (
        "pagerduty",
        "pagerduty_create_incident_snooze",
        False,
    )
    PAGERDUTY_CREATE_INCIDENT_STATUS_UPDATE = (
        "pagerduty",
        "pagerduty_create_incident_status_update",
        False,
    )
    PAGERDUTY_CREATE_INCIDENT_WORK_FLOW_INSTANCE = (
        "pagerduty",
        "pagerduty_create_incident_work_flow_instance",
        False,
    )
    PAGERDUTY_CREATE_INCIDENT_WORK_FLOW_TRIGGER = (
        "pagerduty",
        "pagerduty_create_incident_work_flow_trigger",
        False,
    )
    PAGERDUTY_CREATE_MAINTENANCE_WINDOW = (
        "pagerduty",
        "pagerduty_create_maintenance_window",
        False,
    )
    PAGERDUTY_CREATE_RESPONSE_PLAY = (
        "pagerduty",
        "pagerduty_create_response_play",
        False,
    )
    PAGERDUTY_CREATE_RULE_SET = ("pagerduty", "pagerduty_create_rule_set", False)
    PAGERDUTY_CREATE_RULE_SET_EVENT_RULE = (
        "pagerduty",
        "pagerduty_create_rule_set_event_rule",
        False,
    )
    PAGERDUTY_CREATE_SCHEDULE = ("pagerduty", "pagerduty_create_schedule", False)
    PAGERDUTY_CREATE_SCHEDULE_OVERRIDE = (
        "pagerduty",
        "pagerduty_create_schedule_override",
        False,
    )
    PAGERDUTY_CREATE_SCHEDULE_PREVIEW = (
        "pagerduty",
        "pagerduty_create_schedule_preview",
        False,
    )
    PAGERDUTY_CREATE_SERVICE = ("pagerduty", "pagerduty_create_service", False)
    PAGERDUTY_CREATE_SERVICE_DEPENDENCY = (
        "pagerduty",
        "pagerduty_create_service_dependency",
        False,
    )
    PAGERDUTY_CREATE_SERVICE_EVENT_RULE = (
        "pagerduty",
        "pagerduty_create_service_event_rule",
        False,
    )
    PAGERDUTY_CREATE_SERVICE_INTEGRATION = (
        "pagerduty",
        "pagerduty_create_service_integration",
        False,
    )
    PAGERDUTY_CREATE_STATUS_PAGE_POST = (
        "pagerduty",
        "pagerduty_create_status_page_post",
        False,
    )
    PAGERDUTY_CREATE_STATUS_PAGE_POST_UPDATE = (
        "pagerduty",
        "pagerduty_create_status_page_post_update",
        False,
    )
    PAGERDUTY_CREATE_STATUS_PAGE_POSTMORTEM = (
        "pagerduty",
        "pagerduty_create_status_page_postmortem",
        False,
    )
    PAGERDUTY_CREATE_STATUS_PAGE_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_create_status_page_subscription",
        False,
    )
    PAGERDUTY_CREATE_TAGS = ("pagerduty", "pagerduty_create_tags", False)
    PAGERDUTY_CREATE_TEAM = ("pagerduty", "pagerduty_create_team", False)
    PAGERDUTY_CREATE_TEAM_NOTIFICATION_SUBSCRIPTIONS = (
        "pagerduty",
        "pagerduty_create_team_notification_subscriptions",
        False,
    )
    PAGERDUTY_CREATE_TEMPLATE = ("pagerduty", "pagerduty_create_template", False)
    PAGERDUTY_CREATE_USER_CONTACT_METHOD = (
        "pagerduty",
        "pagerduty_create_user_contact_method",
        False,
    )
    PAGERDUTY_CREATE_USER_HAND_OFF_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_create_user_hand_off_notification_rule",
        False,
    )
    PAGERDUTY_CREATE_USER_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_create_user_notification_rule",
        False,
    )
    PAGERDUTY_CREATE_USER_NOTIFICATION_SUBSCRIPTIONS = (
        "pagerduty",
        "pagerduty_create_user_notification_subscriptions",
        False,
    )
    PAGERDUTY_CREATE_USER_STATUS_UPDATE_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_create_user_status_update_notification_rule",
        False,
    )
    PAGERDUTY_CREATE_WEB_HOOK_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_create_web_hook_subscription",
        False,
    )
    PAGERDUTY_DELETE_ADDON = ("pagerduty", "pagerduty_delete_addon", False)
    PAGERDUTY_DELETE_ALERT_GROUPING_SETTING = (
        "pagerduty",
        "pagerduty_delete_alert_grouping_setting",
        False,
    )
    PAGERDUTY_DELETE_AUTOMATION_ACTION = (
        "pagerduty",
        "pagerduty_delete_automation_action",
        False,
    )
    PAGERDUTY_DELETE_AUTOMATION_ACTION_SERVICE_ASSOCIATION = (
        "pagerduty",
        "pagerduty_delete_automation_action_service_association",
        False,
    )
    PAGERDUTY_DELETE_AUTOMATION_ACTION_TEAM_ASSOCIATION = (
        "pagerduty",
        "pagerduty_delete_automation_action_team_association",
        False,
    )
    PAGERDUTY_DELETE_AUTOMATION_ACTIONS_RUNNER = (
        "pagerduty",
        "pagerduty_delete_automation_actions_runner",
        False,
    )
    PAGERDUTY_DELETE_AUTOMATION_ACTIONS_RUNNER_TEAM_ASSOCIATION = (
        "pagerduty",
        "pagerduty_delete_automation_actions_runner_team_association",
        False,
    )
    PAGERDUTY_DELETE_BUSINESS_SERVICE = (
        "pagerduty",
        "pagerduty_delete_business_service",
        False,
    )
    PAGERDUTY_DELETE_BUSINESS_SERVICE_PRIORITY_THRESHOLDS = (
        "pagerduty",
        "pagerduty_delete_business_service_priority_thresholds",
        False,
    )
    PAGERDUTY_DELETE_CACHE_VAR_ON_GLOBAL_OR_CH = (
        "pagerduty",
        "pagerduty_delete_cache_var_on_global_or_ch",
        False,
    )
    PAGERDUTY_DELETE_CACHE_VAR_ON_SERVICE_OR_CH = (
        "pagerduty",
        "pagerduty_delete_cache_var_on_service_or_ch",
        False,
    )
    PAGERDUTY_DELETE_CUSTOM_FIELDS_FIELD = (
        "pagerduty",
        "pagerduty_delete_custom_fields_field",
        False,
    )
    PAGERDUTY_DELETE_CUSTOM_FIELDS_FIELD_OPTION = (
        "pagerduty",
        "pagerduty_delete_custom_fields_field_option",
        False,
    )
    PAGERDUTY_DELETE_ESCALATION_POLICY = (
        "pagerduty",
        "pagerduty_delete_escalation_policy",
        False,
    )
    PAGERDUTY_DELETE_EXTENSION = ("pagerduty", "pagerduty_delete_extension", False)
    PAGERDUTY_DELETE_INCIDENT_WORK_FLOW = (
        "pagerduty",
        "pagerduty_delete_incident_work_flow",
        False,
    )
    PAGERDUTY_DELETE_INCIDENT_WORK_FLOW_TRIGGER = (
        "pagerduty",
        "pagerduty_delete_incident_work_flow_trigger",
        False,
    )
    PAGERDUTY_DELETE_MAINTENANCE_WINDOW = (
        "pagerduty",
        "pagerduty_delete_maintenance_window",
        False,
    )
    PAGERDUTY_DELETE_ORCHESTRATION = (
        "pagerduty",
        "pagerduty_delete_orchestration",
        False,
    )
    PAGERDUTY_DELETE_ORCHESTRATION_INTEGRATION = (
        "pagerduty",
        "pagerduty_delete_orchestration_integration",
        False,
    )
    PAGERDUTY_DELETE_RESPONSE_PLAY = (
        "pagerduty",
        "pagerduty_delete_response_play",
        False,
    )
    PAGERDUTY_DELETE_RULE_SET = ("pagerduty", "pagerduty_delete_rule_set", False)
    PAGERDUTY_DELETE_RULE_SET_EVENT_RULE = (
        "pagerduty",
        "pagerduty_delete_rule_set_event_rule",
        False,
    )
    PAGERDUTY_DELETE_SCHEDULE = ("pagerduty", "pagerduty_delete_schedule", False)
    PAGERDUTY_DELETE_SCHEDULE_OVERRIDE = (
        "pagerduty",
        "pagerduty_delete_schedule_override",
        False,
    )
    PAGERDUTY_DELETE_SERVICE = ("pagerduty", "pagerduty_delete_service", False)
    PAGERDUTY_DELETE_SERVICE_DEPENDENCY = (
        "pagerduty",
        "pagerduty_delete_service_dependency",
        False,
    )
    PAGERDUTY_DELETE_SERVICE_EVENT_RULE = (
        "pagerduty",
        "pagerduty_delete_service_event_rule",
        False,
    )
    PAGERDUTY_DELETE_SERVICE_FROM_INCIDENT_WORK_FLOW_TRIGGER = (
        "pagerduty",
        "pagerduty_delete_service_from_incident_work_flow_trigger",
        False,
    )
    PAGERDUTY_DELETE_STATUS_PAGE_POST = (
        "pagerduty",
        "pagerduty_delete_status_page_post",
        False,
    )
    PAGERDUTY_DELETE_STATUS_PAGE_POST_UPDATE = (
        "pagerduty",
        "pagerduty_delete_status_page_post_update",
        False,
    )
    PAGERDUTY_DELETE_STATUS_PAGE_POSTMORTEM = (
        "pagerduty",
        "pagerduty_delete_status_page_postmortem",
        False,
    )
    PAGERDUTY_DELETE_STATUS_PAGE_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_delete_status_page_subscription",
        False,
    )
    PAGERDUTY_DELETE_TAG = ("pagerduty", "pagerduty_delete_tag", False)
    PAGERDUTY_DELETE_TEAM = ("pagerduty", "pagerduty_delete_team", False)
    PAGERDUTY_DELETE_TEAM_ESCALATION_POLICY = (
        "pagerduty",
        "pagerduty_delete_team_escalation_policy",
        False,
    )
    PAGERDUTY_DELETE_TEAM_USER = ("pagerduty", "pagerduty_delete_team_user", False)
    PAGERDUTY_DELETE_TEMPLATE = ("pagerduty", "pagerduty_delete_template", False)
    PAGERDUTY_DELETE_USER = ("pagerduty", "pagerduty_delete_user", False)
    PAGERDUTY_DELETE_USER_CONTACT_METHOD = (
        "pagerduty",
        "pagerduty_delete_user_contact_method",
        False,
    )
    PAGERDUTY_DELETE_USER_HAND_OFF_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_delete_user_hand_off_notification_rule",
        False,
    )
    PAGERDUTY_DELETE_USER_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_delete_user_notification_rule",
        False,
    )
    PAGERDUTY_DELETE_USER_SESSION = (
        "pagerduty",
        "pagerduty_delete_user_session",
        False,
    )
    PAGERDUTY_DELETE_USER_SESSIONS = (
        "pagerduty",
        "pagerduty_delete_user_sessions",
        False,
    )
    PAGERDUTY_DELETE_USER_STATUS_UPDATE_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_delete_user_status_update_notification_rule",
        False,
    )
    PAGERDUTY_DELETE_WEB_HOOK_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_delete_web_hook_subscription",
        False,
    )
    PAGERDUTY_ENABLE_EXTENSION = ("pagerduty", "pagerduty_enable_extension", False)
    PAGERDUTY_ENABLE_WEB_HOOK_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_enable_web_hook_subscription",
        False,
    )
    PAGERDUTY_GE_TORCH_ACTIVE_STATUS = (
        "pagerduty",
        "pagerduty_ge_torch_active_status",
        False,
    )
    PAGERDUTY_GE_TORCH_PATH_GLOBAL = (
        "pagerduty",
        "pagerduty_ge_torch_path_global",
        False,
    )
    PAGERDUTY_GE_TORCH_PATH_ROUTER = (
        "pagerduty",
        "pagerduty_ge_torch_path_router",
        False,
    )
    PAGERDUTY_GE_TORCH_PATH_SERVICE = (
        "pagerduty",
        "pagerduty_ge_torch_path_service",
        False,
    )
    PAGERDUTY_GET_ABILITY = ("pagerduty", "pagerduty_get_ability", False)
    PAGERDUTY_GET_ADDON = ("pagerduty", "pagerduty_get_addon", False)
    PAGERDUTY_GET_ALERT_GROUPING_SETTING = (
        "pagerduty",
        "pagerduty_get_alert_grouping_setting",
        False,
    )
    PAGERDUTY_GET_ALL_AUTOMATION_ACTIONS = (
        "pagerduty",
        "pagerduty_get_all_automation_actions",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_INCIDENT_RESPONSES_BY_ID = (
        "pagerduty",
        "pagerduty_get_analytics_incident_responses_by_id",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_INCIDENTS = (
        "pagerduty",
        "pagerduty_get_analytics_incidents",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_INCIDENTS_BY_ID = (
        "pagerduty",
        "pagerduty_get_analytics_incidents_by_id",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_INCIDENTS_ALL = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_incidents_all",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_INCIDENTS_ESCALATION_POLICY = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_incidents_escalation_policy",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_INCIDENTS_ESCALATION_POLICY_ALL = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_incidents_escalation_policy_all",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_INCIDENTS_SERVICE = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_incidents_service",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_INCIDENTS_SERVICE_ALL = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_incidents_service_all",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_INCIDENTS_TEAM = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_incidents_team",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_INCIDENTS_TEAM_ALL = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_incidents_team_all",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_RESPONDER_STEAM = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_responder_steam",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_METRICS_RESPONDERS_ALL = (
        "pagerduty",
        "pagerduty_get_analytics_metrics_responders_all",
        False,
    )
    PAGERDUTY_GET_ANALYTICS_RESPONDER_INCIDENTS = (
        "pagerduty",
        "pagerduty_get_analytics_responder_incidents",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTION = (
        "pagerduty",
        "pagerduty_get_automation_action",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_ACTION_SERVICE_ASSOCIATION = (
        "pagerduty",
        "pagerduty_get_automation_actions_action_service_association",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_ACTION_SERVICE_ASSOCIATIONS = (
        "pagerduty",
        "pagerduty_get_automation_actions_action_service_associations",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_ACTION_TEAM_ASSOCIATION = (
        "pagerduty",
        "pagerduty_get_automation_actions_action_team_association",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_ACTION_TEAM_ASSOCIATIONS = (
        "pagerduty",
        "pagerduty_get_automation_actions_action_team_associations",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_INVOCATION = (
        "pagerduty",
        "pagerduty_get_automation_actions_invocation",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_RUNNER = (
        "pagerduty",
        "pagerduty_get_automation_actions_runner",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_RUNNER_TEAM_ASSOCIATION = (
        "pagerduty",
        "pagerduty_get_automation_actions_runner_team_association",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_RUNNER_TEAM_ASSOCIATIONS = (
        "pagerduty",
        "pagerduty_get_automation_actions_runner_team_associations",
        False,
    )
    PAGERDUTY_GET_AUTOMATION_ACTIONS_RUNNERS = (
        "pagerduty",
        "pagerduty_get_automation_actions_runners",
        False,
    )
    PAGERDUTY_GET_BUSINESS_SERVICE = (
        "pagerduty",
        "pagerduty_get_business_service",
        False,
    )
    PAGERDUTY_GET_BUSINESS_SERVICE_IMPACTS = (
        "pagerduty",
        "pagerduty_get_business_service_impacts",
        False,
    )
    PAGERDUTY_GET_BUSINESS_SERVICE_PRIORITY_THRESHOLDS = (
        "pagerduty",
        "pagerduty_get_business_service_priority_thresholds",
        False,
    )
    PAGERDUTY_GET_BUSINESS_SERVICE_SERVICE_DEPENDENCIES = (
        "pagerduty",
        "pagerduty_get_business_service_service_dependencies",
        False,
    )
    PAGERDUTY_GET_BUSINESS_SERVICE_SUBSCRIBERS = (
        "pagerduty",
        "pagerduty_get_business_service_subscribers",
        False,
    )
    PAGERDUTY_GET_BUSINESS_SERVICE_SUPPORTING_SERVICE_IMPACTS = (
        "pagerduty",
        "pagerduty_get_business_service_supporting_service_impacts",
        False,
    )
    PAGERDUTY_GET_BUSINESS_SERVICE_TOP_LEVEL_IMPACTORS = (
        "pagerduty",
        "pagerduty_get_business_service_top_level_impactors",
        False,
    )
    PAGERDUTY_GET_CACHE_VAR_ON_GLOBAL_OR_CH = (
        "pagerduty",
        "pagerduty_get_cache_var_on_global_or_ch",
        False,
    )
    PAGERDUTY_GET_CACHE_VAR_ON_SERVICE_OR_CH = (
        "pagerduty",
        "pagerduty_get_cache_var_on_service_or_ch",
        False,
    )
    PAGERDUTY_GET_CHANGE_EVENT = ("pagerduty", "pagerduty_get_change_event", False)
    PAGERDUTY_GET_CURRENT_USER = ("pagerduty", "pagerduty_get_current_user", False)
    PAGERDUTY_GET_CUSTOM_FIELDS_FIELD = (
        "pagerduty",
        "pagerduty_get_custom_fields_field",
        False,
    )
    PAGERDUTY_GET_ENTITY_TYPE_BY_ID_TAGS = (
        "pagerduty",
        "pagerduty_get_entity_type_by_id_tags",
        False,
    )
    PAGERDUTY_GET_ESCALATION_POLICY = (
        "pagerduty",
        "pagerduty_get_escalation_policy",
        False,
    )
    PAGERDUTY_GET_EXTENSION = ("pagerduty", "pagerduty_get_extension", False)
    PAGERDUTY_GET_EXTENSION_SCHEMA = (
        "pagerduty",
        "pagerduty_get_extension_schema",
        False,
    )
    PAGERDUTY_GET_INCIDENT = ("pagerduty", "pagerduty_get_incident", False)
    PAGERDUTY_GET_INCIDENT_ALERT = ("pagerduty", "pagerduty_get_incident_alert", False)
    PAGERDUTY_GET_INCIDENT_FIELD_VALUES = (
        "pagerduty",
        "pagerduty_get_incident_field_values",
        False,
    )
    PAGERDUTY_GET_INCIDENT_IMPACTED_BUSINESS_SERVICES = (
        "pagerduty",
        "pagerduty_get_incident_impacted_business_services",
        False,
    )
    PAGERDUTY_GET_INCIDENT_NOTIFICATION_SUBSCRIBERS = (
        "pagerduty",
        "pagerduty_get_incident_notification_subscribers",
        False,
    )
    PAGERDUTY_GET_INCIDENT_WORK_FLOW = (
        "pagerduty",
        "pagerduty_get_incident_work_flow",
        False,
    )
    PAGERDUTY_GET_INCIDENT_WORK_FLOW_ACTION = (
        "pagerduty",
        "pagerduty_get_incident_work_flow_action",
        False,
    )
    PAGERDUTY_GET_INCIDENT_WORK_FLOW_TRIGGER = (
        "pagerduty",
        "pagerduty_get_incident_work_flow_trigger",
        False,
    )
    PAGERDUTY_GET_LOG_ENTRY = ("pagerduty", "pagerduty_get_log_entry", False)
    PAGERDUTY_GET_MAINTENANCE_WINDOW = (
        "pagerduty",
        "pagerduty_get_maintenance_window",
        False,
    )
    PAGERDUTY_GET_OR_CHPA_THUN_ROUTED = (
        "pagerduty",
        "pagerduty_get_or_chpa_thun_routed",
        False,
    )
    PAGERDUTY_GET_ORCHESTRATION = ("pagerduty", "pagerduty_get_orchestration", False)
    PAGERDUTY_GET_ORCHESTRATION_INTEGRATION = (
        "pagerduty",
        "pagerduty_get_orchestration_integration",
        False,
    )
    PAGERDUTY_GET_OUTLIER_INCIDENT = (
        "pagerduty",
        "pagerduty_get_outlier_incident",
        False,
    )
    PAGERDUTY_GET_PAST_INCIDENTS = ("pagerduty", "pagerduty_get_past_incidents", False)
    PAGERDUTY_GET_PAUSED_INCIDENT_REPORT_ALERTS = (
        "pagerduty",
        "pagerduty_get_paused_incident_report_alerts",
        False,
    )
    PAGERDUTY_GET_PAUSED_INCIDENT_REPORT_COUNTS = (
        "pagerduty",
        "pagerduty_get_paused_incident_report_counts",
        False,
    )
    PAGERDUTY_GET_POST_UPDATE = ("pagerduty", "pagerduty_get_post_update", False)
    PAGERDUTY_GET_POSTMORTEM = ("pagerduty", "pagerduty_get_postmortem", False)
    PAGERDUTY_GET_RELATED_INCIDENTS = (
        "pagerduty",
        "pagerduty_get_related_incidents",
        False,
    )
    PAGERDUTY_GET_RESPONSE_PLAY = ("pagerduty", "pagerduty_get_response_play", False)
    PAGERDUTY_GET_RULE_SET = ("pagerduty", "pagerduty_get_rule_set", False)
    PAGERDUTY_GET_RULE_SET_EVENT_RULE = (
        "pagerduty",
        "pagerduty_get_rule_set_event_rule",
        False,
    )
    PAGERDUTY_GET_SCHEDULE = ("pagerduty", "pagerduty_get_schedule", False)
    PAGERDUTY_GET_SERVICE = ("pagerduty", "pagerduty_get_service", False)
    PAGERDUTY_GET_SERVICE_EVENT_RULE = (
        "pagerduty",
        "pagerduty_get_service_event_rule",
        False,
    )
    PAGERDUTY_GET_SERVICE_INTEGRATION = (
        "pagerduty",
        "pagerduty_get_service_integration",
        False,
    )
    PAGERDUTY_GET_STATUS_DASHBOARD_BY_ID = (
        "pagerduty",
        "pagerduty_get_status_dashboard_by_id",
        False,
    )
    PAGERDUTY_GET_STATUS_DASHBOARD_BY_URL_SLUG = (
        "pagerduty",
        "pagerduty_get_status_dashboard_by_url_slug",
        False,
    )
    PAGERDUTY_GET_STATUS_DASHBOARD_SERVICE_IMPACTS_BY_ID = (
        "pagerduty",
        "pagerduty_get_status_dashboard_service_impacts_by_id",
        False,
    )
    PAGERDUTY_GET_STATUS_DASHBOARD_SERVICE_IMPACTS_BY_URL_SLUG = (
        "pagerduty",
        "pagerduty_get_status_dashboard_service_impacts_by_url_slug",
        False,
    )
    PAGERDUTY_GET_STATUS_PAGE_IMPACT = (
        "pagerduty",
        "pagerduty_get_status_page_impact",
        False,
    )
    PAGERDUTY_GET_STATUS_PAGE_POST = (
        "pagerduty",
        "pagerduty_get_status_page_post",
        False,
    )
    PAGERDUTY_GET_STATUS_PAGE_SERVICE = (
        "pagerduty",
        "pagerduty_get_status_page_service",
        False,
    )
    PAGERDUTY_GET_STATUS_PAGE_SEVERITY = (
        "pagerduty",
        "pagerduty_get_status_page_severity",
        False,
    )
    PAGERDUTY_GET_STATUS_PAGE_STATUS = (
        "pagerduty",
        "pagerduty_get_status_page_status",
        False,
    )
    PAGERDUTY_GET_STATUS_PAGE_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_get_status_page_subscription",
        False,
    )
    PAGERDUTY_GET_TAG = ("pagerduty", "pagerduty_get_tag", False)
    PAGERDUTY_GET_TAGS_BY_ENTITY_TYPE = (
        "pagerduty",
        "pagerduty_get_tags_by_entity_type",
        False,
    )
    PAGERDUTY_GET_TEAM = ("pagerduty", "pagerduty_get_team", False)
    PAGERDUTY_GET_TEAM_NOTIFICATION_SUBSCRIPTIONS = (
        "pagerduty",
        "pagerduty_get_team_notification_subscriptions",
        False,
    )
    PAGERDUTY_GET_TECHNICAL_SERVICE_SERVICE_DEPENDENCIES = (
        "pagerduty",
        "pagerduty_get_technical_service_service_dependencies",
        False,
    )
    PAGERDUTY_GET_TEMPLATE = ("pagerduty", "pagerduty_get_template", False)
    PAGERDUTY_GET_TEMPLATE_FIELDS = (
        "pagerduty",
        "pagerduty_get_template_fields",
        False,
    )
    PAGERDUTY_GET_TEMPLATES = ("pagerduty", "pagerduty_get_templates", False)
    PAGERDUTY_GET_USER = ("pagerduty", "pagerduty_get_user", False)
    PAGERDUTY_GET_USER_CONTACT_METHOD = (
        "pagerduty",
        "pagerduty_get_user_contact_method",
        False,
    )
    PAGERDUTY_GET_USER_CONTACT_METHODS = (
        "pagerduty",
        "pagerduty_get_user_contact_methods",
        False,
    )
    PAGERDUTY_GET_USER_HAND_OFF_NOT_IFI_ACTION_RULE = (
        "pagerduty",
        "pagerduty_get_user_hand_off_not_ifi_action_rule",
        False,
    )
    PAGERDUTY_GET_USER_HAND_OFF_NOTIFICATION_RULES = (
        "pagerduty",
        "pagerduty_get_user_hand_off_notification_rules",
        False,
    )
    PAGERDUTY_GET_USER_LICENSE = ("pagerduty", "pagerduty_get_user_license", False)
    PAGERDUTY_GET_USER_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_get_user_notification_rule",
        False,
    )
    PAGERDUTY_GET_USER_NOTIFICATION_RULES = (
        "pagerduty",
        "pagerduty_get_user_notification_rules",
        False,
    )
    PAGERDUTY_GET_USER_NOTIFICATION_SUBSCRIPTIONS = (
        "pagerduty",
        "pagerduty_get_user_notification_subscriptions",
        False,
    )
    PAGERDUTY_GET_USER_SESSION = ("pagerduty", "pagerduty_get_user_session", False)
    PAGERDUTY_GET_USER_SESSIONS = ("pagerduty", "pagerduty_get_user_sessions", False)
    PAGERDUTY_GET_USER_STATUS_UPDATE_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_get_user_status_update_notification_rule",
        False,
    )
    PAGERDUTY_GET_USER_STATUS_UPDATE_NOTIFICATION_RULES = (
        "pagerduty",
        "pagerduty_get_user_status_update_notification_rules",
        False,
    )
    PAGERDUTY_GET_VENDOR = ("pagerduty", "pagerduty_get_vendor", False)
    PAGERDUTY_GET_WEB_HOOK_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_get_web_hook_subscription",
        False,
    )
    PAGERDUTY_LIST_ABILITIES = ("pagerduty", "pagerduty_list_abilities", False)
    PAGERDUTY_LIST_ADDON = ("pagerduty", "pagerduty_list_addon", False)
    PAGERDUTY_LIST_ALERT_GROUPING_SETTINGS = (
        "pagerduty",
        "pagerduty_list_alert_grouping_settings",
        False,
    )
    PAGERDUTY_LIST_AUDIT_RECORDS = ("pagerduty", "pagerduty_list_audit_records", False)
    PAGERDUTY_LIST_AUTOMATION_ACTION_INVOCATIONS = (
        "pagerduty",
        "pagerduty_list_automation_action_invocations",
        False,
    )
    PAGERDUTY_LIST_BUSINESS_SERVICES = (
        "pagerduty",
        "pagerduty_list_business_services",
        False,
    )
    PAGERDUTY_LIST_CACHE_VAR_ON_GLOBAL_OR_CH = (
        "pagerduty",
        "pagerduty_list_cache_var_on_global_or_ch",
        False,
    )
    PAGERDUTY_LIST_CACHE_VAR_ON_SERVICE_OR_CH = (
        "pagerduty",
        "pagerduty_list_cache_var_on_service_or_ch",
        False,
    )
    PAGERDUTY_LIST_CHANGE_EVENTS = ("pagerduty", "pagerduty_list_change_events", False)
    PAGERDUTY_LIST_CUSTOM_FIELDS_FIELD_OPTIONS = (
        "pagerduty",
        "pagerduty_list_custom_fields_field_options",
        False,
    )
    PAGERDUTY_LIST_CUSTOM_FIELDS_FIELDS = (
        "pagerduty",
        "pagerduty_list_custom_fields_fields",
        False,
    )
    PAGERDUTY_LIST_ESCALATION_POLICIES = (
        "pagerduty",
        "pagerduty_list_escalation_policies",
        False,
    )
    PAGERDUTY_LIST_ESCALATION_POLICY_AUDIT_RECORDS = (
        "pagerduty",
        "pagerduty_list_escalation_policy_audit_records",
        False,
    )
    PAGERDUTY_LIST_EVENT_ORCHESTRATIONS = (
        "pagerduty",
        "pagerduty_list_event_orchestrations",
        False,
    )
    PAGERDUTY_LIST_EXTENSION_SCHEMAS = (
        "pagerduty",
        "pagerduty_list_extension_schemas",
        False,
    )
    PAGERDUTY_LIST_EXTENSIONS = ("pagerduty", "pagerduty_list_extensions", False)
    PAGERDUTY_LIST_INCIDENT_ALERTS = (
        "pagerduty",
        "pagerduty_list_incident_alerts",
        False,
    )
    PAGERDUTY_LIST_INCIDENT_LOG_ENTRIES = (
        "pagerduty",
        "pagerduty_list_incident_log_entries",
        False,
    )
    PAGERDUTY_LIST_INCIDENT_NOTES = (
        "pagerduty",
        "pagerduty_list_incident_notes",
        False,
    )
    PAGERDUTY_LIST_INCIDENT_RELATED_CHANGE_EVENTS = (
        "pagerduty",
        "pagerduty_list_incident_related_change_events",
        False,
    )
    PAGERDUTY_LIST_INCIDENT_WORK_FLOW_ACTIONS = (
        "pagerduty",
        "pagerduty_list_incident_work_flow_actions",
        False,
    )
    PAGERDUTY_LIST_INCIDENT_WORK_FLOW_TRIGGERS = (
        "pagerduty",
        "pagerduty_list_incident_work_flow_triggers",
        False,
    )
    PAGERDUTY_LIST_INCIDENT_WORK_FLOWS = (
        "pagerduty",
        "pagerduty_list_incident_work_flows",
        False,
    )
    PAGERDUTY_LIST_INCIDENTS = ("pagerduty", "pagerduty_list_incidents", False)
    PAGERDUTY_LIST_LICENSE_ALLOCATIONS = (
        "pagerduty",
        "pagerduty_list_license_allocations",
        False,
    )
    PAGERDUTY_LIST_LICENSES = ("pagerduty", "pagerduty_list_licenses", False)
    PAGERDUTY_LIST_LOG_ENTRIES = ("pagerduty", "pagerduty_list_log_entries", False)
    PAGERDUTY_LIST_MAINTENANCE_WINDOWS = (
        "pagerduty",
        "pagerduty_list_maintenance_windows",
        False,
    )
    PAGERDUTY_LIST_NOTIFICATIONS = ("pagerduty", "pagerduty_list_notifications", False)
    PAGERDUTY_LIST_ON_CALLS = ("pagerduty", "pagerduty_list_on_calls", False)
    PAGERDUTY_LIST_ORCHESTRATION_INTEGRATIONS = (
        "pagerduty",
        "pagerduty_list_orchestration_integrations",
        False,
    )
    PAGERDUTY_LIST_PRIORITIES = ("pagerduty", "pagerduty_list_priorities", False)
    PAGERDUTY_LIST_RESOURCE_STANDARDS = (
        "pagerduty",
        "pagerduty_list_resource_standards",
        False,
    )
    PAGERDUTY_LIST_RESOURCE_STANDARDS_MANY_SERVICES = (
        "pagerduty",
        "pagerduty_list_resource_standards_many_services",
        False,
    )
    PAGERDUTY_LIST_RESPONSE_PLAYS = (
        "pagerduty",
        "pagerduty_list_response_plays",
        False,
    )
    PAGERDUTY_LIST_RULE_SET_EVENT_RULES = (
        "pagerduty",
        "pagerduty_list_rule_set_event_rules",
        False,
    )
    PAGERDUTY_LIST_RULE_SETS = ("pagerduty", "pagerduty_list_rule_sets", False)
    PAGERDUTY_LIST_SCHEDULE_OVERRIDES = (
        "pagerduty",
        "pagerduty_list_schedule_overrides",
        False,
    )
    PAGERDUTY_LIST_SCHEDULE_USERS = (
        "pagerduty",
        "pagerduty_list_schedule_users",
        False,
    )
    PAGERDUTY_LIST_SCHEDULES = ("pagerduty", "pagerduty_list_schedules", False)
    PAGERDUTY_LIST_SCHEDULES_AUDIT_RECORDS = (
        "pagerduty",
        "pagerduty_list_schedules_audit_records",
        False,
    )
    PAGERDUTY_LIST_SERVICE_AUDIT_RECORDS = (
        "pagerduty",
        "pagerduty_list_service_audit_records",
        False,
    )
    PAGERDUTY_LIST_SERVICE_CHANGE_EVENTS = (
        "pagerduty",
        "pagerduty_list_service_change_events",
        False,
    )
    PAGERDUTY_LIST_SERVICE_EVENT_RULES = (
        "pagerduty",
        "pagerduty_list_service_event_rules",
        False,
    )
    PAGERDUTY_LIST_SERVICES = ("pagerduty", "pagerduty_list_services", False)
    PAGERDUTY_LIST_STANDARDS = ("pagerduty", "pagerduty_list_standards", False)
    PAGERDUTY_LIST_STATUS_DASHBOARDS = (
        "pagerduty",
        "pagerduty_list_status_dashboards",
        False,
    )
    PAGERDUTY_LIST_STATUS_PAGE_IMPACTS = (
        "pagerduty",
        "pagerduty_list_status_page_impacts",
        False,
    )
    PAGERDUTY_LIST_STATUS_PAGE_POST_UPDATES = (
        "pagerduty",
        "pagerduty_list_status_page_post_updates",
        False,
    )
    PAGERDUTY_LIST_STATUS_PAGE_POSTS = (
        "pagerduty",
        "pagerduty_list_status_page_posts",
        False,
    )
    PAGERDUTY_LIST_STATUS_PAGE_SERVICES = (
        "pagerduty",
        "pagerduty_list_status_page_services",
        False,
    )
    PAGERDUTY_LIST_STATUS_PAGE_STATUSES = (
        "pagerduty",
        "pagerduty_list_status_page_statuses",
        False,
    )
    PAGERDUTY_LIST_STATUS_PAGE_SUBSCRIPTIONS = (
        "pagerduty",
        "pagerduty_list_status_page_subscriptions",
        False,
    )
    PAGERDUTY_LIST_STATUS_PAGES = ("pagerduty", "pagerduty_list_status_pages", False)
    PAGERDUTY_LIST_STATUS_PAGESE_VERITIES = (
        "pagerduty",
        "pagerduty_list_status_pagese_verities",
        False,
    )
    PAGERDUTY_LIST_TAGS = ("pagerduty", "pagerduty_list_tags", False)
    PAGERDUTY_LIST_TEAM_USERS = ("pagerduty", "pagerduty_list_team_users", False)
    PAGERDUTY_LIST_TEAMS = ("pagerduty", "pagerduty_list_teams", False)
    PAGERDUTY_LIST_TEAMS_AUDIT_RECORDS = (
        "pagerduty",
        "pagerduty_list_teams_audit_records",
        False,
    )
    PAGERDUTY_LIST_USERS = ("pagerduty", "pagerduty_list_users", False)
    PAGERDUTY_LIST_USERS_AUDIT_RECORDS = (
        "pagerduty",
        "pagerduty_list_users_audit_records",
        False,
    )
    PAGERDUTY_LIST_VENDORS = ("pagerduty", "pagerduty_list_vendors", False)
    PAGERDUTY_LIST_WEB_HOOK_SUBSCRIPTIONS = (
        "pagerduty",
        "pagerduty_list_web_hook_subscriptions",
        False,
    )
    PAGERDUTY_MERGE_INCIDENTS = ("pagerduty", "pagerduty_merge_incidents", False)
    PAGERDUTY_MIGRATE_ORCHESTRATION_INTEGRATION = (
        "pagerduty",
        "pagerduty_migrate_orchestration_integration",
        False,
    )
    PAGERDUTY_POST_ALERT_GROUPING_SETTINGS = (
        "pagerduty",
        "pagerduty_post_alert_grouping_settings",
        False,
    )
    PAGERDUTY_POST_INCIDENT_WORK_FLOW = (
        "pagerduty",
        "pagerduty_post_incident_work_flow",
        False,
    )
    PAGERDUTY_POST_ORCHESTRATION = ("pagerduty", "pagerduty_post_orchestration", False)
    PAGERDUTY_POST_ORCHESTRATION_INTEGRATION = (
        "pagerduty",
        "pagerduty_post_orchestration_integration",
        False,
    )
    PAGERDUTY_PUT_ALERT_GROUPING_SETTING = (
        "pagerduty",
        "pagerduty_put_alert_grouping_setting",
        False,
    )
    PAGERDUTY_PUT_BUSINESS_SERVICE_PRIORITY_THRESHOLDS = (
        "pagerduty",
        "pagerduty_put_business_service_priority_thresholds",
        False,
    )
    PAGERDUTY_PUT_INCIDENT_MANUAL_BUSINESS_SERVICE_ASSOCIATION = (
        "pagerduty",
        "pagerduty_put_incident_manual_business_service_association",
        False,
    )
    PAGERDUTY_PUT_INCIDENT_WORK_FLOW = (
        "pagerduty",
        "pagerduty_put_incident_work_flow",
        False,
    )
    PAGERDUTY_REMOVE_BUSINESS_SERVICE_ACCOUNT_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_remove_business_service_account_subscription",
        False,
    )
    PAGERDUTY_REMOVE_BUSINESS_SERVICE_NOTIFICATION_SUBSCRIBER = (
        "pagerduty",
        "pagerduty_remove_business_service_notification_subscriber",
        False,
    )
    PAGERDUTY_REMOVE_INCIDENT_NOTIFICATION_SUBSCRIBERS = (
        "pagerduty",
        "pagerduty_remove_incident_notification_subscribers",
        False,
    )
    PAGERDUTY_REMOVE_TEAM_NOTIFICATION_SUBSCRIPTIONS = (
        "pagerduty",
        "pagerduty_remove_team_notification_subscriptions",
        False,
    )
    PAGERDUTY_RENDER_TEMPLATE = ("pagerduty", "pagerduty_render_template", False)
    PAGERDUTY_RUN_RESPONSE_PLAY = ("pagerduty", "pagerduty_run_response_play", False)
    PAGERDUTY_SET_INCIDENT_FIELD_VALUES = (
        "pagerduty",
        "pagerduty_set_incident_field_values",
        False,
    )
    PAGERDUTY_TEST_WEB_HOOK_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_test_web_hook_subscription",
        False,
    )
    PAGERDUTY_UNSUBSCRIBE_USER_NOTIFICATION_SUBSCRIPTIONS = (
        "pagerduty",
        "pagerduty_unsubscribe_user_notification_subscriptions",
        False,
    )
    PAGERDUTY_UPDATE_ADDON = ("pagerduty", "pagerduty_update_addon", False)
    PAGERDUTY_UPDATE_AUTOMATION_ACTION = (
        "pagerduty",
        "pagerduty_update_automation_action",
        False,
    )
    PAGERDUTY_UPDATE_AUTOMATION_ACTIONS_RUNNER = (
        "pagerduty",
        "pagerduty_update_automation_actions_runner",
        False,
    )
    PAGERDUTY_UPDATE_BUSINESS_SERVICE = (
        "pagerduty",
        "pagerduty_update_business_service",
        False,
    )
    PAGERDUTY_UPDATE_CACHE_VAR_ON_GLOBAL_OR_CH = (
        "pagerduty",
        "pagerduty_update_cache_var_on_global_or_ch",
        False,
    )
    PAGERDUTY_UPDATE_CACHE_VAR_ON_SERVICE_OR_CH = (
        "pagerduty",
        "pagerduty_update_cache_var_on_service_or_ch",
        False,
    )
    PAGERDUTY_UPDATE_CUSTOM_FIELDS_FIELD = (
        "pagerduty",
        "pagerduty_update_custom_fields_field",
        False,
    )
    PAGERDUTY_UPDATE_CUSTOM_FIELDS_FIELD_OPTION = (
        "pagerduty",
        "pagerduty_update_custom_fields_field_option",
        False,
    )
    PAGERDUTY_UPDATE_ESCALATION_POLICY = (
        "pagerduty",
        "pagerduty_update_escalation_policy",
        False,
    )
    PAGERDUTY_UPDATE_EXTENSION = ("pagerduty", "pagerduty_update_extension", False)
    PAGERDUTY_UPDATE_INCIDENT = ("pagerduty", "pagerduty_update_incident", False)
    PAGERDUTY_UPDATE_INCIDENT_ALERT = (
        "pagerduty",
        "pagerduty_update_incident_alert",
        False,
    )
    PAGERDUTY_UPDATE_INCIDENT_ALERTS = (
        "pagerduty",
        "pagerduty_update_incident_alerts",
        False,
    )
    PAGERDUTY_UPDATE_INCIDENT_WORK_FLOW_TRIGGER = (
        "pagerduty",
        "pagerduty_update_incident_work_flow_trigger",
        False,
    )
    PAGERDUTY_UPDATE_INCIDENTS = ("pagerduty", "pagerduty_update_incidents", False)
    PAGERDUTY_UPDATE_LOG_ENTRY_CHANNEL = (
        "pagerduty",
        "pagerduty_update_log_entry_channel",
        False,
    )
    PAGERDUTY_UPDATE_MAINTENANCE_WINDOW = (
        "pagerduty",
        "pagerduty_update_maintenance_window",
        False,
    )
    PAGERDUTY_UPDATE_OR_CH_ACTIVE_STATUS = (
        "pagerduty",
        "pagerduty_update_or_ch_active_status",
        False,
    )
    PAGERDUTY_UPDATE_OR_CH_PATH_GLOBAL = (
        "pagerduty",
        "pagerduty_update_or_ch_path_global",
        False,
    )
    PAGERDUTY_UPDATE_OR_CH_PATH_ROUTER = (
        "pagerduty",
        "pagerduty_update_or_ch_path_router",
        False,
    )
    PAGERDUTY_UPDATE_OR_CH_PATH_SERVICE = (
        "pagerduty",
        "pagerduty_update_or_ch_path_service",
        False,
    )
    PAGERDUTY_UPDATE_OR_CHPA_THUN_ROUTED = (
        "pagerduty",
        "pagerduty_update_or_chpa_thun_routed",
        False,
    )
    PAGERDUTY_UPDATE_ORCHESTRATION = (
        "pagerduty",
        "pagerduty_update_orchestration",
        False,
    )
    PAGERDUTY_UPDATE_ORCHESTRATION_INTEGRATION = (
        "pagerduty",
        "pagerduty_update_orchestration_integration",
        False,
    )
    PAGERDUTY_UPDATE_RESPONSE_PLAY = (
        "pagerduty",
        "pagerduty_update_response_play",
        False,
    )
    PAGERDUTY_UPDATE_RULE_SET = ("pagerduty", "pagerduty_update_rule_set", False)
    PAGERDUTY_UPDATE_RULE_SET_EVENT_RULE = (
        "pagerduty",
        "pagerduty_update_rule_set_event_rule",
        False,
    )
    PAGERDUTY_UPDATE_SCHEDULE = ("pagerduty", "pagerduty_update_schedule", False)
    PAGERDUTY_UPDATE_SERVICE = ("pagerduty", "pagerduty_update_service", False)
    PAGERDUTY_UPDATE_SERVICE_EVENT_RULE = (
        "pagerduty",
        "pagerduty_update_service_event_rule",
        False,
    )
    PAGERDUTY_UPDATE_SERVICE_INTEGRATION = (
        "pagerduty",
        "pagerduty_update_service_integration",
        False,
    )
    PAGERDUTY_UPDATE_STANDARD = ("pagerduty", "pagerduty_update_standard", False)
    PAGERDUTY_UPDATE_STATUS_PAGE_POST = (
        "pagerduty",
        "pagerduty_update_status_page_post",
        False,
    )
    PAGERDUTY_UPDATE_STATUS_PAGE_POST_UPDATE = (
        "pagerduty",
        "pagerduty_update_status_page_post_update",
        False,
    )
    PAGERDUTY_UPDATE_STATUS_PAGE_POSTMORTEM = (
        "pagerduty",
        "pagerduty_update_status_page_postmortem",
        False,
    )
    PAGERDUTY_UPDATE_TEAM = ("pagerduty", "pagerduty_update_team", False)
    PAGERDUTY_UPDATE_TEAM_ESCALATION_POLICY = (
        "pagerduty",
        "pagerduty_update_team_escalation_policy",
        False,
    )
    PAGERDUTY_UPDATE_TEAM_USER = ("pagerduty", "pagerduty_update_team_user", False)
    PAGERDUTY_UPDATE_TEMPLATE = ("pagerduty", "pagerduty_update_template", False)
    PAGERDUTY_UPDATE_USER_CONTACT_METHOD = (
        "pagerduty",
        "pagerduty_update_user_contact_method",
        False,
    )
    PAGERDUTY_UPDATE_USER_HAND_OFF_NOTIFICATION = (
        "pagerduty",
        "pagerduty_update_user_hand_off_notification",
        False,
    )
    PAGERDUTY_UPDATE_USER_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_update_user_notification_rule",
        False,
    )
    PAGERDUTY_UPDATE_USER_STATUS_UPDATE_NOTIFICATION_RULE = (
        "pagerduty",
        "pagerduty_update_user_status_update_notification_rule",
        False,
    )
    PAGERDUTY_UPDATE_WEB_HOOK_SUBSCRIPTION = (
        "pagerduty",
        "pagerduty_update_web_hook_subscription",
        False,
    )
    PERPLEXITYAI_PERPLEXITY_AI_SEARCH = (
        "perplexityai",
        "perplexityai_perplexity_ai_search",
        False,
    )
    SCHEDULER_SCHEDULE_JOB_ACTION = ("scheduler", "scheduler_schedule_job_action", True)
    SERPAPI_DUCK_DUCK_GO_SEARCH = ("serpapi", "serpapi_duck_duck_go_search", False)
    SERPAPI_EVENT_SEARCH = ("serpapi", "serpapi_event_search", False)
    SERPAPI_FINANCE_SEARCH = ("serpapi", "serpapi_finance_search", False)
    SERPAPI_IMAGE_SEARCH = ("serpapi", "serpapi_image_search", False)
    SERPAPI_NEWS_SEARCH = ("serpapi", "serpapi_news_search", False)
    SERPAPI_SCHOLAR_SEARCH = ("serpapi", "serpapi_scholar_search", False)
    SERPAPI_SEARCH = ("serpapi", "serpapi_search", False)
    SERPAPI_SHOPPING_SEARCH = ("serpapi", "serpapi_shopping_search", False)
    SERPAPI_TRENDS_SEARCH = ("serpapi", "serpapi_trends_search", False)
    SLACK_ADMIN_APPS_APPROVE_APP_INSTALLATION = (
        "slack",
        "slack_admin_apps_approve_app_installation",
        False,
    )
    SLACK_ADMIN_APPS_APPROVED_LIST = ("slack", "slack_admin_apps_approved_list", False)
    SLACK_ADMIN_APPS_REQUESTS_LIST = ("slack", "slack_admin_apps_requests_list", False)
    SLACK_ADMIN_APPS_RESTRICT_APP = ("slack", "slack_admin_apps_restrict_app", False)
    SLACK_ADMIN_APPS_RESTRICTED_GET_LIST = (
        "slack",
        "slack_admin_apps_restricted_get_list",
        False,
    )
    SLACK_ADMIN_CONVERSATION_SUN_ARCHIVE_CHANNEL = (
        "slack",
        "slack_admin_conversation_sun_archive_channel",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_ARCHIVE_CHANNEL = (
        "slack",
        "slack_admin_conversations_archive_channel",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_CONVERT_TO_PRIVATE_CHANNEL = (
        "slack",
        "slack_admin_conversations_convert_to_private_channel",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_CREATE_CHANNEL_BASED_CONVERSATION = (
        "slack",
        "slack_admin_conversations_create_channel_based_conversation",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_DELETE_CHANNEL = (
        "slack",
        "slack_admin_conversations_delete_channel",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_DISCONNECT_SHARED_CHANNEL = (
        "slack",
        "slack_admin_conversations_disconnect_shared_channel",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_E_KM_LIST_ORIGINAL_CONNECTED_CHANNEL_INFO = (
        "slack",
        "slack_admin_conversations_e_km_list_original_connected_channel_info",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_GET_CONVERSATION_PREF_S = (
        "slack",
        "slack_admin_conversations_get_conversation_pref_s",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_GET_TEAMS_LIST = (
        "slack",
        "slack_admin_conversations_get_teams_list",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_INVITE_USER_TO_CHANNEL = (
        "slack",
        "slack_admin_conversations_invite_user_to_channel",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_RENAME_CHANNEL = (
        "slack",
        "slack_admin_conversations_rename_channel",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_RESTRICT_ACCESS_ADD_GROUP_IDP_GROUPS = (
        "slack",
        "slack_admin_conversations_restrict_access_add_group_idp_groups",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_RESTRICT_ACCESS_LIST_GROUPS = (
        "slack",
        "slack_admin_conversations_restrict_access_list_groups",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_RESTRICT_ACCESS_REMOVE_IDP_GROUP = (
        "slack",
        "slack_admin_conversations_restrict_access_remove_idp_group",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_SEARCH_CHANNELS = (
        "slack",
        "slack_admin_conversations_search_channels",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_SET_CONVERSATION_PREF_S = (
        "slack",
        "slack_admin_conversations_set_conversation_pref_s",
        False,
    )
    SLACK_ADMIN_CONVERSATIONS_SET_TEAMS_WORK_SPACE_CONNECTION = (
        "slack",
        "slack_admin_conversations_set_teams_work_space_connection",
        False,
    )
    SLACK_ADMIN_E_MOJI_ADDE_MOJI = ("slack", "slack_admin_e_moji_adde_moji", False)
    SLACK_ADMIN_E_MOJI_ALIAS_ADD = ("slack", "slack_admin_e_moji_alias_add", False)
    SLACK_ADMIN_E_MOJI_LIST_ENTERPRISE_E_MOJI = (
        "slack",
        "slack_admin_e_moji_list_enterprise_e_moji",
        False,
    )
    SLACK_ADMIN_E_MOJI_REMOVE_ENTERPRISE_E_MOJI = (
        "slack",
        "slack_admin_e_moji_remove_enterprise_e_moji",
        False,
    )
    SLACK_ADMIN_E_MOJI_RENAME_E_MOJI = (
        "slack",
        "slack_admin_e_moji_rename_e_moji",
        False,
    )
    SLACK_ADMIN_INVITE_REQUESTS_APPROVE_REQUEST = (
        "slack",
        "slack_admin_invite_requests_approve_request",
        False,
    )
    SLACK_ADMIN_INVITE_REQUESTS_APPROVED_LIST = (
        "slack",
        "slack_admin_invite_requests_approved_list",
        False,
    )
    SLACK_ADMIN_INVITE_REQUESTS_DENIED_LIST = (
        "slack",
        "slack_admin_invite_requests_denied_list",
        False,
    )
    SLACK_ADMIN_INVITE_REQUESTS_DENY_REQUEST = (
        "slack",
        "slack_admin_invite_requests_deny_request",
        False,
    )
    SLACK_ADMIN_INVITE_REQUESTS_LIST_PENDING_WORK_SPACE_INVITE_REQUESTS = (
        "slack",
        "slack_admin_invite_requests_list_pending_work_space_invite_requests",
        False,
    )
    SLACK_ADMIN_TEAMS_ADMINS_GET_ALL = (
        "slack",
        "slack_admin_teams_admins_get_all",
        False,
    )
    SLACK_ADMIN_TEAMS_CREATE_ENTERPRISE_TEAM = (
        "slack",
        "slack_admin_teams_create_enterprise_team",
        False,
    )
    SLACK_ADMIN_TEAMS_LIST_ALL = ("slack", "slack_admin_teams_list_all", False)
    SLACK_ADMIN_TEAMS_OWNERS_LIST_OWNERS = (
        "slack",
        "slack_admin_teams_owners_list_owners",
        False,
    )
    SLACK_ADMIN_TEAMS_SETTINGS_GET_INFO = (
        "slack",
        "slack_admin_teams_settings_get_info",
        False,
    )
    SLACK_ADMIN_TEAMS_SETTINGS_SET_DEFAULT_CHANNELS = (
        "slack",
        "slack_admin_teams_settings_set_default_channels",
        False,
    )
    SLACK_ADMIN_TEAMS_SETTINGS_SET_DESCRIPTION = (
        "slack",
        "slack_admin_teams_settings_set_description",
        False,
    )
    SLACK_ADMIN_TEAMS_SETTINGS_SET_DISCOVER_ABILITY_OF_WORK_SPACE = (
        "slack",
        "slack_admin_teams_settings_set_discover_ability_of_work_space",
        False,
    )
    SLACK_ADMIN_TEAMS_SETTINGS_SET_ICON = (
        "slack",
        "slack_admin_teams_settings_set_icon",
        False,
    )
    SLACK_ADMIN_TEAMS_SETTINGS_SET_NAME = (
        "slack",
        "slack_admin_teams_settings_set_name",
        False,
    )
    SLACK_ADMIN_USER_GROUPS_ADD_DEFAULT_CHANNELS = (
        "slack",
        "slack_admin_user_groups_add_default_channels",
        False,
    )
    SLACK_ADMIN_USER_GROUPS_ASSOCIATE_DEFAULT_WORK_SPACES = (
        "slack",
        "slack_admin_user_groups_associate_default_work_spaces",
        False,
    )
    SLACK_ADMIN_USER_GROUPS_LIST_CHANNELS_GET = (
        "slack",
        "slack_admin_user_groups_list_channels_get",
        False,
    )
    SLACK_ADMIN_USER_GROUPS_REMOVE_CHANNELS = (
        "slack",
        "slack_admin_user_groups_remove_channels",
        False,
    )
    SLACK_ADMIN_USERS_ADD_WORK_SPACE_USER = (
        "slack",
        "slack_admin_users_add_work_space_user",
        False,
    )
    SLACK_ADMIN_USERS_INVITE_USER_TO_WORK_SPACE = (
        "slack",
        "slack_admin_users_invite_user_to_work_space",
        False,
    )
    SLACK_ADMIN_USERS_LIST_WORK_SPACE_USERS = (
        "slack",
        "slack_admin_users_list_work_space_users",
        False,
    )
    SLACK_ADMIN_USERS_REMOVE_USER_FROM_WORK_SPACE = (
        "slack",
        "slack_admin_users_remove_user_from_work_space",
        False,
    )
    SLACK_ADMIN_USERS_SESSION_INVALIDATE_SESSION = (
        "slack",
        "slack_admin_users_session_invalidate_session",
        False,
    )
    SLACK_ADMIN_USERS_SESSION_RESET_SESSIONS = (
        "slack",
        "slack_admin_users_session_reset_sessions",
        False,
    )
    SLACK_ADMIN_USERS_SET_ADMIN_USER = (
        "slack",
        "slack_admin_users_set_admin_user",
        False,
    )
    SLACK_ADMIN_USERS_SET_EXPIRATION_GUEST = (
        "slack",
        "slack_admin_users_set_expiration_guest",
        False,
    )
    SLACK_ADMIN_USERS_SET_REGULAR_USER = (
        "slack",
        "slack_admin_users_set_regular_user",
        False,
    )
    SLACK_ADMIN_USERS_SET_WORK_SPACE_OWNER = (
        "slack",
        "slack_admin_users_set_work_space_owner",
        False,
    )
    SLACK_API_TEST = ("slack", "slack_api_test", False)
    SLACK_APPS_EVENT_AUTHORIZATIONS_GET_LIST = (
        "slack",
        "slack_apps_event_authorizations_get_list",
        False,
    )
    SLACK_APPS_PERMISSIONS_ADDITIONAL_SCOPES_REQUEST = (
        "slack",
        "slack_apps_permissions_additional_scopes_request",
        False,
    )
    SLACK_APPS_PERMISSIONS_LIST_PERMISSIONS = (
        "slack",
        "slack_apps_permissions_list_permissions",
        False,
    )
    SLACK_APPS_PERMISSIONS_RESOURCES_GET_RESOURCES_LIST = (
        "slack",
        "slack_apps_permissions_resources_get_resources_list",
        False,
    )
    SLACK_APPS_PERMISSIONS_SCOPES_GET_LIST = (
        "slack",
        "slack_apps_permissions_scopes_get_list",
        False,
    )
    SLACK_APPS_PERMISSIONS_USERS_LIST_USER_GRANTS = (
        "slack",
        "slack_apps_permissions_users_list_user_grants",
        False,
    )
    SLACK_APPS_PERMISSIONS_USERS_REQUEST_MODAL = (
        "slack",
        "slack_apps_permissions_users_request_modal",
        False,
    )
    SLACK_APPS_UNINSTALL = ("slack", "slack_apps_uninstall", False)
    SLACK_AU_TH_REVOKE = ("slack", "slack_au_th_revoke", False)
    SLACK_AU_TH_TEST = ("slack", "slack_au_th_test", False)
    SLACK_BOTS_INFO = ("slack", "slack_bots_info", False)
    SLACK_CALLS_ADD = ("slack", "slack_calls_add", False)
    SLACK_CALLS_END = ("slack", "slack_calls_end", False)
    SLACK_CALLS_INFO = ("slack", "slack_calls_info", False)
    SLACK_CALLS_PARTICIPANTS_ADD_NEW_PARTICIPANT = (
        "slack",
        "slack_calls_participants_add_new_participant",
        False,
    )
    SLACK_CALLS_PARTICIPANTS_REGISTER_REMOVED = (
        "slack",
        "slack_calls_participants_register_removed",
        False,
    )
    SLACK_CALLS_UPDATE = ("slack", "slack_calls_update", False)
    SLACK_CHAT_DELETE = ("slack", "slack_chat_delete", False)
    SLACK_CHAT_DELETE_SCHEDULED_MESSAGE = (
        "slack",
        "slack_chat_delete_scheduled_message",
        False,
    )
    SLACK_CHAT_GET_PERMALINK = ("slack", "slack_chat_get_permalink", False)
    SLACK_CHAT_ME_MESSAGE = ("slack", "slack_chat_me_message", False)
    SLACK_CHAT_POST_EPHEMERAL = ("slack", "slack_chat_post_ephemeral", False)
    SLACK_CHAT_POST_MESSAGE = ("slack", "slack_chat_post_message", False)
    SLACK_CHAT_SCHEDULE_MESSAGE = ("slack", "slack_chat_schedule_message", False)
    SLACK_CHAT_SCHEDULED_MESSAGES_LIST = (
        "slack",
        "slack_chat_scheduled_messages_list",
        False,
    )
    SLACK_CHAT_UNFURL = ("slack", "slack_chat_unfurl", False)
    SLACK_CHAT_UPDATE = ("slack", "slack_chat_update", False)
    SLACK_CONVERSATION_SUN_ARCHIVE = ("slack", "slack_conversation_sun_archive", False)
    SLACK_CONVERSATIONS_ARCHIVE = ("slack", "slack_conversations_archive", False)
    SLACK_CONVERSATIONS_CLOSE = ("slack", "slack_conversations_close", False)
    SLACK_CONVERSATIONS_CREATE = ("slack", "slack_conversations_create", False)
    SLACK_CONVERSATIONS_HISTORY = ("slack", "slack_conversations_history", False)
    SLACK_CONVERSATIONS_INFO = ("slack", "slack_conversations_info", False)
    SLACK_CONVERSATIONS_INVITE = ("slack", "slack_conversations_invite", False)
    SLACK_CONVERSATIONS_JOIN = ("slack", "slack_conversations_join", False)
    SLACK_CONVERSATIONS_KICK = ("slack", "slack_conversations_kick", False)
    SLACK_CONVERSATIONS_LEAVE = ("slack", "slack_conversations_leave", False)
    SLACK_CONVERSATIONS_LIST = ("slack", "slack_conversations_list", False)
    SLACK_CONVERSATIONS_MARK = ("slack", "slack_conversations_mark", False)
    SLACK_CONVERSATIONS_MEMBERS = ("slack", "slack_conversations_members", False)
    SLACK_CONVERSATIONS_OPEN = ("slack", "slack_conversations_open", False)
    SLACK_CONVERSATIONS_RENAME = ("slack", "slack_conversations_rename", False)
    SLACK_CONVERSATIONS_REPLIES = ("slack", "slack_conversations_replies", False)
    SLACK_CONVERSATIONS_SET_PURPOSE = (
        "slack",
        "slack_conversations_set_purpose",
        False,
    )
    SLACK_CONVERSATIONS_SET_TOPIC = ("slack", "slack_conversations_set_topic", False)
    SLACK_DIALOG_OPEN = ("slack", "slack_dialog_open", False)
    SLACK_DND_END_DND = ("slack", "slack_dnd_end_dnd", False)
    SLACK_DND_END_SNOOZE = ("slack", "slack_dnd_end_snooze", False)
    SLACK_DND_INFO = ("slack", "slack_dnd_info", False)
    SLACK_DND_SET_SNOOZE = ("slack", "slack_dnd_set_snooze", False)
    SLACK_DND_TEAM_INFO = ("slack", "slack_dnd_team_info", False)
    SLACK_E_MOJI_LIST = ("slack", "slack_e_moji_list", False)
    SLACK_FILES_COMMENTS_DELETE_COMMENT = (
        "slack",
        "slack_files_comments_delete_comment",
        False,
    )
    SLACK_FILES_DELETE = ("slack", "slack_files_delete", False)
    SLACK_FILES_INFO = ("slack", "slack_files_info", False)
    SLACK_FILES_LIST = ("slack", "slack_files_list", False)
    SLACK_FILES_REMOTE_ADD_FROM_REMOTE = (
        "slack",
        "slack_files_remote_add_from_remote",
        False,
    )
    SLACK_FILES_REMOTE_DELETE_FILE = ("slack", "slack_files_remote_delete_file", False)
    SLACK_FILES_REMOTE_GET_INFO = ("slack", "slack_files_remote_get_info", False)
    SLACK_FILES_REMOTE_LIST_REMOTE_FILES = (
        "slack",
        "slack_files_remote_list_remote_files",
        False,
    )
    SLACK_FILES_REMOTE_SHARE_REMOTE_FILE = (
        "slack",
        "slack_files_remote_share_remote_file",
        False,
    )
    SLACK_FILES_REMOTE_UPDATE_REMOTE_FILE = (
        "slack",
        "slack_files_remote_update_remote_file",
        False,
    )
    SLACK_FILES_REVOKE_PUBLIC_URL = ("slack", "slack_files_revoke_public_url", False)
    SLACK_FILES_SHARED_PUBLIC_URL = ("slack", "slack_files_shared_public_url", False)
    SLACK_FILES_UPLOAD = ("slack", "slack_files_upload", False)
    SLACK_MIGRATION_EXCHANGE = ("slack", "slack_migration_exchange", False)
    SLACK_OAUTH_ACCESS = ("slack", "slack_oauth_access", False)
    SLACK_OAUTH_TOKEN = ("slack", "slack_oauth_token", False)
    SLACK_OAUTH_V_2_EXCHANGE_TOKEN = ("slack", "slack_oauth_v_2_exchange_token", False)
    SLACK_PINS_ADD = ("slack", "slack_pins_add", False)
    SLACK_PINS_LIST = ("slack", "slack_pins_list", False)
    SLACK_PINS_REMOVE = ("slack", "slack_pins_remove", False)
    SLACK_REACTIONS_ADD = ("slack", "slack_reactions_add", False)
    SLACK_REACTIONS_GET = ("slack", "slack_reactions_get", False)
    SLACK_REACTIONS_LIST = ("slack", "slack_reactions_list", False)
    SLACK_REACTIONS_REMOVE = ("slack", "slack_reactions_remove", False)
    SLACK_REMINDERS_ADD = ("slack", "slack_reminders_add", False)
    SLACK_REMINDERS_COMPLETE = ("slack", "slack_reminders_complete", False)
    SLACK_REMINDERS_DELETE = ("slack", "slack_reminders_delete", False)
    SLACK_REMINDERS_INFO = ("slack", "slack_reminders_info", False)
    SLACK_REMINDERS_LIST = ("slack", "slack_reminders_list", False)
    SLACK_RT_M_CONNECT = ("slack", "slack_rt_m_connect", False)
    SLACK_SEARCH_MESSAGES = ("slack", "slack_search_messages", False)
    SLACK_STARS_ADD = ("slack", "slack_stars_add", False)
    SLACK_STARS_LIST = ("slack", "slack_stars_list", False)
    SLACK_STARS_REMOVE = ("slack", "slack_stars_remove", False)
    SLACK_TEAM_ACCESS_LOGS = ("slack", "slack_team_access_logs", False)
    SLACK_TEAM_INFO = ("slack", "slack_team_info", False)
    SLACK_TEAM_INTEGRATION_LOGS = ("slack", "slack_team_integration_logs", False)
    SLACK_TEAM_PROFILE_GET_PROFILE = ("slack", "slack_team_profile_get_profile", False)
    SLACK_TEAMBILL_ABLE_INFO = ("slack", "slack_teambill_able_info", False)
    SLACK_USER_GROUPS_CREATE = ("slack", "slack_user_groups_create", False)
    SLACK_USER_GROUPS_DISABLE = ("slack", "slack_user_groups_disable", False)
    SLACK_USER_GROUPS_ENABLE = ("slack", "slack_user_groups_enable", False)
    SLACK_USER_GROUPS_LIST = ("slack", "slack_user_groups_list", False)
    SLACK_USER_GROUPS_UPDATE = ("slack", "slack_user_groups_update", False)
    SLACK_USER_GROUPS_USERS_LIST_ALL_USERS = (
        "slack",
        "slack_user_groups_users_list_all_users",
        False,
    )
    SLACK_USER_GROUPS_USERS_UPDATE_LIST = (
        "slack",
        "slack_user_groups_users_update_list",
        False,
    )
    SLACK_USERS_CONVERSATIONS = ("slack", "slack_users_conversations", False)
    SLACK_USERS_DELETE_PHOTO = ("slack", "slack_users_delete_photo", False)
    SLACK_USERS_GET_PRESENCE = ("slack", "slack_users_get_presence", False)
    SLACK_USERS_IDENTITY = ("slack", "slack_users_identity", False)
    SLACK_USERS_INFO = ("slack", "slack_users_info", False)
    SLACK_USERS_LIST = ("slack", "slack_users_list", False)
    SLACK_USERS_LOOKUP_BY_EMAIL = ("slack", "slack_users_lookup_by_email", False)
    SLACK_USERS_PROFILE_GET_PROFILE_INFO = (
        "slack",
        "slack_users_profile_get_profile_info",
        False,
    )
    SLACK_USERS_PROFILE_SET_PROFILE_INFO = (
        "slack",
        "slack_users_profile_set_profile_info",
        False,
    )
    SLACK_USERS_SET_ACTIVE = ("slack", "slack_users_set_active", False)
    SLACK_USERS_SET_PHOTO = ("slack", "slack_users_set_photo", False)
    SLACK_USERS_SET_PRESENCE = ("slack", "slack_users_set_presence", False)
    SLACK_VIEWS_OPEN = ("slack", "slack_views_open", False)
    SLACK_VIEWS_PUBLISH = ("slack", "slack_views_publish", False)
    SLACK_VIEWS_PUSH = ("slack", "slack_views_push", False)
    SLACK_VIEWS_UPDATE = ("slack", "slack_views_update", False)
    SLACK_WORK_FLOWS_STEP_COMPLETED = (
        "slack",
        "slack_work_flows_step_completed",
        False,
    )
    SLACK_WORK_FLOWS_STEP_FAILED = ("slack", "slack_work_flows_step_failed", False)
    SLACK_WORK_FLOWS_UPDATE_STEP = ("slack", "slack_work_flows_update_step", False)
    SLACKBOT_API_TEST = ("slackbot", "slackbot_api_test", False)
    SLACKBOT_APPS_EVENT_AUTHORIZATIONS_GET_LIST = (
        "slackbot",
        "slackbot_apps_event_authorizations_get_list",
        False,
    )
    SLACKBOT_APPS_PERMISSIONS_ADDITIONAL_SCOPES_REQUEST = (
        "slackbot",
        "slackbot_apps_permissions_additional_scopes_request",
        False,
    )
    SLACKBOT_APPS_PERMISSIONS_LIST_PERMISSIONS = (
        "slackbot",
        "slackbot_apps_permissions_list_permissions",
        False,
    )
    SLACKBOT_APPS_PERMISSIONS_RESOURCES_GET_RESOURCES_LIST = (
        "slackbot",
        "slackbot_apps_permissions_resources_get_resources_list",
        False,
    )
    SLACKBOT_APPS_PERMISSIONS_SCOPES_GET_LIST = (
        "slackbot",
        "slackbot_apps_permissions_scopes_get_list",
        False,
    )
    SLACKBOT_APPS_PERMISSIONS_USERS_LIST_USER_GRANTS = (
        "slackbot",
        "slackbot_apps_permissions_users_list_user_grants",
        False,
    )
    SLACKBOT_APPS_PERMISSIONS_USERS_REQUEST_MODAL = (
        "slackbot",
        "slackbot_apps_permissions_users_request_modal",
        False,
    )
    SLACKBOT_APPS_UNINSTALL = ("slackbot", "slackbot_apps_uninstall", False)
    SLACKBOT_AU_TH_REVOKE = ("slackbot", "slackbot_au_th_revoke", False)
    SLACKBOT_AU_TH_TEST = ("slackbot", "slackbot_au_th_test", False)
    SLACKBOT_BOTS_INFO = ("slackbot", "slackbot_bots_info", False)
    SLACKBOT_CALLS_ADD = ("slackbot", "slackbot_calls_add", False)
    SLACKBOT_CALLS_END = ("slackbot", "slackbot_calls_end", False)
    SLACKBOT_CALLS_INFO = ("slackbot", "slackbot_calls_info", False)
    SLACKBOT_CALLS_PARTICIPANTS_ADD_NEW_PARTICIPANT = (
        "slackbot",
        "slackbot_calls_participants_add_new_participant",
        False,
    )
    SLACKBOT_CALLS_PARTICIPANTS_REGISTER_REMOVED = (
        "slackbot",
        "slackbot_calls_participants_register_removed",
        False,
    )
    SLACKBOT_CALLS_UPDATE = ("slackbot", "slackbot_calls_update", False)
    SLACKBOT_CHAT_DELETE = ("slackbot", "slackbot_chat_delete", False)
    SLACKBOT_CHAT_DELETE_SCHEDULED_MESSAGE = (
        "slackbot",
        "slackbot_chat_delete_scheduled_message",
        False,
    )
    SLACKBOT_CHAT_GET_PERMALINK = ("slackbot", "slackbot_chat_get_permalink", False)
    SLACKBOT_CHAT_ME_MESSAGE = ("slackbot", "slackbot_chat_me_message", False)
    SLACKBOT_CHAT_POST_EPHEMERAL = ("slackbot", "slackbot_chat_post_ephemeral", False)
    SLACKBOT_CHAT_POST_MESSAGE = ("slackbot", "slackbot_chat_post_message", False)
    SLACKBOT_CHAT_SCHEDULE_MESSAGE = (
        "slackbot",
        "slackbot_chat_schedule_message",
        False,
    )
    SLACKBOT_CHAT_SCHEDULED_MESSAGES_LIST = (
        "slackbot",
        "slackbot_chat_scheduled_messages_list",
        False,
    )
    SLACKBOT_CHAT_UNFURL = ("slackbot", "slackbot_chat_unfurl", False)
    SLACKBOT_CHAT_UPDATE = ("slackbot", "slackbot_chat_update", False)
    SLACKBOT_CONVERSATION_SUN_ARCHIVE = (
        "slackbot",
        "slackbot_conversation_sun_archive",
        False,
    )
    SLACKBOT_CONVERSATIONS_ARCHIVE = (
        "slackbot",
        "slackbot_conversations_archive",
        False,
    )
    SLACKBOT_CONVERSATIONS_CLOSE = ("slackbot", "slackbot_conversations_close", False)
    SLACKBOT_CONVERSATIONS_CREATE = ("slackbot", "slackbot_conversations_create", False)
    SLACKBOT_CONVERSATIONS_HISTORY = (
        "slackbot",
        "slackbot_conversations_history",
        False,
    )
    SLACKBOT_CONVERSATIONS_INFO = ("slackbot", "slackbot_conversations_info", False)
    SLACKBOT_CONVERSATIONS_INVITE = ("slackbot", "slackbot_conversations_invite", False)
    SLACKBOT_CONVERSATIONS_JOIN = ("slackbot", "slackbot_conversations_join", False)
    SLACKBOT_CONVERSATIONS_KICK = ("slackbot", "slackbot_conversations_kick", False)
    SLACKBOT_CONVERSATIONS_LEAVE = ("slackbot", "slackbot_conversations_leave", False)
    SLACKBOT_CONVERSATIONS_LIST = ("slackbot", "slackbot_conversations_list", False)
    SLACKBOT_CONVERSATIONS_MARK = ("slackbot", "slackbot_conversations_mark", False)
    SLACKBOT_CONVERSATIONS_MEMBERS = (
        "slackbot",
        "slackbot_conversations_members",
        False,
    )
    SLACKBOT_CONVERSATIONS_OPEN = ("slackbot", "slackbot_conversations_open", False)
    SLACKBOT_CONVERSATIONS_RENAME = ("slackbot", "slackbot_conversations_rename", False)
    SLACKBOT_CONVERSATIONS_REPLIES = (
        "slackbot",
        "slackbot_conversations_replies",
        False,
    )
    SLACKBOT_CONVERSATIONS_SET_PURPOSE = (
        "slackbot",
        "slackbot_conversations_set_purpose",
        False,
    )
    SLACKBOT_CONVERSATIONS_SET_TOPIC = (
        "slackbot",
        "slackbot_conversations_set_topic",
        False,
    )
    SLACKBOT_DIALOG_OPEN = ("slackbot", "slackbot_dialog_open", False)
    SLACKBOT_DND_END_DND = ("slackbot", "slackbot_dnd_end_dnd", False)
    SLACKBOT_DND_END_SNOOZE = ("slackbot", "slackbot_dnd_end_snooze", False)
    SLACKBOT_DND_INFO = ("slackbot", "slackbot_dnd_info", False)
    SLACKBOT_DND_SET_SNOOZE = ("slackbot", "slackbot_dnd_set_snooze", False)
    SLACKBOT_DND_TEAM_INFO = ("slackbot", "slackbot_dnd_team_info", False)
    SLACKBOT_E_MOJI_LIST = ("slackbot", "slackbot_e_moji_list", False)
    SLACKBOT_FILES_COMMENTS_DELETE_COMMENT = (
        "slackbot",
        "slackbot_files_comments_delete_comment",
        False,
    )
    SLACKBOT_FILES_DELETE = ("slackbot", "slackbot_files_delete", False)
    SLACKBOT_FILES_INFO = ("slackbot", "slackbot_files_info", False)
    SLACKBOT_FILES_LIST = ("slackbot", "slackbot_files_list", False)
    SLACKBOT_FILES_REMOTE_ADD_FROM_REMOTE = (
        "slackbot",
        "slackbot_files_remote_add_from_remote",
        False,
    )
    SLACKBOT_FILES_REMOTE_DELETE_FILE = (
        "slackbot",
        "slackbot_files_remote_delete_file",
        False,
    )
    SLACKBOT_FILES_REMOTE_GET_INFO = (
        "slackbot",
        "slackbot_files_remote_get_info",
        False,
    )
    SLACKBOT_FILES_REMOTE_LIST_REMOTE_FILES = (
        "slackbot",
        "slackbot_files_remote_list_remote_files",
        False,
    )
    SLACKBOT_FILES_REMOTE_SHARE_REMOTE_FILE = (
        "slackbot",
        "slackbot_files_remote_share_remote_file",
        False,
    )
    SLACKBOT_FILES_REMOTE_UPDATE_REMOTE_FILE = (
        "slackbot",
        "slackbot_files_remote_update_remote_file",
        False,
    )
    SLACKBOT_FILES_REVOKE_PUBLIC_URL = (
        "slackbot",
        "slackbot_files_revoke_public_url",
        False,
    )
    SLACKBOT_FILES_SHARED_PUBLIC_URL = (
        "slackbot",
        "slackbot_files_shared_public_url",
        False,
    )
    SLACKBOT_FILES_UPLOAD = ("slackbot", "slackbot_files_upload", False)
    SLACKBOT_MIGRATION_EXCHANGE = ("slackbot", "slackbot_migration_exchange", False)
    SLACKBOT_OAUTH_ACCESS = ("slackbot", "slackbot_oauth_access", False)
    SLACKBOT_OAUTH_TOKEN = ("slackbot", "slackbot_oauth_token", False)
    SLACKBOT_OAUTH_V_2_EXCHANGE_TOKEN = (
        "slackbot",
        "slackbot_oauth_v_2_exchange_token",
        False,
    )
    SLACKBOT_PINS_ADD = ("slackbot", "slackbot_pins_add", False)
    SLACKBOT_PINS_LIST = ("slackbot", "slackbot_pins_list", False)
    SLACKBOT_PINS_REMOVE = ("slackbot", "slackbot_pins_remove", False)
    SLACKBOT_REACTIONS_ADD = ("slackbot", "slackbot_reactions_add", False)
    SLACKBOT_REACTIONS_GET = ("slackbot", "slackbot_reactions_get", False)
    SLACKBOT_REACTIONS_LIST = ("slackbot", "slackbot_reactions_list", False)
    SLACKBOT_REACTIONS_REMOVE = ("slackbot", "slackbot_reactions_remove", False)
    SLACKBOT_REMINDERS_COMPLETE = ("slackbot", "slackbot_reminders_complete", False)
    SLACKBOT_REMINDERS_DELETE = ("slackbot", "slackbot_reminders_delete", False)
    SLACKBOT_REMINDERS_INFO = ("slackbot", "slackbot_reminders_info", False)
    SLACKBOT_REMINDERS_LIST = ("slackbot", "slackbot_reminders_list", False)
    SLACKBOT_RT_M_CONNECT = ("slackbot", "slackbot_rt_m_connect", False)
    SLACKBOT_STARS_ADD = ("slackbot", "slackbot_stars_add", False)
    SLACKBOT_STARS_LIST = ("slackbot", "slackbot_stars_list", False)
    SLACKBOT_STARS_REMOVE = ("slackbot", "slackbot_stars_remove", False)
    SLACKBOT_TEAM_ACCESS_LOGS = ("slackbot", "slackbot_team_access_logs", False)
    SLACKBOT_TEAM_INFO = ("slackbot", "slackbot_team_info", False)
    SLACKBOT_TEAM_INTEGRATION_LOGS = (
        "slackbot",
        "slackbot_team_integration_logs",
        False,
    )
    SLACKBOT_TEAM_PROFILE_GET_PROFILE = (
        "slackbot",
        "slackbot_team_profile_get_profile",
        False,
    )
    SLACKBOT_TEAMBILL_ABLE_INFO = ("slackbot", "slackbot_teambill_able_info", False)
    SLACKBOT_USER_GROUPS_CREATE = ("slackbot", "slackbot_user_groups_create", False)
    SLACKBOT_USER_GROUPS_DISABLE = ("slackbot", "slackbot_user_groups_disable", False)
    SLACKBOT_USER_GROUPS_ENABLE = ("slackbot", "slackbot_user_groups_enable", False)
    SLACKBOT_USER_GROUPS_LIST = ("slackbot", "slackbot_user_groups_list", False)
    SLACKBOT_USER_GROUPS_UPDATE = ("slackbot", "slackbot_user_groups_update", False)
    SLACKBOT_USER_GROUPS_USERS_LIST_ALL_USERS = (
        "slackbot",
        "slackbot_user_groups_users_list_all_users",
        False,
    )
    SLACKBOT_USER_GROUPS_USERS_UPDATE_LIST = (
        "slackbot",
        "slackbot_user_groups_users_update_list",
        False,
    )
    SLACKBOT_USERS_CONVERSATIONS = ("slackbot", "slackbot_users_conversations", False)
    SLACKBOT_USERS_DELETE_PHOTO = ("slackbot", "slackbot_users_delete_photo", False)
    SLACKBOT_USERS_GET_PRESENCE = ("slackbot", "slackbot_users_get_presence", False)
    SLACKBOT_USERS_IDENTITY = ("slackbot", "slackbot_users_identity", False)
    SLACKBOT_USERS_INFO = ("slackbot", "slackbot_users_info", False)
    SLACKBOT_USERS_LIST = ("slackbot", "slackbot_users_list", False)
    SLACKBOT_USERS_LOOKUP_BY_EMAIL = (
        "slackbot",
        "slackbot_users_lookup_by_email",
        False,
    )
    SLACKBOT_USERS_PROFILE_GET_PROFILE_INFO = (
        "slackbot",
        "slackbot_users_profile_get_profile_info",
        False,
    )
    SLACKBOT_USERS_PROFILE_SET_PROFILE_INFO = (
        "slackbot",
        "slackbot_users_profile_set_profile_info",
        False,
    )
    SLACKBOT_USERS_SET_ACTIVE = ("slackbot", "slackbot_users_set_active", False)
    SLACKBOT_USERS_SET_PHOTO = ("slackbot", "slackbot_users_set_photo", False)
    SLACKBOT_USERS_SET_PRESENCE = ("slackbot", "slackbot_users_set_presence", False)
    SLACKBOT_VIEWS_OPEN = ("slackbot", "slackbot_views_open", False)
    SLACKBOT_VIEWS_PUBLISH = ("slackbot", "slackbot_views_publish", False)
    SLACKBOT_VIEWS_PUSH = ("slackbot", "slackbot_views_push", False)
    SLACKBOT_VIEWS_UPDATE = ("slackbot", "slackbot_views_update", False)
    SLACKBOT_WORK_FLOWS_STEP_COMPLETED = (
        "slackbot",
        "slackbot_work_flows_step_completed",
        False,
    )
    SLACKBOT_WORK_FLOWS_STEP_FAILED = (
        "slackbot",
        "slackbot_work_flows_step_failed",
        False,
    )
    SLACKBOT_WORK_FLOWS_UPDATE_STEP = (
        "slackbot",
        "slackbot_work_flows_update_step",
        False,
    )
    SNOWFLAKE_DESCRIBE_TABLE = ("snowflake", "snowflake_describe_table", False)
    SNOWFLAKE_EXPLORE_COLUMNS = ("snowflake", "snowflake_explore_columns", False)
    SNOWFLAKE_RUN_QUERY = ("snowflake", "snowflake_run_query", False)
    SNOWFLAKE_SHOW_TABLES = ("snowflake", "snowflake_show_tables", False)
    SOUNDCLOUD_LIKESPLAYLIST = ("soundcloud", "soundcloud_likesplaylist", False)
    SOUNDCLOUD_LIKESTRACKACTION = ("soundcloud", "soundcloud_likestrackaction", False)
    SOUNDCLOUD_LIKESUNLIKEPLAYLIST = (
        "soundcloud",
        "soundcloud_likesunlikeplaylist",
        False,
    )
    SOUNDCLOUD_LIKESUNLIKETRACK = ("soundcloud", "soundcloud_likesunliketrack", False)
    SOUNDCLOUD_MEDELETEFOLLOWEDUSER = (
        "soundcloud",
        "soundcloud_medeletefolloweduser",
        False,
    )
    SOUNDCLOUD_MEFOLLOWUSER = ("soundcloud", "soundcloud_mefollowuser", False)
    SOUNDCLOUD_MEGETACTIVITIES = ("soundcloud", "soundcloud_megetactivities", False)
    SOUNDCLOUD_MEGETFOLLOWEDUSER = ("soundcloud", "soundcloud_megetfolloweduser", False)
    SOUNDCLOUD_MEGETFOLLOWEDUSERS = (
        "soundcloud",
        "soundcloud_megetfollowedusers",
        False,
    )
    SOUNDCLOUD_MEGETFOLLOWERBYID = ("soundcloud", "soundcloud_megetfollowerbyid", False)
    SOUNDCLOUD_MEGETFOLLOWERSLIST = (
        "soundcloud",
        "soundcloud_megetfollowerslist",
        False,
    )
    SOUNDCLOUD_MEGETLIKEDPLAYLISTS = (
        "soundcloud",
        "soundcloud_megetlikedplaylists",
        False,
    )
    SOUNDCLOUD_MEGETRECENTACTIVITIES = (
        "soundcloud",
        "soundcloud_megetrecentactivities",
        False,
    )
    SOUNDCLOUD_MEGETRECENTTRACKS = ("soundcloud", "soundcloud_megetrecenttracks", False)
    SOUNDCLOUD_MEGETUSERINFORMATION = (
        "soundcloud",
        "soundcloud_megetuserinformation",
        False,
    )
    SOUNDCLOUD_MELISTFOLLOWEDTRACKS = (
        "soundcloud",
        "soundcloud_melistfollowedtracks",
        False,
    )
    SOUNDCLOUD_MELISTLIKEDTRACKS = ("soundcloud", "soundcloud_melistlikedtracks", False)
    SOUNDCLOUD_MELISTPLAYLISTSINFOTRACKSOWNER = (
        "soundcloud",
        "soundcloud_melistplaylistsinfotracksowner",
        False,
    )
    SOUNDCLOUD_MELISTUSERTRACKS = ("soundcloud", "soundcloud_melistusertracks", False)
    SOUNDCLOUD_MISCELLANEOUSRESOLVESOUNDCLOUDURLS = (
        "soundcloud",
        "soundcloud_miscellaneousresolvesoundcloudurls",
        False,
    )
    SOUNDCLOUD_OAUTHAUTHORIZEUSER = (
        "soundcloud",
        "soundcloud_oauthauthorizeuser",
        False,
    )
    SOUNDCLOUD_OAUTHPROVISIONACCESSTOKEN = (
        "soundcloud",
        "soundcloud_oauthprovisionaccesstoken",
        False,
    )
    SOUNDCLOUD_PLAYLISTSCREATENEWPLAYLIST = (
        "soundcloud",
        "soundcloud_playlistscreatenewplaylist",
        False,
    )
    SOUNDCLOUD_PLAYLISTSDELETEPLAYLIST = (
        "soundcloud",
        "soundcloud_playlistsdeleteplaylist",
        False,
    )
    SOUNDCLOUD_PLAYLISTSGETPLAYLISTBYID = (
        "soundcloud",
        "soundcloud_playlistsgetplaylistbyid",
        False,
    )
    SOUNDCLOUD_PLAYLISTSGETTRACKS = (
        "soundcloud",
        "soundcloud_playlistsgettracks",
        False,
    )
    SOUNDCLOUD_PLAYLISTSLISTREPOSTERS = (
        "soundcloud",
        "soundcloud_playlistslistreposters",
        False,
    )
    SOUNDCLOUD_PLAYLISTSUPDATEPLAYLISTBYID = (
        "soundcloud",
        "soundcloud_playlistsupdateplaylistbyid",
        False,
    )
    SOUNDCLOUD_REPOSTSPLAYLISTASAUTHENTICATEDUSER = (
        "soundcloud",
        "soundcloud_repostsplaylistasauthenticateduser",
        False,
    )
    SOUNDCLOUD_REPOSTSREMOVEREPOST = (
        "soundcloud",
        "soundcloud_repostsremoverepost",
        False,
    )
    SOUNDCLOUD_REPOSTSREMOVEREPOSTONPLAYLIST = (
        "soundcloud",
        "soundcloud_repostsremoverepostonplaylist",
        False,
    )
    SOUNDCLOUD_REPOSTSTRACKASAUTHENTICATEDUSER = (
        "soundcloud",
        "soundcloud_repoststrackasauthenticateduser",
        False,
    )
    SOUNDCLOUD_SEARCHBYQUERY = ("soundcloud", "soundcloud_searchbyquery", False)
    SOUNDCLOUD_SEARCHBYQUERY2 = ("soundcloud", "soundcloud_searchbyquery2", False)
    SOUNDCLOUD_SEARCHUSERQUERY = ("soundcloud", "soundcloud_searchuserquery", False)
    SOUNDCLOUD_TRACKSCREATECOMMENT = (
        "soundcloud",
        "soundcloud_trackscreatecomment",
        False,
    )
    SOUNDCLOUD_TRACKSDELETETRACK = ("soundcloud", "soundcloud_tracksdeletetrack", False)
    SOUNDCLOUD_TRACKSGETBYID = ("soundcloud", "soundcloud_tracksgetbyid", False)
    SOUNDCLOUD_TRACKSGETCOMMENTS = ("soundcloud", "soundcloud_tracksgetcomments", False)
    SOUNDCLOUD_TRACKSGETFAVORITERS = (
        "soundcloud",
        "soundcloud_tracksgetfavoriters",
        False,
    )
    SOUNDCLOUD_TRACKSGETRELATEDTRACKS = (
        "soundcloud",
        "soundcloud_tracksgetrelatedtracks",
        False,
    )
    SOUNDCLOUD_TRACKSGETSTREAMABLEURLS = (
        "soundcloud",
        "soundcloud_tracksgetstreamableurls",
        False,
    )
    SOUNDCLOUD_TRACKSLISTREPOSTERS = (
        "soundcloud",
        "soundcloud_trackslistreposters",
        False,
    )
    SOUNDCLOUD_TRACKSUPDATETRACKINFORMATION = (
        "soundcloud",
        "soundcloud_tracksupdatetrackinformation",
        False,
    )
    SOUNDCLOUD_TRACKSUPLOADNEWTRACK = (
        "soundcloud",
        "soundcloud_tracksuploadnewtrack",
        False,
    )
    SOUNDCLOUD_USERSGETFOLLOWERS = ("soundcloud", "soundcloud_usersgetfollowers", False)
    SOUNDCLOUD_USERSGETFOLLOWINGBYID = (
        "soundcloud",
        "soundcloud_usersgetfollowingbyid",
        False,
    )
    SOUNDCLOUD_USERSGETUSER = ("soundcloud", "soundcloud_usersgetuser", False)
    SOUNDCLOUD_USERSGETUSERFOLLOWINGS = (
        "soundcloud",
        "soundcloud_usersgetuserfollowings",
        False,
    )
    SOUNDCLOUD_USERSGETUSERPLAYLISTS = (
        "soundcloud",
        "soundcloud_usersgetuserplaylists",
        False,
    )
    SOUNDCLOUD_USERSGETUSERTRACKS = (
        "soundcloud",
        "soundcloud_usersgetusertracks",
        False,
    )
    SOUNDCLOUD_USERSGETUSERWEBPROFILES = (
        "soundcloud",
        "soundcloud_usersgetuserwebprofiles",
        False,
    )
    SOUNDCLOUD_USERSLISTFAVORITES = (
        "soundcloud",
        "soundcloud_userslistfavorites",
        False,
    )
    SOUNDCLOUD_USERSLISTLIKEDPLAYLISTS = (
        "soundcloud",
        "soundcloud_userslistlikedplaylists",
        False,
    )
    SOUNDCLOUD_USERSLISTLIKEDTRACKS = (
        "soundcloud",
        "soundcloud_userslistlikedtracks",
        False,
    )
    SPLITWISE_ADD_USER_TO_GROUP = ("splitwise", "splitwise_add_user_to_group", False)
    SPLITWISE_DELETE_GROUP = ("splitwise", "splitwise_delete_group", False)
    SPLITWISE_GET_CURRENT_USER_INFO = (
        "splitwise",
        "splitwise_get_current_user_info",
        False,
    )
    SPLITWISE_GET_GROUP = ("splitwise", "splitwise_get_group", False)
    SPLITWISE_GET_USER_INFO = ("splitwise", "splitwise_get_user_info", False)
    SPLITWISE_REMOVE_USER_FROM_GROUP = (
        "splitwise",
        "splitwise_remove_user_from_group",
        False,
    )
    SPLITWISE_RESTORE_GROUP = ("splitwise", "splitwise_restore_group", False)
    SPOTIFY_ADD_TO_QUEUE = ("spotify", "spotify_add_to_queue", False)
    SPOTIFY_ADD_TRACKS_TO_PLAYLIST = (
        "spotify",
        "spotify_add_tracks_to_playlist",
        False,
    )
    SPOTIFY_CHANGE_PLAYLIST_DETAILS = (
        "spotify",
        "spotify_change_playlist_details",
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
    SPOTIFY_CHECKUSERS_SAVED_ALBUMS = (
        "spotify",
        "spotify_checkusers_saved_albums",
        False,
    )
    SPOTIFY_CHECKUSERS_SAVED_AUDIOBOOKS = (
        "spotify",
        "spotify_checkusers_saved_audiobooks",
        False,
    )
    SPOTIFY_CHECKUSERS_SAVED_EPISODES = (
        "spotify",
        "spotify_checkusers_saved_episodes",
        False,
    )
    SPOTIFY_CHECKUSERS_SAVED_SHOWS = (
        "spotify",
        "spotify_checkusers_saved_shows",
        False,
    )
    SPOTIFY_CHECKUSERS_SAVED_TRACKS = (
        "spotify",
        "spotify_checkusers_saved_tracks",
        False,
    )
    SPOTIFY_CREATE_PLAYLIST = ("spotify", "spotify_create_playlist", False)
    SPOTIFY_FOLLOW_ARTISTS_USERS = ("spotify", "spotify_follow_artists_users", False)
    SPOTIFY_FOLLOW_PLAYLIST = ("spotify", "spotify_follow_playlist", False)
    SPOTIFY_GET_A_CATEGORIES_PLAYLISTS = (
        "spotify",
        "spotify_get_a_categories_playlists",
        False,
    )
    SPOTIFY_GET_A_CATEGORY = ("spotify", "spotify_get_a_category", False)
    SPOTIFY_GET_A_CHAPTER = ("spotify", "spotify_get_a_chapter", False)
    SPOTIFY_GET_A_LIST_OF_CURRENT_USERS_PLAYLISTS = (
        "spotify",
        "spotify_get_a_list_of_current_users_playlists",
        False,
    )
    SPOTIFY_GET_A_SHOW = ("spotify", "spotify_get_a_show", False)
    SPOTIFY_GET_A_SHOWS_EPISODES = ("spotify", "spotify_get_a_shows_episodes", False)
    SPOTIFY_GET_A_USERS_AVAILABLE_DEVICES = (
        "spotify",
        "spotify_get_a_users_available_devices",
        False,
    )
    SPOTIFY_GET_AN_ALBUM = ("spotify", "spotify_get_an_album", False)
    SPOTIFY_GET_AN_ALBUMS_TRACKS = ("spotify", "spotify_get_an_albums_tracks", False)
    SPOTIFY_GET_AN_ARTIST = ("spotify", "spotify_get_an_artist", False)
    SPOTIFY_GET_AN_ARTISTS_ALBUMS = ("spotify", "spotify_get_an_artists_albums", False)
    SPOTIFY_GET_AN_ARTISTS_RELATED_ARTISTS = (
        "spotify",
        "spotify_get_an_artists_related_artists",
        False,
    )
    SPOTIFY_GET_AN_ARTISTS_TOP_TRACKS = (
        "spotify",
        "spotify_get_an_artists_top_tracks",
        False,
    )
    SPOTIFY_GET_AN_AUDIOBOOK = ("spotify", "spotify_get_an_audiobook", False)
    SPOTIFY_GET_AN_EPISODE = ("spotify", "spotify_get_an_episode", False)
    SPOTIFY_GET_AUDIO_ANALYSIS = ("spotify", "spotify_get_audio_analysis", False)
    SPOTIFY_GET_AUDIO_FEATURES = ("spotify", "spotify_get_audio_features", False)
    SPOTIFY_GET_AUDIOBOOK_CHAPTERS = (
        "spotify",
        "spotify_get_audiobook_chapters",
        False,
    )
    SPOTIFY_GET_AVAILABLE_MARKETS = ("spotify", "spotify_get_available_markets", False)
    SPOTIFY_GET_CATEGORIES = ("spotify", "spotify_get_categories", False)
    SPOTIFY_GET_CURRENT_USERS_PROFILE = (
        "spotify",
        "spotify_get_current_users_profile",
        False,
    )
    SPOTIFY_GET_FEATURED_PLAYLISTS = (
        "spotify",
        "spotify_get_featured_playlists",
        False,
    )
    SPOTIFY_GET_FOLLOWED = ("spotify", "spotify_get_followed", False)
    SPOTIFY_GET_INFORMATION_ABOUT_THE_USERS_CURRENT_PLAYBACK = (
        "spotify",
        "spotify_get_information_about_the_users_current_playback",
        False,
    )
    SPOTIFY_GET_LIST_USERS_PLAYLISTS = (
        "spotify",
        "spotify_get_list_users_playlists",
        False,
    )
    SPOTIFY_GET_MULTIPLE_ALBUMS = ("spotify", "spotify_get_multiple_albums", False)
    SPOTIFY_GET_MULTIPLE_ARTISTS = ("spotify", "spotify_get_multiple_artists", False)
    SPOTIFY_GET_MULTIPLE_AUDIOBOOKS = (
        "spotify",
        "spotify_get_multiple_audiobooks",
        False,
    )
    SPOTIFY_GET_MULTIPLE_EPISODES = ("spotify", "spotify_get_multiple_episodes", False)
    SPOTIFY_GET_MULTIPLE_SHOWS = ("spotify", "spotify_get_multiple_shows", False)
    SPOTIFY_GET_NEW_RELEASES = ("spotify", "spotify_get_new_releases", False)
    SPOTIFY_GET_PLAYLIST = ("spotify", "spotify_get_playlist", False)
    SPOTIFY_GET_PLAYLIST_COVER = ("spotify", "spotify_get_playlist_cover", False)
    SPOTIFY_GET_PLAYLISTS_TRACKS = ("spotify", "spotify_get_playlists_tracks", False)
    SPOTIFY_GET_QUEUE = ("spotify", "spotify_get_queue", False)
    SPOTIFY_GET_RECENTLY_PLAYED = ("spotify", "spotify_get_recently_played", False)
    SPOTIFY_GET_RECOMMENDATION_GENRES = (
        "spotify",
        "spotify_get_recommendation_genres",
        False,
    )
    SPOTIFY_GET_RECOMMENDATIONS = ("spotify", "spotify_get_recommendations", False)
    SPOTIFY_GET_SEVERAL_AUDIO_FEATURES = (
        "spotify",
        "spotify_get_several_audio_features",
        False,
    )
    SPOTIFY_GET_SEVERAL_CHAPTERS = ("spotify", "spotify_get_several_chapters", False)
    SPOTIFY_GET_SEVERAL_TRACKS = ("spotify", "spotify_get_several_tracks", False)
    SPOTIFY_GET_THE_USERS_CURRENTLY_PLAYING_TRACK = (
        "spotify",
        "spotify_get_the_users_currently_playing_track",
        False,
    )
    SPOTIFY_GET_TRACK = ("spotify", "spotify_get_track", False)
    SPOTIFY_GET_USERS_PROFILE = ("spotify", "spotify_get_users_profile", False)
    SPOTIFY_GET_USERS_SAVED_ALBUMS = (
        "spotify",
        "spotify_get_users_saved_albums",
        False,
    )
    SPOTIFY_GET_USERS_SAVED_AUDIOBOOKS = (
        "spotify",
        "spotify_get_users_saved_audiobooks",
        False,
    )
    SPOTIFY_GET_USERS_SAVED_EPISODES = (
        "spotify",
        "spotify_get_users_saved_episodes",
        False,
    )
    SPOTIFY_GET_USERS_SAVED_SHOWS = ("spotify", "spotify_get_users_saved_shows", False)
    SPOTIFY_GET_USERS_SAVED_TRACKS = (
        "spotify",
        "spotify_get_users_saved_tracks",
        False,
    )
    SPOTIFY_GET_USERS_TOP_ARTISTS = ("spotify", "spotify_get_users_top_artists", False)
    SPOTIFY_GET_USERS_TOP_TRACKS = ("spotify", "spotify_get_users_top_tracks", False)
    SPOTIFY_PAUSE_A_USERS_PLAYBACK = (
        "spotify",
        "spotify_pause_a_users_playback",
        False,
    )
    SPOTIFY_REMOVE_ALBUMS_USER = ("spotify", "spotify_remove_albums_user", False)
    SPOTIFY_REMOVE_AUDIOBOOKS_USER = (
        "spotify",
        "spotify_remove_audiobooks_user",
        False,
    )
    SPOTIFY_REMOVE_EPISODES_USER = ("spotify", "spotify_remove_episodes_user", False)
    SPOTIFY_REMOVE_SHOWS_USER = ("spotify", "spotify_remove_shows_user", False)
    SPOTIFY_REMOVE_TRACKS_PLAYLIST = (
        "spotify",
        "spotify_remove_tracks_playlist",
        False,
    )
    SPOTIFY_REMOVE_TRACKS_USER = ("spotify", "spotify_remove_tracks_user", False)
    SPOTIFY_REORDER_OR_REPLACE_PLAYLISTS_TRACKS = (
        "spotify",
        "spotify_reorder_or_replace_playlists_tracks",
        False,
    )
    SPOTIFY_SAVE_ALBUMS_USER = ("spotify", "spotify_save_albums_user", False)
    SPOTIFY_SAVE_AUDIOBOOKS_USER = ("spotify", "spotify_save_audiobooks_user", False)
    SPOTIFY_SAVE_EPISODES_USER = ("spotify", "spotify_save_episodes_user", False)
    SPOTIFY_SAVE_SHOWS_USER = ("spotify", "spotify_save_shows_user", False)
    SPOTIFY_SAVE_TRACKS_USER = ("spotify", "spotify_save_tracks_user", False)
    SPOTIFY_SEARCH = ("spotify", "spotify_search", False)
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
    SPOTIFY_START_A_USERS_PLAYBACK = (
        "spotify",
        "spotify_start_a_users_playback",
        False,
    )
    SPOTIFY_TOGGLE_SHUFFLE_FOR_USERS_PLAYBACK = (
        "spotify",
        "spotify_toggle_shuffle_for_users_playback",
        False,
    )
    SPOTIFY_TRANSFER_A_USERS_PLAYBACK = (
        "spotify",
        "spotify_transfer_a_users_playback",
        False,
    )
    SPOTIFY_UN_FOLLOW_ARTISTS_USERS = (
        "spotify",
        "spotify_un_follow_artists_users",
        False,
    )
    SPOTIFY_UN_FOLLOW_PLAYLIST = ("spotify", "spotify_un_follow_playlist", False)
    SPOTIFY_UPLOAD_CUSTOM_PLAYLIST_COVER = (
        "spotify",
        "spotify_upload_custom_playlist_cover",
        False,
    )
    STRAVA_CREATE_ACTIVITY = ("strava", "strava_create_activity", False)
    STRAVA_CREATE_UPLOAD = ("strava", "strava_create_upload", False)
    STRAVA_EXPLORE_SEGMENTS = ("strava", "strava_explore_segments", False)
    STRAVA_GET_ACTIVITY_BY_ID = ("strava", "strava_get_activity_by_id", False)
    STRAVA_GET_ACTIVITY_STREAMS = ("strava", "strava_get_activity_streams", False)
    STRAVA_GET_CLUB_ACTIVITIES_BY_ID = (
        "strava",
        "strava_get_club_activities_by_id",
        False,
    )
    STRAVA_GET_CLUB_ADMINS_BY_ID = ("strava", "strava_get_club_admins_by_id", False)
    STRAVA_GET_CLUB_BY_ID = ("strava", "strava_get_club_by_id", False)
    STRAVA_GET_CLUB_MEMBERS_BY_ID = ("strava", "strava_get_club_members_by_id", False)
    STRAVA_GET_COMMENTS_BY_ACTIVITY_ID = (
        "strava",
        "strava_get_comments_by_activity_id",
        False,
    )
    STRAVA_GET_EFFORTS_BY_SEGMENT_ID = (
        "strava",
        "strava_get_efforts_by_segment_id",
        False,
    )
    STRAVA_GET_GEAR_BY_ID = ("strava", "strava_get_gear_by_id", False)
    STRAVA_GET_KU_DOERS_BY_ACTIVITY_ID = (
        "strava",
        "strava_get_ku_doers_by_activity_id",
        False,
    )
    STRAVA_GET_LAPS_BY_ACTIVITY_ID = ("strava", "strava_get_laps_by_activity_id", False)
    STRAVA_GET_LOGGED_IN_ATHLETE = ("strava", "strava_get_logged_in_athlete", False)
    STRAVA_GET_LOGGED_IN_ATHLETE_ACTIVITIES = (
        "strava",
        "strava_get_logged_in_athlete_activities",
        False,
    )
    STRAVA_GET_LOGGED_IN_ATHLETE_CLUBS = (
        "strava",
        "strava_get_logged_in_athlete_clubs",
        False,
    )
    STRAVA_GET_LOGGED_IN_ATHLETE_STARRED_SEGMENTS = (
        "strava",
        "strava_get_logged_in_athlete_starred_segments",
        False,
    )
    STRAVA_GET_LOGGED_IN_ATHLETE_ZONES = (
        "strava",
        "strava_get_logged_in_athlete_zones",
        False,
    )
    STRAVA_GET_ROUT_EAST_CX = ("strava", "strava_get_rout_east_cx", False)
    STRAVA_GET_ROUTE_ASG_PX = ("strava", "strava_get_route_asg_px", False)
    STRAVA_GET_ROUTE_BY_ID = ("strava", "strava_get_route_by_id", False)
    STRAVA_GET_ROUTE_STREAMS = ("strava", "strava_get_route_streams", False)
    STRAVA_GET_ROUTES_BY_ATHLETE_ID = (
        "strava",
        "strava_get_routes_by_athlete_id",
        False,
    )
    STRAVA_GET_SEGMENT_BY_ID = ("strava", "strava_get_segment_by_id", False)
    STRAVA_GET_SEGMENT_EFFORT_BY_ID = (
        "strava",
        "strava_get_segment_effort_by_id",
        False,
    )
    STRAVA_GET_SEGMENT_EFFORT_STREAMS = (
        "strava",
        "strava_get_segment_effort_streams",
        False,
    )
    STRAVA_GET_SEGMENT_STREAMS = ("strava", "strava_get_segment_streams", False)
    STRAVA_GET_STATS = ("strava", "strava_get_stats", False)
    STRAVA_GET_UPLOAD_BY_ID = ("strava", "strava_get_upload_by_id", False)
    STRAVA_GET_ZONES_BY_ACTIVITY_ID = (
        "strava",
        "strava_get_zones_by_activity_id",
        False,
    )
    STRAVA_STAR_SEGMENT = ("strava", "strava_star_segment", False)
    STRAVA_UPDATE_ACTIVITY_BY_ID = ("strava", "strava_update_activity_by_id", False)
    STRAVA_UPDATE_LOGGED_IN_ATHLETE = (
        "strava",
        "strava_update_logged_in_athlete",
        False,
    )
    TASKADE_COMPLETE_TASK_IN_PROJECT = (
        "taskade",
        "taskade_complete_task_in_project",
        False,
    )
    TASKADE_COPY_PROJECT_TO_FOLDER = (
        "taskade",
        "taskade_copy_project_to_folder",
        False,
    )
    TASKADE_CREATE_PROJECT_IN_WORKSPACE = (
        "taskade",
        "taskade_create_project_in_workspace",
        False,
    )
    TASKADE_CREATE_PROJECTIN_FOLDER = (
        "taskade",
        "taskade_create_projectin_folder",
        False,
    )
    TASKADE_CREATE_TASK_IN_PROJECT = (
        "taskade",
        "taskade_create_task_in_project",
        False,
    )
    TASKADE_CREATE_UPDATE_DATE_FOR_TASK = (
        "taskade",
        "taskade_create_update_date_for_task",
        False,
    )
    TASKADE_DELETE_TASK_OFA_TASK = ("taskade", "taskade_delete_task_ofa_task", False)
    TASKADE_DELETE_TASK_PROJECT = ("taskade", "taskade_delete_task_project", False)
    TASKADE_ENABLE_PUBLIC_ACCESS_AGENT = (
        "taskade",
        "taskade_enable_public_access_agent",
        False,
    )
    TASKADE_ENABLE_SHARE_LINK_IN_PROJECT = (
        "taskade",
        "taskade_enable_share_link_in_project",
        False,
    )
    TASKADE_GET_ALL_FOLDERS_FOR_WORKSPACE = (
        "taskade",
        "taskade_get_all_folders_for_workspace",
        False,
    )
    TASKADE_GET_ALL_PROJECTS_MINE = ("taskade", "taskade_get_all_projects_mine", False)
    TASKADE_GET_ALL_PROJECTSIN_FOLDER = (
        "taskade",
        "taskade_get_all_projectsin_folder",
        False,
    )
    TASKADE_GET_ALL_TASKS_FOR_PROJECT = (
        "taskade",
        "taskade_get_all_tasks_for_project",
        False,
    )
    TASKADE_GET_ALL_WORKSPACES_FOR_USER = (
        "taskade",
        "taskade_get_all_workspaces_for_user",
        False,
    )
    TASKADE_GET_SHARE_LINK_FOR_PROJECT = (
        "taskade",
        "taskade_get_share_link_for_project",
        False,
    )
    TASKADE_GET_TASK_WITH_ID = ("taskade", "taskade_get_task_with_id", False)
    TASKADE_REMOVE_ASSIGNEE_FROM_TASK = (
        "taskade",
        "taskade_remove_assignee_from_task",
        False,
    )
    TASKADE_TASK_ASSIGNMENT = ("taskade", "taskade_task_assignment", False)
    TAVILY_TAVILY_SEARCH = ("tavily", "tavily_tavily_search", False)
    TRELLO_ACTION_GET_BOARD_BY_ID_ACTION = (
        "trello",
        "trello_action_get_board_by_id_action",
        False,
    )
    TRELLO_ACTION_GET_BOARD_BY_ID_ACTION_BY_FIELD = (
        "trello",
        "trello_action_get_board_by_id_action_by_field",
        False,
    )
    TRELLO_ACTION_GET_BY_ID = ("trello", "trello_action_get_by_id", False)
    TRELLO_ACTION_GET_BY_ID_ACTION_FIELD = (
        "trello",
        "trello_action_get_by_id_action_field",
        False,
    )
    TRELLO_ACTION_GET_CARD_BY_ID_ACTION = (
        "trello",
        "trello_action_get_card_by_id_action",
        False,
    )
    TRELLO_ACTION_GET_CARD_BY_ID_ACTION_BY_FIELD = (
        "trello",
        "trello_action_get_card_by_id_action_by_field",
        False,
    )
    TRELLO_ACTION_GET_DISPLAY_BY_ID_ACTION = (
        "trello",
        "trello_action_get_display_by_id_action",
        False,
    )
    TRELLO_ACTION_GET_ENTITIES_BY_ID_ACTION = (
        "trello",
        "trello_action_get_entities_by_id_action",
        False,
    )
    TRELLO_ACTION_GET_LIST_BY_ID_ACTION = (
        "trello",
        "trello_action_get_list_by_id_action",
        False,
    )
    TRELLO_ACTION_GET_LIST_BY_ID_ACTION_BY_FIELD = (
        "trello",
        "trello_action_get_list_by_id_action_by_field",
        False,
    )
    TRELLO_ACTION_GET_MEMBER_BY_FIELD = (
        "trello",
        "trello_action_get_member_by_field",
        False,
    )
    TRELLO_ACTION_GET_MEMBER_BY_ID_ACTION = (
        "trello",
        "trello_action_get_member_by_id_action",
        False,
    )
    TRELLO_ACTION_GET_MEMBER_BY_ID_ACTION_BY_FIELD = (
        "trello",
        "trello_action_get_member_by_id_action_by_field",
        False,
    )
    TRELLO_ACTION_GET_MEMBER_CREATOR_BY_ID_ACTION = (
        "trello",
        "trello_action_get_member_creator_by_id_action",
        False,
    )
    TRELLO_ACTION_GET_ORG_BY_ID_ACTION_BY_FIELD = (
        "trello",
        "trello_action_get_org_by_id_action_by_field",
        False,
    )
    TRELLO_ACTION_GET_ORGANIZATION_BY_ID_ACTION = (
        "trello",
        "trello_action_get_organization_by_id_action",
        False,
    )
    TRELLO_ACTION_REMOVE_BY_ID_ACTION = (
        "trello",
        "trello_action_remove_by_id_action",
        False,
    )
    TRELLO_ACTION_UPDATE_BY_ID_ACTION = (
        "trello",
        "trello_action_update_by_id_action",
        False,
    )
    TRELLO_ACTION_UPDATE_TEXT_BY_ID_ACTION = (
        "trello",
        "trello_action_update_text_by_id_action",
        False,
    )
    TRELLO_BATCH_GET_DATA = ("trello", "trello_batch_get_data", False)
    TRELLO_BOARD_ADD_CHECKLISTS = ("trello", "trello_board_add_checklists", False)
    TRELLO_BOARD_ADD_LABELS_BY_ID_BOARD = (
        "trello",
        "trello_board_add_labels_by_id_board",
        False,
    )
    TRELLO_BOARD_ADD_POWER_UPS_BY_ID_BOARD = (
        "trello",
        "trello_board_add_power_ups_by_id_board",
        False,
    )
    TRELLO_BOARD_CREATE_BOARD = ("trello", "trello_board_create_board", False)
    TRELLO_BOARD_CREATE_LISTS_BY_ID_BOARD = (
        "trello",
        "trello_board_create_lists_by_id_board",
        False,
    )
    TRELLO_BOARD_FILTER_CARDS_BY_ID_BOARD = (
        "trello",
        "trello_board_filter_cards_by_id_board",
        False,
    )
    TRELLO_BOARD_GENERATE_CALENDAR_KEY_BY_ID = (
        "trello",
        "trello_board_generate_calendar_key_by_id",
        False,
    )
    TRELLO_BOARD_GENERATE_EMAIL_KEY = (
        "trello",
        "trello_board_generate_email_key",
        False,
    )
    TRELLO_BOARD_GET_BOARD_STARS_BY_ID = (
        "trello",
        "trello_board_get_board_stars_by_id",
        False,
    )
    TRELLO_BOARD_GET_BY_ID = ("trello", "trello_board_get_by_id", False)
    TRELLO_BOARD_GET_BY_ID_FIELD = ("trello", "trello_board_get_by_id_field", False)
    TRELLO_BOARD_GET_CARDS_BY_ID_BOARD = (
        "trello",
        "trello_board_get_cards_by_id_board",
        False,
    )
    TRELLO_BOARD_GET_CARDS_BY_ID_BOARD_BY_ID_CARD = (
        "trello",
        "trello_board_get_cards_by_id_board_by_id_card",
        False,
    )
    TRELLO_BOARD_GET_CHECKLISTS_BY_ID = (
        "trello",
        "trello_board_get_checklists_by_id",
        False,
    )
    TRELLO_BOARD_GET_DELTAS_BY_ID_BOARD = (
        "trello",
        "trello_board_get_deltas_by_id_board",
        False,
    )
    TRELLO_BOARD_GET_LABELS_BY_ID_BOARD_BY_ID_LABEL = (
        "trello",
        "trello_board_get_labels_by_id_board_by_id_label",
        False,
    )
    TRELLO_BOARD_GET_LISTS_BY_FILTER = (
        "trello",
        "trello_board_get_lists_by_filter",
        False,
    )
    TRELLO_BOARD_GET_LISTS_BY_ID_BOARD = (
        "trello",
        "trello_board_get_lists_by_id_board",
        False,
    )
    TRELLO_BOARD_GET_MEMBERS_BY_FILTER = (
        "trello",
        "trello_board_get_members_by_filter",
        False,
    )
    TRELLO_BOARD_GET_MEMBERS_BY_ID_BOARD = (
        "trello",
        "trello_board_get_members_by_id_board",
        False,
    )
    TRELLO_BOARD_GET_MEMBERS_CARDS_BY_ID_BOARD_BY_ID_MEMBER = (
        "trello",
        "trello_board_get_members_cards_by_id_board_by_id_member",
        False,
    )
    TRELLO_BOARD_GET_MEMBERS_INVITED_BY_FIELD = (
        "trello",
        "trello_board_get_members_invited_by_field",
        False,
    )
    TRELLO_BOARD_GET_MEMBERS_INVITED_BY_ID_BOARD = (
        "trello",
        "trello_board_get_members_invited_by_id_board",
        False,
    )
    TRELLO_BOARD_GET_MEMBERSHIPS_BY_ID_BOARD = (
        "trello",
        "trello_board_get_memberships_by_id_board",
        False,
    )
    TRELLO_BOARD_GET_MEMBERSHIPS_BY_ID_BOARD_BY_ID_MEMBERSHIP = (
        "trello",
        "trello_board_get_memberships_by_id_board_by_id_membership",
        False,
    )
    TRELLO_BOARD_GET_MY_PREF_S_BY_ID = (
        "trello",
        "trello_board_get_my_pref_s_by_id",
        False,
    )
    TRELLO_BOARD_GET_ORGANIZATION_BY_ID = (
        "trello",
        "trello_board_get_organization_by_id",
        False,
    )
    TRELLO_BOARD_GET_ORGANIZATION_BY_ID_BOARD_BY_FIELD = (
        "trello",
        "trello_board_get_organization_by_id_board_by_field",
        False,
    )
    TRELLO_BOARD_LIST_ACTIONS_BY_ID_BOARD = (
        "trello",
        "trello_board_list_actions_by_id_board",
        False,
    )
    TRELLO_BOARD_LIST_LABELS_BY_ID_BOARD = (
        "trello",
        "trello_board_list_labels_by_id_board",
        False,
    )
    TRELLO_BOARD_MARK_AS_VIEWED_BY_ID_BOARD = (
        "trello",
        "trello_board_mark_as_viewed_by_id_board",
        False,
    )
    TRELLO_BOARD_REMOVE_MEMBER = ("trello", "trello_board_remove_member", False)
    TRELLO_BOARD_REMOVE_POWER_UP = ("trello", "trello_board_remove_power_up", False)
    TRELLO_BOARD_UPDATE_BY_ID = ("trello", "trello_board_update_by_id", False)
    TRELLO_BOARD_UPDATE_CLOSED_BY_ID = (
        "trello",
        "trello_board_update_closed_by_id",
        False,
    )
    TRELLO_BOARD_UPDATE_DESCRIPTION_BY_ID_BOARD = (
        "trello",
        "trello_board_update_description_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_LABEL_NAMES_BLUE_BY_ID = (
        "trello",
        "trello_board_update_label_names_blue_by_id",
        False,
    )
    TRELLO_BOARD_UPDATE_LABEL_NAMES_GREEN_BY_ID_BOARD_PUT = (
        "trello",
        "trello_board_update_label_names_green_by_id_board_put",
        False,
    )
    TRELLO_BOARD_UPDATE_LABEL_NAMES_ORANGE_BY_ID_BOARD = (
        "trello",
        "trello_board_update_label_names_orange_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_LABEL_NAMES_PURPLE_BY_ID_BOARD = (
        "trello",
        "trello_board_update_label_names_purple_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_LABEL_NAMES_RED = (
        "trello",
        "trello_board_update_label_names_red",
        False,
    )
    TRELLO_BOARD_UPDATE_LABEL_NAMES_YELLOW_BY_ID_BOARD = (
        "trello",
        "trello_board_update_label_names_yellow_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_MEMBERS_BY_ID_BOARD = (
        "trello",
        "trello_board_update_members_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_MEMBERS_BY_ID_BOARD_BY_ID_MEMBER = (
        "trello",
        "trello_board_update_members_by_id_board_by_id_member",
        False,
    )
    TRELLO_BOARD_UPDATE_MEMBERSHIPS_BY_ID_BOARD_BY_ID_MEMBERSHIP = (
        "trello",
        "trello_board_update_memberships_by_id_board_by_id_membership",
        False,
    )
    TRELLO_BOARD_UPDATE_MY_PREF_S_EMAIL_LIST_BY_ID_BOARD = (
        "trello",
        "trello_board_update_my_pref_s_email_list_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_MY_PREF_S_EMAIL_POSITION_BY_ID_BOARD = (
        "trello",
        "trello_board_update_my_pref_s_email_position_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_MY_PREF_S_SHOW_LIST_GUIDE_BY_ID_BOARD = (
        "trello",
        "trello_board_update_my_pref_s_show_list_guide_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_MY_PREF_S_SHOW_SIDEBAR = (
        "trello",
        "trello_board_update_my_pref_s_show_sidebar",
        False,
    )
    TRELLO_BOARD_UPDATE_MY_PREF_S_SHOW_SIDEBAR_ACTIONS_BY_ID_BOARD = (
        "trello",
        "trello_board_update_my_pref_s_show_sidebar_actions_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_MY_PREF_S_SHOW_SIDEBAR_ACTIVITY_BY_ID_BOARD = (
        "trello",
        "trello_board_update_my_pref_s_show_sidebar_activity_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_NAME_BY_ID = ("trello", "trello_board_update_name_by_id", False)
    TRELLO_BOARD_UPDATE_ORGANIZATION_BY_ID_BOARD = (
        "trello",
        "trello_board_update_organization_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_BACKGROUND_BY_ID_BOARD = (
        "trello",
        "trello_board_update_pref_s_background_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_CALENDAR_FEED_ENABLED_BY_ID = (
        "trello",
        "trello_board_update_pref_s_calendar_feed_enabled_by_id",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_CARD_AGING_BY_ID_BOARD = (
        "trello",
        "trello_board_update_pref_s_card_aging_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_CARD_COVERS_BY_ID_BOARD = (
        "trello",
        "trello_board_update_pref_s_card_covers_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_COMMENTS_BY_ID_BOARD = (
        "trello",
        "trello_board_update_pref_s_comments_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_INVITATIONS_BY_ID_BOARD = (
        "trello",
        "trello_board_update_pref_s_invitations_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_PERMISSION_LEVEL_BY_ID = (
        "trello",
        "trello_board_update_pref_s_permission_level_by_id",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_SELF_JOIN_BY_ID_BOARD = (
        "trello",
        "trello_board_update_pref_s_self_join_by_id_board",
        False,
    )
    TRELLO_BOARD_UPDATE_PREF_S_SHOW_SIDEBAR_MEMBERS_BY_ID = (
        "trello",
        "trello_board_update_pref_s_show_sidebar_members_by_id",
        False,
    )
    TRELLO_BOARD_UPDATE_SUBSCRIBED_BY_ID = (
        "trello",
        "trello_board_update_subscribed_by_id",
        False,
    )
    TRELLO_BOARD_UPDATE_VOTING_PREF_S_BY_ID = (
        "trello",
        "trello_board_update_voting_pref_s_by_id",
        False,
    )
    TRELLO_CARD_AD_DID_LABELS_TO_CARD = (
        "trello",
        "trello_card_ad_did_labels_to_card",
        False,
    )
    TRELLO_CARD_ADD_ACTIONS_COMMENTS_BY_ID_CARD = (
        "trello",
        "trello_card_add_actions_comments_by_id_card",
        False,
    )
    TRELLO_CARD_ADD_ATTACHMENTS_BY_ID_CARD = (
        "trello",
        "trello_card_add_attachments_by_id_card",
        False,
    )
    TRELLO_CARD_ADD_CHECKLIST_CHECK_ITEM = (
        "trello",
        "trello_card_add_checklist_check_item",
        False,
    )
    TRELLO_CARD_ADD_CHECKLISTS = ("trello", "trello_card_add_checklists", False)
    TRELLO_CARD_ADD_LABELS = ("trello", "trello_card_add_labels", False)
    TRELLO_CARD_ADD_MEMBERS = ("trello", "trello_card_add_members", False)
    TRELLO_CARD_ADD_MEMBERS_VOTED = ("trello", "trello_card_add_members_voted", False)
    TRELLO_CARD_ADD_STICKERS_BY_ID_CARD = (
        "trello",
        "trello_card_add_stickers_by_id_card",
        False,
    )
    TRELLO_CARD_CONVERT_CHECK_ITEM_TO_CARD = (
        "trello",
        "trello_card_convert_check_item_to_card",
        False,
    )
    TRELLO_CARD_CREATE_AND_UPDATE = ("trello", "trello_card_create_and_update", False)
    TRELLO_CARD_DELETE_ATTACHMENTS_BY_ID_CARD_BY_ID_ATTACHMENT = (
        "trello",
        "trello_card_delete_attachments_by_id_card_by_id_attachment",
        False,
    )
    TRELLO_CARD_DELETE_CHECKLIST_BY_ID_CARD_BY_ID_CHECKLIST = (
        "trello",
        "trello_card_delete_checklist_by_id_card_by_id_checklist",
        False,
    )
    TRELLO_CARD_GET_ATTACHMENTS_BY_ID_CARD = (
        "trello",
        "trello_card_get_attachments_by_id_card",
        False,
    )
    TRELLO_CARD_GET_ATTACHMENTS_BY_IDS = (
        "trello",
        "trello_card_get_attachments_by_ids",
        False,
    )
    TRELLO_CARD_GET_BOARD_BY_ID = ("trello", "trello_card_get_board_by_id", False)
    TRELLO_CARD_GET_BOARD_BY_ID_CARD_BY_FIELD = (
        "trello",
        "trello_card_get_board_by_id_card_by_field",
        False,
    )
    TRELLO_CARD_GET_BY_ID = ("trello", "trello_card_get_by_id", False)
    TRELLO_CARD_GET_BY_ID_FIELD = ("trello", "trello_card_get_by_id_field", False)
    TRELLO_CARD_GET_CARDS_LIST_BY_ID_CARD_BY_FIELD = (
        "trello",
        "trello_card_get_cards_list_by_id_card_by_field",
        False,
    )
    TRELLO_CARD_GET_CHECK_ITEM_STATES_BY_ID = (
        "trello",
        "trello_card_get_check_item_states_by_id",
        False,
    )
    TRELLO_CARD_GET_CHECKLISTS_BY_ID = (
        "trello",
        "trello_card_get_checklists_by_id",
        False,
    )
    TRELLO_CARD_GET_LIST_BY_ID = ("trello", "trello_card_get_list_by_id", False)
    TRELLO_CARD_GET_MEMBERS_VOTED_BY_ID_CARD = (
        "trello",
        "trello_card_get_members_voted_by_id_card",
        False,
    )
    TRELLO_CARD_GET_STICKER_BY_IDS = ("trello", "trello_card_get_sticker_by_ids", False)
    TRELLO_CARD_GET_STICKERS_BY_ID_CARD = (
        "trello",
        "trello_card_get_stickers_by_id_card",
        False,
    )
    TRELLO_CARD_LIST_CARD_ACTIONS_BY_ID = (
        "trello",
        "trello_card_list_card_actions_by_id",
        False,
    )
    TRELLO_CARD_LIST_MEMBERS_BY_ID_CARD = (
        "trello",
        "trello_card_list_members_by_id_card",
        False,
    )
    TRELLO_CARD_MARK_ASSOCIATED_NOTIFICATIONS_READ = (
        "trello",
        "trello_card_mark_associated_notifications_read",
        False,
    )
    TRELLO_CARD_REMOVE_ACTION_COMMENT_BY_ID_CARD_BY_ID_ACTION = (
        "trello",
        "trello_card_remove_action_comment_by_id_card_by_id_action",
        False,
    )
    TRELLO_CARD_REMOVE_BY_ID_CARD = ("trello", "trello_card_remove_by_id_card", False)
    TRELLO_CARD_REMOVE_CHECKLIST_CHECK_ITEM = (
        "trello",
        "trello_card_remove_checklist_check_item",
        False,
    )
    TRELLO_CARD_REMOVE_LABEL_BY_ID_CARD_BY_ID_LABEL = (
        "trello",
        "trello_card_remove_label_by_id_card_by_id_label",
        False,
    )
    TRELLO_CARD_REMOVE_LABELS_BY_ID_CARD_BY_COLOR = (
        "trello",
        "trello_card_remove_labels_by_id_card_by_color",
        False,
    )
    TRELLO_CARD_REMOVE_MEMBER_BY_ID_MEMBER = (
        "trello",
        "trello_card_remove_member_by_id_member",
        False,
    )
    TRELLO_CARD_REMOVE_MEMBERS_VOTED_BY_ID_CARD_BY_ID_MEMBER = (
        "trello",
        "trello_card_remove_members_voted_by_id_card_by_id_member",
        False,
    )
    TRELLO_CARD_REMOVE_STICKER_BY_IDS = (
        "trello",
        "trello_card_remove_sticker_by_ids",
        False,
    )
    TRELLO_CARD_UPDATE_ACTION_COMMENT_BY_ID_CARD_BY_ID_ACTION = (
        "trello",
        "trello_card_update_action_comment_by_id_card_by_id_action",
        False,
    )
    TRELLO_CARD_UPDATE_ATTACHMENT_COVER_BY_ID_CARD = (
        "trello",
        "trello_card_update_attachment_cover_by_id_card",
        False,
    )
    TRELLO_CARD_UPDATE_BOARD_BY_ID_CARD = (
        "trello",
        "trello_card_update_board_by_id_card",
        False,
    )
    TRELLO_CARD_UPDATE_BY_ID_CARD = ("trello", "trello_card_update_by_id_card", False)
    TRELLO_CARD_UPDATE_CHECK_I_TEMPOS_BY_ID = (
        "trello",
        "trello_card_update_check_i_tempos_by_id",
        False,
    )
    TRELLO_CARD_UPDATE_CHECKLIST_CHECK_ITEM = (
        "trello",
        "trello_card_update_checklist_check_item",
        False,
    )
    TRELLO_CARD_UPDATE_CHECKLIST_CHECK_ITEM_NAME_BY_ID = (
        "trello",
        "trello_card_update_checklist_check_item_name_by_id",
        False,
    )
    TRELLO_CARD_UPDATE_CHECKLIST_CHECK_ITEM_STATE = (
        "trello",
        "trello_card_update_checklist_check_item_state",
        False,
    )
    TRELLO_CARD_UPDATE_CLOSED_BY_ID = (
        "trello",
        "trello_card_update_closed_by_id",
        False,
    )
    TRELLO_CARD_UPDATE_DESCRIPTION_BY_ID_CARD = (
        "trello",
        "trello_card_update_description_by_id_card",
        False,
    )
    TRELLO_CARD_UPDATE_DUE_BY_ID = ("trello", "trello_card_update_due_by_id", False)
    TRELLO_CARD_UPDATE_ID_LIST_BY_ID_CARD = (
        "trello",
        "trello_card_update_id_list_by_id_card",
        False,
    )
    TRELLO_CARD_UPDATE_ID_MEMBERS = ("trello", "trello_card_update_id_members", False)
    TRELLO_CARD_UPDATE_LABELS = ("trello", "trello_card_update_labels", False)
    TRELLO_CARD_UPDATE_NAME_BY_ID = ("trello", "trello_card_update_name_by_id", False)
    TRELLO_CARD_UPDATE_POS_BY_ID_CARD = (
        "trello",
        "trello_card_update_pos_by_id_card",
        False,
    )
    TRELLO_CARD_UPDATE_STICKERS_BY_ID_CARD_BY_ID_STICKER = (
        "trello",
        "trello_card_update_stickers_by_id_card_by_id_sticker",
        False,
    )
    TRELLO_CARD_UPDATE_SUBSCRIBED_BY_ID_CARD = (
        "trello",
        "trello_card_update_subscribed_by_id_card",
        False,
    )
    TRELLO_CHECKLIST_ADD_CHECK_ITEMS_BY_ID_CHECKLIST = (
        "trello",
        "trello_checklist_add_check_items_by_id_checklist",
        False,
    )
    TRELLO_CHECKLIST_CREATE = ("trello", "trello_checklist_create", False)
    TRELLO_CHECKLIST_GET_BOARD_BY_ID_CHECKLIST = (
        "trello",
        "trello_checklist_get_board_by_id_checklist",
        False,
    )
    TRELLO_CHECKLIST_GET_BOARD_BY_ID_CHECKLIST_BY_FIELD = (
        "trello",
        "trello_checklist_get_board_by_id_checklist_by_field",
        False,
    )
    TRELLO_CHECKLIST_GET_BY_ID = ("trello", "trello_checklist_get_by_id", False)
    TRELLO_CHECKLIST_GET_BY_ID_FIELD = (
        "trello",
        "trello_checklist_get_by_id_field",
        False,
    )
    TRELLO_CHECKLIST_GET_CARDS_BY_FILTER = (
        "trello",
        "trello_checklist_get_cards_by_filter",
        False,
    )
    TRELLO_CHECKLIST_GET_CHECK_ITEMS_BY_ID_CHECKLIST = (
        "trello",
        "trello_checklist_get_check_items_by_id_checklist",
        False,
    )
    TRELLO_CHECKLIST_GET_CHECK_ITEMS_BY_ID_CHECKLIST_BY_ID_CHECK_ITEM = (
        "trello",
        "trello_checklist_get_check_items_by_id_checklist_by_id_check_item",
        False,
    )
    TRELLO_CHECKLIST_LIST_CARDS_BY_ID_CHECKLIST = (
        "trello",
        "trello_checklist_list_cards_by_id_checklist",
        False,
    )
    TRELLO_CHECKLIST_REMOVE_BY_ID = ("trello", "trello_checklist_remove_by_id", False)
    TRELLO_CHECKLIST_REMOVE_BY_ID_CHECK_ITEM = (
        "trello",
        "trello_checklist_remove_by_id_check_item",
        False,
    )
    TRELLO_CHECKLIST_UPDATE_BY_ID_CHECKLIST = (
        "trello",
        "trello_checklist_update_by_id_checklist",
        False,
    )
    TRELLO_CHECKLIST_UPDATE_ID_CARD_BY_ID_CHECKLIST = (
        "trello",
        "trello_checklist_update_id_card_by_id_checklist",
        False,
    )
    TRELLO_CHECKLIST_UPDATE_NAME_BY_ID_CHECKLIST = (
        "trello",
        "trello_checklist_update_name_by_id_checklist",
        False,
    )
    TRELLO_CHECKLIST_UPDATE_POS_BY_ID_CHECKLIST = (
        "trello",
        "trello_checklist_update_pos_by_id_checklist",
        False,
    )
    TRELLO_LABEL_CREATE_LABELS = ("trello", "trello_label_create_labels", False)
    TRELLO_LABEL_GET_BOARD_BY_ID_LABEL = (
        "trello",
        "trello_label_get_board_by_id_label",
        False,
    )
    TRELLO_LABEL_GET_BOARD_BY_ID_LABEL_BY_FIELD = (
        "trello",
        "trello_label_get_board_by_id_label_by_field",
        False,
    )
    TRELLO_LABEL_GET_BY_ID_LABEL = ("trello", "trello_label_get_by_id_label", False)
    TRELLO_LABEL_REMOVE_BY_ID_LABEL = (
        "trello",
        "trello_label_remove_by_id_label",
        False,
    )
    TRELLO_LABEL_UPDATE_BY_ID_LABEL = (
        "trello",
        "trello_label_update_by_id_label",
        False,
    )
    TRELLO_LABEL_UPDATE_COLOR_BY_ID_LABEL = (
        "trello",
        "trello_label_update_color_by_id_label",
        False,
    )
    TRELLO_LABEL_UPDATE_NAME_BY_ID_LABEL = (
        "trello",
        "trello_label_update_name_by_id_label",
        False,
    )
    TRELLO_LIST_ARCHIVE_ALL_CARDS_BY_ID_LIST = (
        "trello",
        "trello_list_archive_all_cards_by_id_list",
        False,
    )
    TRELLO_LIST_CREATE_CARDS_BY_ID_LIST = (
        "trello",
        "trello_list_create_cards_by_id_list",
        False,
    )
    TRELLO_LIST_CREATE_LIST = ("trello", "trello_list_create_list", False)
    TRELLO_LIST_GET_ACTIONS_BY_ID_LIST = (
        "trello",
        "trello_list_get_actions_by_id_list",
        False,
    )
    TRELLO_LIST_GET_BOARD_BY_ID_LIST_BY_FIELD = (
        "trello",
        "trello_list_get_board_by_id_list_by_field",
        False,
    )
    TRELLO_LIST_GET_BY_ID_LIST = ("trello", "trello_list_get_by_id_list", False)
    TRELLO_LIST_GET_BY_ID_LIST_BY_FIELD = (
        "trello",
        "trello_list_get_by_id_list_by_field",
        False,
    )
    TRELLO_LIST_GET_CARDS_BY_FILTER = (
        "trello",
        "trello_list_get_cards_by_filter",
        False,
    )
    TRELLO_LIST_GET_CARDS_BY_ID_LIST = (
        "trello",
        "trello_list_get_cards_by_id_list",
        False,
    )
    TRELLO_LIST_ID_BOARD_GET = ("trello", "trello_list_id_board_get", False)
    TRELLO_LIST_MOVE_ALL_CARDS_BY_ID_LIST = (
        "trello",
        "trello_list_move_all_cards_by_id_list",
        False,
    )
    TRELLO_LIST_UPDATE_BY_ID_LIST = ("trello", "trello_list_update_by_id_list", False)
    TRELLO_LIST_UPDATE_CLOSED_BY_ID_LIST = (
        "trello",
        "trello_list_update_closed_by_id_list",
        False,
    )
    TRELLO_LIST_UPDATE_ID_BOARD_BY_ID_LIST = (
        "trello",
        "trello_list_update_id_board_by_id_list",
        False,
    )
    TRELLO_LIST_UPDATE_NAME_BY_ID_LIST = (
        "trello",
        "trello_list_update_name_by_id_list",
        False,
    )
    TRELLO_LIST_UPDATE_POS_BY_ID_LIST = (
        "trello",
        "trello_list_update_pos_by_id_list",
        False,
    )
    TRELLO_LIST_UPDATE_SUBSCRIBED_BY_ID_LIST = (
        "trello",
        "trello_list_update_subscribed_by_id_list",
        False,
    )
    TRELLO_MEMBER_ADD_BOARD_BACKGROUNDS = (
        "trello",
        "trello_member_add_board_backgrounds",
        False,
    )
    TRELLO_MEMBER_ADD_BOARD_STARS_BY_ID_MEMBER = (
        "trello",
        "trello_member_add_board_stars_by_id_member",
        False,
    )
    TRELLO_MEMBER_ADD_CUSTOM_BOARD_BACKGROUNDS = (
        "trello",
        "trello_member_add_custom_board_backgrounds",
        False,
    )
    TRELLO_MEMBER_ADD_CUSTOM_E_MOJI_BY_ID_MEMBER = (
        "trello",
        "trello_member_add_custom_e_moji_by_id_member",
        False,
    )
    TRELLO_MEMBER_ADD_CUSTOM_STICKERS = (
        "trello",
        "trello_member_add_custom_stickers",
        False,
    )
    TRELLO_MEMBER_ADD_ONE_TIME_MESSAGES_DISMISSED_BY_ID_MEMBER = (
        "trello",
        "trello_member_add_one_time_messages_dismissed_by_id_member",
        False,
    )
    TRELLO_MEMBER_CREATE_SAVED_SEARCH = (
        "trello",
        "trello_member_create_saved_search",
        False,
    )
    TRELLO_MEMBER_DELETE_BOARD_BACKGROUND = (
        "trello",
        "trello_member_delete_board_background",
        False,
    )
    TRELLO_MEMBER_GET_BOARD_BACKGROUND_BY_IDS = (
        "trello",
        "trello_member_get_board_background_by_ids",
        False,
    )
    TRELLO_MEMBER_GET_BOARD_BACKGROUNDS_BY_ID = (
        "trello",
        "trello_member_get_board_backgrounds_by_id",
        False,
    )
    TRELLO_MEMBER_GET_BOARD_STAR_BY_ID_MEMBER = (
        "trello",
        "trello_member_get_board_star_by_id_member",
        False,
    )
    TRELLO_MEMBER_GET_BOARD_STARS_BY_ID = (
        "trello",
        "trello_member_get_board_stars_by_id",
        False,
    )
    TRELLO_MEMBER_GET_BOARDS = ("trello", "trello_member_get_boards", False)
    TRELLO_MEMBER_GET_BOARDS_BY_ID_MEMBER = (
        "trello",
        "trello_member_get_boards_by_id_member",
        False,
    )
    TRELLO_MEMBER_GET_BOARDS_INVITED_BY_ID_MEMBER_BY_FIELD = (
        "trello",
        "trello_member_get_boards_invited_by_id_member_by_field",
        False,
    )
    TRELLO_MEMBER_GET_BY_FIELD = ("trello", "trello_member_get_by_field", False)
    TRELLO_MEMBER_GET_BY_ID = ("trello", "trello_member_get_by_id", False)
    TRELLO_MEMBER_GET_CARDS_BY_FILTER = (
        "trello",
        "trello_member_get_cards_by_filter",
        False,
    )
    TRELLO_MEMBER_GET_CARDS_BY_ID_MEMBER = (
        "trello",
        "trello_member_get_cards_by_id_member",
        False,
    )
    TRELLO_MEMBER_GET_CUSTOM_BOARD_BACKGROUND_BY_IDS = (
        "trello",
        "trello_member_get_custom_board_background_by_ids",
        False,
    )
    TRELLO_MEMBER_GET_CUSTOM_BOARD_BACKGROUNDS_BY_ID = (
        "trello",
        "trello_member_get_custom_board_backgrounds_by_id",
        False,
    )
    TRELLO_MEMBER_GET_CUSTOM_E_MOJI_BY_IDS = (
        "trello",
        "trello_member_get_custom_e_moji_by_ids",
        False,
    )
    TRELLO_MEMBER_GET_CUSTOM_STICKER_BY_IDS = (
        "trello",
        "trello_member_get_custom_sticker_by_ids",
        False,
    )
    TRELLO_MEMBER_GET_CUSTOM_STICKERS_BY_ID_MEMBER = (
        "trello",
        "trello_member_get_custom_stickers_by_id_member",
        False,
    )
    TRELLO_MEMBER_GET_DELTAS_BY_ID_MEMBER = (
        "trello",
        "trello_member_get_deltas_by_id_member",
        False,
    )
    TRELLO_MEMBER_GET_INVITED_BOARDS = (
        "trello",
        "trello_member_get_invited_boards",
        False,
    )
    TRELLO_MEMBER_GET_NOTIFICATIONS_BY_ID_MEMBER = (
        "trello",
        "trello_member_get_notifications_by_id_member",
        False,
    )
    TRELLO_MEMBER_GET_NOTIFICATIONS_BY_ID_MEMBER_BY_FILTER = (
        "trello",
        "trello_member_get_notifications_by_id_member_by_filter",
        False,
    )
    TRELLO_MEMBER_GET_ORGANIZATIONS = (
        "trello",
        "trello_member_get_organizations",
        False,
    )
    TRELLO_MEMBER_GET_SAVED_SEARCH_BY_IDS = (
        "trello",
        "trello_member_get_saved_search_by_ids",
        False,
    )
    TRELLO_MEMBER_GET_SAVED_SEARCHES_BY_ID_MEMBER = (
        "trello",
        "trello_member_get_saved_searches_by_id_member",
        False,
    )
    TRELLO_MEMBER_GET_TOKENS_BY_ID_MEMBER = (
        "trello",
        "trello_member_get_tokens_by_id_member",
        False,
    )
    TRELLO_MEMBER_LIST_ACTIONS_BY_ID_MEMBER = (
        "trello",
        "trello_member_list_actions_by_id_member",
        False,
    )
    TRELLO_MEMBER_LIST_CUSTOM_E_MOJI_BY_ID_MEMBER = (
        "trello",
        "trello_member_list_custom_e_moji_by_id_member",
        False,
    )
    TRELLO_MEMBER_LIST_INVITED_ORGANIZATIONS_BY_ID = (
        "trello",
        "trello_member_list_invited_organizations_by_id",
        False,
    )
    TRELLO_MEMBER_LIST_ORGANIZATIONS_BY_ID = (
        "trello",
        "trello_member_list_organizations_by_id",
        False,
    )
    TRELLO_MEMBER_LIST_ORGANIZATIONS_INVITED_BY_ID_MEMBER_BY_FIELD = (
        "trello",
        "trello_member_list_organizations_invited_by_id_member_by_field",
        False,
    )
    TRELLO_MEMBER_REMOVE_BOARD_STAR_BY_ID_MEMBER_BY_ID_BOARD_STAR = (
        "trello",
        "trello_member_remove_board_star_by_id_member_by_id_board_star",
        False,
    )
    TRELLO_MEMBER_REMOVE_CUSTOM_BOARD_BACKGROUND_BY_ID = (
        "trello",
        "trello_member_remove_custom_board_background_by_id",
        False,
    )
    TRELLO_MEMBER_REMOVE_CUSTOM_STICKER_BY_IDS = (
        "trello",
        "trello_member_remove_custom_sticker_by_ids",
        False,
    )
    TRELLO_MEMBER_REMOVE_SAVED_SEARCH_BY_IDS = (
        "trello",
        "trello_member_remove_saved_search_by_ids",
        False,
    )
    TRELLO_MEMBER_UPDATE_AVATAR_SOURCE = (
        "trello",
        "trello_member_update_avatar_source",
        False,
    )
    TRELLO_MEMBER_UPDATE_BIO_BY_ID = ("trello", "trello_member_update_bio_by_id", False)
    TRELLO_MEMBER_UPDATE_BOARD_BACKGROUNDS_BY_ID = (
        "trello",
        "trello_member_update_board_backgrounds_by_id",
        False,
    )
    TRELLO_MEMBER_UPDATE_BOARD_STAR = (
        "trello",
        "trello_member_update_board_star",
        False,
    )
    TRELLO_MEMBER_UPDATE_BOARD_STAR_POS_BY_ID_MEMBER_BY_ID_BOARD_STAR = (
        "trello",
        "trello_member_update_board_star_pos_by_id_member_by_id_board_star",
        False,
    )
    TRELLO_MEMBER_UPDATE_BOARD_STARS_ID_BOARD = (
        "trello",
        "trello_member_update_board_stars_id_board",
        False,
    )
    TRELLO_MEMBER_UPDATE_BY_ID_MEMBER = (
        "trello",
        "trello_member_update_by_id_member",
        False,
    )
    TRELLO_MEMBER_UPDATE_CUSTOM_BOARD_BACKGROUNDS = (
        "trello",
        "trello_member_update_custom_board_backgrounds",
        False,
    )
    TRELLO_MEMBER_UPDATE_FULL_NAME = ("trello", "trello_member_update_full_name", False)
    TRELLO_MEMBER_UPDATE_INITIALS_BY_ID_MEMBER = (
        "trello",
        "trello_member_update_initials_by_id_member",
        False,
    )
    TRELLO_MEMBER_UPDATE_PREF_S_COLORBLIND_BY_ID_MEMBER = (
        "trello",
        "trello_member_update_pref_s_colorblind_by_id_member",
        False,
    )
    TRELLO_MEMBER_UPDATE_PREF_S_LOCALE_BY_ID_MEMBER = (
        "trello",
        "trello_member_update_pref_s_locale_by_id_member",
        False,
    )
    TRELLO_MEMBER_UPDATE_PREF_S_MINUTES_BETWEEN_SUMMARIES_BY_ID = (
        "trello",
        "trello_member_update_pref_s_minutes_between_summaries_by_id",
        False,
    )
    TRELLO_MEMBER_UPDATE_SAVED_SEARCH_QUERY_BY_ID_MEMBER_BY_ID_SAVED_SEARCH = (
        "trello",
        "trello_member_update_saved_search_query_by_id_member_by_id_saved_search",
        False,
    )
    TRELLO_MEMBER_UPDATE_SAVED_SEARCHES_BY_ID_MEMBER_BY_ID_SAVED_SEARCH = (
        "trello",
        "trello_member_update_saved_searches_by_id_member_by_id_saved_search",
        False,
    )
    TRELLO_MEMBER_UPDATE_SAVED_SEARCHES_NAME_BY_ID_MEMBER_BY_ID_SAVED_SEARCH = (
        "trello",
        "trello_member_update_saved_searches_name_by_id_member_by_id_saved_search",
        False,
    )
    TRELLO_MEMBER_UPDATE_SAVED_SEARCHES_POS_BY_ID_MEMBER_BY_ID_SAVED_SEARCH = (
        "trello",
        "trello_member_update_saved_searches_pos_by_id_member_by_id_saved_search",
        False,
    )
    TRELLO_MEMBER_UPDATE_USERNAME_BY_ID = (
        "trello",
        "trello_member_update_username_by_id",
        False,
    )
    TRELLO_MEMBER_UPLOAD_AVATAR_BY_ID = (
        "trello",
        "trello_member_upload_avatar_by_id",
        False,
    )
    TRELLO_NOTIFICATION_GET_BOARD_BY_FIELD = (
        "trello",
        "trello_notification_get_board_by_field",
        False,
    )
    TRELLO_NOTIFICATION_GET_BOARD_BY_ID = (
        "trello",
        "trello_notification_get_board_by_id",
        False,
    )
    TRELLO_NOTIFICATION_GET_BY_ID = ("trello", "trello_notification_get_by_id", False)
    TRELLO_NOTIFICATION_GET_BY_ID_FIELD = (
        "trello",
        "trello_notification_get_by_id_field",
        False,
    )
    TRELLO_NOTIFICATION_GET_CARD_BY_ID = (
        "trello",
        "trello_notification_get_card_by_id",
        False,
    )
    TRELLO_NOTIFICATION_GET_CARD_BY_ID_NOTIFICATION_BY_FIELD = (
        "trello",
        "trello_notification_get_card_by_id_notification_by_field",
        False,
    )
    TRELLO_NOTIFICATION_GET_DISPLAY_BY_ID_NOTIFICATION = (
        "trello",
        "trello_notification_get_display_by_id_notification",
        False,
    )
    TRELLO_NOTIFICATION_GET_ENTITIES_BY_ID_NOTIFICATION = (
        "trello",
        "trello_notification_get_entities_by_id_notification",
        False,
    )
    TRELLO_NOTIFICATION_GET_LIST_BY_ID_NOTIFICATION = (
        "trello",
        "trello_notification_get_list_by_id_notification",
        False,
    )
    TRELLO_NOTIFICATION_GET_LIST_BY_ID_NOTIFICATION_BY_FIELD = (
        "trello",
        "trello_notification_get_list_by_id_notification_by_field",
        False,
    )
    TRELLO_NOTIFICATION_GET_MEMBER_BY_ID_FIELD = (
        "trello",
        "trello_notification_get_member_by_id_field",
        False,
    )
    TRELLO_NOTIFICATION_GET_MEMBER_BY_ID_NOTIFICATION_BY_FIELD = (
        "trello",
        "trello_notification_get_member_by_id_notification_by_field",
        False,
    )
    TRELLO_NOTIFICATION_GET_MEMBER_BY_NOTIFICATION = (
        "trello",
        "trello_notification_get_member_by_notification",
        False,
    )
    TRELLO_NOTIFICATION_GET_MEMBER_CREATOR_BY_ID = (
        "trello",
        "trello_notification_get_member_creator_by_id",
        False,
    )
    TRELLO_NOTIFICATION_GET_ORGANIZATION_BY_ID_NOTIFICATION = (
        "trello",
        "trello_notification_get_organization_by_id_notification",
        False,
    )
    TRELLO_NOTIFICATION_GET_ORGANIZATION_BY_ID_NOTIFICATION_BY_FIELD = (
        "trello",
        "trello_notification_get_organization_by_id_notification_by_field",
        False,
    )
    TRELLO_NOTIFICATION_MARK_ALL_AS_READ = (
        "trello",
        "trello_notification_mark_all_as_read",
        False,
    )
    TRELLO_NOTIFICATION_UPDATE_BY_ID_NOTIFICATION = (
        "trello",
        "trello_notification_update_by_id_notification",
        False,
    )
    TRELLO_NOTIFICATION_UPDATE_UNREAD_BY_ID_NOTIFICATION = (
        "trello",
        "trello_notification_update_unread_by_id_notification",
        False,
    )
    TRELLO_ORGANIZATION_CREATE = ("trello", "trello_organization_create", False)
    TRELLO_ORGANIZATION_DELETE_PREF_S_ASSOCIATED_DOMAIN_BY_ID_ORG = (
        "trello",
        "trello_organization_delete_pref_s_associated_domain_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_GET_ACTIONS_BY_ID_ORG = (
        "trello",
        "trello_organization_get_actions_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_GET_BOARDS_BY_ID_ORG_BY_FILTER = (
        "trello",
        "trello_organization_get_boards_by_id_org_by_filter",
        False,
    )
    TRELLO_ORGANIZATION_GET_BOARDS_BY_OR_GID = (
        "trello",
        "trello_organization_get_boards_by_or_gid",
        False,
    )
    TRELLO_ORGANIZATION_GET_BY_ID_AND_FIELD = (
        "trello",
        "trello_organization_get_by_id_and_field",
        False,
    )
    TRELLO_ORGANIZATION_GET_BY_ID_ORG = (
        "trello",
        "trello_organization_get_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_GET_MEMBERS_BY_ID_ORG = (
        "trello",
        "trello_organization_get_members_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_GET_MEMBERS_INVITED_BY_ID_ORG = (
        "trello",
        "trello_organization_get_members_invited_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_GET_MEMBERS_INVITED_BY_ID_ORG_BY_FIELD = (
        "trello",
        "trello_organization_get_members_invited_by_id_org_by_field",
        False,
    )
    TRELLO_ORGANIZATION_GET_MEMBERSHIPS_BY_ID_ORG_BY_ID_MEMBERSHIP = (
        "trello",
        "trello_organization_get_memberships_by_id_org_by_id_membership",
        False,
    )
    TRELLO_ORGANIZATION_GET_ORGANIZATION_DELTAS = (
        "trello",
        "trello_organization_get_organization_deltas",
        False,
    )
    TRELLO_ORGANIZATION_LIST_MEMBERS_BY_ID_ORG_BY_FILTER = (
        "trello",
        "trello_organization_list_members_by_id_org_by_filter",
        False,
    )
    TRELLO_ORGANIZATION_LIST_MEMBERS_CARDS_BY_ID_ORG_BY_ID_MEMBER = (
        "trello",
        "trello_organization_list_members_cards_by_id_org_by_id_member",
        False,
    )
    TRELLO_ORGANIZATION_LIST_MEMBERSHIPS_BY_ID_ORG = (
        "trello",
        "trello_organization_list_memberships_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_REMOVE_BY_ID_ORG = (
        "trello",
        "trello_organization_remove_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_REMOVE_INVITE_RESTRICT_BY_ID_ORG = (
        "trello",
        "trello_organization_remove_invite_restrict_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_REMOVE_LOGO_BY_ID_ORG = (
        "trello",
        "trello_organization_remove_logo_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_REMOVE_MEMBER_ALL = (
        "trello",
        "trello_organization_remove_member_all",
        False,
    )
    TRELLO_ORGANIZATION_REMOVE_MEMBER_BY_ID_ORG_BY_ID_MEMBER = (
        "trello",
        "trello_organization_remove_member_by_id_org_by_id_member",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_BY_ID_ORG = (
        "trello",
        "trello_organization_update_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_DESCRIPTION_BY_ID_ORG = (
        "trello",
        "trello_organization_update_description_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_DISPLAY_NAME_BY_ID_ORG = (
        "trello",
        "trello_organization_update_display_name_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_MEMBERS_BY_ID_ORG = (
        "trello",
        "trello_organization_update_members_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_MEMBERS_BY_ID_ORG_BY_ID_MEMBER = (
        "trello",
        "trello_organization_update_members_by_id_org_by_id_member",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_MEMBERS_DEACTIVATED_BY_ID_ORG_BY_ID_MEMBER = (
        "trello",
        "trello_organization_update_members_deactivated_by_id_org_by_id_member",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_MEMBERSHIP_BY_ID_ORG_BY_ID_MEMBERSHIP = (
        "trello",
        "trello_organization_update_membership_by_id_org_by_id_membership",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_NAME_BY_ID_ORG = (
        "trello",
        "trello_organization_update_name_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_PREF_S_ASSOCIATED_DOMAIN_BY_ID_ORG = (
        "trello",
        "trello_organization_update_pref_s_associated_domain_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_PREF_S_BOARD_VISIBILITY_RESTRICT_BY_ID_ORG = (
        "trello",
        "trello_organization_update_pref_s_board_visibility_restrict_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_PREF_S_BOARD_VISIBILITY_RESTRICT_PUBLIC_BY_ID_ORG = (
        "trello",
        "trello_organization_update_pref_s_board_visibility_restrict_public_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_PREF_S_EXTERNAL_MEMBERS_DISABLED_BY_ID_ORG = (
        "trello",
        "trello_organization_update_pref_s_external_members_disabled_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_PREF_S_GOOGLE_APPS_VERSION_BY_ID_ORG = (
        "trello",
        "trello_organization_update_pref_s_google_apps_version_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_PREF_S_ORG_INVITE_RESTRICT_BY_ID_ORG = (
        "trello",
        "trello_organization_update_pref_s_org_invite_restrict_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_PREF_S_PERMISSION_LEVEL_BY_ID_ORG = (
        "trello",
        "trello_organization_update_pref_s_permission_level_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_PREF_S_VISIBILITY_BY_ID_ORG = (
        "trello",
        "trello_organization_update_pref_s_visibility_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPDATE_WEBSITE_BY_ID_ORG = (
        "trello",
        "trello_organization_update_website_by_id_org",
        False,
    )
    TRELLO_ORGANIZATION_UPLOAD_LOGO_BY_ID_ORG = (
        "trello",
        "trello_organization_upload_logo_by_id_org",
        False,
    )
    TRELLO_SEARCH_FIND_MEMBERS = ("trello", "trello_search_find_members", False)
    TRELLO_SEARCH_GET_RESULTS = ("trello", "trello_search_get_results", False)
    TRELLO_SESSION_CREATE_AND_UPDATE = (
        "trello",
        "trello_session_create_and_update",
        False,
    )
    TRELLO_SESSION_GET_SOCKET_SESSIONS = (
        "trello",
        "trello_session_get_socket_sessions",
        False,
    )
    TRELLO_SESSION_UPDATE_STATUS_BY_ID_SESSION = (
        "trello",
        "trello_session_update_status_by_id_session",
        False,
    )
    TRELLO_SESSION_UPDATE_STATUS_BY_ID_SESSION_2 = (
        "trello",
        "trello_session_update_status_by_id_session_2",
        False,
    )
    TRELLO_TOKEN_DELETE_BY_TOKEN = ("trello", "trello_token_delete_by_token", False)
    TRELLO_TOKEN_GET_BY_TOKEN = ("trello", "trello_token_get_by_token", False)
    TRELLO_TOKEN_GET_BY_TOKEN_BY_FIELD = (
        "trello",
        "trello_token_get_by_token_by_field",
        False,
    )
    TRELLO_TOKEN_GET_MEMBER_BY_FIELD = (
        "trello",
        "trello_token_get_member_by_field",
        False,
    )
    TRELLO_TOKEN_GET_MEMBER_BY_TOKEN = (
        "trello",
        "trello_token_get_member_by_token",
        False,
    )
    TRELLO_TOKEN_GET_WEB_HOOK_BY_ID = (
        "trello",
        "trello_token_get_web_hook_by_id",
        False,
    )
    TRELLO_TOKEN_GET_WEB_HOOKS = ("trello", "trello_token_get_web_hooks", False)
    TRELLO_TOKEN_REGISTER_WEB_HOOK = ("trello", "trello_token_register_web_hook", False)
    TRELLO_TOKEN_REMOVE_BY_TOKEN_BY_ID_WEB_HOOK = (
        "trello",
        "trello_token_remove_by_token_by_id_web_hook",
        False,
    )
    TRELLO_TOKEN_UPDATE_WEB_HOOKS_BY_TOKEN = (
        "trello",
        "trello_token_update_web_hooks_by_token",
        False,
    )
    TRELLO_TYPE_GET_BY_ID = ("trello", "trello_type_get_by_id", False)
    TRELLO_WEB_HOOK_GET_BY_ID = ("trello", "trello_web_hook_get_by_id", False)
    TRELLO_WEB_HOOK_GET_BY_ID_FIELD = (
        "trello",
        "trello_web_hook_get_by_id_field",
        False,
    )
    TRELLO_WEB_HOOK_REMOVE_BY_ID = ("trello", "trello_web_hook_remove_by_id", False)
    TRELLO_WEB_HOOK_UPDATE = ("trello", "trello_web_hook_update", False)
    TRELLO_WEB_HOOK_UPDATE_ACTIVE_BY_ID = (
        "trello",
        "trello_web_hook_update_active_by_id",
        False,
    )
    TRELLO_WEB_HOOK_UPDATE_BY_ID_WEB_HOOK = (
        "trello",
        "trello_web_hook_update_by_id_web_hook",
        False,
    )
    TRELLO_WEB_HOOK_UPDATE_CALLBACK_URL_BY_ID = (
        "trello",
        "trello_web_hook_update_callback_url_by_id",
        False,
    )
    TRELLO_WEB_HOOK_UPDATE_DESCRIPTION_BY_ID_WEB_HOOK = (
        "trello",
        "trello_web_hook_update_description_by_id_web_hook",
        False,
    )
    TRELLO_WEB_HOOK_UPDATE_MODEL_BY_ID = (
        "trello",
        "trello_web_hook_update_model_by_id",
        False,
    )
    TWILIO_SEND_SMS = ("twilio", "twilio_send_sms", False)
    TWILIO_SEND_WHATS_APP_MESSAGE = ("twilio", "twilio_send_whats_app_message", False)
    TYPEFORM_GET_ABOUT_ME = ("typeform", "typeform_get_about_me", False)
    WEATHERMAP_WEATHER = ("weathermap", "weathermap_weather", True)
    WHATSAPP_APPLICATION_GET_SETTINGS = (
        "whatsapp",
        "whatsapp_application_get_settings",
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
    WHATSAPP_APPLICATION_RESET_SETTINGS = (
        "whatsapp",
        "whatsapp_application_reset_settings",
        False,
    )
    WHATSAPP_APPLICATION_SET_SHARDS = (
        "whatsapp",
        "whatsapp_application_set_shards",
        False,
    )
    WHATSAPP_APPLICATION_UPDATE_SETTINGS = (
        "whatsapp",
        "whatsapp_application_update_settings",
        False,
    )
    WHATSAPP_BACKUP_RESTORE_SETTINGS_POST = (
        "whatsapp",
        "whatsapp_backup_restore_settings_post",
        False,
    )
    WHATSAPP_BACKUP_RESTORE_SETTINGS_POST_2 = (
        "whatsapp",
        "whatsapp_backup_restore_settings_post_2",
        False,
    )
    WHATSAPP_BUSINESS_PROFILE_GET = ("whatsapp", "whatsapp_business_profile_get", False)
    WHATSAPP_BUSINESS_PROFILE_UPDATE = (
        "whatsapp",
        "whatsapp_business_profile_update",
        False,
    )
    WHATSAPP_CERTIFICATES_DELETE_WEB_HOOK_CA = (
        "whatsapp",
        "whatsapp_certificates_delete_web_hook_ca",
        False,
    )
    WHATSAPP_CERTIFICATES_DOWNLOAD_CA_CERTIFICATE = (
        "whatsapp",
        "whatsapp_certificates_download_ca_certificate",
        False,
    )
    WHATSAPP_CERTIFICATES_DOWNLOAD_WEB_HOOK_CA_CERTIFICATE = (
        "whatsapp",
        "whatsapp_certificates_download_web_hook_ca_certificate",
        False,
    )
    WHATSAPP_CERTIFICATES_UPLOAD_EXTERNAL_CERTIFICATE = (
        "whatsapp",
        "whatsapp_certificates_upload_external_certificate",
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
    WHATSAPP_GROUPS_CREATE_GROUP = ("whatsapp", "whatsapp_groups_create_group", False)
    WHATSAPP_GROUPS_DELETE_GROUP_ICON = (
        "whatsapp",
        "whatsapp_groups_delete_group_icon",
        False,
    )
    WHATSAPP_GROUPS_DELETE_INVITE = ("whatsapp", "whatsapp_groups_delete_invite", False)
    WHATSAPP_GROUPS_DEMOTE_ADMIN = ("whatsapp", "whatsapp_groups_demote_admin", False)
    WHATSAPP_GROUPS_GET_ALL = ("whatsapp", "whatsapp_groups_get_all", False)
    WHATSAPP_GROUPS_GET_ICON_BINARY = (
        "whatsapp",
        "whatsapp_groups_get_icon_binary",
        False,
    )
    WHATSAPP_GROUPS_GET_INFO = ("whatsapp", "whatsapp_groups_get_info", False)
    WHATSAPP_GROUPS_GET_INVITE_DETAILS = (
        "whatsapp",
        "whatsapp_groups_get_invite_details",
        False,
    )
    WHATSAPP_GROUPS_LEAVE_GROUP = ("whatsapp", "whatsapp_groups_leave_group", False)
    WHATSAPP_GROUPS_PROMOTE_TO_ADMIN = (
        "whatsapp",
        "whatsapp_groups_promote_to_admin",
        False,
    )
    WHATSAPP_GROUPS_REMOVE_PARTICIPANT = (
        "whatsapp",
        "whatsapp_groups_remove_participant",
        False,
    )
    WHATSAPP_GROUPS_SET_GROUP_ICON = (
        "whatsapp",
        "whatsapp_groups_set_group_icon",
        False,
    )
    WHATSAPP_GROUPS_UPDATE_INFO = ("whatsapp", "whatsapp_groups_update_info", False)
    WHATSAPP_HEALTH_CHECK_STATUS = ("whatsapp", "whatsapp_health_check_status", False)
    WHATSAPP_HEALTH_GET_APP_STATS = ("whatsapp", "whatsapp_health_get_app_stats", False)
    WHATSAPP_HEALTH_GET_DB_STATS = ("whatsapp", "whatsapp_health_get_db_stats", False)
    WHATSAPP_HEALTH_GET_METRICS_DATA = (
        "whatsapp",
        "whatsapp_health_get_metrics_data",
        False,
    )
    WHATSAPP_HEALTH_GET_SUPPORT_INFO = (
        "whatsapp",
        "whatsapp_health_get_support_info",
        False,
    )
    WHATSAPP_MEDIA_DOWNLOAD = ("whatsapp", "whatsapp_media_download", False)
    WHATSAPP_MEDIA_REMOVE_MEDIA = ("whatsapp", "whatsapp_media_remove_media", False)
    WHATSAPP_MEDIA_UPLOAD_MEDIA = ("whatsapp", "whatsapp_media_upload_media", False)
    WHATSAPP_MESSAGES_MARK_AS_READ = (
        "whatsapp",
        "whatsapp_messages_mark_as_read",
        False,
    )
    WHATSAPP_MESSAGES_SEND_MESSAGE = (
        "whatsapp",
        "whatsapp_messages_send_message",
        False,
    )
    WHATSAPP_PROFILE_GET_ABOUT = ("whatsapp", "whatsapp_profile_get_about", False)
    WHATSAPP_PROFILE_GET_PHOTO = ("whatsapp", "whatsapp_profile_get_photo", False)
    WHATSAPP_PROFILE_REMOVE_PHOTO = ("whatsapp", "whatsapp_profile_remove_photo", False)
    WHATSAPP_PROFILE_UPDATE_ABOUT = ("whatsapp", "whatsapp_profile_update_about", False)
    WHATSAPP_PROFILE_UPDATE_PHOTO = ("whatsapp", "whatsapp_profile_update_photo", False)
    WHATSAPP_REGISTRATION_REQUEST_CODE = (
        "whatsapp",
        "whatsapp_registration_request_code",
        False,
    )
    WHATSAPP_REGISTRATION_VERIFY_ACCOUNT = (
        "whatsapp",
        "whatsapp_registration_verify_account",
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
    WHATSAPP_USERS_CREATE_USER = ("whatsapp", "whatsapp_users_create_user", False)
    WHATSAPP_USERS_GET_BY_USERNAME = (
        "whatsapp",
        "whatsapp_users_get_by_username",
        False,
    )
    WHATSAPP_USERS_PERFORM_LOG_OUT = (
        "whatsapp",
        "whatsapp_users_perform_log_out",
        False,
    )
    WHATSAPP_USERS_PERFORM_LOGIN = ("whatsapp", "whatsapp_users_perform_login", False)
    WHATSAPP_USERS_REMOVE_USER = ("whatsapp", "whatsapp_users_remove_user", False)
    WHATSAPP_USERS_UPDATE_USER = ("whatsapp", "whatsapp_users_update_user", False)
    WORKABLE_GET_ACCOUNT_DEPARTMENT_ACTION = (
        "workable",
        "workable_get_account_department_action",
        False,
    )
    WORKABLE_GET_EXTERNAL_RECRUITER_LIST_ACTION = (
        "workable",
        "workable_get_external_recruiter_list_action",
        False,
    )
    WORKABLE_GET_LEGAL_ENTITIES_ACTION = (
        "workable",
        "workable_get_legal_entities_action",
        False,
    )
    WORKABLE_GET_MEMBERS_LIST_ACTION = (
        "workable",
        "workable_get_members_list_action",
        False,
    )
    WORKABLE_GET_REQUIREMENT_PIPELINE_STAGE_ACTION = (
        "workable",
        "workable_get_requirement_pipeline_stage_action",
        False,
    )
    WORKABLE_GET_SPECIFIC_ACCOUNT_ACTION = (
        "workable",
        "workable_get_specific_account_action",
        False,
    )
    WORKABLE_WORKABLE_ACCOUNT_ACCESS_ACTION = (
        "workable",
        "workable_workable_account_access_action",
        False,
    )
    YOUSEARCH_SEARCH = ("yousearch", "yousearch_search", True)
    YOUTUBE_LIST_CAPTION_TRACK = ("youtube", "youtube_list_caption_track", False)
    YOUTUBE_LIST_CHANNEL_VIDEOS = ("youtube", "youtube_list_channel_videos", False)
    YOUTUBE_LIST_USER_PLAYLISTS = ("youtube", "youtube_list_user_playlists", False)
    YOUTUBE_LIST_USER_SUBSCRIPTIONS = (
        "youtube",
        "youtube_list_user_subscriptions",
        False,
    )
    YOUTUBE_LOAD_CAPTIONS = ("youtube", "youtube_load_captions", False)
    YOUTUBE_SEARCH_YOU_TUBE = ("youtube", "youtube_search_you_tube", False)
    YOUTUBE_SUBSCRIBE_CHANNEL = ("youtube", "youtube_subscribe_channel", False)
    YOUTUBE_UPDATE_THUMBNAIL = ("youtube", "youtube_update_thumbnail", False)
    YOUTUBE_UPDATE_VIDEO = ("youtube", "youtube_update_video", False)
    YOUTUBE_VIDEO_DETAILS = ("youtube", "youtube_video_details", False)
    ZENDESK_COUNT_ZENDESK_ORGANIZATIONS = (
        "zendesk",
        "zendesk_count_zendesk_organizations",
        False,
    )
    ZENDESK_CREATE_ZENDESK_ORGANIZATION = (
        "zendesk",
        "zendesk_create_zendesk_organization",
        False,
    )
    ZENDESK_CREATE_ZENDESK_TICKET = ("zendesk", "zendesk_create_zendesk_ticket", False)
    ZENDESK_DELETE_ZENDESK_ORGANIZATION = (
        "zendesk",
        "zendesk_delete_zendesk_organization",
        False,
    )
    ZENDESK_DELETE_ZENDESK_TICKET = ("zendesk", "zendesk_delete_zendesk_ticket", False)
    ZENDESK_GET_ABOUT_ME = ("zendesk", "zendesk_get_about_me", False)
    ZENDESK_GET_ALL_ZENDESK_ORGANIZATIONS = (
        "zendesk",
        "zendesk_get_all_zendesk_organizations",
        False,
    )
    ZENDESK_GET_ZENDESK_ORGANIZATION = (
        "zendesk",
        "zendesk_get_zendesk_organization",
        False,
    )
    ZENDESK_UPDATE_ZENDESK_ORGANIZATION = (
        "zendesk",
        "zendesk_update_zendesk_organization",
        False,
    )
    ZOOM_ANALYTICS_DETAILS = ("zoom", "zoom_analytics_details", False)
    ZOOM_ANALYTICS_SUMMARY = ("zoom", "zoom_analytics_summary", False)
    ZOOM_ARCHIVING_GET_STATISTICS = ("zoom", "zoom_archiving_get_statistics", False)
    ZOOM_ARCHIVING_MEETING_FILES_DELETE = (
        "zoom",
        "zoom_archiving_meeting_files_delete",
        False,
    )
    ZOOM_ARCHIVING_MEETING_FILES_LIST = (
        "zoom",
        "zoom_archiving_meeting_files_list",
        False,
    )
    ZOOM_ARCHIVING_MEETING_FILES_LIST_2 = (
        "zoom",
        "zoom_archiving_meeting_files_list_2",
        False,
    )
    ZOOM_ARCHIVING_UPDATE_AUTO_DELETE_STATUS = (
        "zoom",
        "zoom_archiving_update_auto_delete_status",
        False,
    )
    ZOOM_CLOUD_RECORDING_CREATE_REGISTRANT = (
        "zoom",
        "zoom_cloud_recording_create_registrant",
        False,
    )
    ZOOM_CLOUD_RECORDING_DELETE_MEETING_RECORDINGS = (
        "zoom",
        "zoom_cloud_recording_delete_meeting_recordings",
        False,
    )
    ZOOM_CLOUD_RECORDING_DELETE_RECORDING = (
        "zoom",
        "zoom_cloud_recording_delete_recording",
        False,
    )
    ZOOM_CLOUD_RECORDING_GET_MEETING_RECORDINGS = (
        "zoom",
        "zoom_cloud_recording_get_meeting_recordings",
        False,
    )
    ZOOM_CLOUD_RECORDING_GET_SETTINGS = (
        "zoom",
        "zoom_cloud_recording_get_settings",
        False,
    )
    ZOOM_CLOUD_RECORDING_LIST_RECORDINGS = (
        "zoom",
        "zoom_cloud_recording_list_recordings",
        False,
    )
    ZOOM_CLOUD_RECORDING_LIST_REGISTRANTS = (
        "zoom",
        "zoom_cloud_recording_list_registrants",
        False,
    )
    ZOOM_CLOUD_RECORDING_LIST_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_cloud_recording_list_registration_questions",
        False,
    )
    ZOOM_CLOUD_RECORDING_RECOVER_RECORDING_STATUS = (
        "zoom",
        "zoom_cloud_recording_recover_recording_status",
        False,
    )
    ZOOM_CLOUD_RECORDING_RECOVER_STATUS = (
        "zoom",
        "zoom_cloud_recording_recover_status",
        False,
    )
    ZOOM_CLOUD_RECORDING_UPDATE_REGISTRANT_STATUS = (
        "zoom",
        "zoom_cloud_recording_update_registrant_status",
        False,
    )
    ZOOM_CLOUD_RECORDING_UPDATE_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_cloud_recording_update_registration_questions",
        False,
    )
    ZOOM_CLOUD_RECORDING_UPDATE_SETTINGS = (
        "zoom",
        "zoom_cloud_recording_update_settings",
        False,
    )
    ZOOM_DEVICES_ASSIGN_DEVICE_ZP_A_ASSIGNMENT = (
        "zoom",
        "zoom_devices_assign_device_zp_a_assignment",
        False,
    )
    ZOOM_DEVICES_CHANGE_DEVICE_ASSOCIATION = (
        "zoom",
        "zoom_devices_change_device_association",
        False,
    )
    ZOOM_DEVICES_CREATE_NEW_DEVICE = ("zoom", "zoom_devices_create_new_device", False)
    ZOOM_DEVICES_GET_DETAIL = ("zoom", "zoom_devices_get_detail", False)
    ZOOM_DEVICES_GET_ZP_A_VERSION_INFO = (
        "zoom",
        "zoom_devices_get_zp_a_version_info",
        False,
    )
    ZOOM_DEVICES_LIST = ("zoom", "zoom_devices_list", False)
    ZOOM_DEVICES_LIST_ZD_M_GROUP_INFO = (
        "zoom",
        "zoom_devices_list_zd_m_group_info",
        False,
    )
    ZOOM_DEVICES_REMOVE_DEVICE_ZM_D = ("zoom", "zoom_devices_remove_device_zm_d", False)
    ZOOM_DEVICES_REMOVE_ZP_A_DEVICE_BY_VENDOR_AND_MAC_ADDRESS = (
        "zoom",
        "zoom_devices_remove_zp_a_device_by_vendor_and_mac_address",
        False,
    )
    ZOOM_DEVICES_UPDATE_DEVICE_NAME = ("zoom", "zoom_devices_update_device_name", False)
    ZOOM_DEVICES_UPGRADE_ZP_A_OS_APP = (
        "zoom",
        "zoom_devices_upgrade_zp_a_os_app",
        False,
    )
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
    ZOOM_H_323_DEVICES_LIST_DEVICES = ("zoom", "zoom_h_323_devices_list_devices", False)
    ZOOM_H_323_DEVICES_UPDATE_DEVICE_INFO = (
        "zoom",
        "zoom_h_323_devices_update_device_info",
        False,
    )
    ZOOM_MEETINGS_ADD_REGISTRANT = ("zoom", "zoom_meetings_add_registrant", False)
    ZOOM_MEETINGS_BATCH_REGISTRANTS_CREATE = (
        "zoom",
        "zoom_meetings_batch_registrants_create",
        False,
    )
    ZOOM_MEETINGS_CONTROL_IN_MEETING_FEATURES = (
        "zoom",
        "zoom_meetings_control_in_meeting_features",
        False,
    )
    ZOOM_MEETINGS_CREATE_BATCH_POLLS = (
        "zoom",
        "zoom_meetings_create_batch_polls",
        False,
    )
    ZOOM_MEETINGS_CREATE_INVITE_LINKS = (
        "zoom",
        "zoom_meetings_create_invite_links",
        False,
    )
    ZOOM_MEETINGS_CREATE_MEETING = ("zoom", "zoom_meetings_create_meeting", False)
    ZOOM_MEETINGS_CREATE_POLL = ("zoom", "zoom_meetings_create_poll", False)
    ZOOM_MEETINGS_CREATE_TEMPLATE_FROM_MEETING = (
        "zoom",
        "zoom_meetings_create_template_from_meeting",
        False,
    )
    ZOOM_MEETINGS_DELETE_MEETING_CHAT_MESSAGE = (
        "zoom",
        "zoom_meetings_delete_meeting_chat_message",
        False,
    )
    ZOOM_MEETINGS_DELETE_MEETING_SURVEY = (
        "zoom",
        "zoom_meetings_delete_meeting_survey",
        False,
    )
    ZOOM_MEETINGS_DELETE_REGISTRANT = ("zoom", "zoom_meetings_delete_registrant", False)
    ZOOM_MEETINGS_GET_DETAILS = ("zoom", "zoom_meetings_get_details", False)
    ZOOM_MEETINGS_GET_DETAILS_2 = ("zoom", "zoom_meetings_get_details_2", False)
    ZOOM_MEETINGS_GET_INVITATION_NOTE = (
        "zoom",
        "zoom_meetings_get_invitation_note",
        False,
    )
    ZOOM_MEETINGS_GET_JOIN_TOKEN = ("zoom", "zoom_meetings_get_join_token", False)
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
    ZOOM_MEETINGS_GET_MEETING_ARCHIVE_TOKEN_FOR_LOCAL_ARCHIVING = (
        "zoom",
        "zoom_meetings_get_meeting_archive_token_for_local_archiving",
        False,
    )
    ZOOM_MEETINGS_GET_MEETING_SUMMARY = (
        "zoom",
        "zoom_meetings_get_meeting_summary",
        False,
    )
    ZOOM_MEETINGS_GET_MEETING_SURVEY = (
        "zoom",
        "zoom_meetings_get_meeting_survey",
        False,
    )
    ZOOM_MEETINGS_GET_MEETING_TOKEN = ("zoom", "zoom_meetings_get_meeting_token", False)
    ZOOM_MEETINGS_GET_PAST_MEETING_PARTICIPANTS = (
        "zoom",
        "zoom_meetings_get_past_meeting_participants",
        False,
    )
    ZOOM_MEETINGS_GET_POLL = ("zoom", "zoom_meetings_get_poll", False)
    ZOOM_MEETINGS_GET_REGISTRANT_DETAILS = (
        "zoom",
        "zoom_meetings_get_registrant_details",
        False,
    )
    ZOOM_MEETINGS_GETS_IP_URI_WITH_PASS_CODE = (
        "zoom",
        "zoom_meetings_gets_ip_uri_with_pass_code",
        False,
    )
    ZOOM_MEETINGS_LIST_HOST_SCHEDULED = (
        "zoom",
        "zoom_meetings_list_host_scheduled",
        False,
    )
    ZOOM_MEETINGS_LIST_MEETING_POLLS = (
        "zoom",
        "zoom_meetings_list_meeting_polls",
        False,
    )
    ZOOM_MEETINGS_LIST_MEETING_SUMMARIES = (
        "zoom",
        "zoom_meetings_list_meeting_summaries",
        False,
    )
    ZOOM_MEETINGS_LIST_MEETING_TEMPLATES = (
        "zoom",
        "zoom_meetings_list_meeting_templates",
        False,
    )
    ZOOM_MEETINGS_LIST_PAST_MEETING_INSTANCES = (
        "zoom",
        "zoom_meetings_list_past_meeting_instances",
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
    ZOOM_MEETINGS_LIST_REGISTRANTS = ("zoom", "zoom_meetings_list_registrants", False)
    ZOOM_MEETINGS_LIST_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_meetings_list_registration_questions",
        False,
    )
    ZOOM_MEETINGS_LIST_UPCOMING_MEETINGS = (
        "zoom",
        "zoom_meetings_list_upcoming_meetings",
        False,
    )
    ZOOM_MEETINGS_LIVE_STREAM_STATUS_UPDATE = (
        "zoom",
        "zoom_meetings_live_stream_status_update",
        False,
    )
    ZOOM_MEETINGS_POLL_DELETE = ("zoom", "zoom_meetings_poll_delete", False)
    ZOOM_MEETINGS_REMOVE_MEETING = ("zoom", "zoom_meetings_remove_meeting", False)
    ZOOM_MEETINGS_UPDATE_DETAILS = ("zoom", "zoom_meetings_update_details", False)
    ZOOM_MEETINGS_UPDATE_LIVE_STREAM = (
        "zoom",
        "zoom_meetings_update_live_stream",
        False,
    )
    ZOOM_MEETINGS_UPDATE_MEETING_POLL = (
        "zoom",
        "zoom_meetings_update_meeting_poll",
        False,
    )
    ZOOM_MEETINGS_UPDATE_MEETING_STATUS = (
        "zoom",
        "zoom_meetings_update_meeting_status",
        False,
    )
    ZOOM_MEETINGS_UPDATE_MESSAGE = ("zoom", "zoom_meetings_update_message", False)
    ZOOM_MEETINGS_UPDATE_REGISTRANT_STATUS = (
        "zoom",
        "zoom_meetings_update_registrant_status",
        False,
    )
    ZOOM_MEETINGS_UPDATE_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_meetings_update_registration_questions",
        False,
    )
    ZOOM_MEETINGS_UPDATE_SURVEY = ("zoom", "zoom_meetings_update_survey", False)
    ZOOM_PAC_LIST_ACCOUNTS = ("zoom", "zoom_pac_list_accounts", False)
    ZOOM_REPORTS_GET_ACTIVE_INACTIVE_HOST_REPORTS = (
        "zoom",
        "zoom_reports_get_active_inactive_host_reports",
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
    ZOOM_REPORTS_GET_MEETING_REPORTS = (
        "zoom",
        "zoom_reports_get_meeting_reports",
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
    ZOOM_REPORTS_GET_WEB_IN_AR_DETAILS_REPORT = (
        "zoom",
        "zoom_reports_get_web_in_ar_details_report",
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
    ZOOM_REPORTS_LIST_SIGN_IN_SIGN_OUT_ACTIVITIES = (
        "zoom",
        "zoom_reports_list_sign_in_sign_out_activities",
        False,
    )
    ZOOM_REPORTS_LIST_UPCOMING_EVENTS_REPORT = (
        "zoom",
        "zoom_reports_list_upcoming_events_report",
        False,
    )
    ZOOM_REPORTS_WEB_IN_AR_PARTICIPANTS_LIST = (
        "zoom",
        "zoom_reports_web_in_ar_participants_list",
        False,
    )
    ZOOM_SIP_PHONE_DELETE_PHONE = ("zoom", "zoom_sip_phone_delete_phone", False)
    ZOOM_SIP_PHONE_ENABLE_USERS_IP_PHONE = (
        "zoom",
        "zoom_sip_phone_enable_users_ip_phone",
        False,
    )
    ZOOM_SIP_PHONE_LIST = ("zoom", "zoom_sip_phone_list", False)
    ZOOM_SIP_PHONE_UPDATE_SPECIFIC_PHONE = (
        "zoom",
        "zoom_sip_phone_update_specific_phone",
        False,
    )
    ZOOM_TRACKING_FIELD_CREATE_FIELD = (
        "zoom",
        "zoom_tracking_field_create_field",
        False,
    )
    ZOOM_TRACKING_FIELD_DELETE_FIELD = (
        "zoom",
        "zoom_tracking_field_delete_field",
        False,
    )
    ZOOM_TRACKING_FIELD_GET = ("zoom", "zoom_tracking_field_get", False)
    ZOOM_TRACKING_FIELD_LIST = ("zoom", "zoom_tracking_field_list", False)
    ZOOM_TRACKING_FIELD_UPDATE = ("zoom", "zoom_tracking_field_update", False)
    ZOOM_TSP_ADD_USE_RTSP_ACCOUNT = ("zoom", "zoom_tsp_add_use_rtsp_account", False)
    ZOOM_TSP_DELETE_USE_RTSP_ACCOUNT = (
        "zoom",
        "zoom_tsp_delete_use_rtsp_account",
        False,
    )
    ZOOM_TSP_GET_ACCOUNT_INFO = ("zoom", "zoom_tsp_get_account_info", False)
    ZOOM_TSP_GET_USE_RTSP_ACCOUNT = ("zoom", "zoom_tsp_get_use_rtsp_account", False)
    ZOOM_TSP_LIST_USE_RTSP_ACCOUNTS = ("zoom", "zoom_tsp_list_use_rtsp_accounts", False)
    ZOOM_TSP_SET_GLOBAL_DIAL_IN_URL = ("zoom", "zoom_tsp_set_global_dial_in_url", False)
    ZOOM_TSP_UPDATE_ACCOUNT_TSP_INFORMATION = (
        "zoom",
        "zoom_tsp_update_account_tsp_information",
        False,
    )
    ZOOM_TSP_UPDATE_USE_RTSP_ACCOUNT = (
        "zoom",
        "zoom_tsp_update_use_rtsp_account",
        False,
    )
    ZOOM_WEB_IN_ARS_ADD_PANELISTS = ("zoom", "zoom_web_in_ars_add_panelists", False)
    ZOOM_WEB_IN_ARS_ADD_REGISTRANT = ("zoom", "zoom_web_in_ars_add_registrant", False)
    ZOOM_WEB_IN_ARS_CREATE_BATCH_REGISTRANTS = (
        "zoom",
        "zoom_web_in_ars_create_batch_registrants",
        False,
    )
    ZOOM_WEB_IN_ARS_CREATE_BRANDING_NAME_TAG = (
        "zoom",
        "zoom_web_in_ars_create_branding_name_tag",
        False,
    )
    ZOOM_WEB_IN_ARS_CREATE_INVITE_LINKS = (
        "zoom",
        "zoom_web_in_ars_create_invite_links",
        False,
    )
    ZOOM_WEB_IN_ARS_CREATE_POLL = ("zoom", "zoom_web_in_ars_create_poll", False)
    ZOOM_WEB_IN_ARS_CREATE_WEB_IN_AR = (
        "zoom",
        "zoom_web_in_ars_create_web_in_ar",
        False,
    )
    ZOOM_WEB_IN_ARS_CREATE_WEB_IN_AR_TEMPLATE = (
        "zoom",
        "zoom_web_in_ars_create_web_in_ar_template",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_BRANDING_NAME_TAG = (
        "zoom",
        "zoom_web_in_ars_delete_branding_name_tag",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_BRANDING_VIRTUAL_BACKGROUND = (
        "zoom",
        "zoom_web_in_ars_delete_branding_virtual_background",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_BRANDING_WALLPAPER = (
        "zoom",
        "zoom_web_in_ars_delete_branding_wallpaper",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_MESSAGE_BY_ID = (
        "zoom",
        "zoom_web_in_ars_delete_message_by_id",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_POLL = ("zoom", "zoom_web_in_ars_delete_poll", False)
    ZOOM_WEB_IN_ARS_DELETE_REGISTRANT = (
        "zoom",
        "zoom_web_in_ars_delete_registrant",
        False,
    )
    ZOOM_WEB_IN_ARS_DELETE_SURVEY = ("zoom", "zoom_web_in_ars_delete_survey", False)
    ZOOM_WEB_IN_ARS_GET_DETAILS = ("zoom", "zoom_web_in_ars_get_details", False)
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
    ZOOM_WEB_IN_ARS_GET_MEETING_ARCHIVE_TOKEN_FOR_LOCAL_ARCHIVING = (
        "zoom",
        "zoom_web_in_ars_get_meeting_archive_token_for_local_archiving",
        False,
    )
    ZOOM_WEB_IN_ARS_GET_POLL_DETAILS = (
        "zoom",
        "zoom_web_in_ars_get_poll_details",
        False,
    )
    ZOOM_WEB_IN_ARS_GET_SESSION_BRANDING = (
        "zoom",
        "zoom_web_in_ars_get_session_branding",
        False,
    )
    ZOOM_WEB_IN_ARS_GET_SURVEY = ("zoom", "zoom_web_in_ars_get_survey", False)
    ZOOM_WEB_IN_ARS_GET_WEB_IN_ART_OKEN = (
        "zoom",
        "zoom_web_in_ars_get_web_in_art_oken",
        False,
    )
    ZOOM_WEB_IN_ARS_GETS_IP_URI_WITH_PASS_CODE = (
        "zoom",
        "zoom_web_in_ars_gets_ip_uri_with_pass_code",
        False,
    )
    ZOOM_WEB_IN_ARS_JOIN_TOKEN_LIVE_STREAMING = (
        "zoom",
        "zoom_web_in_ars_join_token_live_streaming",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_ABSENTEES = ("zoom", "zoom_web_in_ars_list_absentees", False)
    ZOOM_WEB_IN_ARS_LIST_PANELISTS = ("zoom", "zoom_web_in_ars_list_panelists", False)
    ZOOM_WEB_IN_ARS_LIST_PARTICIPANTS = (
        "zoom",
        "zoom_web_in_ars_list_participants",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_PAST_INSTANCES = (
        "zoom",
        "zoom_web_in_ars_list_past_instances",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_PAST_WEB_IN_AR_QA = (
        "zoom",
        "zoom_web_in_ars_list_past_web_in_ar_qa",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_POLL_RESULTS = (
        "zoom",
        "zoom_web_in_ars_list_poll_results",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_POLLS = ("zoom", "zoom_web_in_ars_list_polls", False)
    ZOOM_WEB_IN_ARS_LIST_REGISTRANTS = (
        "zoom",
        "zoom_web_in_ars_list_registrants",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_web_in_ars_list_registration_questions",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_TRACKING_SOURCES = (
        "zoom",
        "zoom_web_in_ars_list_tracking_sources",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_WEB_IN_AR_TEMPLATES = (
        "zoom",
        "zoom_web_in_ars_list_web_in_ar_templates",
        False,
    )
    ZOOM_WEB_IN_ARS_LIST_WEB_IN_ARS = ("zoom", "zoom_web_in_ars_list_web_in_ars", False)
    ZOOM_WEB_IN_ARS_REGISTRANT_DETAILS = (
        "zoom",
        "zoom_web_in_ars_registrant_details",
        False,
    )
    ZOOM_WEB_IN_ARS_REMOVE_PANELIST = ("zoom", "zoom_web_in_ars_remove_panelist", False)
    ZOOM_WEB_IN_ARS_REMOVE_PANELISTS = (
        "zoom",
        "zoom_web_in_ars_remove_panelists",
        False,
    )
    ZOOM_WEB_IN_ARS_REMOVE_WEB_IN_AR = (
        "zoom",
        "zoom_web_in_ars_remove_web_in_ar",
        False,
    )
    ZOOM_WEB_IN_ARS_SET_DEFAULT_BRANDING_VIRTUAL_BACKGROUND = (
        "zoom",
        "zoom_web_in_ars_set_default_branding_virtual_background",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_BRANDING_NAME_TAG = (
        "zoom",
        "zoom_web_in_ars_update_branding_name_tag",
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
    ZOOM_WEB_IN_ARS_UPDATE_POLL = ("zoom", "zoom_web_in_ars_update_poll", False)
    ZOOM_WEB_IN_ARS_UPDATE_REGISTRANT_STATUS = (
        "zoom",
        "zoom_web_in_ars_update_registrant_status",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_REGISTRATION_QUESTIONS = (
        "zoom",
        "zoom_web_in_ars_update_registration_questions",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_SCHEDULED_WEB_IN_AR = (
        "zoom",
        "zoom_web_in_ars_update_scheduled_web_in_ar",
        False,
    )
    ZOOM_WEB_IN_ARS_UPDATE_STATUS = ("zoom", "zoom_web_in_ars_update_status", False)
    ZOOM_WEB_IN_ARS_UPDATE_SURVEY = ("zoom", "zoom_web_in_ars_update_survey", False)
    ZOOM_WEB_IN_ARS_UPLOAD_BRANDING_VIRTUAL_BACKGROUND = (
        "zoom",
        "zoom_web_in_ars_upload_branding_virtual_background",
        False,
    )
    ZOOM_WEB_IN_ARS_UPLOAD_BRANDING_WALLPAPER = (
        "zoom",
        "zoom_web_in_ars_upload_branding_wallpaper",
        False,
    )
    MATHEMATICAL_CALCULATOR = ("mathematical", "mathematical_calculator", True, True)
    LOCALWORKSPACE_WORKSPACESTATUSACTION = (
        "localworkspace",
        "localworkspace_workspacestatusaction",
        True,
        True,
    )
    LOCALWORKSPACE_CREATEWORKSPACEACTION = (
        "localworkspace",
        "localworkspace_createworkspaceaction",
        True,
        True,
    )
    CMDMANAGERTOOL_FINDFILECMD = (
        "cmdmanagertool",
        "cmdmanagertool_findfilecmd",
        True,
        True,
    )
    CMDMANAGERTOOL_CREATEFILECMD = (
        "cmdmanagertool",
        "cmdmanagertool_createfilecmd",
        True,
        True,
    )
    CMDMANAGERTOOL_GOTOLINENUMINOPENFILE = (
        "cmdmanagertool",
        "cmdmanagertool_gotolinenuminopenfile",
        True,
        True,
    )
    CMDMANAGERTOOL_OPENFILE = ("cmdmanagertool", "cmdmanagertool_openfile", True, True)
    CMDMANAGERTOOL_SCROLL = ("cmdmanagertool", "cmdmanagertool_scroll", True, True)
    CMDMANAGERTOOL_SEARCHFILECMD = (
        "cmdmanagertool",
        "cmdmanagertool_searchfilecmd",
        True,
        True,
    )
    CMDMANAGERTOOL_SEARCHDIRCMD = (
        "cmdmanagertool",
        "cmdmanagertool_searchdircmd",
        True,
        True,
    )
    CMDMANAGERTOOL_EDITFILE = ("cmdmanagertool", "cmdmanagertool_editfile", True, True)
    CMDMANAGERTOOL_RUNCOMMANDONWORKSPACE = (
        "cmdmanagertool",
        "cmdmanagertool_runcommandonworkspace",
        True,
        True,
    )
    CMDMANAGERTOOL_GETCURRENTDIRCMD = (
        "cmdmanagertool",
        "cmdmanagertool_getcurrentdircmd",
        True,
        True,
    )
    CMDMANAGERTOOL_GITHUBCLONECMD = (
        "cmdmanagertool",
        "cmdmanagertool_githubclonecmd",
        True,
        True,
    )
    CMDMANAGERTOOL_BLACKLINTER = (
        "cmdmanagertool",
        "cmdmanagertool_blacklinter",
        True,
        True,
    )
    CMDMANAGERTOOL_ISORTLINTER = (
        "cmdmanagertool",
        "cmdmanagertool_isortlinter",
        True,
        True,
    )
    CMDMANAGERTOOL_FLAKE8LINTER = (
        "cmdmanagertool",
        "cmdmanagertool_flake8linter",
        True,
        True,
    )
    CMDMANAGERTOOL_PYLINTLINTER = (
        "cmdmanagertool",
        "cmdmanagertool_pylintlinter",
        True,
        True,
    )
    CMDMANAGERTOOL_AUTOFLAKELINTER = (
        "cmdmanagertool",
        "cmdmanagertool_autoflakelinter",
        True,
        True,
    )
    CMDMANAGERTOOL_AUTOPEP8LINTER = (
        "cmdmanagertool",
        "cmdmanagertool_autopep8linter",
        True,
        True,
    )
    CMDMANAGERTOOL_GITREPOTREE = (
        "cmdmanagertool",
        "cmdmanagertool_gitrepotree",
        True,
        True,
    )
    CMDMANAGERTOOL_GETPATCHCMD = (
        "cmdmanagertool",
        "cmdmanagertool_getpatchcmd",
        True,
        True,
    )
    HISTORYKEEPER_GETWORKSPACEHISTORY = (
        "historykeeper",
        "historykeeper_getworkspacehistory",
        True,
        True,
    )
    RAGTOOL_RAGTOOLQUERY = ("ragtool", "ragtool_ragtoolquery", True, True)
    RAGTOOL_ADDCONTENTTORAGTOOL = ("ragtool", "ragtool_addcontenttoragtool", True, True)
    WEBTOOL_SCRAPEWEBSITECONTENT = (
        "webtool",
        "webtool_scrapewebsitecontent",
        True,
        True,
    )
    WEBTOOL_SCRAPEWEBSITEELEMENT = (
        "webtool",
        "webtool_scrapewebsiteelement",
        True,
        True,
    )
    GREPTILE_CODEQUERY = ("greptile", "greptile_codequery", True, True)
    SUBMITPATCHTOOL_SUBMITPATCH = (
        "submitpatchtool",
        "submitpatchtool_submitpatch",
        True,
        True,
    )
    SQLTOOL_SQLQUERY = ("sqltool", "sqltool_sqlquery", True, True)
    FILETOOL_READFILE = ("filetool", "filetool_readfile", True, True)
    FILETOOL_WRITEFILE = ("filetool", "filetool_writefile", True, True)


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

    GITHUB_COMMIT_EVENT = ("github", "github_commit_event")
    GITHUB_ISSUE_ADDED_EVENT = ("github", "github_issue_added_event")
    GITHUB_LABEL_ADDED_EVENT = ("github", "github_label_added_event")
    GITHUB_PULL_REQUEST_EVENT = ("github", "github_pull_request_event")
    GITHUB_STAR_ADDED_EVENT = ("github", "github_star_added_event")
    GMAIL_NEW_GMAIL_MESSAGE = ("gmail", "gmail_new_gmail_message")
    GOOGLEDRIVE_GOOGLE_DRIVE_CHANGES = (
        "googledrive",
        "googledrive_google_drive_changes",
    )
    NOTION_NEW_PAGE = ("notion", "notion_page_added_to_database")
    SLACK_NEW_CHANNEL_CREATED = ("slack", "slack_channel_created")
    SLACK_REACTION_ADDED = ("slack", "slack_reaction_added")
    SLACK_REACTION_REMOVED = ("slack", "slack_reaction_removed")
    SLACK_NEW_MESSAGE = ("slack", "slack_receive_message")
    SLACK_THREAD_REPLY = ("slack", "slack_receive_thread_reply")
    SLACKBOT_NEW_CHANNEL_CREATED = ("slackbot", "slackbot_channel_created")
    SLACKBOT_REACTION_ADDED = ("slackbot", "slackbot_reaction_added")
    SLACKBOT_REACTION_REMOVED = ("slackbot", "slackbot_reaction_removed")
    SLACKBOT_NEW_MESSAGE = ("slackbot", "slackbot_receive_message")
    SLACKBOT_THREAD_REPLY = ("slackbot", "slackbot_receive_thread_reply")
    SPOTIFY_NEW_DEVICE_ADDED = ("spotify", "spotify_new_device_trigger")
    SPOTIFY_NEW_SONG_ADDED_TO_PLAYLIST = ("spotify", "spotify_playlist_item_trigger")
    SPOTIFY_NEW_PLAYLIST_CREATED_OR_DELETED = ("spotify", "spotify_playlist_trigger")
    YOUTUBE_NEW_YOUTUBE_ACTIVITY = ("youtube", "youtube_new_activity_trigger")
    YOUTUBE_NEW_ITEM_IN_YOUTUBE_PLAYLIST = (
        "youtube",
        "youtube_new_item_in_playlist_trigger",
    )
    YOUTUBE_NEW_PLAYLIST_IN_YOUTUBE_CHANNEL = (
        "youtube",
        "youtube_new_playlist_trigger",
    )
    YOUTUBE_NEW_YOUTUBE_CHANNEL_SUBSCRIPTION = (
        "youtube",
        "youtube_new_subscription_trigger",
    )
