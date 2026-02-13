export function getSlugFromHost(hostHeader: string): string {
  const host = (hostHeader || "").split(":")[0].toLowerCase(); // strip port

  // Local dev
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1"
  ) {
    return "demo";
  }

  // Vercel preview/prod default domain
  if (host.endsWith(".vercel.app")) {
    return "demo";
  }

  // edge-lab.uk subdomains
  // e.g. demo.edge-lab.uk
  // e.g. anytime.edge-lab.uk
  const parts = host.split(".");
  const sub = parts[0] || "demo";

  // staging should behave like demo
  if (sub === "staging") {
    return "demo";
  }

  return sub;
}