import { SessionExecuteMetaModifiers } from "@composio/core";
import ora from 'ora';
let spinner = ora();

export const modifiers: SessionExecuteMetaModifiers = {
  beforeExecute: ({ toolSlug, params }) => {
    spinner = ora();
    spinner.start(`Executing ${toolSlug}`);
    console.log(JSON.stringify(params, null, 2));
    return params;
  },
  afterExecute: ({ toolSlug, result }) => {
    spinner.succeed(`Executed ${toolSlug}`);
    return result;
  },
};