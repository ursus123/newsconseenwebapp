export class IdjwiRequestError extends Error {
  constructor({ code, category, message, status = null, retryable = false, action = "retry", endpoint = "", cause = "http", requestId = null }) {
    super(message);
    this.name = "IdjwiRequestError";
    this.code = code;
    this.category = category;
    this.status = status;
    this.retryable = retryable;
    this.action = action;
    this.endpoint = endpoint;
    this.cause = cause;
    this.requestId = requestId;
  }
}

const HTTP_DEFAULTS = {
  401: ["session_invalid", "authorization", "Your Newsconseen session is invalid or expired.", true, "sign_in"],
  403: ["tenant_forbidden", "authorization", "Your account is not authorized for this organization.", false, "contact_admin"],
  404: ["endpoint_missing", "backend", "This Idjwi endpoint is not available.", false, "contact_admin"],
  500: ["backend_error", "backend", "Idjwi encountered an unexpected server error.", true, "retry"],
  502: ["backend_unavailable", "backend", "The Idjwi service is temporarily unavailable.", true, "retry"],
  503: ["backend_unavailable", "backend", "The Idjwi service is temporarily unavailable.", true, "retry"],
  504: ["backend_timeout", "transport", "Idjwi took too long to respond.", true, "retry"],
};

export function httpRequestError({ response, body = {}, endpoint = "" }) {
  const detail = body?.detail && typeof body.detail === "object" ? body.detail : {};
  const fallback = HTTP_DEFAULTS[response.status] || ["request_failed", "backend", `Idjwi request failed with HTTP ${response.status}.`, response.status >= 500, "retry"];
  return new IdjwiRequestError({
    code: detail.code || fallback[0],
    category: detail.category || fallback[1],
    message: detail.message || (typeof body?.detail === "string" ? body.detail : fallback[2]),
    status: response.status,
    retryable: detail.retryable ?? fallback[3],
    action: detail.action || fallback[4],
    endpoint,
    cause: "http",
    requestId: detail.request_id || response.headers?.get?.("x-request-id") || null,
  });
}

export function fetchRequestError(error, endpoint = "") {
  if (error instanceof IdjwiRequestError) return error;
  const timedOut = error?.name === "AbortError";
  return new IdjwiRequestError({
    code: timedOut ? "backend_timeout" : "backend_unreachable",
    category: "transport",
    message: timedOut
      ? "Idjwi took too long to respond."
      : "The Newsconseen interface is available, but the Idjwi backend could not be reached.",
    retryable: true,
    action: "retry",
    endpoint,
    cause: timedOut ? "timeout" : "network",
  });
}

export function classifySnapshot(results) {
  const [statusResult, contextResult, advisorResult] = results;
  const status = statusResult.status === "fulfilled" ? statusResult.value : null;
  const context = contextResult.status === "fulfilled" ? contextResult.value : null;
  const advisors = advisorResult.status === "fulfilled" ? advisorResult.value : null;
  const statusError = statusResult.status === "rejected" ? fetchRequestError(statusResult.reason, "/copilot/status") : null;
  const contextError = contextResult.status === "rejected" ? fetchRequestError(contextResult.reason, "/copilot/context") : null;
  const advisorError = advisorResult.status === "rejected" ? fetchRequestError(advisorResult.reason, "/copilot/advisors") : null;

  const backendState = status
    ? "connected"
    : statusError?.code === "backend_timeout" ? "timeout"
      : statusError?.category === "transport" ? "unreachable" : "server_error";

  let authorizationState = "indeterminate";
  if (context?.tenant_authorized) authorizationState = "authorized";
  else if (contextError?.status === 401) authorizationState = "unauthenticated";
  else if (contextError?.status === 403) authorizationState = "tenant_forbidden";

  let contextState = "unavailable";
  if (context) contextState = context.context_state || (context.records_available ? "available" : "empty");
  else if (contextError?.category === "authorization") contextState = "not_authorized";

  return {
    loading: false,
    status,
    context,
    advisors,
    backend: { state: backendState, data: status, error: statusError },
    authorization: { state: authorizationState, error: contextError?.category === "authorization" ? contextError : null },
    tenantContext: { state: contextState, data: context, error: contextError },
    advisorService: { state: advisors ? "connected" : "unavailable", data: advisors, error: advisorError },
  };
}

export function initialIdjwiSnapshot() {
  return {
    loading: true,
    status: null,
    context: null,
    advisors: null,
    backend: { state: "connecting", data: null, error: null },
    authorization: { state: "checking", error: null },
    tenantContext: { state: "loading", data: null, error: null },
    advisorService: { state: "loading", data: null, error: null },
  };
}
