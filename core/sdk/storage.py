import json
import os

def save_api_key(api_key):
    user_data = {'api_key': api_key}
    user_data_path = os.path.join(os.path.dirname(__file__), 'user_data.json')
    with open(user_data_path, 'w') as outfile:
        json.dump(user_data, outfile)

def get_api_key():
    user_data_path = os.path.join(os.path.dirname(__file__), 'user_data.json')
    if os.path.exists(user_data_path):
        with open(user_data_path, 'r') as infile:
            user_data = json.load(infile)
            return user_data.get('api_key')
    return None

def save_user_connection(connection_id: str, tool_name: str) -> None:
    user_data = {}
    user_data_path = os.path.join(os.path.dirname(__file__), 'connection_data.json')
    if os.path.exists(user_data_path):
        user_data = json.load(open(user_data_path, 'r'))

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