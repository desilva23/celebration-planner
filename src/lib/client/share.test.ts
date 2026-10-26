import { describe, expect, it } from "vitest";
import { addGuest } from "@/lib/domain/plan";
import { weddingPlan } from "@/test/plan";
import { planFromLink, shareLink } from "./share";

const ORIGIN = "https://planner.example";
const hashOf = (link: string) => link.slice(link.indexOf("#"));

describe("share links", () => {
  it("round-trip a plan through a compact, URL-safe fragment", async () => {
    const plan = weddingPlan();
    const link = await shareLink(plan, ORIGIN);
    expect(link).toMatch(/^https:\/\/planner\.example\/#plan=[A-Za-z0-9_-]+$/);
    expect(link.length).toBeLessThan(JSON.stringify(plan).length / 2);
    expect(await planFromLink(hashOf(link))).toEqual(plan);
  });

  it("leave the guest list out, since it names real people", async () => {
    const plan = addGuest(weddingPlan(), { id: "g1", name: "The Sharmas", partySize: 4, rsvp: "yes" });
    const shared = await planFromLink(hashOf(await shareLink(plan, ORIGIN)));
    expect(shared).toEqual({ ...plan, guests: [] });
  });

  it.each([
    ["has no plan in it", "#budget"],
    ["isn't valid base64", "#plan=!!!"],
    ["isn't compressed data", "#plan=aGVsbG8"],
    ["isn't a plan", "#plan="],
  ])("ignore a fragment that %s", async (_, hash) => {
    expect(await planFromLink(hash)).toBeNull();
  });

  it("ignore a link to a plan this version can't read", async () => {
    const link = await shareLink({ ...weddingPlan(), version: 2 } as never, ORIGIN);
    expect(await planFromLink(hashOf(link))).toBeNull();
  });
});
