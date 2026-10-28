export const LOWER_THIRD_SOURCE_NAME = 'FTC Lower Third';

// The lower-third graphic is served next to this dashboard.
export const lowerThirdUrl = (params: Record<string, string>) => {
  const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== '')).toString();
  return `${window.location.origin}/lower-third.html${query ? `?${query}` : ''}`;
};
