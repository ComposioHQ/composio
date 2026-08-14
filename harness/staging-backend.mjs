export const STAGING_BASE_URL = 'https://staging-backend.composio.dev';

export const requireStagingBaseUrl = (
  value = process.env.COMPOSIO_BASE_URL ?? STAGING_BASE_URL
) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`refusing invalid COMPOSIO_BASE_URL: ${value}`);
  }

  const isStagingRoot =
    url.origin === STAGING_BASE_URL &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password;
  if (!isStagingRoot) {
    throw new Error(`refusing non-staging COMPOSIO_BASE_URL: ${value}`);
  }

  return STAGING_BASE_URL;
};
