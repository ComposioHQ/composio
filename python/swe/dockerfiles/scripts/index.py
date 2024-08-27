import argparse

from composio import Action, ComposioToolSet


parser = argparse.ArgumentParser()
parser.add_argument("--repo", type=str, required=True)
args = parser.parse_args()

composio_toolset = ComposioToolSet()

resp = composio_toolset.execute_action(
    action=Action.CODE_ANALYSIS_TOOL_CREATE_CODE_MAP,
    params={"dir_to_index_path": args.repo},
)
