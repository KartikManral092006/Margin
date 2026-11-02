"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { roomErrorMessage } from "@/features/lectures/shared/messages";
import { parseYouTubeUrl } from "@/features/lectures/shared/youtube";

// A plain GET form to /open, so it also works before hydration and without JS. `from` tells
// /open where to send an invalid link back to; the page renders that error on the server.
export function PasteForm({ autoFocus = false, from }: { autoFocus?: boolean; from?: "home" }) {
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
      {from ? <input type="hidden" name="from" value={from} /> : null}
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
