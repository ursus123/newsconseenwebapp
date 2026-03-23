import React, { useEffect, useRef, useState } from "react";

// Style overrides for the html5-qrcode UI to fit dark theme
const scannerStyles = `
  #qr-reader { background: #0f172a !important; border: none !important; }
  #qr-reader__scan_region { background: #000 !important; }
  #qr-reader__dashboard { background: #1e293b !important; padding: 8px !important; }
  #qr-reader__dashboard button { background: #4f46e5 !important; color: white !important; border: none !important; border-radius: 8px !important; padding: 6px 12px !important; cursor: pointer !important; }
  #qr-reader__dashboard select { background: #334155 !important; color: white !important; border: 1px solid #475569 !important; border-radius: 6px !important; padding: 4px 8px !important; }
  #qr-reader__status_span { color: #94a3b8 !important; font-size: 12px !important; }
  #qr-reader img { display: none !important; }
`;

export default function ScannerViewfinder({ onScan, isProcessing }) {
  const [status, setStatus] = useState("init"); // init | ready | detected | denied
  const scannerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    let scanner;

    const init = async () => {
      const { Html5QrcodeScanner, Html5QrcodeSupportedFormats } = await import("html5-qrcode");

    scanner = new Html5QrcodeScanner(
      "qr-reader",
      {
        fps: 10,
        qrbox: { width: 250, height: 150 },
        formatsToSupport: [
          Html5QrcodeSupportedFormats.QR_CODE,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
        ],
        rememberLastUsedCamera: true,
        showTorchButtonIfSupported: true,
      },
      false
    );

      scannerRef.current = scanner;

      scanner.render(
        (decodedText) => {
          if (!mountedRef.current) return;
          setStatus("detected");
          onScan(decodedText);
          setTimeout(() => { if (mountedRef.current) setStatus("ready"); }, 1500);
        },
        () => {
          if (mountedRef.current && status === "init") setStatus("ready");
        }
      );

      // Detect when camera starts
      setTimeout(() => {
        if (mountedRef.current && status === "init") setStatus("ready");
      }, 2000);
    };

    init();

    return () => {
      mountedRef.current = false;
      try { if (scannerRef.current) scannerRef.current.clear(); } catch (e) {}
    };
  }, []);

  const statusMessages = {
    init:     { text: "Requesting camera access…", color: "text-slate-400" },
    ready:    { text: "Point camera at barcode", color: "text-slate-300" },
    detected: { text: "✅ Barcode detected!", color: "text-emerald-400" },
    denied:   { text: "Camera access denied — use manual entry below", color: "text-red-400" },
  };
  const msg = statusMessages[status];

  return (
    <div className="bg-slate-900 px-4 pt-4 pb-2">
      <style>{scannerStyles}</style>
      {/* Let html5-qrcode control its own layout — no clipping */}
      <div className="mx-auto max-w-[480px] rounded-2xl overflow-hidden bg-black">
        <div id="qr-reader" style={{ width: "100%" }} />
      </div>

      {/* Status message */}
      <p className={`text-center text-sm mt-2 font-semibold ${msg.color}`}>{msg.text}</p>
    </div>
  );
}