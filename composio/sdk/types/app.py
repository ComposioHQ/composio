from pydantic import BaseModel, Field, HttpUrl
from typing import Any, List, Dict, Optional

class AuthSchemeField(BaseModel):
    name: str
    display_name: str
    description: str
    type: str
    required: bool
    expected_from_customer: bool
    default: Optional[str] = None

class AuthScheme(BaseModel):
    scheme_name: str
    auth_mode: str
    authorization_url: HttpUrl
    token_url: HttpUrl
    proxy: Dict[str, str]
    default_scopes: List[str]
    token_response_metadata: List[str]
    client_id: str
    client_secret: str
    fields: List[AuthSchemeField]

class AppInfoModel(BaseModel):
    name: str
    key: str
    status: str
    documentation_doc_text: str
    configuration_docs_text: str
    docs: HttpUrl
    description: str
    logo: HttpUrl
    categories: List[str]
    auth_schemes: List[AuthScheme]
    yaml: Dict[str, Any]
    group: str
    appId: str
    testConnectors: List[Dict[str, str]]
    meta: Dict[str, Any]
