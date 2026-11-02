const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

export function renderMagicLinkEmail(input: { url: string; expiresInMinutes: number }): {
  subject: string;
  html: string;
  text: string;
} {
  const url = escapeHtml(input.url);
  const expiry = `This link expires in ${input.expiresInMinutes} minutes and works once.`;
  const ignore = "If you didn't ask to sign in, you can ignore this email.";

  return {
    subject: "Sign in to Margin",
    html: [
      `<p>Click the link below to sign in to Margin.</p>`,
      `<p><a href="${url}">Sign in to Margin</a></p>`,
      `<p>${expiry}</p>`,
      `<p>Or paste this address into your browser:<br>${url}</p>`,
      `<p>${ignore}</p>`,
    ].join("\n"),
    text: ["Sign in to Margin:", input.url, "", expiry, ignore].join("\n"),
  };
}
