export const STAGING_BASE_URL = 'https://staging-backend.composio.dev';

// Resolves the backend the examples run against: whatever COMPOSIO_BASE_URL
// says, defaulting to staging. The structural checks are not about which
// backend it is — a base URL carrying a path, query, fragment, or embedded
// credentials means the caller meant something else, and the origin
// normalisation below only holds for a bare root.
export const resolveBackendBaseUrl = (
  value = process.env.COMPOSIO_BASE_URL ?? STAGING_BASE_URL
) => {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`refusing invalid COMPOSIO_BASE_URL: ${value}`);
  }

  const isBareHttpsRoot =
    url.protocol === 'https:' &&
    url.pathname === '/' &&
    !url.search &&
    !url.hash &&
    !url.username &&
    !url.password;
  if (!isBareHttpsRoot) {
    throw new Error(`refusing malformed COMPOSIO_BASE_URL: ${value}`);
  }

  return url.origin;
};
