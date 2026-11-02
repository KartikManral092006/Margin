import { describe, expect, it } from "vitest";
import {
  canonicalWatchUrl,
  parseStartSec,
  parseYouTubeUrl,
  type ParsedYouTube,
} from "@/features/lectures/shared/youtube";

const R = "dQw4w9WgXcQ";
const ok = (startSec: number | null = null, videoId = R): ParsedYouTube => ({ videoId, startSec });

const cases: [string, ParsedYouTube | null][] = [
  [`https://www.youtube.com/watch?v=${R}`, ok()],
  [`https://youtube.com/watch?v=${R}`, ok()],
  [`http://www.youtube.com/watch?v=${R}`, ok()],
  [`www.youtube.com/watch?v=${R}`, ok()],
  [`youtube.com/watch?v=${R}`, ok()],
  [`  https://www.youtube.com/watch?v=${R}  `, ok()],
  [`https://WWW.YouTube.COM/watch?v=${R}`, ok()],
  [`https://m.youtube.com/watch?v=${R}`, ok()],
  [`https://music.youtube.com/watch?v=${R}&list=RDAMVM${R}`, ok()],
  [`https://www.youtube.com/watch?feature=share&v=${R}`, ok()],
  [`https://www.youtube.com/watch?v=${R}&list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG&index=3`, ok()],
  [`https://www.youtube.com/watch?v=${R}&pp=ygUJcmljayByb2xs`, ok()],
  [`https://www.youtube.com/watch?v=${R}&t=90`, ok(90)],
  [`https://www.youtube.com/watch?v=${R}&t=90s`, ok(90)],
  [`https://www.youtube.com/watch?v=${R}&t=1m30s`, ok(90)],
  [`https://www.youtube.com/watch?v=${R}&t=1h2m3s`, ok(3723)],
  [`https://www.youtube.com/watch?v=${R}&t=2m`, ok(120)],
  [`https://www.youtube.com/watch?v=${R}#t=1m30s`, ok(90)],
  [`https://www.youtube.com/watch?v=${R}&t=0`, ok(null)],
  [`https://www.youtube.com/watch?v=${R}&t=abc`, ok(null)],
  [`https://www.youtube.com/watch?v=${R}&t=-5`, ok(null)],
  [`https://www.youtube.com/watch?v=${R}&t=1:30`, ok(null)],
  [`https://www.youtube.com/watch?v=${R}&t=999999`, ok(null)],
  [`https://youtu.be/${R}`, ok()],
  [`https://youtu.be/${R}/`, ok()],
  [`https://youtu.be/${R}?t=90`, ok(90)],
  [`https://youtu.be/${R}?si=AbCdEf123&t=1m30s`, ok(90)],
  [`https://www.youtube.com/shorts/${R}`, ok()],
  [`https://youtube.com/shorts/${R}?feature=share`, ok()],
  [`https://www.youtube.com/embed/${R}?start=90`, ok(90)],
  [`https://www.youtube-nocookie.com/embed/${R}?start=45`, ok(45)],
  [`https://www.youtube.com/live/${R}?si=x`, ok()],
  [`https://www.youtube.com/v/${R}`, ok()],
  [`https://www.youtube.com/e/${R}`, ok()],
  [`https://www.youtube.com/attribution_link?a=x&u=%2Fwatch%3Fv%3D${R}%26feature%3Dshare`, ok()],
  [`https://www.youtube.com/watch?v=jNQXAC9IVRw`, ok(null, "jNQXAC9IVRw")],
  [`https://www.youtube.com/watch?v=M7lc1UVf-VE`, ok(null, "M7lc1UVf-VE")],
  [`https://www.youtube.com/watch?v=_-_-_-_-_-_`, ok(null, "_-_-_-_-_-_")],
  // rejects
  [`https://www.youtube.com.evil.com/watch?v=${R}`, null],
  [`https://youtu.be.evil.com/${R}`, null],
  [`https://evil.com/watch?v=${R}`, null],
  [`https://www.youtube.com@evil.com/watch?v=${R}`, null],
  [`https://user:pw@www.youtube.com/watch?v=${R}`, null],
  [`https://www.youtube.com:8443/watch?v=${R}`, null],
  [`https://notyoutube.com/watch?v=${R}`, null],
  [`https://www.youtube.com./watch?v=${R}`, null],
  [`javascript:alert(1)//youtube.com/watch?v=${R}`, null],
  [`ftp://www.youtube.com/watch?v=${R}`, null],
  [`https://www.youtube.com/watch?v=dQw4w9WgXc`, null],
  [`https://www.youtube.com/watch?v=dQw4w9WgXcQQ`, null],
  [`https://www.youtube.com/watch?v=dQw4w9WgX!Q`, null],
  [`https://www.youtube.com/watch?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG`, null],
  [`https://www.youtube.com/playlist?list=PLx0sYbCqOb8TBPRdmBHs5Iftvv9TPboYG`, null],
  [`https://www.youtube.com/@RickAstleyYT`, null],
  [`https://www.youtube.com/@RickAstleyYT/live`, null],
  [`https://www.youtube.com/channel/UCuAXFkgsw1L7xaCfnd5JJOw`, null],
  [`https://www.youtube.com/results?search_query=rick`, null],
  [`https://www.youtube.com/attribution_link?u=https%3A%2F%2Fevil.com%2Fwatch%3Fv%3D${R}`, null],
  [`https://www.youtube.com/attribution_link?u=%2F%2Fevil.com%2Fwatch%3Fv%3D${R}`, null],
  [`https://youtu.be/${R}/extra`, null],
  [`https://www.youtube-nocookie.com/watch?v=${R}`, null],
  [R, null],
  [``, null],
  [`x`.repeat(3000), null],
];

describe("parseYouTubeUrl", () => {
  it.each(cases)("%s", (input, expected) => {
    expect(parseYouTubeUrl(input)).toEqual(expected);
  });

  it("rejects non-strings", () => {
    expect(parseYouTubeUrl(undefined)).toBeNull();
    expect(parseYouTubeUrl(42)).toBeNull();
  });

  it("keeps the ID's case", () => {
    expect(parseYouTubeUrl("https://youtu.be/AbCdEfGhIjK")?.videoId).toBe("AbCdEfGhIjK");
  });
});

describe("parseStartSec", () => {
  it.each([
    ["90", 90],
    ["90s", 90],
    ["1m30s", 90],
    ["1h2m3s", 3723],
    ["2m", 120],
    [" 45 ", 45],
    ["0", null],
    ["abc", null],
    ["-5", null],
    ["1:30", null],
    ["999999", null],
    ["", null],
  ] as const)("%s -> %s", (raw, expected) => {
    expect(parseStartSec(raw)).toBe(expected);
  });

  it("treats a missing value as no start", () => {
    expect(parseStartSec(null)).toBeNull();
    expect(parseStartSec(undefined)).toBeNull();
  });
});

describe("canonicalWatchUrl", () => {
  it("builds the watch URL from the ID", () => {
    expect(canonicalWatchUrl(R)).toBe(`https://www.youtube.com/watch?v=${R}`);
  });
});
