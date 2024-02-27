import json
import os


def save_user_id(user_id):
    user_data = {'user_id': user_id}
    with open('user_data.json', 'w') as outfile:
        json.dump(user_data, outfile)

def get_user_id():
    if os.path.exists('user_data.json'):
        with open('user_data.json', 'r') as infile:
            user_data = json.load(infile)
            return user_data.get('user_id')
    return None