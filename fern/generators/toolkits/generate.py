from composio import Composio

composio = Composio()

for toolkit in composio.toolkits.list().items:
    toolkit_data = composio.toolkits.get(slug=toolkit.slug)
    for auth_config in toolkit_data.auth_config_details:
        print(auth_config.model_dump_json(indent=2))
        break
    break

exit()

_ = ToolkitRetrieveResponse(
    deprecated=Deprecated(
        raw_proxy_info_by_auth_schemes=[
            {
                "auth_method": "OAUTH2",
                "proxy": {"base_url": "https://www.googleapis.com"},
                "token_url": "https://oauth2.googleapis.com/token",
                "token_params": {"grant_type": "authorization_code"},
                "disable_pkce": False,
                "authorization_params": {
                    "access_type": "offline",
                    "prompt": "consent",
                    "response_type": "code",
                },
            },
            {"auth_method": "BEARER_TOKEN", "proxy": {"base_url": "https://www.googleapis.com"}},
        ],
        toolkit_id="a90e7d79-4f7a-4ff2-bd7d-19c78640b8f8",
        get_current_user_endpoint="https://www.googleapis.com/gmail/v1/users/me/profile",
        toolkitId="a90e7d79-4f7a-4ff2-bd7d-19c78640b8f8",
        getCurrentUserEndpoint="https://www.googleapis.com/gmail/v1/users/me/profile",
        rawProxyInfoByAuthSchemes=[
            {
                "auth_method": "OAUTH2",
                "proxy": {"base_url": "https://www.googleapis.com"},
                "token_url": "https://oauth2.googleapis.com/token",
                "token_params": {"grant_type": "authorization_code"},
                "disable_pkce": False,
                "authorization_params": {
                    "access_type": "offline",
                    "prompt": "consent",
                    "response_type": "code",
                },
            },
            {"auth_method": "BEARER_TOKEN", "proxy": {"base_url": "https://www.googleapis.com"}},
        ],
    ),
    enabled=True,
    is_local_toolkit=False,
    meta=Meta(
        categories=[
            MetaCategory(name="Collaboration & Communication", slug="collaboration-&-communication")
        ],
        created_at="Fri May 03 2024",
        description="Gmail is Google’s email service, featuring spam protection, search functions, and seamless integration with other G Suite apps for productivity",
        logo="https://cdn.jsdelivr.net/gh/ComposioHQ/open-logos@master/gmail.svg",
        tools_count=23.0,
        triggers_count=1.0,
        updated_at="Thu Jul 31 2025",
        app_url="https://mail.google.com",
    ),
    name="Gmail",
    slug="gmail",
    auth_config_details=[
        AuthConfigDetail(
            fields=AuthConfigDetailFields(
                auth_config_creation=AuthConfigDetailFieldsAuthConfigCreation(
                    optional=[
                        AuthConfigDetailFieldsAuthConfigCreationOptional(
                            description="Add this Redirect URL to your app's OAuth allow list.",
                            display_name="Redirect URI",
                            name="oauth_redirect_uri",
                            required=False,
                            type="string",
                            default="https://backend.composio.dev/api/v1/auth-apps/add",
                            legacy_template_name=None,
                        ),
                        AuthConfigDetailFieldsAuthConfigCreationOptional(
                            description="Scopes to request from the user, comma separated",
                            display_name="Scopes",
                            name="scopes",
                            required=False,
                            type="string",
                            default="https://www.googleapis.com/auth/gmail.modify,https://www.googleapis.com/auth/userinfo.profile,https://www.googleapis.com/auth/userinfo.email,https://www.googleapis.com/auth/contacts.readonly,https://www.googleapis.com/auth/contacts.other.readonly,https://www.googleapis.com/auth/profile.language.read,https://www.googleapis.com/auth/user.addresses.read,https://www.googleapis.com/auth/user.birthday.read,https://www.googleapis.com/auth/user.emails.read,https://www.googleapis.com/auth/user.phonenumbers.read,https://www.googleapis.com/auth/profile.emails.read",
                            legacy_template_name=None,
                        ),
                        AuthConfigDetailFieldsAuthConfigCreationOptional(
                            description="Access token injected automatically after OAuth2 authentication flow.",
                            display_name="Access Token",
                            name="bearer_token",
                            required=False,
                            type="string",
                            default=None,
                            legacy_template_name="access_token",
                        ),
                    ],
                    required=[
                        AuthConfigDetailFieldsAuthConfigCreationRequired(
                            description="Client id of the app",
                            display_name="Client id",
                            name="client_id",
                            required=True,
                            type="string",
                            default=None,
                            legacy_template_name=None,
                        ),
                        AuthConfigDetailFieldsAuthConfigCreationRequired(
                            description="Client secret of the app",
                            display_name="Client secret",
                            name="client_secret",
                            required=True,
                            type="string",
                            default=None,
                            legacy_template_name=None,
                        ),
                    ],
                ),
                connected_account_initiation=AuthConfigDetailFieldsConnectedAccountInitiation(
                    optional=[], required=[]
                ),
            ),
            mode="OAUTH2",
            name="gmail_oauth",
            proxy=None,
            deprecated_auth_provider_details={
                "token_url": "https://oauth2.googleapis.com/token",
                "authorization_url": "https://accounts.google.com/o/oauth2/v2/auth",
            },
        ),
        AuthConfigDetail(
            fields=AuthConfigDetailFields(
                auth_config_creation=AuthConfigDetailFieldsAuthConfigCreation(
                    optional=[], required=[]
                ),
                connected_account_initiation=AuthConfigDetailFieldsConnectedAccountInitiation(
                    optional=[],
                    required=[
                        AuthConfigDetailFieldsConnectedAccountInitiationRequired(
                            description="Token for bearer token auth",
                            display_name="Token",
                            name="token",
                            required=True,
                            type="string",
                            default=None,
                            legacy_template_name=None,
                        )
                    ],
                ),
            ),
            mode="BEARER_TOKEN",
            name="gmail_bearer",
            proxy=None,
        ),
    ],
    base_url="https://www.googleapis.com",
    composio_managed_auth_schemes=["OAUTH2"],
    get_current_user_endpoint="https://www.googleapis.com/gmail/v1/users/me/profile",
)
