import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
      <form className="flex flex-col gap-2 sm:flex-row" aria-label="Open a lecture room">
        <label htmlFor="lecture-url" className="sr-only">
          YouTube lecture link
        </label>
        <Input
          id="lecture-url"
          type="url"
          placeholder="https://www.youtube.com/watch?v=…"
          disabled
          className="h-11"
        />
        <Button type="submit" size="lg" disabled className="h-11">
          Open room
        </Button>
      </form>
      <p className="text-sm text-muted-foreground">
        Lecture rooms are coming soon.{" "}
        <Link href="/sign-in" className="font-medium text-foreground underline underline-offset-4">
          Sign in
        </Link>
      </p>
    </main>
  );
}
