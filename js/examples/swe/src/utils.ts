import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { ComposioToolSet } from "composio-core/lib/sdk/base.toolset";
import { nanoid } from "nanoid";

type InputType = any;

function readUserInput(
  prompt: string,
  metavar: string,
  validator: (value: string) => InputType
): Promise<InputType> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise<InputType>((resolve, reject) => {
    rl.question(`${prompt} > `, (value) => {
      rl.close();
      try {
        const validatedValue = validator(value);
        resolve(validatedValue);
      } catch (e) {
        console.error(`Invalid value for \`${metavar}\`: error parsing \`${value}\`; ${e}`);
        reject(e);
      }
    });
  });
}

function githubRepositoryNameValidator(name: string): [string, string] {
  if (name.includes(' ')) throw new Error();
  return name.split('/') as [string, string]; // Ensures correct tuple type
}

function createGithubIssueValidator(owner: string, name: string, toolset: ComposioToolSet) {
  return async (value: string): Promise<string> => {
    const resolvedPath = path.resolve(value);
    if (fs.existsSync(resolvedPath)) {
      return fs.readFileSync(resolvedPath, 'utf-8');
    }

    if (/^\d+$/.test(value)) {
      const responseData = await toolset.executeAction('github_issues_get', {
        owner,
        repo: name,
        issue_number: parseInt(value, 10),
      });
      return responseData.body as string;
    }

    return value;
  };
}

export async function fromGithub(toolset: ComposioToolSet): Promise<{ repo: string; issue: string }> {
  const owner = await readUserInput(
    'Enter github repository owner',
    'github repository owner',
    (value: string) => value
  );
  const name = await readUserInput(
    'Enter github repository name',
    'github repository name',
    (value: string) => value
  );
  const repo = `${owner}/${name}`;
  const issue = await readUserInput(
    'Enter github issue ID or description or path to the file containing description',
    'github issue',
    createGithubIssueValidator(owner, name, toolset)
  );
  return { repo, issue };
}

export function getBranchNameFromIssue(issue: string): string {
  return `swe/${issue.toLowerCase().replace(/\s+/g, '-')}-${nanoid()}`;
}
