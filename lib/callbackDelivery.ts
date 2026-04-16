import { addCallbackLog } from "@/lib/callbackLog";
import { isArtisioTrackedCallbackUrl } from "@/lib/artisio";

type CallbackSource = "charge" | "return-url-test" | "result-resend";

type SendCallbackArgs = {
  slug: string;
  source: CallbackSource;
  returnUrl: string;
  payload: unknown;
  requestHost?: string;
  sessionId?: string;
};

function newId() {
  return crypto.randomUUID().replace(/-/g, "");
}

function shouldLogCallback(slug: string, returnUrl: string) {
  return slug === "artisio" && isArtisioTrackedCallbackUrl(returnUrl);
}

function logPrefix(source: CallbackSource) {
  return `[artisio-callback:${source}]`;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Callback delivery failed";
}

export async function sendCallback({
  slug,
  source,
  returnUrl,
  payload,
  requestHost = "",
  sessionId,
}: SendCallbackArgs) {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };

  // Permit server-side delivery to our internal webhook sink without
  // exposing sink token via query string.
  const sinkToken = process.env.EDGE_LAB_SINK_TOKEN || "";
  const u = new URL(returnUrl);
  const host = u.host.split(":")[0].toLowerCase();
  const expectedHost = requestHost.split(":")[0].toLowerCase();
  const isInternalSink = host === expectedHost && u.pathname === "/api/webhook-sink";
  if (isInternalSink && sinkToken) {
    headers["x-edge-lab-sink-token"] = sinkToken;
  }

  const body = JSON.stringify(payload);
  const shouldLog = shouldLogCallback(slug, returnUrl);

  if (shouldLog) {
    console.info(`${logPrefix(source)} request`, {
      sessionId,
      returnUrl,
      headers,
      body: payload,
    });
  }

  try {
    const response = await fetch(returnUrl, {
      method: "POST",
      headers,
      body,
    });

    const responseBody = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });

    if (shouldLog) {
      addCallbackLog({
        id: newId(),
        createdAt: Date.now(),
        slug,
        source,
        sessionId,
        returnUrl,
        request: {
          headers,
          body: payload,
        },
        response: {
          ok: response.ok,
          status: response.status,
          headers: responseHeaders,
          body: responseBody,
        },
      });

      console.info(`${logPrefix(source)} response`, {
        sessionId,
        returnUrl,
        status: response.status,
        ok: response.ok,
        body: responseBody,
      });
    }

    return {
      ok: response.ok,
      status: response.status,
      headers: responseHeaders,
      body: responseBody,
    };
  } catch (error: unknown) {
    const message = errorMessage(error);

    if (shouldLog) {
      addCallbackLog({
        id: newId(),
        createdAt: Date.now(),
        slug,
        source,
        sessionId,
        returnUrl,
        request: {
          headers,
          body: payload,
        },
        error: message,
      });

      console.warn(`${logPrefix(source)} error`, {
        sessionId,
        returnUrl,
        error: message,
      });
    }

    throw error;
  }
}
