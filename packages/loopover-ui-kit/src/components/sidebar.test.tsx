import { fireEvent, render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it } from "vitest";

import { SidebarProvider, useSidebar } from "./sidebar";

// SidebarProvider consumes useIsMobile -> window.matchMedia, which jsdom does not implement.
beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
});

// A tiny consumer that surfaces the sidebar's open state + the focusable targets the global
// Cmd/Ctrl+B handler must distinguish between.
function Harness() {
  const { state } = useSidebar();
  return (
    <div>
      <span data-testid="state">{state}</span>
      <div data-testid="plain" tabIndex={-1}>
        plain
      </div>
      <input data-testid="input" aria-label="text field" />
      <textarea data-testid="textarea" aria-label="notes" />
      <div
        data-testid="editable"
        contentEditable
        suppressContentEditableWarning
      >
        editable
      </div>
    </div>
  );
}

describe("SidebarProvider Cmd/Ctrl+B isTyping guard (#8305)", () => {
  it("toggles the sidebar when the shortcut fires from a non-editable target", () => {
    render(
      <SidebarProvider defaultOpen>
        <Harness />
      </SidebarProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("expanded");
    fireEvent.keyDown(screen.getByTestId("plain"), { key: "b", ctrlKey: true });
    expect(screen.getByTestId("state").textContent).toBe("collapsed");
  });

  it("does NOT toggle the sidebar (and does not preventDefault) while typing in a form field or contenteditable", () => {
    render(
      <SidebarProvider defaultOpen>
        <Harness />
      </SidebarProvider>,
    );
    expect(screen.getByTestId("state").textContent).toBe("expanded");
    // jsdom does not compute HTMLElement.isContentEditable from the contentEditable attribute, so force
    // it on the editable node to faithfully exercise the guard's isContentEditable branch (a real browser
    // reports true for a contentEditable element).
    Object.defineProperty(screen.getByTestId("editable"), "isContentEditable", {
      configurable: true,
      value: true,
    });
    for (const id of ["input", "textarea", "editable"]) {
      const el = screen.getByTestId(id);
      const event = new KeyboardEvent("keydown", {
        key: "b",
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      });
      el.dispatchEvent(event);
      // Native Bold behavior stays intact: the handler returns early, never calling preventDefault.
      expect(event.defaultPrevented).toBe(false);
    }
    // State never changed across all three editable targets.
    expect(screen.getByTestId("state").textContent).toBe("expanded");
  });
});
