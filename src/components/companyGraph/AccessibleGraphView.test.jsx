import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import AccessibleGraphView from "./AccessibleGraphView";

const nodes = [
  { id: "enterprise:e1", entity_type: "enterprise", label: "Supplier A", status: "active" },
  { id: "product:p1", entity_type: "product", label: "Product B", status: "active" },
  { id: "task:t1", entity_type: "task", label: "Unassigned inspection", status: "open" },
];
const edges = [{
  id: "edge:1", source: "enterprise:e1", predicate: "supplies", label: "supplies",
  target: "product:p1", assertion_state: "confirmed", confidence: 0.92,
}];

afterEach(cleanup);

describe("accessible Company Graph representations", () => {
  it("supports keyboard inspection from the record list", async () => {
    const inspect = vi.fn();
    render(<AccessibleGraphView mode="records" nodes={nodes} edges={edges} onInspectNode={inspect} />);
    const record = screen.getByRole("button", { name: /Supplier A/ });
    record.focus();
    await userEvent.keyboard("{Enter}");
    expect(inspect).toHaveBeenCalledWith(nodes[0]);
  });

  it("uses an accessible control to inspect a relationship", async () => {
    const inspect = vi.fn();
    render(<AccessibleGraphView mode="relationships" nodes={nodes} edges={edges} onInspectEdge={inspect} />);
    expect(screen.getByRole("table", { name: "Governed relationships" })).toBeVisible();
    await userEvent.click(screen.getByRole("button", {
      name: "Inspect relationship supplies from Supplier A to Product B",
    }));
    expect(inspect).toHaveBeenCalledWith(edges[0]);
    expect(screen.getByText("confirmed; 92% confidence")).toBeVisible();
  });

  it("provides equivalent outline and textual summaries", () => {
    const { rerender } = render(<AccessibleGraphView mode="outline" nodes={nodes} edges={edges} />);
    expect(screen.getByRole("region", { name: "Hierarchical neighborhood outline" })).toHaveTextContent("Supplier A");
    expect(screen.getByText(/supplies → Product B/)).toBeVisible();
    rerender(<AccessibleGraphView mode="summary" nodes={nodes} edges={edges} />);
    expect(screen.getByRole("region", { name: "Textual graph summary" })).toHaveTextContent("3 authorized records and 1 governed relationships");
    expect(screen.getByText("1 records have no visible connection.")).toBeVisible();
  });
});
