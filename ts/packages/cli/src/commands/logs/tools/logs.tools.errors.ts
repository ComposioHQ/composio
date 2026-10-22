import { requestError } from 'src/effects/request-error';

export class ToolLogsRequestError extends requestError('commands/ToolLogsRequestError') {}
