import React, { useState, useEffect, useRef } from "react";
import { X, Lock, AlertCircle } from "lucide-react";

const LOCK_KEY = (email) => `medadmin_pin_locked_${email}`;
const LOCK_UNTIL_KEY = (email) => `medadmin_pin_lock_until_${email}`;

export default function PINConfirmModal({ medName, clientName, userEmail, storedPin, onSuccess, onCancel, darkMode }) {
  const [digits, setDigits] = useState(["", "", "", ""]);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState("");
  const [locked, setLocked] = useState(false);
  const [lockSecondsLeft, setLockSecondsLeft] = useState(0);
  const refs = [useRef(), useRef(), useRef(), useRef()];

  useEffect(() => {
    const lockUntil = parseInt(localStorage.getItem(LOCK_UNTIL_KEY(userEmail)) || "0");
    if (Date.now() < lockUntil) {
      setLocked(true);
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
      setLockSecondsLeft(remaining);
    }
    refs[0].current?.focus();
  }, []);

  useEffect(() => {
    if (!locked) return;
    const t = setInterval(() => {
      const lockUntil = parseInt(localStorage.getItem(LOCK_UNTIL_KEY(userEmail)) || "0");
      const remaining = Math.ceil((lockUntil - Date.now()) / 1000);
      if (remaining <= 0) {
        setLocked(false);
        setLockSecondsLeft(0);
        localStorage.removeItem(LOCK_UNTIL_KEY(userEmail));
      } else {
        setLockSecondsLeft(remaining);
      }
    }, 1000);
    return () => clearInterval(t);
  }, [locked]);

  const handleDigit = (index, val) => {
    if (!/^\d?$/.test(val)) return;
    const next = [...digits];
    next[index] = val;
    setDigits(next);
    if (val && index < 3) refs[index + 1].current?.focus();
    if (next.every((d) => d !== "") && next.join("").length === 4) {
      verifyPin(next.join(""));
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      refs[index - 1].current?.focus();
    }
  };

  const verifyPin = (entered) => {
    const expected = storedPin || "0000";
    if (entered === expected) {
      localStorage.removeItem(LOCK_UNTIL_KEY(userEmail));
      onSuccess();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setDigits(["", "", "", ""]);
      refs[0].current?.focus();
      if (newAttempts >= 3) {
        const lockUntil = Date.now() + 5 * 60 * 1000;
        localStorage.setItem(LOCK_UNTIL_KEY(userEmail), String(lockUntil));
        setLocked(true);
        setLockSecondsLeft(300);
        setError("Too many failed attempts. Locked for 5 minutes.");
      } else {
        setError(`Incorrect PIN. ${3 - newAttempts} attempt${3 - newAttempts === 1 ? "" : "s"} remaining.`);
      }
    }
  };

  const bg = darkMode ? "bg-slate-800 text-slate-100" : "bg-white text-gray-900";
  const inputBg = darkMode ? "bg-slate-700 border-slate-600 text-slate-100" : "bg-gray-50 border-gray-200 text-gray-900";

  return (
    <div className="fixed inset-0 bg-black/70 z-[200] flex items-center justify-center p-4">
      <div className={`${bg} rounded-3xl w-full max-w-sm p-6 space-y-6 shadow-2xl`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-500" />
            <p className="font-black text-base">PIN Required</p>
          </div>
          <button onClick={onCancel}><X className="w-5 h-5 text-gray-400" /></button>
        </div>

        <div className="text-center">
          <p className="text-sm font-bold text-blue-600">{medName}</p>
          <p className="text-xs text-gray-400 mt-0.5">for {clientName}</p>
          <p className="text-xs mt-2 opacity-60">Enter your 4-digit administration PIN to confirm</p>
        </div>

        {locked ? (
          <div className="bg-red-50 rounded-2xl p-4 text-center">
            <AlertCircle className="w-8 h-8 text-red-500 mx-auto mb-2" />
            <p className="text-sm font-bold text-red-700">Account Locked</p>
            <p className="text-xs text-red-500 mt-1">Unlocks in {Math.floor(lockSecondsLeft / 60)}:{String(lockSecondsLeft % 60).padStart(2, "0")}</p>
          </div>
        ) : (
          <>
            <div className="flex justify-center gap-3">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={refs[i]}
                  type="password"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleDigit(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={`w-14 h-16 text-center text-2xl font-black rounded-2xl border-2 focus:outline-none focus:border-blue-500 ${inputBg}`}
                />
              ))}
            </div>
            {error && (
              <div className="flex items-center gap-2 bg-red-50 rounded-xl px-3 py-2">
                <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
                <p className="text-xs font-semibold text-red-700">{error}</p>
              </div>
            )}
          </>
        )}

        <button onClick={onCancel} className="w-full py-3 rounded-2xl border-2 border-gray-200 text-gray-500 font-bold text-sm">
          Cancel
        </button>
      </div>
    </div>
  );
}