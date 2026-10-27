import { act, renderHook } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { createElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { weddingPlan } from "@/test/plan";

// Renaming these keys would orphan plans users have already saved.
const KEY = "celebration-planner:plan:v1";
const SET_ASIDE_KEY = "celebration-planner:set-aside-plan";

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

  // Regression: an unreadable plan used to be ignored and then overwritten by
  // the next new plan, so it was lost for good.
  it.each([
    ["isn't JSON", "{not json"],
    ["fails validation", JSON.stringify({ ...weddingPlan(), version: 2 })],
  ])("sets a stored plan that %s aside instead of losing it", async (_, raw) => {
    localStorage.setItem(KEY, raw);
    const { usePlan, useSetAsidePlan } = await freshStore();
    expect(renderHook(() => usePlan()).result.current).toBeNull();
    expect(renderHook(() => useSetAsidePlan()).result.current).toBe(raw);
    expect([localStorage.getItem(KEY), localStorage.getItem(SET_ASIDE_KEY)]).toEqual([null, raw]);
  });

  it("keeps an unreadable plan where it was when storage refuses the copy", async () => {
    localStorage.setItem(KEY, "{not json");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Full", "QuotaExceededError");
    });
    const { useSetAsidePlan } = await freshStore();
    expect(renderHook(() => useSetAsidePlan()).result.current).toBe("{not json");
    expect(localStorage.getItem(KEY)).toBe("{not json");
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

  it("never sets aside a plan it can read", async () => {
    localStorage.setItem(KEY, JSON.stringify(weddingPlan()));
    const { usePlan } = await freshStore();
    renderHook(() => usePlan());
    expect(localStorage.getItem(SET_ASIDE_KEY)).toBeNull();
    expect(localStorage.getItem(KEY)).not.toBeNull();
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

describe("a plan set aside", () => {
  it("isn't changed by another tab's unrelated storage", async () => {
    const { useSetAsidePlan } = await freshStore();
    const { result } = renderHook(() => useSetAsidePlan());
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: "something-else", newValue: "x" }));
    });
    expect(result.current).toBeNull();
  });

  it("is null when there isn't one, including during server rendering", async () => {
    const { useSetAsidePlan } = await freshStore();
    expect(renderHook(() => useSetAsidePlan()).result.current).toBeNull();
    function Probe() {
      return String(useSetAsidePlan());
    }
    expect(renderToString(createElement(Probe))).toBe("null");
  });

  it("survives a reload", async () => {
    localStorage.setItem(SET_ASIDE_KEY, "{old}");
    const { useSetAsidePlan } = await freshStore();
    expect(renderHook(() => useSetAsidePlan()).result.current).toBe("{old}");
  });

  it("can be made from the current plan, leaving the user free to start again", async () => {
    const plan = weddingPlan();
    localStorage.setItem(KEY, JSON.stringify(plan));
    const { setAsideSavedPlan, usePlan, useSetAsidePlan } = await freshStore();
    const current = renderHook(() => usePlan());
    const setAside = renderHook(() => useSetAsidePlan());
    act(() => setAsideSavedPlan());
    expect(current.result.current).toBeNull();
    expect(JSON.parse(setAside.result.current!)).toEqual(plan);
  });

  it("leaves nothing aside when there was no saved plan", async () => {
    const { setAsideSavedPlan, useSetAsidePlan } = await freshStore();
    const setAside = renderHook(() => useSetAsidePlan());
    act(() => setAsideSavedPlan());
    expect(setAside.result.current).toBeNull();
  });

  it("can be discarded, even when storage refuses", async () => {
    localStorage.setItem(SET_ASIDE_KEY, "{old}");
    const { discardSetAsidePlan, useSetAsidePlan } = await freshStore();
    const { result } = renderHook(() => useSetAsidePlan());
    act(() => discardSetAsidePlan());
    expect(result.current).toBeNull();
    expect(localStorage.getItem(SET_ASIDE_KEY)).toBeNull();

    localStorage.setItem(SET_ASIDE_KEY, "{again}");
    act(() => {
      window.dispatchEvent(new StorageEvent("storage", { key: SET_ASIDE_KEY, newValue: "{again}" }));
    });
    expect(result.current).toBe("{again}");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new DOMException("Blocked", "SecurityError");
    });
    act(() => discardSetAsidePlan());
    expect(result.current).toBeNull();
  });
});
