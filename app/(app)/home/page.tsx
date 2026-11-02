import type { Metadata } from "next";
import { connection } from "next/server";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { verifySession } from "@/features/auth/server/session";
import { env } from "@/lib/env";

export const instant = false;

export const metadata: Metadata = {
  title: "Home · Margin",
  robots: { index: false, follow: false },
};

export default async function HomePage() {
  await connection();
  const user = await verifySession("/home");

  return (
    <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-6 px-4 py-10">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold">Hi {user.name || "there"}</h1>
        <p className="text-sm break-all text-muted-foreground">{user.email}</p>
      </div>
      <p className="text-sm text-muted-foreground">
        You&apos;re signed in. Lecture rooms arrive next.
      </p>
      {env.NODE_ENV === "development" && (
        <p className="font-mono text-xs break-all text-muted-foreground">
          nexconnUserId: {user.nexconnUserId ?? "missing"}
        </p>
      )}
      <SignOutButton />
    </main>
  );
}
