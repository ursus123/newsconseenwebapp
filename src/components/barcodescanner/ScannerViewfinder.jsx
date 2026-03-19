import React, { useEffect, useRef, useState } from "react";
import { Html5QrcodeScanner, Html5QrcodeSupportedFormats } from "html5-qrcode";

export default function ScannerViewfinder({ onScan, isProcessing }) {
  const [status, setStatus] = useState("init"); // init | ready | detected | denied
  const scannerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;

    const scanner = new Html5QrcodeScanner(
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

    return () => {
      mountedRef.current = false;
      try { scanner.clear(); } catch (e) {}
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
      {/* Viewfinder wrapper */}
      <div className="relative mx-auto max-w-[480px] rounded-2xl overflow-hidden bg-black" style={{ aspectRatio: "4/3" }}>
        {/* html5-qrcode mounts here */}
        <div id="qr-reader" className="w-full h-full [&>*]:border-0 [&_video]:w-full [&_video]:h-full [&_video]:object-cover" />

        {/* Scanning overlay */}
        <div className="absolute inset-0 pointer-events-none">
          {/* Corner brackets */}
          {[
            "top-4 left-4 border-t-4 border-l-4 rounded-tl-lg",
            "top-4 right-4 border-t-4 border-r-4 rounded-tr-lg",
            "bottom-4 left-4 border-b-4 border-l-4 rounded-bl-lg",
            "bottom-4 right-4 border-b-4 border-r-4 rounded-br-lg",
          ].map((cls, i) => (
            <div key={i} className={`absolute w-8 h-8 border-white/80 ${cls}`} />
          ))}

          {/* Scanning line */}
          {status === "ready" && (
            <div
              className="absolute left-[10%] right-[10%] h-0.5 bg-red-500 shadow-[0_0_8px_2px_rgba(239,68,68,0.6)]"
              style={{ animation: "scan 2s ease-in-out infinite", position: "absolute" }}
            />
          )}

          {/* Detected flash */}
          {status === "detected" && (
            <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
              <div className="text-4xl">✅</div>
            </div>
          )}
        </div>
      </div>

      {/* Status message */}
      <p className={`text-center text-sm mt-2 font-semibold ${msg.color}`}>{msg.text}</p>
    </div>
  );
}