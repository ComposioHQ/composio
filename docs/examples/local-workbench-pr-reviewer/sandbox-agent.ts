/**
 * In-sandbox reviewer agent.
 *
 * Runs inside the user's sandbox. The `run_python` tool writes small Python
 * cells that can call Composio through the SDK-provided local workbench helper
 * and run repo checks through subprocess.
 */
import { Agent, run, tool } from '@openai/agents';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { REVIEWER_INSTRUCTIONS } from './reviewer-instructions.js';

const REMOTE = process.env.AGENT_REMOTE_DIR || '/home/user/local-pr-reviewer';
const CELL_TIMEOUT_MS = 900_000;
const MAX_BUFFER_BYTES = 32 * 1024 * 1024;
const TASK = process.env.TASK || 'Review the pull request.';

type RunPythonInput = {
  note: string;
  code: string;
};

type ExecError = {
  status?: number;
  stdout?: string;
  stderr?: string;
};

let cellNumber = 0;

function nextCellFile(): string {
  cellNumber += 1;
  return `cell-${cellNumber}.py`;
}

function cellLabel(file: string): string {
  return file.replace('cell-', 'cell ').replace('.py', '');
}

function buildCellSource(code: string): string {
  return [
    'from composio_helper import run_composio_tool, invoke_llm, web_search',
    'import json',
    'import os',
    'import pathlib',
    'import shutil',
    'import subprocess',
    'import textwrap',
    '',
    'def run(cmd, cwd=None, timeout=900):',
    '    completed = subprocess.run(cmd, cwd=cwd, shell=True, text=True, capture_output=True, timeout=timeout)',
    '    output = (completed.stdout or "") + (completed.stderr or "")',
    '    print(output[-12000:])',
    '    return {"exit_code": completed.returncode, "output": output}',
    '',
    code,
    '',
  ].join('\n');
}

function summarizeFailure(error: ExecError): string {
  return (error.stderr || error.stdout || '').trim().split('\n').slice(-3).join(' | ').slice(-300);
}

function runCell(file: string): string {
  return execSync(`python3 ${file}`, {
    cwd: REMOTE,
    encoding: 'utf8',
    timeout: CELL_TIMEOUT_MS,
    maxBuffer: MAX_BUFFER_BYTES,
    shell: '/bin/bash',
  });
}

const runPython = tool({
  name: 'run_python',
  description:
    'Execute a Python cell in THIS sandbox. Pre-imported and in scope: ' +
    '`run_composio_tool(slug, arguments)` to call Composio tools, `invoke_llm(query)`, `web_search(query)`, ' +
    '`run(cmd, cwd=None, timeout=900)` for shell commands, and Python stdlib modules json/os/pathlib/shutil/subprocess/textwrap. ' +
    'Print anything you want to observe; stdout+stderr are returned to you.',
  parameters: {
    type: 'object',
    properties: {
      note: {
        type: 'string',
        description:
          'A short present-tense description of what this cell does, shown live to the user (<=10 words). ' +
          'e.g. "fetching PR #1 metadata", "downloading repo archive", "running node --test", "posting review comment".',
      },
      code: { type: 'string', description: 'Python to run. Do not include markdown fences.' },
    },
    required: ['note', 'code'],
    additionalProperties: false,
  },
  strict: true,
  execute: async (raw: unknown) => {
    const { note, code } = raw as RunPythonInput;
    const file = nextCellFile();

    console.log(`::event::step::${note} (${cellLabel(file)})`);
    writeFileSync(`${REMOTE}/${file}`, buildCellSource(code));

    try {
      return runCell(file);
    } catch (e: unknown) {
      const error = e as ExecError;
      console.log(`::event::error::${note} failed: ${summarizeFailure(error)}`);
      return `exit ${error.status}\n--- stdout ---\n${error.stdout ?? ''}\n--- stderr ---\n${error.stderr ?? ''}`;
    }
  },
});

const agent = new Agent({
  name: 'CI Reviewer',
  instructions: REVIEWER_INSTRUCTIONS,
  tools: [runPython],
});

const result = await run(agent, TASK, { maxTurns: 40 });
console.log('::result::' + JSON.stringify(result.finalOutput ?? '(no output)'));
