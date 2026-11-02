import { Button } from "@/components/ui/button";
import { signOutAction } from "@/features/auth/server/actions";

// A plain form posting to a server action, so it works before hydration and without JS.
export function SignOutButton() {
  return (
    <form action={signOutAction}>
      <Button type="submit" variant="outline" className="h-11 w-full sm:w-auto">
        Sign out
      </Button>
    </form>
  );
}
