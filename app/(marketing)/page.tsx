import Link from "next/link";
import { Suspense } from "react";
import { PasteError, PasteForm } from "@/features/lectures/components/paste-form";

export default function LandingPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-4 py-16">
      <div className="space-y-4">
        <p className="text-sm font-medium tracking-wide text-muted-foreground uppercase">Margin</p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
          Ask your doubt at the exact second you got lost.
        </h1>
        <p className="text-lg text-pretty text-muted-foreground">
          Paste a YouTube lecture. See every question pinned to its timestamp, who else is watching
          that moment, and answers from people who already got it.
        </p>
      </div>
      <div className="space-y-2">
        <PasteForm />
        <Suspense fallback={null}>
          <PasteError />
        </Suspense>
      </div>
      <p className="text-sm text-muted-foreground">
        The same video always opens the same room, so you meet everyone watching it.{" "}
        <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
