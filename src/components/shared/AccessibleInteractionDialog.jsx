import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const INTERACTION_EVENT = "newsconseen:interaction-request";

function requestInteraction(options) {
  if (typeof window === "undefined") {
    return Promise.resolve(options.kind === "confirm" ? false : null);
  }
  return new Promise(resolve => {
    window.dispatchEvent(new CustomEvent(INTERACTION_EVENT, {
      detail: { ...options, resolve },
    }));
  });
}

export function requestText({
  title,
  message,
  label = "Response",
  defaultValue = "",
  confirmLabel = "Continue",
  required = true,
}) {
  return requestInteraction({
    kind: "text",
    title,
    message,
    label,
    defaultValue,
    confirmLabel,
    required,
  });
}

export function requestConfirmation({
  title,
  message,
  confirmLabel = "Confirm",
  tone = "default",
}) {
  return requestInteraction({
    kind: "confirm",
    title,
    message,
    confirmLabel,
    tone,
  });
}

export function showNotice({
  title = "Company Graph notice",
  message,
  confirmLabel = "Close",
  tone = "info",
}) {
  return requestInteraction({
    kind: "notice",
    title,
    message,
    confirmLabel,
    tone,
  });
}

export default function AccessibleInteractionHost() {
  const [queue, setQueue] = useState([]);
  const [value, setValue] = useState("");
  const [validationMessage, setValidationMessage] = useState("");
  const returnFocusRef = useRef(null);
  const request = queue[0] || null;

  useEffect(() => {
    const receive = event => {
      if (!event.detail?.resolve) return;
      setQueue(current => {
        if (current.length === 0) {
          returnFocusRef.current = document.activeElement;
        }
        return [...current, event.detail];
      });
    };
    window.addEventListener(INTERACTION_EVENT, receive);
    return () => window.removeEventListener(INTERACTION_EVENT, receive);
  }, []);

  useEffect(() => {
    setValue(request?.defaultValue || "");
    setValidationMessage("");
  }, [request]);

  const settle = useCallback(result => {
    request?.resolve(result);
    setQueue(current => current.slice(1));
    if (queue.length === 1) {
      window.setTimeout(() => {
        returnFocusRef.current?.focus?.();
        returnFocusRef.current = null;
      }, 0);
    }
  }, [queue.length, request]);

  const cancel = useCallback(() => {
    if (!request) return;
    settle(request.kind === "confirm" ? false : null);
  }, [request, settle]);

  const submit = useCallback(event => {
    event?.preventDefault();
    if (!request) return;
    if (request.kind === "text") {
      if (request.required && !value.trim()) {
        setValidationMessage(`${request.label || "Response"} is required.`);
        return;
      }
      settle(value);
      return;
    }
    settle(request.kind === "confirm" ? true : undefined);
  }, [request, settle, value]);

  const toneClasses = ["danger", "error"].includes(request?.tone)
    ? "bg-rose-600 hover:bg-rose-700 focus-visible:ring-rose-500"
    : "bg-emerald-600 hover:bg-emerald-700 focus-visible:ring-emerald-500";

  return (
    <>
      <Dialog open={Boolean(request)} onOpenChange={open => { if (!open) cancel(); }}>
        <DialogContent
          hideClose
          className="max-w-md rounded-2xl border-slate-200"
          onOpenAutoFocus={event => {
            if (request?.kind !== "text") return;
            event.preventDefault();
            document.getElementById("newsconseen-interaction-input")?.focus();
          }}
        >
          <form onSubmit={submit} noValidate>
            <DialogHeader>
              <DialogTitle className="text-slate-900">{request?.title || "Company Graph"}</DialogTitle>
              <DialogDescription className="pt-2 leading-6 text-slate-600">
                {request?.message}
              </DialogDescription>
            </DialogHeader>

            {request?.kind === "text" && (
              <div className="mt-5">
                <label htmlFor="newsconseen-interaction-input" className="text-sm font-semibold text-slate-700">
                  {request.label}
                </label>
                <textarea
                  id="newsconseen-interaction-input"
                  value={value}
                  onChange={event => {
                    setValue(event.target.value);
                    if (validationMessage) setValidationMessage("");
                  }}
                  rows={3}
                  required={request.required}
                  aria-invalid={Boolean(validationMessage)}
                  aria-describedby={validationMessage ? "newsconseen-interaction-error" : undefined}
                  className="mt-2 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-800 outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-200"
                />
                {validationMessage && (
                  <p id="newsconseen-interaction-error" role="alert" className="mt-2 text-xs font-semibold text-rose-700">
                    {validationMessage}
                  </p>
                )}
              </div>
            )}

            <DialogFooter className="mt-6 gap-2 sm:space-x-0">
              {request?.kind !== "notice" && (
                <button
                  type="button"
                  onClick={cancel}
                  className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                >
                  Cancel
                </button>
              )}
              <button
                type="submit"
                className={`rounded-xl px-4 py-2 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${toneClasses}`}
              >
                {request?.confirmLabel || "Continue"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {request ? `${request.title || "Company Graph dialog"} opened.` : ""}
      </p>
    </>
  );
}
