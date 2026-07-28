// @vitest-environment jsdom

import React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it } from "vitest";
import AccessibleInteractionHost, {
  requestConfirmation,
  requestText,
  showNotice,
} from "./AccessibleInteractionDialog";

afterEach(() => cleanup());

function renderHost() {
  render(<>
    <button type="button">Launch action</button>
    <AccessibleInteractionHost />
  </>);
  const trigger = screen.getByRole("button", { name: "Launch action" });
  trigger.focus();
  return trigger;
}

describe("AccessibleInteractionHost", () => {
  it("labels text requests, focuses the input, validates, resolves, and restores focus", async () => {
    const user = userEvent.setup();
    const trigger = renderHost();
    let result;
    await act(async () => {
      result = requestText({
        title: "Export governed graph",
        message: "State the audited operational purpose.",
        label: "Export purpose",
        confirmLabel: "Continue",
      });
    });

    expect(await screen.findByRole("dialog", { name: "Export governed graph" })).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Export purpose" });
    expect(input).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Export purpose is required");

    await user.type(input, "Manager review");
    await user.click(screen.getByRole("button", { name: "Continue" }));
    await expect(result).resolves.toBe("Manager review");
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("cancels with Escape and resolves confirmation cancellation safely", async () => {
    const user = userEvent.setup();
    const trigger = renderHost();
    let textResult;
    await act(async () => {
      textResult = requestText({
        title: "Correction evidence",
        message: "Explain the correction.",
        label: "Evidence",
      });
    });
    await screen.findByRole("dialog", { name: "Correction evidence" });
    await user.keyboard("{Escape}");
    await expect(textResult).resolves.toBeNull();
    await waitFor(() => expect(trigger).toHaveFocus());

    let confirmResult;
    await act(async () => {
      confirmResult = requestConfirmation({
        title: "Approve action",
        message: "Apply this governed action?",
      });
    });
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await expect(confirmResult).resolves.toBe(false);
  });

  it("queues simultaneous requests instead of overwriting an active decision", async () => {
    const user = userEvent.setup();
    renderHost();
    let first;
    let second;
    await act(async () => {
      first = requestConfirmation({
        title: "First governed decision",
        message: "Review the first decision.",
        confirmLabel: "Approve first",
      });
      second = showNotice({
        title: "Background result",
        message: "A background operation completed.",
      });
    });

    expect(await screen.findByRole("dialog", { name: "First governed decision" })).toBeInTheDocument();
    expect(screen.queryByText("Background operation completed.")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Approve first" }));
    await expect(first).resolves.toBe(true);

    expect(await screen.findByRole("dialog", { name: "Background result" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await expect(second).resolves.toBeUndefined();
  });
});
