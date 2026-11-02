const MAX_NAME_LENGTH = 64;

// Name shown to other people in chat. Never falls back to the email address.
export function nexconnDisplayName(input: { name: string; nexconnUserId: string }): string {
  const collapsed = input.name.replace(/\s+/g, " ").trim();
  if (collapsed.length > 0) return Array.from(collapsed).slice(0, MAX_NAME_LENGTH).join("").trim();
  return `Learner ${input.nexconnUserId.slice(-4).toUpperCase()}`;
}
