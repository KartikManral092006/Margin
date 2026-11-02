import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MAGIC_LINK_VERIFY_PATH } from "@/features/auth/shared/magic-link";
import { SIGN_IN_PATH, safeCallbackPath } from "@/features/auth/shared/routes";

export const instant = false;

export const metadata: Metadata = {
  title: "Confirm sign-in · Margin",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

// The emailed link lands here. Spending the token needs a click on this page (a same-origin
// form submit), which link scanners and cross-site links cannot do.
export default async function ConfirmSignInPage({ searchParams }: PageProps<"/sign-in/confirm">) {
  await connection();
  const params = await searchParams;
  const token = first(params.token);
  const callbackURL = safeCallbackPath(first(params.callbackURL));
  const valid = typeof token === "string" && /^[A-Za-z0-9_-]{16,256}$/.test(token);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            <h1 className="text-xl font-semibold">Finish signing in</h1>
          </CardTitle>
          <CardDescription>
            {valid
              ? "Continue to sign in to Margin on this device. The link works once."
              : "This sign-in link is incomplete. Request a new one."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {valid ? (
            <form method="get" action={MAGIC_LINK_VERIFY_PATH}>
              <input type="hidden" name="token" value={token} />
              <input type="hidden" name="callbackURL" value={callbackURL} />
              <input type="hidden" name="errorCallbackURL" value={SIGN_IN_PATH} />
              <Button type="submit" className="h-11 w-full">
                Continue
              </Button>
            </form>
          ) : (
            <Button asChild variant="outline" className="h-11 w-full">
              <Link href={SIGN_IN_PATH}>Back to sign in</Link>
            </Button>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
