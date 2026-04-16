export function validateAllowlistedUrlOrThrow(
  value: string,
  allowedPrefixes: string[],
  label = "URL"
) {
  let u: URL;
  try {
    u = new URL(value);
  } catch {
    throw new Error(`Invalid ${label} (must be a valid URL)`);
  }

  const isLocal =
    u.hostname === "localhost" ||
    u.hostname === "127.0.0.1" ||
    u.hostname.endsWith(".localhost");

  if (!isLocal && u.protocol !== "https:") {
    throw new Error(`${label} must be HTTPS (except localhost for development)`);
  }

  const ok = allowedPrefixes.some((p) => value.startsWith(p));
  if (!ok) throw new Error(`${label} is not allow-listed for this client`);
}

export function validateReturnUrlOrThrow(returnUrl: string, allowedPrefixes: string[]) {
  validateAllowlistedUrlOrThrow(returnUrl, allowedPrefixes, "returnUrl");
}
