import json
import os

def load_user_data():
    user_data_path = os.path.join(os.path.dirname(__file__), 'user_data.json')
    if os.path.exists(user_data_path):
        with open(user_data_path, 'r') as infile:
            return json.load(infile)
    return {}

def save_user_data(user_data):
    user_data_path = os.path.join(os.path.dirname(__file__), 'user_data.json')
    with open(user_data_path, 'w') as outfile:
        json.dump(user_data, outfile)

def save_api_key(api_key):
    user_data = load_user_data()
    user_data['api_key'] = api_key
    save_user_data(user_data)

def get_api_key():
    user_data = load_user_data()
    return user_data.get('api_key')

def save_user_connection(connection_id: str, tool_name: str) -> None:
    user_data_path = os.path.join(os.path.dirname(__file__), 'connection_data.json')
    user_data = {}
    if os.path.exists(user_data_path):
        with open(user_data_path, 'r') as infile:
            user_data = json.load(infile)

    user_data[tool_name] = connection_id
    with open(user_data_path, 'w') as outfile:
        json.dump(user_data, outfile)

def get_user_connection(tool_name: str) -> str:
    user_data_path = os.path.join(os.path.dirname(__file__), 'connection_data.json')
    if os.path.exists(user_data_path):
        with open(user_data_path, 'r') as infile:
            user_data = json.load(infile)
            return user_data.get(tool_name)
    return None

def delete_user_connections():
    user_data_path = os.path.join(os.path.dirname(__file__), 'connection_data.json')
    if os.path.exists(user_data_path):
        os.remove(user_data_path)

def set_base_url(base_url: str, force_reset: bool = False):
    user_data = {} if force_reset else load_user_data()
    user_data['base_url'] = base_url
    delete_user_connections()
    save_user_data(user_data)

def get_base_url():
    user_data = load_user_data()
    if 'base_url' in user_data:
        return user_data['base_url']
    return 'https://backend.composio.dev/api'

def get_base_account_api_key():
    base_url = get_base_url()
    if base_url == 'https://backend.composio.dev/api':
        return "yw1qb4ls4340z696zh7sa"
    else:
        return "i4i8nasawcsumwg30tn6g"