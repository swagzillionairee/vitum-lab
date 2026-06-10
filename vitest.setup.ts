// Registers @testing-library/jest-dom matchers, but only in a DOM (jsdom)
// environment — the Node-based API/unit tests don't need them and shouldn't
// pay the import cost.
if (typeof document !== "undefined") {
  await import("@testing-library/jest-dom/vitest");
}
