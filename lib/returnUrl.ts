export function validateReturnUrlOrThrow(returnUrl: string, allowedPrefixes: string[]) {
  let u: URL;
  try {
    u = new URL(returnUrl);
  } catch {
    throw new Error("Invalid returnUrl (must be a valid URL)");
  }

  const isLocal =
    u.hostname === "localhost" ||
    u.hostname === "127.0.0.1" ||
    u.hostname.endsWith(".localhost");

  if (!isLocal && u.protocol !== "https:") {
    throw new Error("returnUrl must be HTTPS (except localhost for development)");
  }

  const ok = allowedPrefixes.some((p) => returnUrl.startsWith(p));
  if (!ok) throw new Error("returnUrl is not allow-listed for this client");
}