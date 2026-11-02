import type { Metadata } from "next";
import { connection } from "next/server";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { verifySession } from "@/features/auth/server/session";
import { LectureList } from "@/features/lectures/components/lecture-list";
import { PasteForm } from "@/features/lectures/components/paste-form";
import { listPublicLectures, toSummary } from "@/features/lectures/server/lectures";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const instant = false;

export const metadata: Metadata = {
  title: "Home · Margin",
  robots: { index: false, follow: false },
};

export default async function HomePage() {
  await connection();
  const user = await verifySession("/home");
  const [recent, popular] = await Promise.all([
    listPublicLectures(db, { sort: "recent" }, 10),
    listPublicLectures(db, { sort: "popular" }, 10),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-4 py-10">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0 space-y-1">
          <h1 className="text-2xl font-semibold">Hi {user.name || "there"}</h1>
          <p className="truncate text-sm text-muted-foreground">{user.email}</p>
          {env.NODE_ENV === "development" && (
            <p className="font-mono text-xs break-all text-muted-foreground">
              nexconnUserId: {user.nexconnUserId ?? "missing"}
            </p>
          )}
        </div>
        <SignOutButton />
      </header>

      <section className="space-y-2">
        <h2 className="text-base font-semibold">Open a lecture</h2>
        <PasteForm />
      </section>

      <LectureList
        title="Recent rooms"
        lectures={recent.map(toSummary)}
        empty="No rooms yet. Paste a lecture link to open the first one."
      />
      {popular.length > 0 && (
        <LectureList title="Popular rooms" lectures={popular.map(toSummary)} empty="" />
      )}
    </main>
  );
}
