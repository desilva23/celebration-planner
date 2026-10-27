// Mutation testing: Stryker makes small changes ("mutants") to the code in
// src/lib, such as flipping a comparison or emptying a string, and runs the
// tests against each. A mutant that no test notices marks behaviour that
// nothing checks, even though coverage says the line ran.
/** @type {import("@stryker-mutator/api/core").PartialStrykerOptions} */
const config = {
  testRunner: "vitest",
  // Mutants that don't compile are discarded rather than counted.
  checkers: ["typescript"],
  tsconfigFile: "tsconfig.json",
  mutate: ["src/lib/**/*.ts", "!src/lib/**/*.test.ts", "!src/lib/**/*.test-helpers.ts"],
  coverageAnalysis: "perTest",
  // A timeout counts as a caught mutant. On a busy CI runner the default 5s
  // made slow runs look caught, so allow more before calling it a hang.
  timeoutMS: 15_000,
  reporters: ["clear-text", "progress", "html", "json"],
  htmlReporter: { fileName: "reports/mutation/index.html" },
  jsonReporter: { fileName: "reports/mutation/mutation.json" },
  // The first honest run scored 99.9%. Below 97% the run fails, which leaves
  // room for a little untested code but not for tests that stop checking.
  thresholds: { high: 99, low: 98, break: 97 },
  // Keeps results in reports/, so a rerun only tests mutants whose code or tests changed.
  incremental: true,
};

export default config;
