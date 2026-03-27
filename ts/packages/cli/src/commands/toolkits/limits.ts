import { formatLimitDescription } from 'src/ui/clamp-limit';

export {
  CLI_LIMIT_MAX as TOOLKITS_LIMIT_MAX,
  CLI_LIMIT_MIN as TOOLKITS_LIMIT_MIN,
  formatInvalidLimitMessage as formatInvalidToolkitsLimitMessage,
  validateLimit as validateToolkitsLimit,
} from 'src/ui/clamp-limit';

export const TOOLKITS_LIMIT_DESCRIPTION = formatLimitDescription('Number of results per page');
