import { ExecuteToolModifiers } from "@composio/core";
import ora from 'ora';
let spinner = ora();

export const modifiers: ExecuteToolModifiers = {
  beforeExecute: ({ toolSlug, params }) => {
    spinner = ora();
    spinner.start(`Executing ${toolSlug}`);
    return params;
  },
  afterExecute: ({ toolSlug, result }) => {
    spinner.succeed(`Executed ${toolSlug}`);
    return result;
  },
};