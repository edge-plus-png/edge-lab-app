import { developerSource, developerChallenge, developerEvidence } from "@/lib/session-gateway/developer";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const source = developerSource(request.headers);
    if (!source) return developerChallenge();
    const id = new URL(request.url).searchParams.get("requestId") || undefined;
    if (id && !/^[a-f0-9-]{36}$/.test(id)) return Response.json({error:"Invalid request ID"},{status:400});
    return Response.json(await developerEvidence(source,id),{headers:{"Cache-Control":"no-store"}});
  } catch { return Response.json({error:"Developer evidence is unavailable. Contact GetEdge with your source ID."},{status:503}); }
}
