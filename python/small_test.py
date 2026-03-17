import json
from pathlib import Path
from mercury.tools.base import Action

action = Action.from_file(Path("apps/_21risk/actions/get_compliance.py").resolve())
print(json.dumps(action.request.schema(), indent=2))
