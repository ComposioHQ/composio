"""
Dual-backend compatibility layer for the generated ``composio_client`` package.

The SDK supports two generations of its generated API client:

- v1: the Stainless ``composio-client`` 1.x line — per-field keyword-argument
  methods, ``NOT_GIVEN``/``omit`` sentinels, ``extra_headers``/``timeout``
  kwargs, TypedDict params under ``composio_client.types``.
- v2: the self-managed ``composio_client`` 2.x line — positional path
  parameters, a single ``body``/``query`` mapping, ``RequestOptions``,
  pydantic models under ``composio_client._generated.pydantic_gen`` (several
  responses are pydantic ``RootModel`` whose payload lives under ``.root``).

The SDK itself is written against ONE internal convention — the v2 one:

    method(*path_args, body_dict, query=..., headers=..., request_options=...)

:class:`ResourceProxy` translates that convention onto whichever client
generation is installed. Under v2 calls pass through nearly verbatim (with
``RootModel`` results unwrapped to ``.root``); under v1 the body/query mappings
are splatted back into Stainless keyword arguments.
"""

from __future__ import annotations

import typing as t
from collections.abc import Mapping
from importlib.metadata import PackageNotFoundError, version


class _Omit:
    """Sentinel for "do not send this field" — replaces ``composio_client.omit``.

    Falsy and unique; stripped out of body/query mappings before dispatch to
    either backend.
    """

    _instance: t.Optional["_Omit"] = None

    def __new__(cls) -> "_Omit":
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __bool__(self) -> bool:
        return False

    def __repr__(self) -> str:
        return "OMIT"

    def __copy__(self) -> "_Omit":
        return self

    def __deepcopy__(self, memo: t.Dict[int, t.Any]) -> "_Omit":
        return self


OMIT = _Omit()

OmitType = _Omit


def _detect_v2() -> bool:
    """True when the installed ``composio_client`` is the self-managed 2.x line."""
    try:
        major = int(version("composio-client").split(".")[0])
        return major >= 2
    except (PackageNotFoundError, ValueError, IndexError):
        # Fall back to feature sniffing: the Stainless 1.x line exports
        # NOT_GIVEN; the 2.x line does not.
        import composio_client

        return not hasattr(composio_client, "NOT_GIVEN")


IS_V2: t.Final[bool] = _detect_v2()

if IS_V2:
    # The v2 client parses typed raw-verb responses via
    # ``cast_to.model_validate``: any plain pydantic model works.
    import pydantic as _client_base_model_source
else:
    # The Stainless response machinery constructs its own BaseModel subclasses.
    import composio_client as _client_base_model_source  # type: ignore[no-redef]

ClientBaseModel = _client_base_model_source.BaseModel


def _strip_omitted(
    payload: t.Optional[Mapping[str, t.Any]],
) -> t.Optional[t.Dict[str, t.Any]]:
    """Drop OMIT-valued keys from a body/query mapping (top level only)."""
    if payload is None:
        return None
    return {k: v for k, v in payload.items() if not isinstance(v, _Omit)}


class _RequestOptionsData(t.NamedTuple):
    headers: t.Optional[t.Dict[str, t.Any]]
    timeout: t.Optional[t.Any]
    max_retries: t.Optional[int]


def _read_request_options(request_options: t.Any) -> _RequestOptionsData:
    """Normalize a mapping or ``composio_client.RequestOptions`` into fields."""
    if request_options is None:
        return _RequestOptionsData(None, None, None)
    if isinstance(request_options, Mapping):
        headers = request_options.get("headers")
        return _RequestOptionsData(
            dict(headers) if headers else None,
            request_options.get("timeout"),
            request_options.get("max_retries"),
        )
    # composio_client.RequestOptions (v2) or any object with the same fields.
    headers = getattr(request_options, "headers", None)
    return _RequestOptionsData(
        dict(headers) if headers else None,
        getattr(request_options, "timeout", None),
        getattr(request_options, "max_retries", None),
    )


# ---------------------------------------------------------------------------
# v1 special cases: Stainless methods whose signatures do not follow the
# "leading positional path params + field kwargs" shape the generic dispatch
# assumes. Keyed by the dotted accessor path from the client root.
# ---------------------------------------------------------------------------


