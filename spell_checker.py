import os
from bs4 import BeautifulSoup
import enchant
import re

def split_camelcase(word):
    return re.findall(r'[A-Z](?:[a-z]+|[A-Z]*(?=[A-Z][a-z]|\d|\W|$)|\d*)', word)

def is_valid_word(word, d):
    # Remove common markdown and formatting characters
    cleaned_word = re.sub(r'[*_`#\[\](){}]', '', word)
    # Remove leading/trailing punctuation
    cleaned_word = cleaned_word.strip('.,!?:;')
    # Check if the cleaned word is empty, contains non-alphabetic characters, or is less than 4 letters
    if not cleaned_word or not cleaned_word.isalpha() or len(cleaned_word) < 4:
        return True
    # Split camelCase and PascalCase words
    if cleaned_word[0].isupper() or any(c.isupper() for c in cleaned_word[1:]):
        split_words = split_camelcase(cleaned_word)
        return all(d.check(w.lower()) or w.lower() in ignored_words for w in split_words if w.isalpha() and len(w) >= 4)
    return d.check(cleaned_word.lower()) or cleaned_word.lower() in ignored_words

def spell_check(directory):
    d = enchant.Dict("en_US")
    global ignored_words
    ignored_words = set([
        'composio', 'readme', 'toolset', 'walkthrough', 'repo', 'autogen', 'crewai', 'langchain', 'jupyter',
        'url', 'sdk', 'html', 'css', 'api', 'constructor', 'param', 'params', 'readonly', 'slackbot', 'chromadb',
        'boolean', 'string', 'null', 'undefined', 'enum', 'async', 'await', 'const', 'aider', 'apache',
        'integrations', 'apis', 'youtube', 'linkedin', 'todolist', 'github', 'agentic', 'softwares',
        'gmail', 'hubspot', 'salesforce', 'tavily', 'ngrok', 'redis', 'vercel', 'dotenv', 'linux', 'chmod', 'trello', 'todo', 'webhook', 'webhooks',
        'claude', 'gemini', 'authorisation', 'auth', 'oauth', 'upto', 'embeddable', 'whitelabel',
        'backend', 'pluggable', 'openai', 'initialise', 'javascript', 'github', 'llamaindex', 'langgraph', 'automata',
        'composio_openai', 'openai_client', 'aiohttp', 'cloudflare', 'hono', 'frontend', 'griptape', 'lyzr', 'serp',
        'behaviour', 'sexualized', 'behaviours', 'utkarsh', 'sawardip', 'soham', 'karan', 'linters', 'codebase', 'pipenv',
        'isort', 'pylint', 'mypy', 'asana', 'anthropic', 'pprint', 'colorama', 'chatgptconfig',
        'praisonai', 'praison', 'yaml', 'textwrap', 'sawradip', 'impactful', 'jessica', 'transformative',
        'llm_config', 'chatbot', 'swekit', 'utilising', 'optimise', 'scaffolded', 'customise', 'prebuilt', 'pydantic',
        'pathlib', 'greptile', 'accelo', 'formatters', 'unittests', 'langchain_google_genai', 'huggingface_hub',
        'summarizer', 'webpage', 'ollama', 'usecase', 'declarationstatus', 'authconfig', 'triggerconfig', 'user_uuid', 'useruuid', 'yaml', 'stringauth_schemes', 'stringgroup', 'stringkey',"diskcache"
        'stringmeta', 'numberis_custom_app', 'numbername', 'stringstatus', 'getactiondatares', 'executeactiondatares',
        'listallconnectionsdatares', 'numberpost', 'createconnectiondatares', 'deleteconnectiondatares', 'getconnectedaccountdatares',
        'listallintegrationsdatares', 'createintegrationdatares', 'getintegrationdatares', 'updateintegrationdatares',"pathspec"
        'listtriggersdatares', 'listactivetriggersdatares', 'getactivetriggerdatares', 'getlistactionsdatares',"pygments"
        'indexconstructorsconstructor', 'propertiesapikey', 'constructorsconstructornew', 'langchaintoolset', 'toolsconst',"networkx"
        'taskconst', 'agentconst', 'parametersconfig', 'stringparams', 'integrationsdefined', 'propertiesclient',"fastapi","scipy"
        'methodscreate', 'chatcompletionmessagetoolcallentityid', 'runentityid', 'chatcompletionentityid', 'openairun',"paramiko"
        'runthread', 'threadentityid', 'cancelablepromise', 'methodssaveuser', 'accessdata', 'methodsdisable',"codebases","config"
        'methodslist', 'getapiurlbase', 'generateauthkey', 'validateauthsession',"json","schemas","assistant_model_config","ChatGPTConfig"
    ])

    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith(('.md', '.html', '.txt')):
                with open(os.path.join(root, file), 'r', encoding='utf-8') as f:
                    content = f.read()
                    words = BeautifulSoup(content, 'html.parser').get_text().split()
                    misspelled = []
                    for word in words:
                        # Remove trailing punctuation for checking
                        check_word = word.rstrip('.,!?:;')
                        if len(check_word) >= 4 and not is_valid_word(check_word, d):
                            # Check if the word is a compound of valid words
                            compound_parts = re.findall(r'[A-Z]?[a-z]+|[A-Z]+(?=[A-Z][a-z]|\d|\W|$)|\d+', check_word)
                            if not all(d.check(part.lower()) or part.lower() in ignored_words for part in compound_parts if len(part) >= 4):
                                # Check for capitalized versions of ignored words
                                if not (check_word.lower() in ignored_words or check_word.capitalize() in ignored_words):
                                    misspelled.append(word)
                    if misspelled:
                        print(f"Misspelled words in {file}: {misspelled}")

cwd = os.getcwd()
spell_check(cwd)