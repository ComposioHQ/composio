<!-- Generated from the command tree by `pnpm --filter @composio/cli run commands:map`. Do not edit; `pnpm test` fails while it is stale. -->

# Commands

Every command registration of the CLI and the file that defines it. To find a command, grep this file for its path.

- **Tree**: `dev` for commands under `composio dev` (developer mode), `root` otherwise.
- **Also at**: other registrations of the same definition, such as a root shortcut.
- **Login**: the command needs a logged-in user (`requiresLogin`, inherited from its group).
- **Visibility**: `unlisted` commands are left out of help but still run; `experimental` ones exist only while their experimental feature is enabled.
- `composio help <command>` mirrors every row and is not listed.

| Command                         | Tree | Source                                                                                    | Alias | Also at                       | Login | Visibility   |
| ------------------------------- | ---- | ----------------------------------------------------------------------------------------- | ----- | ----------------------------- | ----- | ------------ |
| `composio`                      | root | `ts/packages/cli/src/commands/$default.cmd.ts`                                            |       |                               | no    | listed       |
| `agent`                         | root | `ts/packages/cli/src/commands/agent/agent.cmd.ts`                                         |       |                               | no    | listed       |
| `agent claim`                   | root | `ts/packages/cli/src/commands/agent/claim/agent.claim.cmd.ts`                             |       |                               | no    | listed       |
| `agent inbox`                   | root | `ts/packages/cli/src/commands/agent/inbox/agent.inbox.cmd.ts`                             |       |                               | no    | listed       |
| `agent login`                   | root | `ts/packages/cli/src/commands/agent/login/agent.login.cmd.ts`                             |       |                               | no    | listed       |
| `agent signup`                  | root | `ts/packages/cli/src/commands/agent/signup/agent.signup.cmd.ts`                           |       |                               | no    | listed       |
| `agent whoami`                  | root | `ts/packages/cli/src/commands/agent/whoami/agent.whoami.cmd.ts`                           |       |                               | no    | listed       |
| `artifacts`                     | root | `ts/packages/cli/src/commands/artifacts/artifacts.cmd.ts`                                 |       |                               | no    | listed       |
| `artifacts cwd`                 | root | `ts/packages/cli/src/commands/artifacts/cwd/artifacts.cwd.cmd.ts`                         |       |                               | no    | listed       |
| `config`                        | root | `ts/packages/cli/src/commands/config/config.cmd.ts`                                       |       |                               | no    | listed       |
| `config experimental`           | root | `ts/packages/cli/src/commands/config/config.experimental.cmd.ts`                          |       |                               | no    | listed       |
| `connections`                   | root | `ts/packages/cli/src/commands/connections/connections.cmd.ts`                             |       |                               | yes   | listed       |
| `connections list`              | root | `ts/packages/cli/src/commands/connections/list/connections.list.cmd.ts`                   |       |                               | yes   | listed       |
| `connections remove`            | root | `ts/packages/cli/src/commands/connections/remove/connections.remove.cmd.ts`               |       |                               | yes   | listed       |
| `debug`                         | root | `ts/packages/cli/src/commands/debug/debug.cmd.ts`                                         |       |                               | no    | unlisted     |
| `debug api-info`                | root | `ts/packages/cli/src/commands/debug/api-info/debug.api-info.cmd.ts`                       |       |                               | no    | unlisted     |
| `debug generate-graph`          | root | `ts/packages/cli/src/commands/debug/generate-graph/debug.generate-graph.cmd.ts`           |       |                               | no    | unlisted     |
| `debug who-is-my-master`        | root | `ts/packages/cli/src/commands/debug/who-is-my-master/debug.who-is-my-master.cmd.ts`       |       |                               | no    | unlisted     |
| `dev`                           | dev  | `ts/packages/cli/src/commands/dev.cmd.ts`                                                 |       |                               | no    | listed       |
| `dev auth-configs`              | dev  | `ts/packages/cli/src/commands/auth-configs/auth-configs.cmd.ts`                           |       |                               | yes   | listed       |
| `dev auth-configs create`       | dev  | `ts/packages/cli/src/commands/auth-configs/create/auth-configs.create.cmd.ts`             |       |                               | yes   | listed       |
| `dev auth-configs info`         | dev  | `ts/packages/cli/src/commands/auth-configs/info/auth-configs.info.cmd.ts`                 |       |                               | yes   | listed       |
| `dev auth-configs list`         | dev  | `ts/packages/cli/src/commands/auth-configs/list/auth-configs.list.cmd.ts`                 |       |                               | yes   | listed       |
| `dev connected-accounts`        | dev  | `ts/packages/cli/src/commands/connected-accounts/connected-accounts.cmd.ts`               |       |                               | yes   | listed       |
| `dev connected-accounts info`   | dev  | `ts/packages/cli/src/commands/connected-accounts/info/connected-accounts.info.cmd.ts`     |       |                               | yes   | listed       |
| `dev connected-accounts link`   | dev  | `ts/packages/cli/src/commands/connected-accounts/link/connected-accounts.link.cmd.ts`     |       | `link`                        | yes   | listed       |
| `dev connected-accounts list`   | dev  | `ts/packages/cli/src/commands/connected-accounts/list/connected-accounts.list.cmd.ts`     |       |                               | yes   | listed       |
| `dev connected-accounts whoami` | dev  | `ts/packages/cli/src/commands/connected-accounts/whoami/connected-accounts.whoami.cmd.ts` |       |                               | yes   | listed       |
| `dev init`                      | dev  | `ts/packages/cli/src/commands/init.cmd.ts`                                                |       |                               | no    | listed       |
| `dev listen`                    | dev  | `ts/packages/cli/src/commands/triggers/commands/triggers.listen.cmd.ts`                   |       | `dev triggers listen`         | yes   | listed       |
| `dev logs`                      | dev  | `ts/packages/cli/src/commands/logs/logs.cmd.ts`                                           |       |                               | yes   | listed       |
| `dev logs tools`                | dev  | `ts/packages/cli/src/commands/logs/tools/logs.tools.cmd.ts`                               |       |                               | yes   | listed       |
| `dev logs triggers`             | dev  | `ts/packages/cli/src/commands/logs/triggers/logs.triggers.cmd.ts`                         |       |                               | yes   | listed       |
| `dev playground-execute`        | dev  | `ts/packages/cli/src/commands/tools/commands/tools.execute.cmd.ts`                        |       |                               | yes   | listed       |
| `dev projects`                  | dev  | `ts/packages/cli/src/commands/projects/projects.cmd.ts`                                   |       |                               | no    | listed       |
| `dev projects list`             | dev  | `ts/packages/cli/src/commands/projects/list/projects.list.cmd.ts`                         |       |                               | yes   | listed       |
| `dev projects switch`           | dev  | `ts/packages/cli/src/commands/projects/switch/projects.switch.cmd.ts`                     |       |                               | no    | listed       |
| `dev toolkits`                  | dev  | `ts/packages/cli/src/commands/toolkits/toolkits.cmd.ts`                                   |       |                               | yes   | listed       |
| `dev toolkits info`             | dev  | `ts/packages/cli/src/commands/toolkits/info/toolkits.info.cmd.ts`                         |       |                               | yes   | listed       |
| `dev toolkits list`             | dev  | `ts/packages/cli/src/commands/toolkits/list/toolkits.list.cmd.ts`                         |       |                               | yes   | listed       |
| `dev toolkits search`           | dev  | `ts/packages/cli/src/commands/toolkits/search/toolkits.search.cmd.ts`                     |       |                               | yes   | listed       |
| `dev toolkits version`          | dev  | `ts/packages/cli/src/commands/toolkits/version/toolkits.version.cmd.ts`                   |       |                               | yes   | listed       |
| `dev triggers`                  | dev  | `ts/packages/cli/src/commands/triggers/triggers.cmd.ts`                                   |       |                               | yes   | listed       |
| `dev triggers create`           | dev  | `ts/packages/cli/src/commands/triggers/create/triggers.create.cmd.ts`                     |       |                               | yes   | listed       |
| `dev triggers disable`          | dev  | `ts/packages/cli/src/commands/triggers/disable/triggers.disable.cmd.ts`                   |       |                               | yes   | listed       |
| `dev triggers enable`           | dev  | `ts/packages/cli/src/commands/triggers/enable/triggers.enable.cmd.ts`                     |       |                               | yes   | listed       |
| `dev triggers info`             | dev  | `ts/packages/cli/src/commands/triggers/info/triggers.info.cmd.ts`                         |       | `triggers info`               | yes   | listed       |
| `dev triggers list`             | dev  | `ts/packages/cli/src/commands/triggers/list/triggers.list.cmd.ts`                         |       | `triggers list`               | yes   | listed       |
| `dev triggers listen`           | dev  | `ts/packages/cli/src/commands/triggers/commands/triggers.listen.cmd.ts`                   |       | `dev listen`                  | yes   | listed       |
| `dev triggers status`           | dev  | `ts/packages/cli/src/commands/triggers/status/triggers.status.cmd.ts`                     |       |                               | yes   | listed       |
| `execute`                       | root | `ts/packages/cli/src/commands/tools/commands/tools.execute.cmd.ts`                        |       |                               | yes   | listed       |
| `generate`                      | root | `ts/packages/cli/src/commands/generate/generate.cmd.ts`                                   |       |                               | no    | listed       |
| `generate py`                   | root | `ts/packages/cli/src/commands/generate/py/generate.py.cmd.ts`                             |       |                               | no    | listed       |
| `generate ts`                   | root | `ts/packages/cli/src/commands/generate/ts/generate.ts.cmd.ts`                             |       |                               | no    | listed       |
| `help`                          | root | `ts/packages/cli/src/commands/root-help.ts`                                               |       |                               | no    | listed       |
| `install`                       | root | `ts/packages/cli/src/commands/install/install.cmd.ts`                                     |       |                               | no    | listed       |
| `link`                          | root | `ts/packages/cli/src/commands/connected-accounts/link/connected-accounts.link.cmd.ts`     |       | `dev connected-accounts link` | yes   | listed       |
| `listen`                        | root | `ts/packages/cli/src/commands/listen.cmd.ts`                                              |       |                               | yes   | experimental |
| `login`                         | root | `ts/packages/cli/src/commands/login/login.cmd.ts`                                         |       |                               | no    | listed       |
| `logout`                        | root | `ts/packages/cli/src/commands/logout.cmd.ts`                                              |       |                               | no    | listed       |
| `orgs`                          | root | `ts/packages/cli/src/commands/orgs/orgs.cmd.ts`                                           |       |                               | yes   | listed       |
| `orgs list`                     | root | `ts/packages/cli/src/commands/orgs/list/orgs.list.cmd.ts`                                 |       |                               | yes   | listed       |
| `orgs switch`                   | root | `ts/packages/cli/src/commands/orgs/switch/orgs.switch.cmd.ts`                             |       |                               | yes   | listed       |
| `proxy`                         | root | `ts/packages/cli/src/commands/proxy.cmd.ts`                                               |       |                               | yes   | listed       |
| `run`                           | root | `ts/packages/cli/src/commands/run/run.cmd.ts`                                             |       |                               | no    | listed       |
| `search`                        | root | `ts/packages/cli/src/commands/tools/search/tools.search.cmd.ts`                           |       |                               | yes   | listed       |
| `setup`                         | root | `ts/packages/cli/src/commands/setup.cmd.ts`                                               |       |                               | no    | listed       |
| `setup skill`                   | root | `ts/packages/cli/src/commands/setup-skill.cmd.ts`                                         |       |                               | no    | listed       |
| `signup`                        | root | `ts/packages/cli/src/commands/signup/signup.cmd.ts`                                       |       |                               | no    | listed       |
| `tools`                         | root | `ts/packages/cli/src/commands/tools/tools.cmd.ts`                                         |       |                               | yes   | listed       |
| `tools info`                    | root | `ts/packages/cli/src/commands/tools/info/tools.info.cmd.ts`                               |       |                               | yes   | listed       |
| `tools list`                    | root | `ts/packages/cli/src/commands/tools/list/tools.list.cmd.ts`                               |       |                               | yes   | listed       |
| `triggers`                      | root | `ts/packages/cli/src/commands/triggers/root-triggers.cmd.ts`                              |       |                               | yes   | listed       |
| `triggers info`                 | root | `ts/packages/cli/src/commands/triggers/info/triggers.info.cmd.ts`                         |       | `dev triggers info`           | yes   | listed       |
| `triggers list`                 | root | `ts/packages/cli/src/commands/triggers/list/triggers.list.cmd.ts`                         |       | `dev triggers list`           | yes   | listed       |
| `upgrade`                       | root | `ts/packages/cli/src/commands/upgrade/upgrade.cmd.ts`                                     |       |                               | no    | listed       |
| `version`                       | root | `ts/packages/cli/src/commands/version.cmd.ts`                                             |       |                               | no    | listed       |
| `whoami`                        | root | `ts/packages/cli/src/commands/whoami.cmd.ts`                                              |       |                               | no    | listed       |
