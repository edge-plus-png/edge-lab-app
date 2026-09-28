"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import type { Booking, Route, Setup, Snapshot } from "@/lib/pay-lab/contract";
import "./collection.css";
type Settings = {
  name: string;
  routes: Route[];
  staffCollectionConfigured: boolean;
  callbackUrl: string;
  returnUrls: string[];
  sample: {
    reference: string;
    amount: string;
    currency: string;
    sessionSeconds: number;
  };
  providerTestModeConfirmed: boolean;
};
type Saved = {
  id: string;
  booking: Booking;
  route: Route | null;
  snapshot: Snapshot | null;
  checkoutUrl: string | null;
  collection: { staffUrl: string; embedUrl: string | null } | null;
  callbackCount: number;
  submissionUncertain: boolean;
};
type Collect = {
  configure: (value: object) => void;
  startPaymentRequest: () => void;
};
declare global {
  interface Window {
    CollectJS?: Collect;
  }
}
async function api(path: string, body?: object) {
  const r = await fetch(`/api/pay-lab/${path}`, {
    method: body ? "POST" : "GET",
    cache: "no-store",
    headers: body ? { "Content-Type": "application/json" } : {},
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || "Unable to confirm the operation.");
  return data;
}
function PhoneFields({
  id,
  setup,
  scriptUrl,
  onResult,
  onError,
}: {
  id: string;
  setup: Setup;
  scriptUrl: string;
  onResult: (v: Saved) => void;
  onError: (v: string) => void;
}) {
  const [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false);
  const [details, setDetails] = useState<Record<string, string>>({});
  useEffect(() => {
    let active = true;
    const script = document.createElement("script");
    script.src = scriptUrl;
    script.dataset.tokenizationKey = setup.tokenizationKey;
    script.dataset.variant = "inline";
    script.async = true;
    script.onload = () => {
      if (!active) return;
      window.CollectJS?.configure({
        variant: "inline",
        fields: {
          ccnumber: { selector: "#phone-number", title: "Card number" },
          ccexp: { selector: "#phone-expiry", title: "Expiry" },
          cvv: { selector: "#phone-cvv", title: "Security code" },
        },
        fieldsAvailableCallback: () => {
          if (active) setReady(true);
        },
        validationCallback: (
          _field: string,
          valid: boolean,
          message: string,
        ) => {
          if (active && !valid) {
            setBusy(false);
            onError(message || "Check the secure card fields.");
          }
        },
        timeoutDuration: 15000,
        timeoutCallback: () => {
          if (active) {
            setBusy(false);
            onError(
              "Card tokenization timed out. No payment result has been confirmed.",
            );
          }
        },
        callback: async (response: { token?: string }) => {
          if (!active) return;
          if (!response.token) {
            setBusy(false);
            onError("The card fields did not return a token.");
            return;
          }
          const form = document.getElementById("phone-form") as HTMLFormElement;
          const values = Object.fromEntries(new FormData(form));
          try {
            onResult(
              await api(`bookings/${id}/pay`, {
                paymentToken: response.token,
                ...values,
              }),
            );
          } catch (e) {
            onError((e as Error).message);
          } finally {
            if (active) setBusy(false);
          }
        },
      });
    };
    script.onerror = () => onError("Secure card fields could not load.");
    document.head.append(script);
    return () => {
      active = false;
      script.remove();
    };
  }, [id, setup, scriptUrl, onResult, onError]);
  return (
    <form
      id="phone-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready && !busy) {
          setBusy(true);
          window.CollectJS?.startPaymentRequest();
        }
      }}
    >
      <h2>Take telephone payment</h2>
      <p>
        Secure provider fields. The payment amount and reference come from the
        saved booking.
      </p>
      <label>
        Card number
        <div id="phone-number" className="secure-field" />
      </label>
      <div className="lab-grid">
        <label>
          Expiry
          <div id="phone-expiry" className="secure-field" />
        </label>
        <label>
          Security code
          <div id="phone-cvv" className="secure-field" />
        </label>
      </div>
      {Object.entries(setup.fields)
        .filter(([, policy]) => policy !== "hidden")
        .map(([key, policy]) => (
          <label key={key}>
            {
              (
                {
                  customerName: "Customer name",
                  email: "Email",
                  billingPostcode: "Billing postcode",
                } as Record<string, string>
              )[key]
            }
            {policy === "optional" ? " (optional)" : ""}
            <input
              name={key}
              required={policy === "required"}
              value={details[key] || ""}
              onChange={(e) =>
                setDetails({ ...details, [key]: e.target.value })
              }
            />
          </label>
        ))}
      <button disabled={!ready || busy}>
        {busy
          ? "Checking payment…"
          : ready
            ? "Submit telephone payment"
            : "Loading secure fields…"}
      </button>
    </form>
  );
}
export default function CollectionLab() {
  const [config, setConfig] = useState<Settings | null>(null),
    [mode, setMode] = useState<"customer" | "staff">("staff"),
    [draft, setDraft] = useState<Booking | null>(null),
    [saved, setSaved] = useState<Saved | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [routeRef, setRouteRef] = useState(""),
    [phone, setPhone] = useState<{ setup: Setup; scriptUrl: string } | null>(
      null,
    ),
    [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    api("settings")
      .then(async (c) => {
        if (!active) return;
        setConfig(c);
        const prior = new URLSearchParams(location.search).get("booking");
        if (prior) {
          setSaved(await api(`bookings/${encodeURIComponent(prior)}`));
          return;
        }
        const stored = sessionStorage.getItem("pay-lab-draft");
        setDraft(
          stored
            ? JSON.parse(stored)
            : {
                id: crypto.randomUUID(),
                reference: c.sample.reference,
                amount: c.sample.amount,
                currency: c.sample.currency,
                expiresAt: new Date(
                  Date.now() + c.sample.sessionSeconds * 1000,
                ).toISOString(),
              },
        );
      })
      .catch((e) => active && setError(e.message));
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (draft) sessionStorage.setItem("pay-lab-draft", JSON.stringify(draft));
  }, [draft]);
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function save() {
    if (!draft) return;
    await action(async () => {
      const result = await api("bookings", draft);
      setSaved(result);
      history.replaceState(null, "", `/collect?booking=${result.id}`);
      if (mode === "customer") {
        if (!routeRef) throw Error("Select an online payment route.");
        const launched = await api(`bookings/${result.id}/launch`, {
          routeRef,
        });
        setSaved(launched);
        if (launched.checkoutUrl) location.assign(launched.checkoutUrl);
      }
    });
  }
  async function launch(route: Route) {
    if (!saved) return;
    await action(async () => {
      setPhone(null);
      const value = await api(`bookings/${saved.id}/launch`, {
        routeRef: route.ref,
      });
      setSaved(value);
      if (route.channel === "MOTO")
        setPhone(await api(`bookings/${saved.id}/setup`, {}));
    });
  }
  const allowed =
    config?.routes.filter(
      (r) => r.currency === (saved?.booking.currency || draft?.currency),
    ) || [];
  const state = saved?.snapshot?.paymentState;
  const activePayment =
    !!saved?.snapshot &&
    ["awaiting", "declined"].includes(saved.snapshot.paymentState) &&
    saved.snapshot.sessionState === "open" &&
    Date.parse(saved.snapshot.expiresAt) > Date.now();
  return (
    <main className="pay-lab">
      <header>
        <Link href="/" aria-label="Existing customer checkout">
          <Image
            src="/edge-lab-logo.png"
            alt="edge lab"
            width={132}
            height={56}
          />
        </Link>
        <span>GETEDGE PAY · STAGING LAB</span>
      </header>
      <section className="lab-intro">
        <p className="eyebrow">{config?.name || "Partner integration"}</p>
        <h1>
          One booking.
          <br />
          The right way to pay.
        </h1>
        <p>
          Prove customer checkout and staff collection with the same saved
          reference and a verified payment result.
        </p>
        <Link href="/">Open existing customer checkout ↗</Link>
      </section>
      {error && (
        <div className="lab-error" role="alert">
          {error}
          <button className="secondary" onClick={() => location.reload()}>
            Reload saved request
          </button>
        </div>
      )}
      {!config && !error && (
        <p role="status">Checking the staging connection…</p>
      )}
      {config && (
        <>
          <aside className="lab-connection">
            <strong>{config.name}</strong>
            <span>
              Connection authenticated ·{" "}
              {config.providerTestModeConfirmed
                ? "Provider test mode confirmed in server configuration"
                : "Provider test mode requires confirmation"}
            </span>
            <details>
              <summary>Result delivery and browser return</summary>
              <p>
                <b>Result callback:</b> {config.callbackUrl}
              </p>
              <p>
                GetEdge Pay sends signed results here. This is separate from the
                browser return. A successful connection check is not payment
                acceptance.
              </p>
            </details>
          </aside>
          {!saved && draft && (
            <section className="lab-card">
              <div className="lab-tabs" role="group" aria-label="Journey">
                <button
                  aria-pressed={mode === "customer"}
                  className={mode === "customer" ? "" : "secondary"}
                  onClick={() => {
                    setMode("customer");
                    setRouteRef("");
                  }}
                >
                  Customer checkout
                </button>
                <button
                  aria-pressed={mode === "staff"}
                  className={mode === "staff" ? "" : "secondary"}
                  onClick={() => setMode("staff")}
                >
                  Staff collection
                </button>
              </div>
              <h2>
                {mode === "staff"
                  ? "Prepare a booking payment"
                  : "Customer pays online"}
              </h2>
              <p>
                {mode === "staff"
                  ? "Enter the outstanding amount, then choose a payment link or telephone payment."
                  : "Continue directly to hosted customer checkout. No staff collection menu."}
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void save();
                }}
              >
                <label>
                  Booking / order reference
                  <input
                    required
                    maxLength={200}
                    value={draft.reference}
                    onChange={(e) =>
                      setDraft({ ...draft, reference: e.target.value })
                    }
                  />
                </label>
                <div className="lab-grid">
                  <label>
                    Amount
                    <input
                      required
                      inputMode="decimal"
                      pattern="[0-9]+(\.[0-9]{1,2})?"
                      value={draft.amount}
                      onChange={(e) =>
                        setDraft({ ...draft, amount: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Currency
                    <select
                      value={draft.currency}
                      onChange={(e) => {
                        setDraft({ ...draft, currency: e.target.value });
                        setRouteRef("");
                      }}
                    >
                      {Array.from(
                        new Set(config.routes.map((r) => r.currency)),
                      ).map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Payment expiry (UTC)
                  <input
                    required
                    value={draft.expiresAt}
                    onChange={(e) =>
                      setDraft({ ...draft, expiresAt: e.target.value })
                    }
                  />
                </label>
                <label>
                  Description (optional)
                  <input
                    maxLength={500}
                    value={draft.description || ""}
                    onChange={(e) =>
                      setDraft({ ...draft, description: e.target.value })
                    }
                  />
                </label>
                <label>
                  Browser return (optional)
                  <select
                    value={draft.returnUrl || ""}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        returnUrl: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">Remain on the payment result page</option>
                    {config.returnUrls.map((url) => (
                      <option key={url}>{url}</option>
                    ))}
                  </select>
                </label>
                <details>
                  <summary>Supplied customer details (optional)</summary>
                  <p>
                    Reuse genuine booking details. No placeholder names or
                    billing addresses are added.
                  </p>
                  {(["firstName", "lastName", "email"] as const).map((key) => (
                    <label key={key}>
                      {
                        {
                          firstName: "First name",
                          lastName: "Last name",
                          email: "Email",
                        }[key]
                      }
                      <input
                        type={key === "email" ? "email" : "text"}
                        value={draft.customer?.[key] || ""}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            customer: {
                              ...draft.customer,
                              [key]: e.target.value,
                            },
                          })
                        }
                      />
                    </label>
                  ))}
                </details>
                {mode === "customer" && (
                  <label>
                    Online payment route
                    <select
                      required
                      value={routeRef}
                      onChange={(e) => setRouteRef(e.target.value)}
                    >
                      <option value="">Select the configured route</option>
                      {allowed
                        .filter((r) => r.channel === "ECOM")
                        .map((r) => (
                          <option key={r.ref} value={r.ref}>
                            {r.label}
                          </option>
                        ))}
                    </select>
                  </label>
                )}
                <button disabled={busy || !config.providerTestModeConfirmed}>
                  {busy
                    ? "Saving request…"
                    : mode === "staff"
                      ? "Continue to collection"
                      : "Pay now — hosted checkout"}
                </button>
              </form>
            </section>
          )}
          {saved && (
            <section className="lab-card">
              <p className="eyebrow">{saved.booking.reference}</p>
              <h2>
                {saved.booking.amount} {saved.booking.currency}
              </h2>
              <p>
                Expiry: {new Date(saved.booking.expiresAt).toLocaleString()}
              </p>
              <div className="lab-status">
                <b>
                  {state
                    ? state === "approved"
                      ? "Payment approved"
                      : `Payment ${state}`
                    : "Ready to collect"}
                </b>
                <span>
                  {saved.snapshot
                    ? "Verified GetEdge Pay state"
                    : "No payment has been taken"}
                </span>
              </div>
              {config.staffCollectionConfigured && !saved.collection && !saved.route && <button disabled={busy} onClick={() => void action(async () => { setSaved(await api(`bookings/${saved.id}/collection`, {})); })}>Prepare hosted staff collection</button>}
              {saved.collection && <section><h3>GetEdge Pay staff collection</h3><p><a href={saved.collection.staffUrl} target="_blank" rel="noreferrer">Open secure staff collection</a></p>{saved.collection.embedUrl && <iframe title="GetEdge Pay staff collection" src={saved.collection.embedUrl} referrerPolicy="no-referrer" style={{width:"100%",height:760,border:0}} />}</section>}
              {!config.staffCollectionConfigured && !saved.route && (
                <>
                  <h3>How would you like to collect payment?</h3>
                  <div className="lab-choices">
                    {allowed.map((route) => (
                      <button
                        className="secondary"
                        disabled={busy}
                        key={route.ref}
                        onClick={() => void launch(route)}
                      >
                        <strong>
                          {route.channel === "MOTO"
                            ? "Take payment by phone"
                            : "Create payment link"}
                        </strong>
                        <span>{route.label}</span>
                      </button>
                    ))}
                  </div>
                </>
              )}
              {saved.route && !saved.snapshot && (
                <button
                  disabled={busy}
                  onClick={() => void launch(saved.route!)}
                >
                  Recover payment creation
                </button>
              )}
              {saved.checkoutUrl && activePayment && (
                <div className="lab-link">
                  <h3>Customer payment link</h3>
                  <p>
                    Creating or copying this link does not mark the booking
                    paid.
                  </p>
                  <input
                    readOnly
                    aria-label="Customer payment link"
                    value={saved.checkoutUrl}
                  />
                  <div className="lab-actions">
                    <button
                      onClick={() =>
                        void navigator.clipboard
                          .writeText(saved.checkoutUrl!)
                          .then(() => setCopied(true))
                          .catch(() =>
                            setError(
                              "Copy was unavailable. Select and copy the link above.",
                            ),
                          )
                      }
                    >
                      {copied ? "Copied" : "Copy payment link"}
                    </button>
                    <a
                      href={saved.checkoutUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open customer checkout ↗
                    </a>
                  </div>
                </div>
              )}
              {saved.route?.channel === "MOTO" && activePayment && !phone && (
                <button
                  disabled={busy}
                  onClick={() =>
                    void action(async () =>
                      setPhone(await api(`bookings/${saved.id}/setup`, {})),
                    )
                  }
                >
                  Open secure telephone fields
                </button>
              )}
              {phone && activePayment && (
                <PhoneFields
                  id={saved.id}
                  {...phone}
                  onResult={setSaved}
                  onError={setError}
                />
              )}
              <div className="lab-actions">
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void action(async () => {
                      setPhone(null);
                      setSaved(await api(`bookings/${saved.id}/status`, {}));
                    })
                  }
                >
                  Check saved payment status
                </button>
              </div>
              <p>
                {saved.callbackCount
                  ? `${saved.callbackCount} distinct signed result notification(s) received by this lab.`
                  : "No signed result notification recorded by this lab. If Anytime is the configured callback receiver, check acknowledgement there."}
              </p>
              {saved.submissionUncertain &&
                state !== "approved" &&
                state !== "declined" && (
                  <p role="status">
                    A telephone attempt was dispatched. Resolve its saved
                    outcome before taking another payment.
                  </p>
                )}
              <details>
                <summary>Integration evidence</summary>
                <dl>
                  <dt>Lab request ID</dt>
                  <dd>{saved.id}</dd>
                  <dt>Pay session</dt>
                  <dd>{saved.snapshot?.sessionId || "Not yet confirmed"}</dd>
                  <dt>Provider reference</dt>
                  <dd>{saved.snapshot?.providerReference || "Not returned"}</dd>
                  <dt>Revision</dt>
                  <dd>{saved.snapshot?.revision || "—"}</dd>
                </dl>
                <p>
                  Browser return and notification acknowledgement are not
                  payment approval. The status above comes from verified service
                  messages.
                </p>
              </details>
              <a
                href="/collect"
                onClick={() => sessionStorage.removeItem("pay-lab-draft")}
              >
                Prepare a different booking
              </a>
            </section>
          )}
        </>
      )}
      <footer>
        Hosted customer checkout · Staff payment links · Secure telephone
        collection
        <br />
        Inline customer checkout is a separate acceptance step. This lab does
        not claim it is production-approved.
      </footer>
    </main>
  );
}
