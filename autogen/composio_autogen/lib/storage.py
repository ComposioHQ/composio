import json
import os

def save_user_id(user_id):
    user_data = {'user_id': user_id}
    user_data_path = os.path.join(os.path.dirname(__file__), 'user_data.json')
    with open(user_data_path, 'w') as outfile:
        json.dump(user_data, outfile)

def get_user_id():
    user_data_path = os.path.join(os.path.dirname(__file__), 'user_data.json')
    if os.path.exists(user_data_path):
        with open(user_data_path, 'r') as infile:
            user_data = json.load(infile)
            return user_data.get('user_id')
    return None