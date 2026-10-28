# Composio CLI

The vocabulary of `@composio/cli`: who a command acts for, where it runs, and how one invocation ends.

## Command trees

**Root tree**:
The commands a Composio user runs directly (`composio execute`, `composio link`); they act on the user's consumer project.
_Avoid_: consumer mode, root mode

**Dev tree**:
The commands under `composio dev`, for developers building on Composio; they act on a developer project.
_Avoid_: developer mode, playground

**Command path**:
The command names of an invocation, without `composio`, flags, or arguments, e.g. `dev triggers list`.
_Avoid_: command name, command string

**Command registration**:
One place a command appears in the command tree; the same command can have several, each with its own command path (`link` and `dev connected-accounts link`).
_Avoid_: command instance

**Root shortcut**:
A root-tree command that reaches a command defined in a group, e.g. `search` for `tools search`.
_Avoid_: alias (reserved for a flag's or command's short name)

## Projects and users

**Consumer project**:
The project that holds a Composio user's own connections and executions, resolved from their login.

**Developer project**:
A project a developer builds against, chosen by the working directory or `--project-name`.

**Consumer user**:
The user id of the logged-in person within their consumer project; no flag overrides it.

**Test user**:
A user id a developer acts as on a developer project: the directory test user (from the directory's project setup) or the global test user (stored at login).
_Avoid_: playground user, default user

**Acting user**:
The user a command acts as: the consumer user on the root tree; on the dev tree, against the developer project, `--user-id` when given, otherwise the directory test user (only for the directory's own project), otherwise the global test user. A test user standing in is named on stderr; no user at all is a missing acting user, with one message per tree.
_Avoid_: current user, target user

**User filter**:
A `--user-id` that only narrows listed results and never falls back to a test user.

## Outcomes

**Invocation**:
One execution of the `composio` binary, from argv to exit code.
_Avoid_: run (that is the `composio run` command)

**Expected failure**:
A failure the user fixes by changing the invocation or their setup, or that a remote service reported clearly; the CLI prints its message and no defect report.
_Avoid_: usage error (a usage error is one kind)

**Defect**:
A failure that signals a bug in the CLI; the CLI prints a defect report.
