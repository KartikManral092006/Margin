"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { createLectureAction, type CreateRoomState } from "@/features/lectures/server/actions";

const INITIAL: CreateRoomState = { error: null };

export function CreateRoomForm({
  videoId,
  startSec,
}: {
  videoId: string;
  startSec: number | null;
}) {
  const [state, action, pending] = useActionState(createLectureAction, INITIAL);
  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="v" value={videoId} />
      {startSec ? <input type="hidden" name="t" value={startSec} /> : null}
      <Button type="submit" className="h-11 w-full" disabled={pending}>
        {pending ? "Opening room…" : "Open the room"}
      </Button>
      <p aria-live="polite" className="min-h-5 text-sm text-destructive">
        {state.error}
      </p>
    </form>
  );
}
