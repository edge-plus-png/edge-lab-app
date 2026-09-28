import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  authorized,
  getConfig,
  LabError,
  sameOrigin,
} from "@/lib/pay-lab/config";
import { getRecord, publicRecord } from "@/lib/pay-lab/db";
import {
  launch,
  launchCollection,
  operatorSetup,
  receive,
  refresh,
  saveBooking,
  settings,
  submit,
} from "@/lib/pay-lab/service";
import { readBounded } from "@/lib/pay-lab/transport";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
async function handle(
  req: NextRequest,
  { params }: { params: Promise<{ action: string[] }> },
) {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
  };
  try {
    const c = getConfig(req.headers.get("host"));
    const { action } = await params;
    if (action.join("/") === "callback" && req.method === "POST")
      return NextResponse.json(
        await receive(c, await readBounded(req), req.headers),
        { headers },
      );
    if (!authorized(c, req.headers))
      return NextResponse.json(
        { error: "Staff sign-in is required." },
        {
          status: 401,
          headers: {
            ...headers,
            "WWW-Authenticate":
              'Basic realm="GetEdge Pay staging lab", charset="UTF-8"',
          },
        },
      );
    if (action.join("/") === "settings" && req.method === "GET")
      return NextResponse.json(await settings(c), { headers });
    if (req.method === "POST") sameOrigin(req);
    if (action.join("/") === "bookings" && req.method === "POST")
      return NextResponse.json(
        await saveBooking(c, JSON.parse(await readBounded(req))),
        { headers },
      );
    if (action[0] !== "bookings" || action.length < 2 || action.length > 3)
      throw new LabError("Unknown operation.", 404);
    const id = z.uuid().parse(action[1]);
    if (action.length === 2 && req.method === "GET")
      return NextResponse.json(publicRecord(await getRecord(c.id, id)), {
        headers,
      });
    if (req.method !== "POST") throw new LabError("Method not allowed.", 405);
    const body = JSON.parse((await readBounded(req)) || "{}");
    let result;
    switch (action[2]) {
      case "collection":
        z.object({}).strict().parse(body);
        result = await launchCollection(c, id);
        break;
      case "launch":
        result = await launch(
          c,
          id,
          z
            .object({ routeRef: z.string().min(1) })
            .strict()
            .parse(body).routeRef,
        );
        break;
      case "status":
        result = await refresh(c, id);
        break;
      case "setup":
        result = await operatorSetup(c, id);
        break;
      case "pay":
        result = await submit(c, id, body);
        break;
      default:
        throw new LabError("Unknown operation.", 404);
    }
    return NextResponse.json(result, { headers });
  } catch (error) {
    const known = error instanceof LabError;
    const status = known
      ? error.status
      : error instanceof z.ZodError || error instanceof SyntaxError
        ? 400
        : 503;
    return NextResponse.json(
      {
        error: known
          ? error.message
          : status === 400
            ? "Invalid request. Check the required fields."
            : "The service could not confirm this operation. Keep this booking and check its saved status.",
      },
      { status, headers },
    );
  }
}
export const GET = handle;
export const POST = handle;
