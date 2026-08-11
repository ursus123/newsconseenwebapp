import { describe, expect, it } from "vitest";
import {
  assertIntelligenceItem,
  INTELLIGENCE_INBOX_CONTRACT,
  INTELLIGENCE_ITEM_CONTRACT,
  legacyCollectionsFromItems,
  normalizeIntelligenceEnvelope,
  projectLegacyIntelligenceItem,
} from "./intelligenceItemContract";

describe("intelligence-item.v1", () => {
  it("projects legacy records into safe governed summaries", () => {
    const item = projectLegacyIntelligenceItem({
      id: "i-1", title: "Payment risk", body: "Payment is overdue", source: "ml_model",
      evidence: [{ id: "e-1", label: "Overdue by 10 days", raw_row: { secret: true } }],
      private_notes: "do not expose",
    }, "insight", "tenant-a");
    expect(assertIntelligenceItem(item).contract).toBe(INTELLIGENCE_ITEM_CONTRACT);
    expect(item.source.type).toBe("machine_learning_model");
    expect(item.source.assertion_class).toBe("predictive_finding");
    expect(JSON.stringify(item)).not.toContain("private_notes");
    expect(JSON.stringify(item)).not.toContain("raw_row");
  });

  it("keeps advisor output classified as a proposal", () => {
    const item = projectLegacyIntelligenceItem({ id: "a-1", title: "Proposal", source: "advisor" }, "insight", "tenant-a");
    expect(item.source.assertion_class).toBe("advisor_proposal");
    expect(item.source.authority).toBe("proposal");
    expect(item.advisor.contribution_proven).toBe(false);
  });

  it("normalizes fallback data and supplies the compatibility presentation", () => {
    const envelope = normalizeIntelligenceEnvelope({ risks: [{ id: "r-1", title: "Risk", source: "rule", status: "open" }] }, "tenant-a");
    expect(envelope.contract).toBe(INTELLIGENCE_INBOX_CONTRACT);
    expect(envelope.idjwi_context.item_ids).toEqual(envelope.audit_context.item_ids);
    expect(legacyCollectionsFromItems(envelope.items).risks).toHaveLength(1);
    expect(envelope.delivery.realtime_enabled).toBe(false);
    expect(envelope.delivery.mode).toBe("authorized_pull");
  });
});
