import { Data } from 'effect';
import type {
  SessionExecuteMetaResponse,
  SessionExecuteResponse,
  SessionProxyExecuteResponse,
} from '@composio/client/resources/tool-router';

type ExecuteFamilyResponse =
  SessionExecuteResponse | SessionExecuteMetaResponse | SessionProxyExecuteResponse;

type InputRequiredResponse = Extract<ExecuteFamilyResponse, { result_type: 'input_required' }>;

/**
 * A tool execution or proxied call that did not run because it needs input
 * from the user first, for example an approval. The API answers such a call
 * with `result_type: "input_required"` instead of a result, and the CLI has no
 * flow to collect and submit the answers.
 */
export class ToolInputRequiredError extends Data.TaggedError('utils/ToolInputRequiredError')<{
  readonly message: string;
  readonly inputRequests: InputRequiredResponse['input_requests'];
  readonly requestState: string | undefined;
}> {}

/**
 * Builds the error for an `input_required` answer. `subject` names the call
 * that did not run, for example `Tool GMAIL_SEND_EMAIL`.
 */
export const toolInputRequiredError = (
  subject: string,
  response: Pick<InputRequiredResponse, 'input_requests' | 'request_state'>
): ToolInputRequiredError => {
  const count = Object.keys(response.input_requests).length;
  return new ToolInputRequiredError({
    message: `${subject} requires user input before it can run (${count} input request${count === 1 ? '' : 's'}) and was not executed. The CLI cannot answer input requests yet.`,
    inputRequests: response.input_requests,
    requestState: response.request_state,
  });
};

/**
 * Narrows an execute-family response to the variants that carry a result.
 *
 * @throws {ToolInputRequiredError} If the call asked for user input instead of running
 */
export function assertNotInputRequired<Response extends ExecuteFamilyResponse>(
  subject: string,
  response: Response
): asserts response is Exclude<Response, InputRequiredResponse> {
  if (response.result_type !== 'input_required') return;
  throw toolInputRequiredError(subject, response);
}
