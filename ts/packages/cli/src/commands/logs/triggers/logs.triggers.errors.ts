import { requestError } from 'src/effects/request-error';

export class TriggerLogsRequestError extends requestError('commands/TriggerLogsRequestError') {}
