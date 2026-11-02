import { describe, expect, it } from "vitest";
import { renderMagicLinkEmail } from "@/features/auth/server/magic-link-email";

const url = 'http://localhost:3000/api/auth/magic-link/verify?token=t&callbackURL=/home"<x>';

describe("renderMagicLinkEmail", () => {
  it("escapes the link in the HTML body", () => {
    const { html } = renderMagicLinkEmail({ url, expiresInMinutes: 10 });
    expect(html).not.toContain('"<x>');
    expect(html).toContain("token=t&amp;callbackURL=/home&quot;&lt;x&gt;");
  });

  it("keeps the raw link in the text body", () => {
    const { text, subject } = renderMagicLinkEmail({ url, expiresInMinutes: 10 });
    expect(text).toContain(url);
    expect(text).toContain("10 minutes");
    expect(subject).toBe("Sign in to Margin");
  });
});
