export function getSlugFromHost(host: string): string {
  const h = (host || "").toLowerCase();
  // examples:
  // anytime.localhost:3000 -> anytime
  // nuco.edge-lab.uk -> nuco
  const first = h.split(".")[0] || "";
  return first;
}