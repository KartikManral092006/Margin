import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";

export const E2E_DOMAIN = "e2e.test";
const LOG = ".e2e/dev.log";

export function e2eEmail(label: string): string {
  return `${label}.${Date.now()}@${E2E_DOMAIN}`;
}

// The dev server logs a magic link instead of emailing it. The log masks the address, so the
// newest link written after `since` (log length when the request was sent) is ours.
async function magicLinkAfter(since: number): Promise<string> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const tail = readFileSync(LOG, "utf8").slice(since);
    const links = [...tail.matchAll(/"magicLinkUrl":"([^"]+)"/g)].map((m) => m[1]);
    const link = links.at(-1);
    if (link) return link;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("No magic link was logged within 30 s");
}

export async function signIn(page: Page, email: string, callback = "/home") {
  await page.goto(`/sign-in?callbackURL=${encodeURIComponent(callback)}`);
  await page.getByLabel("Email").fill(email);
  const since = readFileSync(LOG, "utf8").length;
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Check your inbox")).toBeVisible();
  await page.goto(await magicLinkAfter(since));
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/sign-in"));
}

export async function noHorizontalScroll(page: Page) {
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
}
