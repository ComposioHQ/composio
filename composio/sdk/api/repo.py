import requests
from typing import Optional, List, Dict, Any

from composio.sdk.types.app import AppModel

def get_list_triggers(base_url: str, api_key: str, app_names: Optional[List[str]] = None) -> Dict[str, Any]:
    url = f"{base_url}/v1/triggers"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    params = {"appNames": ",".join(app_names) if app_names else None}
    response = requests.get(url, headers=headers, params=params)
    return response.json()

def get_list_active_triggers(base_url: str, api_key: str, trigger_ids: Optional[List[str]] = None) -> Dict[str, Any]:
    url = f"{base_url}/v1/triggers/active_triggers"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    params = {"triggerIds": ",".join(trigger_ids) if trigger_ids else None}
    response = requests.get(url, headers=headers, params=params)
    return response.json()

def post_disable_trigger(base_url: str, api_key: str, trigger_id: str) -> Dict[str, Any]:
    url = f"{base_url}/v1/triggers/disable/{trigger_id}"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    response = requests.post(url, headers=headers)
    return response.json()

def post_enable_trigger(base_url: str, api_key: str, trigger_name: str, connected_account_id: str, user_inputs: Dict[str, Any]) -> Dict[str, Any]:
    url = f"{base_url}/v1/triggers/enable/{connected_account_id}/{trigger_name}"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    data = {"triggerConfig": user_inputs}
    response = requests.post(url, headers=headers, json=data)
    return response.json()

def post_set_global_trigger(base_url: str, api_key: str, callback_url: str) -> Dict[str, Any]:
    url = f"{base_url}/v1/triggers/setCallbackURL"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    data = {"callbackURL": callback_url}
    response = requests.post(url, headers=headers, json=data)
    return response.json()

def get_list_of_apps(base_url: str, api_key: str) -> Dict[str, Any]:
    url = f"{base_url}/v1/apps"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    response = requests.get(url, headers=headers)
    return response.json()

def get_app(base_url: str, api_key: str, app_name: str) -> Dict[str, AppModel]:
    url = f"{base_url}/v1/apps/{app_name}"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    response = requests.get(url, headers=headers)
    return response.json()

def get_list_of_actions(base_url: str, api_key: str, app_names: List[str], use_case: Optional[str] = None, limit: Optional[int] = None) -> Dict[str, Any]:
    url = f"{base_url}/v1/actions"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    params = {"appNames": ",".join(app_names), "useCase": use_case, "limit": limit}
    response = requests.get(url, headers=headers, params=params)
    return response.json()

def get_list_of_triggers(base_url: str, api_key: str, app_names: Optional[List[str]] = None) -> Dict[str, Any]:
    url = f"{base_url}/v1/triggers"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    params = {"appNames": ",".join(app_names) if app_names else None}
    response = requests.get(url, headers=headers, params=params)
    return response.json()

def get_list_of_integrations(base_url: str, api_key: str) -> Dict[str, Any]:
    url = f"{base_url}/v1/integrations"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    response = requests.get(url, headers=headers)
    return response.json()

def get_integration(base_url: str, api_key: str, connector_id: str) -> Dict[str, Any]:
    url = f"{base_url}/v1/integrations/{connector_id}"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    response = requests.get(url, headers=headers)
    return response.json()

def post_create_integration(base_url: str, api_key: str, app_id: str, use_default: bool, name: Optional[str] = None, auth_mode: Optional[str] = None) -> Dict[str, Any]:
    url = f"{base_url}/v1/integrations"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    data = {"appId": app_id, "useComposioAuth": use_default, "name": name, "authScheme": auth_mode}
    response = requests.post(url, headers=headers, json=data)
    return response.json()

def get_connected_account(base_url: str, api_key: str, connection_id: str) -> Dict[str, Any]:
    url = f"{base_url}/v1/connectedAccounts/{connection_id}"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    response = requests.get(url, headers=headers)
    return response.json()

def get_connected_accounts(base_url: str, api_key: str, user_uuid: Optional[str] = None, showActiveOnly: Optional[bool] = None) -> Dict[str, Any]:
    url = f"{base_url}/v1/connectedAccounts"
    headers = {"Content-Type": "application/json", "x-api-key": api_key}
    params = {"user_uuid": user_uuid, "showActiveOnly": str("true" if showActiveOnly else "false")}
    response = requests.get(url, headers=headers, params=params)
    return response.json()

