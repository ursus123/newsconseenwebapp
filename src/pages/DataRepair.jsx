import React, { useState } from "react"
import { base44 } from "@/api/base44Client"

const ENTERPRISE_ID = "69bc8553af5d08936d75e94f"

export default function DataRepair() {
  const [status, setStatus] = useState("idle")
  const [log, setLog] = useState([])

  const addLog = (msg) => setLog(l => [...l, msg])

  const runFix = async () => {
    setStatus("running")
    setLog([])

    try {
      // Step 1: Fix BrightStar enterprise company_id
      addLog("Fixing BrightStar Care LLC company_id...")
      await base44.entities.Enterprise.update(ENTERPRISE_ID, {
        company_id: ENTERPRISE_ID
      })
      addLog("✅ Enterprise company_id fixed")

      // Step 2: Verify the fix
      addLog("Verifying fix...")
      const check = await base44.entities.Enterprise.filter({
        company_id: ENTERPRISE_ID
      })
      addLog(`✅ Verification: found ${check.length} enterprise(s) with correct company_id`)

      // Step 3: Fix all other entities
      // that have null or empty company_id
      const entities = [
        { name: "Person",       obj: base44.entities.Person },
        { name: "Product",      obj: base44.entities.Product },
        { name: "Service",      obj: base44.entities.Service },
        { name: "Address",      obj: base44.entities.Address },
        { name: "Relationship", obj: base44.entities.Relationship },
        { name: "Task",         obj: base44.entities.Task },
        { name: "Transaction",  obj: base44.entities.Transaction },
      ]

      for (const { name, obj } of entities) {
        addLog(`Scanning ${name}...`)
        const all = await obj.list()
        const toFix = all.filter(r => 
          !r.company_id || r.company_id === ""
        )
        addLog(`Found ${toFix.length} ${name} records to fix`)
        
        for (const record of toFix) {
          await obj.update(record.id, {
            company_id: ENTERPRISE_ID
          })
        }
        
        if (toFix.length > 0) {
          addLog(`✅ Fixed ${toFix.length} ${name} records`)
        }
      }

      addLog("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━")
      addLog("✅ ALL DONE — BrightStar admin can now see their data")
      addLog("Tell the admin to refresh their browser")
      setStatus("done")

    } catch (e) {
      addLog("❌ Error: " + e.message)
      setStatus("error")
    }
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">
          Data Repair Tool
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Super admin only — fixes company_id on all records
        </p>
      </div>

      <div className="bg-blue-50 border border-blue-200 
        rounded-2xl px-5 py-4">
        <p className="text-sm text-blue-700 font-medium">
          Target Enterprise ID
        </p>
        <p className="text-xs font-mono text-blue-600 mt-1">
          {ENTERPRISE_ID}
        </p>
        <p className="text-xs text-blue-500 mt-1">
          BrightStar Care LLC
        </p>
      </div>

      <button
        onClick={runFix}
        disabled={status === "running"}
        className="w-full py-4 bg-emerald-600 
          hover:bg-emerald-700 text-white font-bold 
          text-base rounded-2xl transition-colors
          disabled:opacity-50"
      >
        {status === "running" 
          ? "Running repair..." 
          : status === "done"
            ? "✅ Repair Complete — Run Again?"
            : "Run Full Data Repair"
        }
      </button>

      {log.length > 0 && (
        <div className="bg-slate-900 rounded-2xl p-5 
          space-y-1 max-h-96 overflow-y-auto">
          {log.map((line, i) => (
            <p key={i} className={`text-xs font-mono ${
              line.startsWith("✅") 
                ? "text-emerald-400" 
                : line.startsWith("❌")
                  ? "text-rose-400"
                  : line.startsWith("━")
                    ? "text-slate-600"
                    : "text-slate-300"
            }`}>
              {line}
            </p>
          ))}
        </div>
      )}

      {status === "done" && (
        <div className="bg-emerald-50 border border-emerald-200 
          rounded-2xl px-5 py-4 text-center">
          <p className="text-emerald-700 font-bold">
            ✅ Repair complete
          </p>
          <p className="text-emerald-600 text-sm mt-1">
            Ask the BrightStar admin to refresh their 
            browser — they should now see all their data.
          </p>
        </div>
      )}
    </div>
  )
}