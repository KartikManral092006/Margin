import { roomErrorMessage } from "@/features/lectures/shared/messages";

// Server-rendered, so the error from /open (?error=invalid_url) also shows without JS.
export async function PasteError({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = (await searchParams).error;
  const message = roomErrorMessage(Array.isArray(raw) ? raw[0] : raw);
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-destructive">
      {message}
    </p>
  );
}
