export const INTELLIGENCE_TERMS = Object.freeze({
  signal: "A raw or normalized observation; input rather than a finding.",
  finding: "An interpreted condition supported by governed evidence.",
  risk: "A possible negative operational consequence.",
  opportunity: "A possible beneficial operational consequence.",
  prediction: "A model-generated estimate about a future condition.",
  recommendation: "A proposed response to a finding.",
  decision: "A governed choice.",
  approval: "Authority granted or denied for a proposed decision or action.",
  action: "A governed execution request.",
  task: "Work assigned to a person or operational unit.",
  agent_execution: "Work performed through a governed agent.",
  outcome: "The observed result of governed work.",
  feedback: "Operator correction or outcome evidence used to improve Idjwi.",
  alert: "A time-sensitive delivery mechanism.",
  intelligence_item: "The governed inbox representation coordinating a finding and its operational lifecycle.",
});

export const INTELLIGENCE_ATTENTION_REASONS = Object.freeze([
  "Awareness", "Investigation", "Decision", "Approval", "Action", "Outcome verification",
]);

export const INTELLIGENCE_INBOX_EXCLUSIONS = Object.freeze([
  "Ordinary application events",
  "Raw telemetry",
  "Every model prediction",
  "Successful background operations",
  "Unvalidated LLM text presented as fact",
  "Duplicate findings about the same condition",
  "Information the current user cannot act upon",
]);

export const INTELLIGENCE_LIFECYCLE = Object.freeze([
  "Detected",
  "Validated and contextualized by Idjwi",
  "Assigned and prioritized",
  "Investigated",
  "Decision or approval",
  "Action",
  "Outcome observed",
  "Resolved, reopened or learned from",
]);
