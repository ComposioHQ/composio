import json
from pathlib import Path
from mercury.tools.base import Action

action = Action.from_file(
    Path("apps/abstract/actions/abstract_email_validation_api.py").resolve()
)
print(json.dumps(action.request.schema(), indent=2))
