import { expect, test, type Page } from "@playwright/test";
import { e2eEmail, noHorizontalScroll, signIn } from "./helpers";

// A long public lecture (4.5 h), so the host can jump far ahead.
const VIDEO = "https://www.youtube.com/watch?v=rfscVS0vtbw";

// The host plays without a click (page.evaluate is not a user gesture).
test.use({ launchOptions: { args: ["--autoplay-policy=no-user-gesture-required"] } });

type PlayerReading = { time: number; state: string };

// The room exposes its player store as window.__marginPlayer outside production.
function player(page: Page) {
  return {
    read: () =>
      page.evaluate((): PlayerReading => {
        const store = (window as unknown as { __marginPlayer: MarginPlayer }).__marginPlayer;
        return { time: store.getTime(), state: store.getSnapshot().state };
      }),
    run: (action: "play" | "pause" | { seek: number }) =>
      page.evaluate((a) => {
        const store = (window as unknown as { __marginPlayer: MarginPlayer }).__marginPlayer;
        if (a === "play") store.play();
        else if (a === "pause") store.pause();
        else store.seek(a.seek);
      }, action),
    ready: () =>
      expect
        .poll(() =>
          page.evaluate(
            () =>
              (window as unknown as { __marginPlayer?: MarginPlayer }).__marginPlayer?.getSnapshot()
                .ready ?? false,
          ),
        )
        .toBe(true),
  };
}
type MarginPlayer = {
  getTime(): number;
  getSnapshot(): { state: string; ready: boolean };
  play(): void;
  pause(): void;
  seek(seconds: number): void;
};

// How far the viewer is from the host (both read within a few ms; a playing host moves on).
async function gap(host: ReturnType<typeof player>, viewer: ReturnType<typeof player>) {
  const h = await host.read();
  const at = Date.now();
  const v = await viewer.read();
  const hostNow = h.time + (h.state === "playing" ? (Date.now() - at) / 1000 : 0);
  return { gap: Math.abs(v.time - hostNow), viewerState: v.state };
}

test("a host starts a watch party; a viewer on a phone follows play, pause and a jump", async ({
  browser,
}) => {
  const hostContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const viewerContext = await browser.newContext({
    viewport: { width: 375, height: 812 },
    isMobile: true,
    hasTouch: true,
  });
  const h = await hostContext.newPage();
  const v = await viewerContext.newPage();

  // The host opens the room by pasting the link.
  await signIn(h, e2eEmail("host"));
  await h.getByLabel("YouTube lecture link").fill(VIDEO);
  await h.getByRole("button", { name: "Open room" }).click();
  await h.waitForURL(/\/lectures\/(new|[A-Za-z0-9]{32})/);
  if (h.url().includes("/lectures/new")) {
    await h.getByRole("button", { name: "Open the room" }).click();
  }
  await h.waitForURL(/\/lectures\/[A-Za-z0-9]{32}/);
  const roomPath = new URL(h.url()).pathname;
  await signIn(v, e2eEmail("partygoer"), roomPath);
  await expect(v).toHaveURL(new RegExp(roomPath));

  const host = player(h);
  const viewer = player(v);
  await host.ready();
  await viewer.ready();

  // Start, then join from the banner.
  await h.getByRole("tab", { name: /party/i }).click();
  await h.getByRole("button", { name: "Start a watch party" }).click();
  await expect(h.getByText("You're hosting.")).toBeVisible();
  // The banner above the tabs (the Party tab says the same, hidden).
  await expect(v.getByText(/is hosting a watch party/).first()).toBeVisible({ timeout: 20_000 });
  await v.getByRole("button", { name: "Join party" }).first().click();
  await expect(v.getByText(/^Following/)).toBeVisible();
  await noHorizontalScroll(v);

  // Play: the viewer starts and catches up (polling: Nexconn is off in this run).
  await host.run("play");
  await expect
    .poll(async () => (await gap(host, viewer)).viewerState, { timeout: 20_000 })
    .toBe("playing");
  await expect.poll(async () => (await gap(host, viewer)).gap, { timeout: 20_000 }).toBeLessThan(1);
  await expect(v.getByText(/In sync/)).toBeVisible({ timeout: 20_000 });

  // Pause: the viewer pauses at the same spot.
  await host.run("pause");
  await expect
    .poll(async () => (await gap(host, viewer)).viewerState, { timeout: 15_000 })
    .toBe("paused");
  await expect.poll(async () => (await gap(host, viewer)).gap, { timeout: 15_000 }).toBeLessThan(1);

  // Jump to 30:00 and play: the viewer follows.
  await host.run({ seek: 1800 });
  await host.run("play");
  await expect.poll(async () => (await gap(host, viewer)).gap, { timeout: 30_000 }).toBeLessThan(1);
  expect((await viewer.read()).time).toBeGreaterThan(1790);

  // The host ends it; the viewer is let go.
  await h.getByRole("button", { name: "End party" }).click();
  await expect(h.getByRole("button", { name: "Start a watch party" })).toBeVisible();
  await expect(v.getByText(/^Following/)).toBeHidden({ timeout: 20_000 });

  await hostContext.close();
  await viewerContext.close();
});
