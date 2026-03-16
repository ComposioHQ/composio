#!/bin/zsh
source ~/.zshrc
source /Users/shrey/composio/python/.venv/bin/activate
unset GOOGLE_GENAI_USE_VERTEXAI
unset GOOGLE_CLOUD_PROJECT
unset GOOGLE_CLOUD_LOCATION
python /Users/shrey/composio/python/"${@}"
