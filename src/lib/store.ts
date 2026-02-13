export function isHttpsOrLocalhost(urlStr: string): boolean {
  try {
    const u = new URL(urlStr);
    if (u.hostname === "localhost") return true;
    return u.protocol === "https:";
  } catch {
    return false;
  }
}

function matchPattern(urlStr: string, pattern: string): boolean {
  // Supports:
  // https://staging.nuco.co.uk
  // https://*.nuco.co.uk
  // https://localhost:3000
  try {
    const u = new URL(urlStr);
    const p = new URL(pattern);

    if (u.protocol !== p.protocol) return false;
    if (p.port && u.port !== p.port) return false;

    const ph = p.hostname.toLowerCase();
    const uh = u.hostname.toLowerCase();

    if (ph.startsWith("*.")) {
      const base = ph.slice(2);
      if (uh === base) return false;
      if (!uh.endsWith(`.${base}`)) return false;
    } else {
      if (uh !== ph) return false;
    }

    if (p.pathname && p.pathname !== "/") {
      if (!u.pathname.startsWith(p.pathname)) return false;
    }

    return true;
  } catch {
    return false;
  }
}

export function validateReturnUrlOrThrow(returnUrl: string, allowlist: string[]) {
  if (!isHttpsOrLocalhost(returnUrl)) {
    throw new Error("Return URL must be HTTPS (localhost allowed).");
  }
  const ok = allowlist.length === 0 ? true : allowlist.some((pat) => matchPattern(returnUrl, pat));
  if (!ok) throw new Error("Return URL is not allow-listed for this client.");
}