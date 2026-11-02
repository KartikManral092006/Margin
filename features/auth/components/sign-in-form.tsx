"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { authClient } from "@/features/auth/client/auth-client";
import { signInErrorMessage } from "@/features/auth/shared/errors";
import { SIGN_IN_PATH } from "@/features/auth/shared/routes";

type Status = "idle" | "sending" | "sent" | "redirecting";

type ClientError = { status?: number; code?: string } | null;

function describeError(error: ClientError, via: "email" | "google", google: boolean): string {
  const code =
    error?.status === 429
      ? via === "google"
        ? "RATE_LIMITED"
        : "TOO_MANY_REQUESTS"
      : (error?.code ?? "UNKNOWN");
  return signInErrorMessage(code, { google }) ?? "";
}

export function SignInForm(props: {
  callbackURL: string;
  googleEnabled: boolean;
  devEmailLog: boolean;
  initialError: string | null;
}) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(props.initialError);
  const busy = status === "sending" || status === "redirecting";

  // Back from Google restores this page from the back-forward cache with the old state,
  // which would leave the form disabled on "Opening Google…".
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) {
        setStatus((current) =>
          current === "redirecting" || current === "sending" ? "idle" : current,
        );
      }
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  async function sendLink(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // What the box shows: text typed before the page finished loading is in the field but not
    // yet in React state.
    const typed = new FormData(event.currentTarget).get("email");
    const address = (typeof typed === "string" ? typed : email).trim();
    setEmail(address);
    setError(null);
    setStatus("sending");
    try {
      const result = await authClient.signIn.magicLink({
        email: address,
        callbackURL: props.callbackURL,
        errorCallbackURL: SIGN_IN_PATH,
      });
      if (result.error) {
        setError(describeError(result.error, "email", props.googleEnabled));
        setStatus("idle");
        return;
      }
      setStatus("sent");
    } catch {
      setError(describeError(null, "email", props.googleEnabled));
      setStatus("idle");
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setStatus("redirecting");
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: props.callbackURL,
        errorCallbackURL: SIGN_IN_PATH,
      });
      if (result.error) {
        setError(describeError(result.error, "google", props.googleEnabled));
        setStatus("idle");
      }
    } catch {
      setError(describeError(null, "google", props.googleEnabled));
      setStatus("idle");
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          <h1 className="text-xl font-semibold">Sign in to Margin</h1>
        </CardTitle>
        <CardDescription>
          Ask doubts at the exact second of a lecture and see who else is there.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {status === "sent" ? (
          <div className="flex flex-col gap-3" role="status">
            <p className="text-sm">
              Check your inbox at <span className="font-medium break-all">{email.trim()}</span>. The
              link works once and expires in 10 minutes.
            </p>
            {props.devEmailLog && (
              <p className="text-sm text-muted-foreground">
                Development: the link is in the terminal running <code>pnpm dev</code>.
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              onClick={() => setStatus("idle")}
            >
              Use a different email
            </Button>
          </div>
        ) : (
          <form className="flex flex-col gap-3" onSubmit={sendLink}>
            <label htmlFor="email" className="text-sm font-medium">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              required
              maxLength={254}
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              className="h-11"
            />
            <Button type="submit" className="h-11 w-full" disabled={busy}>
              {status === "sending" ? "Sending link…" : "Email me a sign-in link"}
            </Button>
          </form>
        )}

        {props.googleEnabled && status !== "sent" && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <Button
              type="button"
              variant="outline"
              className="h-11 w-full"
              disabled={busy}
              onClick={signInWithGoogle}
            >
              {status === "redirecting" ? "Opening Google…" : "Continue with Google"}
            </Button>
          </>
        )}

        <p aria-live="polite" className="min-h-5 text-sm text-destructive">
          {error}
        </p>
      </CardContent>
    </Card>
  );
}
