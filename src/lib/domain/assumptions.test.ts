import { describe, expect, it } from "vitest";
import { TASK_TEMPLATES } from "./assumptions";

describe("TASK_TEMPLATES", () => {
  // A misspelt id would be dropped quietly when the timeline is built, and the
  // task would no longer wait for what it needs.
  it("only depend on tasks that exist", () => {
    const ids = new Set(TASK_TEMPLATES.map((t) => t.id));
    const unknown = TASK_TEMPLATES.flatMap((t) =>
      t.dependsOn.filter((id) => !ids.has(id)).map((id) => `${t.id} → ${id}`),
    );
    expect(unknown).toEqual([]);
  });
});
