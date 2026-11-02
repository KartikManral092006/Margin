import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { SignInForm } from "@/features/auth/components/sign-in-form";
import { AuthNotConfiguredError, googleEnabled } from "@/features/auth/server/auth";
import { getOptionalSession } from "@/features/auth/server/session";
import { signInErrorMessage } from "@/features/auth/shared/errors";
import { safeCallbackPath } from "@/features/auth/shared/routes";
import { env } from "@/lib/env";

export const instant = false;

export const metadata: Metadata = {
  title: "Sign in · Margin",
  robots: { index: false, follow: false },
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  await connection();
  const params = await searchParams;
  const callbackURL = safeCallbackPath(first(params.callbackURL));

  let signedIn = false;
  try {
    signedIn = (await getOptionalSession()) !== null;
  } catch (error) {
    if (!(error instanceof AuthNotConfiguredError)) throw error;
    return (
      <main className="flex min-h-dvh items-center justify-center px-4">
        <p className="max-w-sm text-center text-sm text-muted-foreground">
          {signInErrorMessage("AUTH_NOT_CONFIGURED")}
        </p>
      </main>
    );
  }
  if (signedIn) redirect(callbackURL);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <SignInForm
        callbackURL={callbackURL}
        googleEnabled={googleEnabled()}
        devEmailLog={env.NODE_ENV === "development" && !env.EMAIL_API_KEY}
        initialError={signInErrorMessage(first(params.error), { google: googleEnabled() })}
      />
    </main>
  );
}
