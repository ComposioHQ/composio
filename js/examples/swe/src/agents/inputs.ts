import * as fs from 'fs';
import * as path from 'path';
import * as readline from 'readline';
import { ComposioToolSet } from "composio-core/lib/sdk/base.toolset";


type InputType = any;

function readUserInput(
  prompt: string,
  metavar: string,
  validator: (value: string) => InputType
): InputType {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise<InputType>((resolve, reject) => {
    rl.question(`${prompt} > `, (value) => {
      try {
        const validatedValue = validator(value);
        rl.close();
        resolve(validatedValue);
      } catch (e) {
        console.error(`Invalid value for \`${metavar}\` error parsing \`${value}\`; ${e}`);
        rl.close();
        reject(e);
      }
    });
  });
}

function githubRepositoryNameValidator(name: string): [string, string] {
  if (name.includes(' ')) {
    throw new Error();
  }
  const [owner, repoName] = name.split('/');
  return [owner, repoName];
}

function createGithubIssueValidator(owner: string, name: string, toolset: ComposioToolSet) {
  return async function githubIssueValidator(value: string): Promise<string> {
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
    githubRepositoryNameValidator
  );
  const repo = `${owner}/${name}`;
  const issue = await readUserInput(
    'Enter github issue ID or description or path to the file containing description',
    'github issue',
    createGithubIssueValidator(owner, name, toolset)
  );
  return { repo, issue };
}

