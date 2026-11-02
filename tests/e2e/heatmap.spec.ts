import { expect, test } from "@playwright/test";
import { e2eEmail, noHorizontalScroll, signIn } from "./helpers";

// Short public video ("Me at the zoo", 19 s); t=12 is in the first 15-second bucket.
const VIDEO = "https://www.youtube.com/watch?v=jNQXAC9IVRw";

test("'I'm lost' is private alone, and shows up live for others from two people", async ({
  browser,
}) => {
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const contextB = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const a = await contextA.newPage();
  const b = await contextB.newPage();
  // On failure, B's console helps tell a missed live update from a rendering problem.
  const bConsole: string[] = [];
  b.on("console", (message) => bConsole.push(`${message.type()}: ${message.text()}`));

  await signIn(a, e2eEmail("lostA"));
  await a.getByLabel("YouTube lecture link").fill(VIDEO);
  await a.getByRole("button", { name: "Open room" }).click();
  await a.waitForURL(/\/lectures\/(new|[A-Za-z0-9]{32})/);
  if (a.url().includes("/lectures/new")) {
    await a.getByRole("button", { name: "Open the room" }).click();
  }
  await a.waitForURL(/\/lectures\/[A-Za-z0-9]{32}/);
  const roomUrl = new URL(a.url());
  const room = `${roomUrl.pathname}?t=12`;
  await a.goto(room);
  await signIn(b, e2eEmail("lostB"), room);
  await expect(a.getByLabel("Current video time")).toHaveText("0:12");
  await expect(b.getByLabel("Current video time")).toHaveText("0:12");
  // The E2E teardown removes every test reaction, so this room starts with none.
  await expect(b.getByText("Nobody lost yet")).toBeVisible();

  // The dev server compiles a route on its first request, stalling everything for seconds;
  // compile /lost first (unmarking a bucket A never marked changes nothing).
  const warm = await a.request.delete(
    `${roomUrl.pathname.replace("/lectures/", "/api/lectures/")}/lost`,
    { data: { tSec: 5000 }, headers: { origin: roomUrl.origin } },
  );
  expect(warm.ok()).toBe(true);

  const mostLost = (page: typeof a) => page.getByRole("button", { name: /^Most lost:/ });
  // How long a change takes to reach the other browser (the stream checks every second).
  const latencies: number[] = [];
  let sentAt = 0;
  const arrived = () => latencies.push(Date.now() - sentAt);

  try {
    await test.step("A alone presses L: A sees it, B doesn't (one person is never shown)", async () => {
      await a.locator("body").press("l");
      await expect(a.getByRole("button", { name: /Marked: lost here/ })).toBeVisible();
      await expect(a.getByText("Marked at 0:00 (anonymous).")).toBeVisible();
      await expect(mostLost(a)).toContainText("0:00–0:15 · 1 person");
      // Several stream checks pass; B still sees nothing.
      await b.waitForTimeout(3000);
      await expect(b.getByText("Nobody lost yet")).toBeVisible();
      await expect(mostLost(b)).toHaveCount(0);
    });

    await test.step("B taps the button: both see two people, A live", async () => {
      sentAt = Date.now();
      await b.getByRole("button", { name: "I'm lost here" }).click();
      await expect(b.getByRole("button", { name: /Marked: lost here/ })).toBeVisible();
      await expect(mostLost(a)).toContainText("0:00–0:15 · 2 people", { timeout: 15_000 });
      arrived();
      await expect(mostLost(b)).toContainText("0:00–0:15 · 2 people", { timeout: 15_000 });
      await noHorizontalScroll(b);
    });

    await test.step("A takes it back with L: B sees only its own mark again, live", async () => {
      sentAt = Date.now();
      await a.locator("body").press("l");
      await expect(a.getByText("Removed your mark at 0:00.")).toBeVisible();
      await expect(mostLost(b)).toContainText("0:00–0:15 · 1 person", { timeout: 15_000 });
      arrived();
      await expect(a.getByText("Nobody lost yet")).toBeVisible({ timeout: 15_000 });
    });

    await test.step("B unmarks, marks again, and undoes from the notice", async () => {
      const button = b.getByRole("button", { name: /^(I'm lost here|Marked: lost here)/ });
      await button.click();
      await expect(b.getByText("Removed your mark at 0:00.")).toBeVisible();
      await button.click();
      await expect(b.getByText("Marked at 0:00 (anonymous).")).toBeVisible();
      await b.getByRole("button", { name: "Undo" }).click();
      await expect(b.getByText("Removed your mark at 0:00.")).toBeVisible();
      await expect(b.getByRole("button", { name: /I'm lost here/ })).toBeVisible();
      await expect(b.getByText("Nobody lost yet")).toBeVisible();
    });
  } catch (error) {
    console.log(`B console:\n${bConsole.join("\n")}`);
    throw error;
  }
  console.log(`heatmap change reached the other browser in ${latencies.join(", ")} ms`);
  for (const ms of latencies) expect(ms).toBeLessThan(5000);

  await contextA.close();
  await contextB.close();
});
