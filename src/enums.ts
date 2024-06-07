import { Enumify } from "enumify";

export class Tag extends Enumify {
    static IMPORTANT = new Tag("default", "important");
    static GITHUB_BILLING = new Tag("github", "billing");
    static GITHUB_CODESPACES = new Tag("github", "codespaces");
    static GITHUB_PROJECTS = new Tag("github", "projects");
    static GITHUB_SECURITY_ADVISORIES = new Tag("github", "security-advisories");
    static GITHUB_MIGRATIONS = new Tag("github", "migrations");
    static GITHUB_APPS = new Tag("github", "apps");
    static GITHUB_DEPENDABOT = new Tag("github", "dependabot");
    static GITHUB_EMOJIS = new Tag("github", "emojis");
    static GITHUB_LICENSES = new Tag("github", "licenses");
    static GITHUB_DEPENDENCY_GRAPH = new Tag("github", "dependency-graph");
    static GITHUB_TEAMS = new Tag("github", "teams");
    static GITHUB_IMPORTANT = new Tag("github", "important");
    static GITHUB_PULLS = new Tag("github", "pulls");
    static GITHUB_ISSUES = new Tag("github", "issues");
    static GITHUB_ACTIONS = new Tag("github", "actions");
    static GITHUB_CODES_OF_CONDUCT = new Tag("github", "codes-of-conduct");
    static GITHUB_USERS = new Tag("github", "users");
    static GITHUB_SECRET_SCANNING = new Tag("github", "secret-scanning");
    static GITHUB_META = new Tag("github", "meta");
    static GITHUB_REACTIONS = new Tag("github", "reactions");
    static GITHUB_GITIGNORE = new Tag("github", "gitignore");
    static GITHUB_MARKDOWN = new Tag("github", "markdown");
    static GITHUB_RATE_LIMIT = new Tag("github", "rate-limit");
    static GITHUB_COPILOT = new Tag("github", "copilot");
    static GITHUB_OIDC = new Tag("github", "oidc");
    static GITHUB_INTERACTIONS = new Tag("github", "interactions");
    static GITHUB_ACTIVITY = new Tag("github", "activity");
    static GITHUB_CLASSROOM = new Tag("github", "classroom");
    static GITHUB_PACKAGES = new Tag("github", "packages");
    static GITHUB_ORGS = new Tag("github", "orgs");
    static GITHUB_GIT = new Tag("github", "git");
    static GITHUB_CODE = new Tag("github", "code");
    static GITHUB_SEARCH = new Tag("github", "search");
    static GITHUB_CODE_SCANNING = new Tag("github", "code-scanning");
    static GITHUB_CHECKS = new Tag("github", "checks");
    static GITHUB_GISTS = new Tag("github", "gists");
    static GITHUB_REPOS = new Tag("github", "repos");

    constructor(public app: string, public name: string) {
        super();
    }
}
Tag.closeEnum();

export class App extends Enumify {
    static GITHUB = new App("github");

    constructor(public value: string) {
        super();
    }

    get is_local(): boolean {
        return ["mathematical", "localworkspace", "cmdmanagertool", "historykeeper", "ragtool", "webtool", "greptile"].includes(this.value.toLowerCase());
    }
}

App.closeEnum();

export class Action extends Enumify {
    static GITHUB_ACTIVITY_LIST_PUBLIC_EVENTS_FOR_REPO_NETWORK = new Action("github", "github_activity_list_public_events_for_repo_network", false);
    static GITHUB_ACTIVITY_LIST_NOTIFICATIONS_FOR_AUTHENTICATED_USER = new Action("github", "github_activity_list_notifications_for_authenticated_user", false);
    static GITHUB_ACTIVITY_MARK_NOTIFICATIONS_AS_READ = new Action("github", "github_activity_mark_notifications_as_read", false);
    static GITHUB_ACTIVITY_GET_THREAD = new Action("github", "github_activity_get_thread", false);
    static GITHUB_ACTIVITY_MARK_THREAD_AS_READ = new Action("github", "github_activity_mark_thread_as_read", false);
    static GITHUB_ACTIVITY_MARK_THREAD_AS_DONE = new Action("github", "github_activity_mark_thread_as_done", false);
    static GITHUB_ACTIVITY_GET_THREAD_SUBSCRIPTION_FOR_AUTHENTICATED_USER = new Action("github", "github_activity_get_thread_subscription_for_authenticated_user", false);
    static GITHUB_ACTIVITY_SET_THREAD_SUBSCRIPTION = new Action("github", "github_activity_set_thread_subscription", false);
    static GITHUB_ACTIVITY_DELETE_THREAD_SUBSCRIPTION = new Action("github", "github_activity_delete_thread_subscription", false);
    static GITHUB_META_GET_OCTO_CAT = new Action("github", "github_meta_get_octo_cat", false);
    static GITHUB_ORG_S_LIST = new Action("github", "github_org_s_list", false);
    static GITHUB_ORG_S_GET = new Action("github", "github_org_s_get", false);
    static GITHUB_ORG_S_UPDATE = new Action("github", "github_org_s_update", false);
    static GITHUB_ORG_S_DELETE = new Action("github", "github_org_s_delete", false);
    static GITHUB_ACTIONS_GET_ACTIONS_CACHE_USAGE_FOR_ORG = new Action("github", "github_actions_get_actions_cache_usage_for_org", false);
    static GITHUB_ACTIONS_GET_ACTIONS_CACHE_USAGE_BY_REPO_FOR_ORG = new Action("github", "github_actions_get_actions_cache_usage_by_repo_for_org", false);
    static GITHUB_GET_REPOS = new Action("github", "github_get_repos", false);
    static GITHUB_REPO_S_LIST_FOR_AUTHENTICATED_USER = new Action("github", "github_repo_s_list_for_authenticated_user", false);
    static GITHUB_USERS_GET_AUTHENTICATED = new Action("github", "github_users_get_authenticated", false);
    constructor(public app: string, public action: string, public no_auth: boolean, public is_local: boolean = false) {
        super();
    }

    static from_app(name: string): Action {
        for (const action of Object.values(Action)) {
            if (name === action.app) {
                return action;
            }
        }
        throw new Error(`No action type found for name \`${name}\``);
    }

    static from_action(name: string): Action {
        for (const action of Object.values(Action)) {
            if (name === action.action) {
                return action;
            }
        }
        throw new Error(`No action type found for name \`${name}\``);
    }

    static from_app_and_action(app: string, name: string): Action {
        for (const action of Object.values(Action)) {
            if (app === action.app && name === action.action) {
                return action;
            }
        }
        throw new Error(`No action type found for app \`${app}\` and action \`${name}\``);
    }
}

Action.closeEnum();

export class Trigger extends Enumify {
    static GITHUB_COMMIT_EVENT = new Trigger("github", "github_commit_event");

    constructor(public app: string, public event: string) {
        super();
    }
}

Trigger.closeEnum();

