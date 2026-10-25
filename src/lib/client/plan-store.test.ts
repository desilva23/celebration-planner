import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { weddingPlan } from "@/test/plan";

// Renaming this key would orphan every plan users have already saved.
const KEY = "celebration-planner:plan:v1";

/** The store caches what it reads, so each test loads a fresh copy of the module. */
async function freshStore() {
  vi.resetModules();
  return import("./plan-store");
}

beforeEach(() => {
  localStorage.clear();
});

describe("usePlan", () => {
  it("is null when nothing has been saved", async () => {
    const { usePlan } = await freshStore();
    expect(renderHook(() => usePlan()).result.current).toBeNull();
  });

  it("loads a saved plan", async () => {
    const plan = weddingPlan();
    localStorage.setItem(KEY, JSON.stringify(plan));
    const { usePlan } = await freshStore();
    expect(renderHook(() => usePlan()).result.current).toEqual(plan);
  });

  it.each([
    ["isn't JSON", "{not json"],
    ["fails validation", JSON.stringify({ ...weddingPlan(), version: 2 })],
  ])("ignores a stored plan that %s instead of crashing", async (_, raw) => {
    localStorage.setItem(KEY, raw);
    const { usePlan } = await freshStore();
    expect(renderHook(() => usePlan()).result.current).toBeNull();
  });

  it("is null when the browser blocks storage", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    const { usePlan } = await freshStore();
    expect(renderHook(() => usePlan()).result.current).toBeNull();
  });

  it("is undefined during server rendering, so the page can show a loading state", async () => {
    const { usePlan } = await freshStore();
    function Probe() {
      return usePlan() === undefined ? "loading" : "loaded";
    }
    expect(renderToString(createElement(Probe))).toBe("loading");
  });

  it("picks up a plan saved in another tab, and ignores unrelated storage changes", async () => {
    const { usePlan } = await freshStore();
    const { result } = renderHook(() => usePlan());
    const plan = weddingPlan();
    act(() => {
      localStorage.setItem("something-else", "x");
      window.dispatchEvent(new StorageEvent("storage", { key: "something-else" }));
    });
    expect(result.current).toBeNull();
    act(() => {
      localStorage.setItem(KEY, JSON.stringify(plan));
      window.dispatchEvent(new StorageEvent("storage", { key: KEY }));
    });
    expect(result.current).toEqual(plan);
  });

  it("stops listening when the component unmounts", async () => {
    const { usePlan } = await freshStore();
    const remove = vi.spyOn(window, "removeEventListener");
    renderHook(() => usePlan()).unmount();
    expect(remove).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});

describe("savePlan", () => {
  it("persists the plan and updates every component using it", async () => {
    const { savePlan, usePlan } = await freshStore();
    const { result } = renderHook(() => usePlan());
    const plan = weddingPlan();
    act(() => savePlan(plan));
    expect(result.current).toEqual(plan);
    expect(JSON.parse(localStorage.getItem(KEY)!)).toEqual(plan);
  });

  it("removes the plan when given null", async () => {
    localStorage.setItem(KEY, JSON.stringify(weddingPlan()));
    const { savePlan, usePlan } = await freshStore();
    const { result } = renderHook(() => usePlan());
    act(() => savePlan(null));
    expect(result.current).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("keeps the plan for this session when storage is full or blocked", async () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const { savePlan, usePlan } = await freshStore();
    const { result } = renderHook(() => usePlan());
    const plan = weddingPlan();
    act(() => savePlan(plan));
    expect(result.current).toEqual(plan);
  });
});
