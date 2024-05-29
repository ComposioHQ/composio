from pprint import pprint

from composio.local_tools.local_workspace.cmd_manager.actions import (
    CreateFileCmd,
    CreateFileRequest,
    EditFile,
    EditFileRequest,
    FindFileCmd,
    FindFileRequest,
    GoToLineNumInOpenFile,
    GoToRequest,
    OpenCmdRequest,
    OpenFile,
    RunCommandOnWorkspace,
    ScrollDown,
    ScrollDownRequest,
    ScrollUp,
    ScrollUpRequest,
    SearchDirCmd,
    SearchDirRequest,
    SearchFileCmd,
    SearchFileRequest,
    SetCursors,
    SetCursorsRequest,
)
from composio.local_tools.local_workspace.commons.history_processor import (
    HistoryProcessor,
    history_recorder,
)
from composio.local_tools.local_workspace.commons.local_docker_workspace import (
    KEY_CONTAINER_NAME,
    KEY_IMAGE_NAME,
    KEY_PARENT_PIDS,
    KEY_WORKSPACE_MANAGER,
    LocalDockerArgumentsModel,
    WorkspaceManagerFactory,
)
from composio.local_tools.local_workspace.history_keeper.actions import (
    GetWorkspaceHistory,
    GetWorkspaceHistoryRequest,
)
from composio.local_tools.local_workspace.workspace.actions import (
    CreateWorkspaceAction,
    CreateWorkspaceRequest,
    SetupGithubRepo,
    SetupGithubRepoRequest,
    SetupWorkspace,
    WorkspaceSetupRequest,
    WorkspaceStatus,
    WorkspaceStatusRequest,
)


#
# import autopep8
# import pylint.lint


def format_and_lint_code(source_code):
    # Format code using autopep8
    formatted_code = autopep8.fix_code(source_code)

    # Save the formatted code to a temporary file (optional


