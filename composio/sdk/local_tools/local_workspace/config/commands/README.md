# Command Configuration
In this document, we describe how to implement your own commands for the SWE-agent ACI.
To see examples of command implementations, open the `.sh` and `.py` files in this folder.

## Scaffolding
Every command subscribes to the following skeleton code.
```shell
# @yaml
# signature: [command] [argument(s)]
# docstring: [Brief description of what your command does.]
# arguments:
#   [argument 1 name]:
#       type: [type (i.e. integer, string)]
#       description: [Brief description of this argument]
#       required: [true|false]
#   [argument 2 name]:
#       ...
[command]() {
    # Implementation here
}
```
* If a command takes in arguments, reference them via positional parameters notation (i.e. `$1`).
* If there are no arguments, omit the `arguments` section.
* The implementation for your command is unconstrained. There are no limitations on the form of the underlying command code.
* The minimal documentation requirements are `signature` and `docstring`.
* If you'd like multiple commands to make modifications to a similar body of functions, we recommend using global variables.
    * For instance, in `config/commands/default.sh`, you'll see we define the `CURRENT_LINE` variable for the file viewer. This variable is modified across multiple commands, including `open`, `goto`, `scroll_up`, `scroll_down`, and `edit`.
    * You can also leverage third party libraries (check out how we do linting enabled `edit` in `config/commands/edit_linting.sh`).
* To show effects of the command, print to standard output (i.e. `echo`). SWE-agent is implemented such that it does not look for a return value from these commands.

## Displaying the Command to SWE-agent
After you define a command, there are a small set of additional steps to making it available for the agent to use.

First, within your config file...
* Add `config/commands/<file name>.sh` file to the `command_files` field.
* Set the `parse_command` field to `ParseCommandBash` or `ParseCommandDetailed`. This key points to the functionality that generates how command documentation is shown to the agent.
* Decide which template(s) you want to show the `{command_docs}` in.
    * We strongly recommend including `{command_docs}` in the `system_template`, which is the first message shown to the agent for every task instance episode.
    * You might also consider adding `{command_docs}` to the `format_error_template`, which is shown if the response provided by a model is malformed.
* (Optional) Including a demonstration that uses a command is helpful to showcase proper use + increases the frequency with which the agent uses the command. If you'd like to add a demonstration...
    * Create a demonstration manually (i.e. `python run.py --model human_thought ...`) or automatically (i.e. `python run_replay --traj_path ...`)
    * Add/Update the demonstration to the `demonstrations` argument.
    * Update `demonstration_template` to control how the demonstration is displayed to the agent.

> If you're not familiar with how SWE-agent configuration files work, we recommend checking out the [`config` README](https://github.com/princeton-nlp/SWE-agent/tree/main/config).

Next, run your configuration and see how your agent uses the commands!
```bash
python run.py --config_file config/[your config].yaml ...
```
