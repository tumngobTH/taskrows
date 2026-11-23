import { isMergedKey, listKey, mergedKey, normaliseName, parseListKey, taskKey } from "./ids";

describe("ids", () => {
  it("normaliseName trims, collapses whitespace and lowercases", () => {
    expect(normaliseName("  ACC  Cross ")).toBe("acc cross");
  });
  it("mergedKey prefixes the normalised name", () => {
    expect(mergedKey("Tamngob")).toBe("merged:tamngob");
  });
  it("listKey roundtrips through parseListKey", () => {
    expect(parseListKey(listKey("a", "b"))).toEqual({ accountId: "a", listId: "b" });
  });
  it("taskKey joins account and task id", () => {
    expect(taskKey("a", "t")).toBe("a:t");
  });
  it("isMergedKey detects merged slots", () => {
    expect(isMergedKey("merged:x")).toBe(true);
    expect(isMergedKey("a:b")).toBe(false);
  });
});