def check_simple_implementation():
    args = LocalDockerArgumentsModel(
        image_name="sweagent/swe-agent:latest",
        verbose=True,
        install_environment=True,
    )

    w = WorkspaceManagerFactory()
    h = HistoryProcessor()
    workspace_id = w.get_workspace_manager(args)

    # setup environment + copy commands + source scripts
    setup_docker_args = WorkspaceSetupRequest(workspace_id=workspace_id)
    setup_manager = SetupWorkspace("setup-workspace")
    setup_manager.set_workspace_and_history(w, h)
    setup_manager.execute(setup_docker_args)

    # copy github repo
    copy_repo_args = SetupGithubRepoRequest(workspace_id=workspace_id)
    git_setup = SetupGithubRepo("setyp_git_repo")
    git_setup.set_workspace_and_history(w, h)
    git_setup.execute(copy_repo_args)

    search_cmd = SearchDirCmd("abc")
    search_cmd.set_workspace_and_history(w, h)
    output = search_cmd.execute(
        SearchDirRequest(
            workspace_id=workspace_id,
            search_term="'golden-python search'",
            dir="/SWE-bench/",
        ),
        authorisation_data={},
    )
    print(output)

    # set_cursor_cmd = SetCursors("set-cursors")
    # set_cursor_cmd.set_workspace_and_history(w, h)
    # set_cursor_cmd.execute(SetCursorsRequest(workspace_id=workspace_id,
    #                                          start_line=0, end_line=10), authorisation_data={})
    # file_name = "test.py"
    # create_file_cmd = CreateFileCmd("abc")
    # create_file_cmd.set_workspace_and_history(w, h)
    # create_file_cmd.execute(CreateFileRequest(workspace_id=workspace_id, file_name=file_name), authorisation_data={})
    # open_file_cmd = OpenFile("abc")
    # open_file_cmd.set_workspace_and_history(w, h)
    # open_file_cmd.execute(OpenCmdRequest(workspace_id=workspace_id, file_name=file_name), authorisation_data={})
    #
    # source_code = '''import os\nimport pathlib\nimport time\nimport json\nfrom datetime import datetime\nfrom time import mktime, gmtime\n\nimport pandas as pd\n\nfrom pvlib import pvsystem\nfrom pvlib import location as pvlocation\nfrom pvlib import modelchain\nfrom pvlib.temperature import TEMPERATURE_MODEL_PARAMETERS as PARAMS #\nnot used -- to remove\nfrom pvlib.bifacial.pvfactors import pvfactors_timeseries\nfrom pvlib.temperature import TEMPERATURE_MODEL_PARAMETERS\n\nclass PV:\n    def pv_transform_time(self, val):\n        # tt = gmtime(val / 1000)\n        tt = gmtime(val)\n        dd = datetime.fromtimestamp(mktime(tt))\n        timestamp = pd.Timestamp(dd)\n        return timestamp\n\n    def __init__(self, model: str, inverter: str, latitude: float,\n                longitude: float, **kwargs):\n        # super().__init__(**kwargs)\n\n        temperature_model_parameters =\n        TEMPERATURE_MODEL_PARAMETERS[\"sapm\"][\"open_rack_glass_glass\"]\n        # Load the database of CEC module model parameters\n        modules = pvsystem.retrieve_sam(\"cecmod\")\n        # Load the database of CEC inverter model parameters\n        inverters = pvsystem.retrieve_sam(\"cecinverter\")\n\n\n        # A bare bone PV simulator\n\n        # Load the database of CEC module model parameters\n        modules = pvsystem.retrieve_sam('cecmod')\n        inverters = pvsystem.retrieve_sam('cecinverter')\n        module_parameters = modules[model]\n        inverter_parameters = inverters[inverter]\n\n        location = pvlocation.Location(latitude=latitude,\n                                    longitude=longitude)\n        system = pvsystem.PVSystem(module_parameters=module_parameters,\n                                  inverter_parameters=inverter_parameters,\n                                  temperature_model_parameters=temperature_model_parameters)\n        self.modelchain = modelchain.ModelChain(system, location,\n                                              aoi_model='no_loss', spectral_model=\"no_loss\")\n\n    def process(self, data):\n        weather = pd.read_json(data)\n        # print(f\"raw_weather: {weather}\")\n        weather.drop('time.1', axis=1, inplace=True)\n        weather['time'] =\n        pd.to_datetime(weather['time']).map(datetime.timestamp) # --> this\n        works for the new process_weather code and also the old weather file\n        weather[\"time\"] = weather[\"time\"].apply(self.pv_transform_time)\n        weather.index = weather[\"time\"]\n        # print(f\"weather: {weather}\")\n        # print(weather.dtypes)\n        # print(weather['ghi'][0])\n        # print(type(weather['ghi'][0]))\n\n        # simulate\n        self.modelchain.run_model(weather)\n        # print(self.modelchain.results.ac.to_frame().to_json())\n        print(self.modelchain.results.ac)\n\n\n        # good data\n        good_data = \"{\\\"time\\\":{\\\"12\\\":\\\"2010-01-01\n        13:30:00+00:00\\\"},\\\"ghi\\\":{\\\"12\\\":36},\\\"dhi\\\":{\\\"12\\\":36},\\\"dni\\\":{\\\"12\\\"\n        :0},\\\"Tamb\\\":{\\\"12\\\":8.0},\\\"WindVel\\\":{\\\"12\\\":5.0},\\\"WindDir\\\":{\\\"12\\\n        \":270},\\\"time.1\\\":{\\\"12\\\":\\\"2010-01-01 13:30:00+00:00\\\"}}\"\n\n        # data that causes error\n        data = \"{\\\"time\\\":{\\\"4\\\":\\\"2010-01-01\n        05:30:00+00:00\\\"},\\\"ghi\\\":{\\\"4\\\":0},\\\"dhi\\\":{\\\"4\\\":0},\\\"dni\\\":{\\\"4\\\":0}\n        ,\\\"Tamb\\\":{\\\"4\\\":8.0},\\\"WindVel\\\":{\\\"4\\\":4.0},\\\"WindDir\\\":{\\\"4\\\":240},\\\n        \"time.1\\\":{\\\"4\\\":\\\"2010-01-01 05:30:00+00:00\\\"}}\"\n        p1 = PV(model=\"Trina_Solar_TSM_300DEG5C_07_II_\",\n              inverter=\"ABB__MICRO_0_25_I_OUTD_US_208__208V_\", latitude=51.204483,\n              longitude=5.265472)\n        p1.process(good_data)\n        print(\"=====\")\n        p1.process(data)'''
    # formatted_code = autopep8.fix_code(source_code)
    #
    # edit_file_cmd = EditFile("abc")
    # edit_file_cmd.set_workspace_and_history(w, h)
    # output = edit_file_cmd.execute(EditFileRequest(workspace_id=workspace_id,
    #                                       start_line=1,
    #                                       end_line=10,
    #                                       replacement_text=formatted_code), authorisation_data={})
    # print(output)
    # history_keeper.set_workspace_and_history(w, h)
    # pprint(history_keeper.execute(GetWorkspaceHistoryRequest(workspace_id=workspace_id)))

    # pprint(h.get_history(workspace_id))

    # load all the special commands
    # special_commands_util = ShellEditor(COMMANDS_CONFIG_PATH)
    # all_special_cmds = special_commands_util.get_all_commands()
    #
    # # run special command
    # special_cmd_args: EditorOperationRequest = EditorOperationRequest(command="find_file",
    #                                                                   workspace_id="123",
    #                                                                   arguments=["README.md", "/SWE-bench/"])
    # output = special_commands_util.perform_operation(special_cmd_args, container_process, container_name,
    #                                                  image_name, parent_pids)
    # print(output)


if __name__ == "__main__":
    check_simple_implementation()
