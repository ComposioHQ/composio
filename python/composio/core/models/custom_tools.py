"""Custom Tools module"""

import functools
import inspect
import typing as t

from pydantic import BaseModel

from composio.client import HttpClient, NotGiven
from composio.client.types import (
    Tool,
    tool_list_response,
    tool_proxy_params,
    tool_proxy_response,
)
from composio.exceptions import (
    NotFoundError,
)


class ExecuteRequestFn(t.Protocol):
    def __call__(
        self,
        endpoint: str,
        method: t.Literal["GET", "POST", "PUT", "DELETE", "PATCH"],
        body: t.Dict | NotGiven = HttpClient.not_given,
        connected_account_id: str | NotGiven = HttpClient.not_given,
        parameters: t.Iterable[tool_proxy_params.Parameter]
        | NotGiven = HttpClient.not_given,
    ) -> tool_proxy_response.ToolProxyResponse: ...


class CustomToolProtocol(t.Protocol):
    def __call__(self, request: t.Any) -> t.Any: ...


class CustomToolWithProxyProtocol(t.Protocol):
    def __call__(
        self,
        request: t.Any,
        execute_request: ExecuteRequestFn,
        auth_credentials: t.Dict,
    ) -> t.Any: ...


CustomToolFn = t.Union[
    CustomToolProtocol,
    CustomToolWithProxyProtocol,
]


class CustomTool:
    request_model: t.Type[BaseModel]

    def __init__(
        self,
        f: t.Callable[..., t.Any],
        client: HttpClient,
        toolkit: t.Optional[str] = None,
    ):
        """
        Initialize the custom tool.

        :param f: The function to wrap.
        :param client: The client to use for the custom tool.
        :param toolkit: The toolkit to use for the custom tool.
        """
        self.f = t.cast(CustomToolFn, f)
        self.name, self.slug = f.__name__, f.__name__.upper()
        self.description = t.cast(str, f.__doc__)
        self.toolkit = toolkit
        self.client = client
        self.info = self.__parse_info()
        if self.toolkit is not None:
            self.name = f"{self.toolkit.lower()}_{self.name}"
            self.slug = f"{self.toolkit.upper()}_{self.slug}"

    def __parse_info(self) -> Tool:
        """Parse the parameters of the custom tool."""
        if self.description is None:
            raise ValueError(f"Description is required on tool {self.name}")

        self.request_model = inspect.signature(self.f).parameters["request"].annotation
        return Tool(
            name=self.name,
            description=self.description,
            input_parameters=self.request_model.model_json_schema(),
            output_parameters={},
            available_versions=[],
            version="1.0.0",
            scopes=[],
            slug=self.slug,
            toolkit=tool_list_response.ItemToolkit(
                logo="",
                name=self.toolkit or "custom",
                slug=(self.toolkit or "custom").upper(),
            ),
            deprecated=tool_list_response.ItemDeprecated(
                available_versions=[],
                displayName=self.name,
                version="1.0.0",
                toolkit=tool_list_response.ItemDeprecatedToolkit(logo=str()),
                is_deprecated=False,
            ),
            no_auth=False,
            tags=[],
        )

    def __get_auth_credentials(self, user_id: str) -> dict:
        """Get the auth config for the custom tool."""
        if self.toolkit is None:
            raise ValueError("Toolkit is required for custom tools")

        connected_accounts = self.client.connected_accounts.list(
            toolkit_slugs=[self.toolkit],
            user_ids=[user_id],
        )

        if len(connected_accounts.items) == 0:
            raise ValueError(
                f"No connected accounts found for toolkit {self.toolkit} and user {user_id}"
            )

        account, *_ = sorted(
            connected_accounts.items,
            key=lambda x: x.created_at,
            reverse=True,
        )
        return account.state.val.model_dump()

    def __call__(self, **kwargs: t.Any) -> t.Any:
        """Call the custom tool."""
        user_id = kwargs.pop("user_id", "default")
        request = self.request_model.model_validate(kwargs)
        if self.toolkit is None:
            return t.cast(CustomToolProtocol, self.f)(request=request)

        return t.cast(CustomToolWithProxyProtocol, self.f)(
            request=request,
            execute_request=t.cast(ExecuteRequestFn, self.client.tools.proxy),
            auth_credentials=self.__get_auth_credentials(user_id),
        )


class CustomTools:
    """CustomTools class

    Used to manage custom tools created by users."""

    def __init__(self, client: HttpClient):
        self.client = client
        self.custom_tools_registry: dict[str, CustomTool] = {}

    def __getitem__(self, slug: str) -> CustomTool:
        """Get a custom tool by its slug."""
        return self.custom_tools_registry[slug]

    def get(self, slug: str) -> t.Optional[CustomTool]:
        """Get a custom tool by its slug."""
        try:
            return self.custom_tools_registry[slug]
        except KeyError:
            return None

    @t.overload
    def register(self, f: CustomToolProtocol) -> CustomTool: ...

    @t.overload
    def register(
        self, *, toolkit: t.Optional[str] = None
    ) -> t.Callable[[CustomToolWithProxyProtocol], CustomTool]: ...

    def register(
        self,
        f: t.Optional[CustomToolProtocol] = None,
        *,
        toolkit: t.Optional[str] = None,
    ) -> t.Union[
        CustomTool,
        t.Callable[[CustomToolProtocol], CustomTool],
        t.Callable[[CustomToolWithProxyProtocol], CustomTool],
    ]:
        """Register a custom tool."""
        if f is not None:
            return self._wrap_tool(f, toolkit)
        return functools.partial(self._wrap_tool, toolkit=toolkit)

    def _wrap_tool(
        self,
        f: CustomToolFn,
        toolkit: t.Optional[str] = None,
    ) -> CustomTool:
        """Wrap a tool function."""
        tool = CustomTool(f=f, client=self.client, toolkit=toolkit)
        self.custom_tools_registry[tool.slug] = tool
        return tool

    def execute(self, slug: str, request: t.Dict) -> t.Dict:
        """Execute a custom tool."""
        custom_tool = self.get(slug)
        if custom_tool is None:
            raise NotFoundError(f"Custom tool with slug {slug} not found")
        return custom_tool(**request)
