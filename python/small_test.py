from pathlib import Path
from mercury.tools.base import Action

action = Action.from_file(Path("apps/_21risk/actions/get_compliance.py").resolve())
print(action.slug)
