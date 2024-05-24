import logging
from dataclasses import dataclass
from rich.logging import RichHandler
from simple_parsing.helpers.serialization.serializable import FrozenSerializable
from typing import Dict, List, Optional, Tuple, Any, TypedDict, Union
from pydantic.v1 import BaseModel, Field, create_model, ValidationError
import yaml
import json

from utils import communicate, interrupt_container, close_container, get_container_by_container_name

LOGGER_NAME = "composio_logger"

handler = RichHandler(show_time=False, show_path=False)
handler.setLevel(logging.DEBUG)
logger = logging.getLogger(LOGGER_NAME)
logger.setLevel(logging.DEBUG)
logger.addHandler(handler)
logger.propagate = False


@dataclass(frozen=True)
class ObservationAssemblerArguments(FrozenSerializable):
    """has config-path for the observation assembler
    """
    container_name: str = None
    image_name: str = None
    # Policy can only be set via config yaml file from command line

    
class ObservationAssemblerArgumentsModel(BaseModel):
    container_name: str = Field(..., description="locally running docker-container name")
    image_name: str = Field(..., description="docker-image name from which docker-container is created")
    observation: str = Field(..., description="observation from the previous command")
    # Policy can only be set via config yaml file from command line
    # config: Optional[AgentConfig] = field(default=None, cmd=False)


def load_yaml_to_model(yaml_file_path: str) -> ObservationAssemblerArgumentsModel:
    with open(yaml_file_path, 'r') as file:
        yaml_content = yaml.safe_load(file)

    try:
        args = ObservationAssemblerArgumentsModel(subroutine=yaml_content)
        return args
    except ValidationError as e:
        print("Validation error:", e.json())


class ObservationAssembler:
    '''
    this is invoked by the agent to fetch the next set of <thought, action, output>
    After the previous action is performed by command-manager on the underline environment,
    this tool is used to create the input for next conversation by acting on
    history + env_state + previous observation+ + previous action_output
    '''
    def __init__(self, args: ObservationAssemblerArgumentsModel):
        # observation_args = load_yaml_to_model("./config/default.yaml")
        self.args = args
        self.name = "agent"
        self.container_name = args.container_name
        self.image_name = args.image_name
        self.instance_args = None
        self.history = []
        self.last_container_id = None
        self.hooks = []
        self.container_obj = self.get_container_by_container_name()
        self.container_process = None
        self.parent_pids = None
        self.curr_observation = None

    @property
    def state_command(self) -> str:
        """Return the bash command that will be used to extract the environment state."""
        # state_command: Command = Command(
        #     name="state",
        #     code="""state() {
        #             echo '{"working_dir": "'$(realpath --relative-to=$ROOT/.. $PWD)'"}';
        #         };""",
        # )
        # return "state"
        return "state"

    def set_current_observation(self, obs):
        self.curr_observation = obs

    def get_container_by_container_name(self):
        container_obj = get_container_by_container_name(self.container_name, self.image_name)
        return container_obj

    # todo: this is a hack --> fix it
    # fix container process
    # fix parent-pids
    def set_container_process(self, container_process, parent_pids):
        self.container_process = container_process
        self.parent_pids = parent_pids

    def append_history(self, item: Dict):
        # for hook in self.hooks:
        #     hook.on_query_message_added(**item)
        self.history.append(item)

    def setup_initial_observation(self, instance_args) -> None:
        """Setup the agent for a new instance."""
        assert self.config is not None  # mypy
        self.instance_args = instance_args

        system_msg = self.config.system_template.format(**self.system_args)
        logger.info(f"SYSTEM ({self.name})\n{system_msg}")

        self.history: List[Dict[str, Any]] = []
        self.append_history({"role": "system", "content": system_msg, "agent": self.name})

    def get_container_state(self):
        state, return_code = communicate(self.container_process, self.container_obj, self.state_command, self.parent_pids) if self.state_command else None
        return state

    def assemble_observation(self, observation: str) -> str:
        assert self.config is not None  # mypy

        container_state = self.get_container_state()
        state_vars = json.loads(container_state)

        templates: List[str] = []
        # Determine observation template based on what prior observation was
        if self.history[-1]["role"] == "system" or self.history[-1].get(
                "is_demo", False
        ):
            # Show instance template if prev. obs. was initial system message
            templates = [self.config.instance_template]
            if self.config.strategy_template is not None:
                templates.append(self.config.strategy_template)
        elif observation is None or observation.strip() == "":
            # Show no output template if observation content was empty
            templates = [self.config.next_step_no_output_template]
        else:
            # Show standard output template if there is observation content
            templates = [self.config.next_step_template]

        # Populate selected template(s) with information (e.g., issue, arguments, state)
        messages = []
        for template in templates:
            messages.append(
                template.format(
                    **self.instance_args,
                    **self.system_args,
                    **state_vars,
                    observation=(observation if observation is not None else ""),
                )
            )

        message = "\n".join(messages)

        logger.info(f"🤖 MODEL INPUT\n{message}")
        self.append_history(
            {"role": "user", "content": message, "agent": self.name}
        )

        # need to implememnt this for showing ui
        # for hook in self.hooks:
        #     hook.on_model_query(query=self.local_history, agent=self.name)
        message_with_history = self.history_to_messages(self.local_history)
        return message_with_history

    @property
    def local_history(self) -> list[dict[str, str]]:
        """Return the history of the agent since the last reset."""
        return self.config.history_processor(
            [entry for entry in self.history if entry["agent"] == self.name]
        )

    ## todo: this is specific to openai apis --> probably need to test it for crewai agent
    def history_to_messages(
            self, history: list[dict[str, str]], is_demonstration: bool = False
    ) -> Union[str, list[dict[str, str]]]:
        """
        Create `messages` by filtering out all keys except for role/content per `history` turn
        """
        # Remove system messages if it is a demonstration
        if is_demonstration:
            history = [entry for entry in history if entry["role"] != "system"]
            return '\n'.join([entry["content"] for entry in history])
        # Return history components with just role, content fields
        return [
            {k: v for k, v in entry.items() if k in ["role", "content"]}
            for entry in history
        ]


def execute_observation_handler(args: ObservationAssemblerArgumentsModel):
    o = ObservationAssembler(args)
    return o.assemble_observation(args.observation)
