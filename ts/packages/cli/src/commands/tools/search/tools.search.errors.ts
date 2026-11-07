import { requestError } from 'src/effects/request-error';

export class ToolsSearchRequestError extends requestError('commands/ToolsSearchRequestError') {}
