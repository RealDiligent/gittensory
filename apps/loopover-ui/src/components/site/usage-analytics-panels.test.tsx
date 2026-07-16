import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { CommandUsefulnessPanel } from "@/components/site/usage-analytics-panels";

const TOTALS = {
  feedbackCount: 6,
  usefulCount: 4,
  notUsefulCount: 2,
  usefulnessRate: 0.6667,
  answerCount: 9,
};

const COMMANDS = [
  {
    command: "/loopover explain",
    feedbackCount: 4,
    usefulCount: 3,
    notUsefulCount: 1,
    usefulnessRate: 0.75,
  },
  {
    command: "/loopover check",
    feedbackCount: 2,
    usefulCount: 1,
    notUsefulCount: 1,
    usefulnessRate: null,
  },
];

describe("CommandUsefulnessPanel", () => {
  it("renders a row per command with its feedback, useful count, and rate", () => {
    render(<CommandUsefulnessPanel totals={TOTALS} commands={COMMANDS} windowDays={30} />);
    expect(screen.getByText("/loopover explain")).toBeTruthy();
    expect(screen.getByText("/loopover check")).toBeTruthy();
    expect(screen.getByText("75%")).toBeTruthy();
  });

  it("wraps the command table in a keyboard-focusable, labelled scroll region with a caption and column-scoped headers (#794 a11y pattern)", () => {
    render(<CommandUsefulnessPanel totals={TOTALS} commands={COMMANDS} windowDays={30} />);
    const region = screen.getByRole("region", { name: "Command feedback" });
    // A bare overflow-x-auto div is not a tab stop; TableScroll makes it one (WCAG 2.1.1).
    expect(region.tabIndex).toBe(0);
    expect(region.className).toContain("overflow-x-auto");
    const table = screen.getByRole("table", {
      name: "Commands with their feedback count, useful count, and usefulness rate.",
    });
    expect(within(table).getByRole("columnheader", { name: "Command" })).toBeTruthy();
    expect(within(table).getByRole("columnheader", { name: "Rate" })).toBeTruthy();
  });

  it("renders a helper note instead of a table when there is no command feedback in the window", () => {
    render(<CommandUsefulnessPanel totals={TOTALS} commands={[]} windowDays={30} />);
    expect(screen.getByText("No command feedback recorded in this window.")).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
});
