import typing as t

from pydantic import BaseModel, Field

from composio.tools.local.clickup.actions.base import OpenAPIAction


class UpdateSpaceRequest(BaseModel):
    """Request schema for `UpdateSpace`"""

    space_id: int = Field(
        ...,
        alias="space_id",
        description="",
    )
    name: str = Field(
        default=...,
        alias="name",
        description="Name",
    )
    color: str = Field(
        default=...,
        alias="color",
        description="Color",
    )
    private: bool = Field(
        default=...,
        alias="private",
        description="Private",
    )
    admin_can_manage: bool = Field(
        default=...,
        alias="admin_can_manage",
        description=(
            "***Note:** Allowing or restricting admins from managing private Spaces using "
            '`"admin_can_manage"` is an [Enterprise Plan](https://clickup.com/pricing) '
            "feature.* "
        ),
    )
    multiple_assignees: bool = Field(
        default=...,
        alias="multiple_assignees",
        description="Multiple Assignees",
    )
    features_tags_enabled: bool = Field(
        default=...,
        alias="features__tags__enabled",
        description="Enabled",
    )
    features_due_dates_enabled: bool = Field(
        default=...,
        alias="features__due_dates__enabled",
        description="Enabled",
    )
    features_due_dates_start_date: bool = Field(
        default=...,
        alias="features__due_dates__start_date",
        description="Start Date",
    )
    features_due_dates_remap_due_dates: bool = Field(
        default=...,
        alias="features__due_dates__remap_due_dates",
        description="Remap Due Dates",
    )
    features_due_dates_remap_closed_due_date: bool = Field(
        default=...,
        alias="features__due_dates__remap_closed_due_date",
        description="Remap Closed Due Date",
    )
    features_time_tracking_enabled: bool = Field(
        default=...,
        alias="features__time_tracking__enabled",
        description="Enabled",
    )
    features_time_estimates_enabled: bool = Field(
        default=...,
        alias="features__time_estimates__enabled",
        description="Enabled",
    )
    features_checklists_enabled: bool = Field(
        default=...,
        alias="features__checklists__enabled",
        description="Enabled",
    )
    features_custom_fields_enabled: bool = Field(
        default=...,
        alias="features__custom_fields__enabled",
        description="Enabled",
    )
    features_remap_dependencies_enabled: bool = Field(
        default=...,
        alias="features__remap_dependencies__enabled",
        description="Enabled",
    )
    features_dependency_warning_enabled: bool = Field(
        default=...,
        alias="features__dependency_warning__enabled",
        description="Enabled",
    )
    features_portfolios_enabled: bool = Field(
        default=...,
        alias="features__portfolios__enabled",
        description="Enabled",
    )


class UpdateSpaceResponse(BaseModel):
    """Response schema for `UpdateSpace`"""

    data: t.Dict[str, t.Any]


class UpdateSpace(OpenAPIAction):
    """Rename, set the Space color, and enable ClickApps for a Space."""

    _tags = ["Spaces"]
    _display_name = "update_space"
    _request_schema = UpdateSpaceRequest
    _response_schema = UpdateSpaceResponse

    url = "https://api.clickup.com/api/v2"
    path = "/space/{space_id}"
    method = "put"
    operation_id = "Spaces_updateDetailsAndEnableClickApps"
    action_identifier = "/space/{space_id}_put"

    path_params = {"space_id": "space_id"}
    query_params = {}
    header_params = {}
    request_params = {
        "name": {"__alias": "name"},
        "color": {"__alias": "color"},
        "private": {"__alias": "private"},
        "admin_can_manage": {"__alias": "admin_can_manage"},
        "multiple_assignees": {"__alias": "multiple_assignees"},
        "features": {
            "__alias": "features",
            "tags": {"__alias": "tags", "enabled": {"__alias": "enabled"}},
            "due_dates": {
                "__alias": "due_dates",
                "enabled": {"__alias": "enabled"},
                "start_date": {"__alias": "start_date"},
                "remap_due_dates": {"__alias": "remap_due_dates"},
                "remap_closed_due_date": {"__alias": "remap_closed_due_date"},
            },
            "time_tracking": {
                "__alias": "time_tracking",
                "enabled": {"__alias": "enabled"},
            },
            "time_estimates": {
                "__alias": "time_estimates",
                "enabled": {"__alias": "enabled"},
            },
            "checklists": {"__alias": "checklists", "enabled": {"__alias": "enabled"}},
            "custom_fields": {
                "__alias": "custom_fields",
                "enabled": {"__alias": "enabled"},
            },
            "remap_dependencies": {
                "__alias": "remap_dependencies",
                "enabled": {"__alias": "enabled"},
            },
            "dependency_warning": {
                "__alias": "dependency_warning",
                "enabled": {"__alias": "enabled"},
            },
            "portfolios": {"__alias": "portfolios", "enabled": {"__alias": "enabled"}},
        },
    }

    aliases = {
        "features": "b2ec011b",
        "features__tags": "7a0def66",
        "features__due_dates": "ed8540e6",
        "features__time_tracking": "b2de2b7f",
        "features__time_estimates": "1d002990",
        "features__checklists": "1861c93b",
        "features__custom_fields": "32870bca",
        "features__remap_dependencies": "50555158",
        "features__dependency_warning": "e34811c6",
        "features__portfolios": "681dbcee",
    }
