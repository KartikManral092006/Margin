import { expect, test } from "@playwright/test";
import { e2eEmail, noHorizontalScroll, signIn } from "./helpers";

// Short public video ("Me at the zoo", 19 s); t=12 puts both viewers at 0:12.
const VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

test("sign in, open a room, ask a doubt; a second browser on a phone sees it at the right second", async ({
  browser,
}) => {
  // A: desktop. B: a 375 px phone viewport (the P0 gate's phone width).
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextB = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const a = await contextA.newPage();
  const b = await contextB.newPage();

  // A signs in and opens the room by pasting the link (the first paster confirms it).
  await signIn(a, e2eEmail("asker"));
  await a.getByLabel("YouTube lecture link").fill(VIDEO);
  await a.getByRole("button", { name: "Open room" }).click();
  await a.waitForURL(/\/lectures\/(new|[A-Za-z0-9]{32})/);
  if (a.url().includes("/lectures/new")) {
    await a.getByRole("button", { name: "Open the room" }).click();
  }
  await a.waitForURL(/\/lectures\/[A-Za-z0-9]{32}/);
  const roomUrl = new URL(a.url());
  roomUrl.search = "?t=12";
  await a.goto(roomUrl.toString());
  await expect(a.getByRole("heading", { level: 1 })).toContainText("Me at the zoo");

  // B signs in on the phone and lands straight in the same room.
  await signIn(b, e2eEmail("viewer"), `${roomUrl.pathname}?t=12`);
  await expect(b).toHaveURL(new RegExp(`${roomUrl.pathname}`));
  await expect(b.getByRole("heading", { level: 1 })).toContainText("Me at the zoo");
  await noHorizontalScroll(b);

  // A asks at 0:12 with the D shortcut (the player starts at t=12).
  await expect(a.getByLabel("Current video time")).toHaveText("0:12");
  await a.locator("body").press("d");
  await expect(a.getByText("Your doubt at")).toContainText("0:12");
  const doubt = `Why is the elephant facing away? (${Date.now()})`;
  await a.getByRole("textbox", { name: /Your doubt at/ }).fill(doubt);
  await a.keyboard.press("Enter");
  await expect(a.getByText(doubt)).toBeVisible();

  // B sees it, pinned to 0:12, without reloading (polling: Nexconn is off in this run).
  const row = b.getByRole("listitem").filter({ hasText: doubt });
  await expect(row).toBeVisible({ timeout: 20_000 });
  await expect(row.getByRole("button", { name: "Jump to 0:12" })).toBeVisible();
  await noHorizontalScroll(b);

  // B can act on it from the phone: "Me too" counts once.
  await row.getByRole("button", { name: /have this doubt/ }).click();
  await expect(
    row.getByRole("button", { name: /1 person has this doubt, including you/ }),
  ).toBeVisible();

  await contextA.close();
  await contextB.close();
});

test("signed-out visitors are sent to sign-in and back", async ({ page }) => {
  await page.goto("/home");
  await expect(page).toHaveURL(/\/sign-in\?callbackURL=%2Fhome/);
  await expect(page.getByRole("heading", { name: "Sign in to Margin" })).toBeVisible();
});
