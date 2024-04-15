import json
import os

from pathlib import Path

composio_path = os.path.join(Path.home(), ".composio")

# Check if the directory exists
if not os.path.exists(composio_path):
    # If it doesn't exist, create it
    os.makedirs(composio_path)
    print(f"Saving auth data")


def load_user_data():
    user_data_path = os.path.join(composio_path, 'user_data.json')
    if os.path.exists(user_data_path):
        with open(user_data_path, 'r') as infile:
            return json.load(infile)
    return {}

def save_user_data(user_data):
    user_data_path = os.path.join(composio_path, 'user_data.json')
    with open(user_data_path, 'w') as outfile:
        json.dump(user_data, outfile)

def save_api_key(api_key):
    user_data = load_user_data()
    user_data['api_key'] = api_key
    save_user_data(user_data)

def get_api_key():
    user_data = load_user_data()
    return user_data.get('api_key')

def set_base_url(base_url: str, force_reset: bool = False):
    user_data = {} if force_reset else load_user_data()
    user_data['base_url'] = base_url
    save_user_data(user_data)

def get_base_url():
    user_data = load_user_data()
    if 'base_url' in user_data:
        return user_data['base_url']
    return 'https://backend.composio.dev/api'

def get_base_account_api_key():
    user_data = load_user_data()
    return user_data.get('api_key')