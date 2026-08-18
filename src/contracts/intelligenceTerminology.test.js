import { describe, expect, it } from "vitest";
import {
  INTELLIGENCE_ATTENTION_REASONS,
  INTELLIGENCE_INBOX_EXCLUSIONS,
  INTELLIGENCE_LIFECYCLE,
  INTELLIGENCE_TERMS,
} from "./intelligenceTerminology";

describe("Intelligence Inbox Phase 1 product contract", () => {
  it("defines every canonical intelligence concept", () => {
    expect(Object.keys(INTELLIGENCE_TERMS)).toEqual([
      "signal", "finding", "risk", "opportunity", "prediction",
      "recommendation", "decision", "approval", "action", "task",
      "agent_execution", "outcome", "feedback", "alert", "intelligence_item",
    ]);
  });

  it("admits only governed operational attention needs", () => {
    expect(INTELLIGENCE_ATTENTION_REASONS).toEqual([
      "Awareness", "Investigation", "Decision", "Approval", "Action", "Outcome verification",
    ]);
    expect(INTELLIGENCE_INBOX_EXCLUSIONS).toContain("Unvalidated LLM text presented as fact");
    expect(INTELLIGENCE_INBOX_EXCLUSIONS).toContain("Information the current user cannot act upon");
  });

  it("continues through observed outcome and learning", () => {
    expect(INTELLIGENCE_LIFECYCLE[0]).toBe("Detected");
    expect(INTELLIGENCE_LIFECYCLE).toContain("Validated and contextualized by Idjwi");
    expect(INTELLIGENCE_LIFECYCLE.at(-1)).toBe("Resolved, reopened or learned from");
  });
});