def _v1_files_call(
    path_args: t.Tuple[str, ...], kwargs: t.Dict[str, t.Any]
) -> t.Tuple[t.Tuple[str, ...], t.Dict[str, t.Any]]:
    # v2: (session_id, mount_id, ...)  ->  v1: (mount_id, *, session_id=...)
    session_id, mount_id = path_args
    return (mount_id,), {"session_id": session_id, **kwargs}


def _v1_auth_config_update_status_call(
    path_args: t.Tuple[str, ...], kwargs: t.Dict[str, t.Any]
) -> t.Tuple[t.Tuple[str, ...], t.Dict[str, t.Any]]:
    # v2: (nanoid, status)  ->  v1: (status, *, nanoid=...)
    nanoid, status = path_args
    return (status,), {"nanoid": nanoid, **kwargs}


_V1_LIST_ACTIVE_RENAMES = {
    "trigger_ids": "query_trigger_ids_1",
    "trigger_names": "query_trigger_names_1",
    "auth_config_ids": "query_auth_config_ids_1",
    "connected_account_ids": "query_connected_account_ids_1",
    "show_disabled": "query_show_disabled_1",
}

_V1_UPSERT_RENAMES = {
    "trigger_config": "body_trigger_config_1",
}


def _rename_kwargs(
    renames: t.Mapping[str, str],
) -> t.Callable[
    [t.Tuple[str, ...], t.Dict[str, t.Any]],
    t.Tuple[t.Tuple[str, ...], t.Dict[str, t.Any]],
]:
    def _call(
        path_args: t.Tuple[str, ...], kwargs: t.Dict[str, t.Any]
    ) -> t.Tuple[t.Tuple[str, ...], t.Dict[str, t.Any]]:
        return path_args, {renames.get(k, k): v for k, v in kwargs.items()}

    return _call


_V1_SPECIAL_CALLS: t.Dict[
    str,
    t.Callable[
        [t.Tuple[str, ...], t.Dict[str, t.Any]],
        t.Tuple[t.Tuple[str, ...], t.Dict[str, t.Any]],
    ],
] = {
    "tool_router.session.files.list": _v1_files_call,
    "tool_router.session.files.delete": _v1_files_call,
    "tool_router.session.files.create_download_url": _v1_files_call,
    "tool_router.session.files.create_upload_url": _v1_files_call,
    "auth_configs.update_status": _v1_auth_config_update_status_call,
    "trigger_instances.list_active": _rename_kwargs(_V1_LIST_ACTIVE_RENAMES),
    "trigger_instances.upsert": _rename_kwargs(_V1_UPSERT_RENAMES),
}

# Per-source key renames applied BEFORE body/query are merged into Stainless
# kwargs, for v1 methods that expose the same wire name in both locations
# with disambiguated keyword names.
_V1_BODY_KEY_RENAMES: t.Dict[str, t.Mapping[str, str]] = {
    "connected_accounts.refresh": {"redirect_url": "body_redirect_url"},
}
_V1_QUERY_KEY_RENAMES: t.Dict[str, t.Mapping[str, str]] = {
    "connected_accounts.refresh": {"redirect_url": "query_redirect_url"},
}

# Attributes resolved directly on the underlying v1 resource instead of being
# proxied (Stainless-only surfaces with their own calling conventions).
_PASSTHROUGH_ATTRS = frozenset({"with_raw_response", "with_streaming_response"})


