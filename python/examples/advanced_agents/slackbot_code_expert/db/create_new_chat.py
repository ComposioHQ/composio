from main import ChatDB
from dotenv import load_dotenv, set_key
import os

def create_new_chat(db_path: str = 'db.json') -> str:
    chat_name = input("Enter the name of your codebase (directory name): ").strip()
    if not chat_name:
        raise ValueError("Codebase name cannot be empty")
        
    chat_db = ChatDB(db_path)
    chat_id = chat_db.create_chat(chat_name)
    
    env_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), '.env')
    set_key(env_path, 'CHAT_ID', chat_id)
    
    return chat_id

create_new_chat()
