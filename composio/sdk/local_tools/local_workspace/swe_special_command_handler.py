import os
import subprocess
import re
import yaml
import logging
from pydantic import BaseModel, Field
from rich.logging import RichHandler

from utils import communicate, get_container_by_container_name

# Setup logging
handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger("editor_logger")
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False


def extract_yaml_annotations(file_path):
    """Extracts YAML annotations from a shell script."""
    doc_strings = {}
    arguments = {}

    with open(file_path, 'r') as file:
        script_content = file.read()

    yaml_blocks = re.findall(r'# @yaml\n(.*?)(?=\n# @yaml|$)', script_content, re.DOTALL)

    for match in yaml_blocks:
        try:
            data = yaml.safe_load(match)
            if 'signature' in data:
                function_name = data['signature'].split()[0]
                doc_strings[function_name] = data

        except yaml.YAMLError as exc:
            print(f"Error parsing YAML content: {exc}")

    return doc_strings


def parse_yaml_annotations_from_file(file_path):
    with open(file_path, 'r') as file:
        content = file.read()

    # Extract blocks of text that follow a `# @yaml` marker
    yaml_blocks = re.findall(r'# @yaml\n(.*?)(?=\n# @yaml|$)', content, re.DOTALL)

    yaml_data = []
    for block in yaml_blocks:
        # Remove the hash symbol at the beginning of each line in the block
        cleaned_block = re.sub(r'^# ', '', block, flags=re.MULTILINE)
        try:
            # Convert the cleaned block to a Python dictionary
            data = yaml.safe_load(cleaned_block)
            yaml_data.append(data)
        except yaml.YAMLError as exc:
            print(f"Error parsing YAML block: {exc}")
            continue

    return yaml_data


class EditorOperationRequest(BaseModel):
    workspace_id: str = Field(..., description="workspace-id for the workspace to run the command on")
    command: str = Field(..., description="Type of command e.g., open, scroll_up, set_cursors")
    arguments: list = Field(..., description="Arguments required for the command")


class ShellEditor:
    def __init__(self, config_path: str):
        self.config = self.load_config(config_path)
        self.logger = logger

    def load_config(self, path):
        """Load the command configuration from a YAML file."""
        with open(path, 'r') as file:
            return yaml.safe_load(file)

    def get_all_commands(self):
        all_cmds = {}
        for c in self.config["commands"]:
            all_cmds[c] = {"docs": self.config["commands"][c]["docs"],
                           "signature": self.config["commands"][c]["signature"]}
        return all_cmds

    def execute_command_in_container(self, script_file, command: str, container_process: subprocess.Popen,
                                     container_obj, parent_pids):
        """Executes a shell script command inside the Docker container."""
        full_command = f"source {script_file} && {command}"
        output, return_code = communicate(container_process,
                                          container_obj,
                                          full_command,
                                          parent_pids, )
        return output

    def perform_operation(self, request: EditorOperationRequest, container_process: subprocess.Popen,
                          container_name, image_name, parent_pids):
        """Form the command from the operation and arguments and execute it in the container."""
        container_obj = get_container_by_container_name(container_name, image_name)
        script_file = self.config['commands'][request.command]['script']
        command = f"{request.command} {' '.join(map(str, request.arguments))}"
        return self.execute_command_in_container(script_file, command, container_process, container_obj, parent_pids)


def main():
    config_path = "config/commands.yaml"
    # Setup container process and object here
    container_process = None  # Substitute with actual process
    container_obj = None  # Substitute with actual container object

    # Create an instance of ShellEditor
    editor = ShellEditor(config_path)

    # Example operation
    request = EditorOperationRequest(operation="open", arguments=["/path/to/file.txt", "100"])
    c = editor.get_all_commands()
    from pprint import pprint
    pprint(c)

    # editor.perform_operation(request, None, None, [])


if __name__ == "__main__":
    main()