class ResourceProxy:
    """Proxy over a generated-client resource (or method) accessor path.

    Attribute access extends the path; calling dispatches the accumulated path
    as a method on the backend client, translating the SDK-internal (v2-style)
    call convention onto whichever backend generation is installed.
    """

    __slots__ = ("_client", "_path")

    def __init__(self, client: t.Any, path: t.Tuple[str, ...]) -> None:
        self._client = client
        self._path = path

    def __getattr__(self, name: str) -> t.Any:
        if name.startswith("_"):
            raise AttributeError(name)
        if name in _PASSTHROUGH_ATTRS:
            # Resolve on the real backend resource; raises AttributeError on
            # backends (v2) that do not provide the surface.
            return getattr(self._resolve_resource(), name)
        return ResourceProxy(self._client, self._path + (name,))

    def __repr__(self) -> str:
        return f"ResourceProxy({'.'.join(self._path)})"

    def _resolve_resource(self, client: t.Optional[t.Any] = None) -> t.Any:
        target = client if client is not None else self._client
        for name in self._path:
            target = getattr(target, name)
        return target

    def __call__(
        self,
        *args: t.Any,
        query: t.Optional[Mapping[str, t.Any]] = None,
        headers: t.Optional[Mapping[str, t.Any]] = None,
        request_options: t.Any = None,
    ) -> t.Any:
        body: t.Optional[Mapping[str, t.Any]]
        if args and isinstance(args[-1], Mapping):
            path_args = t.cast(t.Tuple[str, ...], args[:-1])
            body = args[-1]
        else:
            path_args = t.cast(t.Tuple[str, ...], args)
            body = None

        if IS_V2:
            return self._call_v2(path_args, body, query, headers, request_options)
        return self._call_v1(path_args, body, query, headers, request_options)

    # -- v2 backend ---------------------------------------------------------

    def _call_v2(
        self,
        path_args: t.Tuple[str, ...],
        body: t.Optional[Mapping[str, t.Any]],
        query: t.Optional[Mapping[str, t.Any]],
        headers: t.Optional[Mapping[str, t.Any]],
        request_options: t.Any,
    ) -> t.Any:
        # Typed as Any: static checkers resolve ``composio_client`` against the
        # v1 package, whose ``RequestOptions`` is an unrelated TypedDict.
        from composio_client import (  # type: ignore[attr-defined]
            RequestOptions as _request_options_cls,
        )

        request_options_cls: t.Any = _request_options_cls

        options = _read_request_options(request_options)
        merged_headers: t.Optional[t.Dict[str, t.Any]] = None
        if headers or options.headers:
            merged_headers = {
                **(dict(headers) if headers else {}),
                **(options.headers or {}),
            }

        request_opts = None
        if (
            merged_headers
            or options.timeout is not None
            or options.max_retries is not None
        ):
            request_opts = request_options_cls(
                headers=merged_headers,
                timeout=options.timeout,
                max_retries=options.max_retries,
            )

        method = self._resolve_resource()
        call_args: t.Tuple[t.Any, ...] = path_args
        clean_body = _strip_omitted(body)
        if clean_body is not None:
            call_args = call_args + (clean_body,)
        call_kwargs: t.Dict[str, t.Any] = {}
        clean_query = _strip_omitted(query)
        if clean_query:
            call_kwargs["query"] = clean_query
        if request_opts is not None:
            call_kwargs["request_options"] = request_opts

        result = method(*call_args, **call_kwargs)
        return _unwrap_root(result)

    # -- v1 backend ---------------------------------------------------------

    def _call_v1(
        self,
        path_args: t.Tuple[str, ...],
        body: t.Optional[Mapping[str, t.Any]],
        query: t.Optional[Mapping[str, t.Any]],
        headers: t.Optional[Mapping[str, t.Any]],
        request_options: t.Any,
    ) -> t.Any:
        options = _read_request_options(request_options)
        dotted = ".".join(self._path)

        kwargs: t.Dict[str, t.Any] = {}
        for source, renames_table in (
            (body, _V1_BODY_KEY_RENAMES),
            (query, _V1_QUERY_KEY_RENAMES),
        ):
            cleaned = _strip_omitted(source)
            if cleaned:
                renames = renames_table.get(dotted)
                if renames:
                    cleaned = {renames.get(k, k): v for k, v in cleaned.items()}
                kwargs.update(cleaned)

        special = _V1_SPECIAL_CALLS.get(dotted)
        if special is not None:
            path_args, kwargs = special(path_args, kwargs)

        extra_headers: t.Optional[t.Dict[str, t.Any]] = None
        if headers or options.headers:
            extra_headers = {
                **(dict(headers) if headers else {}),
                **(options.headers or {}),
            }
        if extra_headers:
            kwargs["extra_headers"] = extra_headers
        if options.timeout is not None:
            kwargs["timeout"] = options.timeout

        client = self._client
        if options.max_retries is not None:
            client = client.with_options(max_retries=options.max_retries)

        method = self._resolve_resource(client)
        return method(*path_args, **kwargs)


def _unwrap_root(result: t.Any) -> t.Any:
    """Unwrap a pydantic ``RootModel`` response to its payload (v2 only)."""
    try:
        from pydantic import RootModel
    except ImportError:  # pragma: no cover - pydantic is a hard dependency
        return result
    if isinstance(result, RootModel):
        return result.root
    return result
