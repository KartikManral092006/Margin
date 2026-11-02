"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roomErrorMessage } from "@/features/lectures/shared/messages";
import { parseYouTubeUrl } from "@/features/lectures/shared/youtube";

// A plain GET form to /open, so it also works before hydration and without JS.
export function PasteForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Back from the room restores this page from the back-forward cache, still "Opening…".
  useEffect(() => {
    function onPageShow(event: PageTransitionEvent) {
      if (event.persisted) setSubmitting(false);
    }
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    const url = new FormData(event.currentTarget).get("url");
    if (!parseYouTubeUrl(url)) {
      event.preventDefault();
      setError(roomErrorMessage("invalid_url"));
      return;
    }
    setError(null);
    setSubmitting(true);
  }

  return (
    <form
      method="get"
      action="/open"
      onSubmit={onSubmit}
      className="flex flex-col gap-2"
      aria-label="Open a lecture room"
    >
      <div className="flex flex-col gap-2 sm:flex-row">
        <label htmlFor="lecture-url" className="sr-only">
          YouTube lecture link
        </label>
        <Input
          id="lecture-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          autoFocus={autoFocus}
          required
          maxLength={2048}
          placeholder="https://www.youtube.com/watch?v=…"
          aria-invalid={error !== null}
          aria-describedby="lecture-url-error"
          onChange={() => setError(null)}
          className="h-11"
        />
        <Button type="submit" size="lg" className="h-11" disabled={submitting}>
          {submitting ? "Opening…" : "Open room"}
        </Button>
      </div>
      <p id="lecture-url-error" aria-live="polite" className="min-h-5 text-sm text-destructive">
        {error}
      </p>
    </form>
  );
}

// Shows ?error= set by /open when the form was submitted without JS. Needs a Suspense boundary.
export function PasteError() {
  const message = roomErrorMessage(useSearchParams().get("error"));
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
