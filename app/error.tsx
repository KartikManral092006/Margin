"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";

// Covers every route group (for example a database outage while reading the session).
export default function ErrorPage({ retry }: { error: unknown; retry: () => void }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 py-10 text-center">
      <h1 className="text-xl font-semibold">Margin is having trouble right now</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Something went wrong on our side. Try again in a moment.
      </p>
      <div className="flex w-full max-w-xs flex-col gap-2 sm:flex-row">
        <Button className="h-11 flex-1" onClick={() => retry()}>
          Try again
        </Button>
        <Button asChild variant="outline" className="h-11 flex-1">
          <Link href="/">Home</Link>
        </Button>
      </div>
    </main>
  );
}
