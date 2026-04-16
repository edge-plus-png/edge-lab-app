export const ARTISIO_STAGING_CALLBACK_URL =
  "https://api.staging.artisio.co/api/v1/payments/online/paydough/webhook/";
export const ARTISIO_LIVE_CALLBACK_URL =
  "https://api.artisio.co/api/v1/payments/online/paydough/webhook/";

function normalizeUrl(url: string) {
  try {
    return new URL(url).toString();
  } catch {
    return url;
  }
}

export function isArtisioStagingCallbackUrl(url: string) {
  return normalizeUrl(url) === normalizeUrl(ARTISIO_STAGING_CALLBACK_URL);
}

export function isArtisioTrackedCallbackUrl(url: string) {
  const normalized = normalizeUrl(url);
  return (
    normalized === normalizeUrl(ARTISIO_STAGING_CALLBACK_URL) ||
    normalized === normalizeUrl(ARTISIO_LIVE_CALLBACK_URL)
  );
}
