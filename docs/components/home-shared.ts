/**
 * Bottom fade applied to the Welcome page's product mocks, so each one bleeds
 * into its card edge instead of stopping at a hard line. Shared by the
 * "Two ways to start" hero cards (`home-surfaces.tsx`) and the feature grid
 * (`home-features.tsx`) so the two sections fade identically.
 */
export const MOCK_FADE_STYLE = {
  maskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
  WebkitMaskImage: 'linear-gradient(to bottom, black 55%, transparent 100%)',
};
