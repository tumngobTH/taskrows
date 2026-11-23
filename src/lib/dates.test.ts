// @ts-expect-error type error without @types/node package
import process from "node:process";
import { dueState, dueToYmd, formatDue, todayYmd, ymdToDue } from "./dates";

process.env.TZ = "Asia/Bangkok";

describe("dates", () => {
  it("dueToYmd takes the first 10 chars", () => {
    expect(dueToYmd("2026-11-24T00:00:00.000Z")).toBe("2026-11-24");
  });
  it("ymdToDue builds the UTC-midnight string", () => {
    expect(ymdToDue("2026-11-24")).toBe("2026-11-24T00:00:00.000Z");
  });
  it("todayYmd uses the local date", () => {
    expect(todayYmd(new Date(2026, 10, 24, 0, 30))).toBe("2026-11-24");
    expect(todayYmd(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });
  it("dueState classifies", () => {
    expect(dueState("2026-11-23T00:00:00.000Z", "2026-11-24")).toBe("overdue");
    expect(dueState("2026-11-24T00:00:00.000Z", "2026-11-24")).toBe("today");
    expect(dueState("2026-11-25T00:00:00.000Z", "2026-11-24")).toBe("future");
  });
  it("formatDue gives Today, Tomorrow or d MMM", () => {
    expect(formatDue("2026-11-24T00:00:00.000Z", "2026-11-24")).toBe("Today");
    expect(formatDue("2026-11-25T00:00:00.000Z", "2026-11-24")).toBe("Tomorrow");
    expect(formatDue("2026-12-01T00:00:00.000Z", "2026-11-24")).toBe("1 Dec");
    expect(formatDue("2026-11-30T00:00:00.000Z", "2026-12-31")).toBe("30 Nov");
    expect(formatDue("2027-01-01T00:00:00.000Z", "2026-12-31")).toBe("Tomorrow");
  });
});
