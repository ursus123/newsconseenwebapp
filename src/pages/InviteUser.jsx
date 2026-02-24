import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Mail, CheckCircle, AlertCircle, Users, Building2, Phone } from "lucide-react";

function Field({ label, required, children }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-slate-700">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}

export default function InviteUser() {
  const [currentUser, setCurrentUser] = React.useState(null);
  React.useEffect(() => { base44.auth.me().then(setCurrentUser).catch(() => {}); }, []);
  const isSuperAdmin = currentUser?.role === "super_admin";

  const [form, setForm] = useState({ first_name: "", last_name: "", email: "", phone: "", enterprise_name: "", company_id: "", role: "user" });
  const [status, setStatus] = useState(null); // null | "loading" | "success" | "error"
  const [errorMsg, setErrorMsg] = useState("");
  const { data: enterprises = [] } = useQuery({ queryKey: ["enterprises"], queryFn: () => base44.entities.Enterprise.list() });
  const { data: appUsers = [] } = useQuery({ queryKey: ["appUsers"], queryFn: () => base44.entities.User.list() });

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.first_name || !form.last_name) return;
    setStatus("loading");
    setErrorMsg("");
    try {
      // Send the platform invitation (email + role)
      await base44.users.inviteUser(form.email, form.role);

      // Also create a Person record to store the full profile
      await base44.entities.Person.create({
        first_name: form.first_name,
        last_name: form.last_name,
        email: form.email,
        phone: form.phone || undefined,
        person_type: "employee",
        status: "active",
        company_id: form.company_id || currentUser?.company_id || undefined,
        internal_notes: form.enterprise_name ? `Enterprise: ${form.enterprise_name}` : undefined,
      });

      setStatus("success");
      setForm({ first_name: "", last_name: "", email: "", phone: "", enterprise_name: "", company_id: "", role: "user" });
    } catch (err) {
      setStatus("error");
      setErrorMsg(err?.message || "Failed to send invitation. The user may already exist.");
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-800 tracking-tight">Invite & Register User</h1>
        <p className="text-sm text-slate-400 mt-1">
          Fill in the user's details and send them an invitation to join the app.
        </p>
      </div>

      {/* Form */}
      <Card className="p-6 space-y-5">
        <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
          <UserPlus className="w-4 h-4 text-emerald-600" />
          <span className="text-sm font-semibold text-slate-700">New User Details</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="First Name" required>
              <Input value={form.first_name} onChange={(e) => set("first_name", e.target.value)} className="rounded-xl" placeholder="John" />
            </Field>
            <Field label="Last Name" required>
              <Input value={form.last_name} onChange={(e) => set("last_name", e.target.value)} className="rounded-xl" placeholder="Smith" />
            </Field>
          </div>

          <Field label="Email Address" required>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="rounded-xl pl-9" placeholder="john@company.com" />
            </div>
          </Field>

          <Field label="Phone Number">
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="rounded-xl pl-9" placeholder="+1 555 000 0000" />
            </div>
          </Field>

          <Field label="Enterprise">
            <div className="relative">
              <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 z-10 pointer-events-none" />
              <Select value={form.enterprise_name} onValueChange={(v) => set("enterprise_name", v)}>
                <SelectTrigger className="rounded-xl pl-9">
                  <SelectValue placeholder="Select enterprise..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={null}>— None —</SelectItem>
                  {enterprises.map((e) => (
                    <SelectItem key={e.id} value={e.enterprise_name}>{e.enterprise_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </Field>

          {isSuperAdmin && (
            <Field label="Company ID">
              <Input value={form.company_id} onChange={(e) => set("company_id", e.target.value)} className="rounded-xl" placeholder="e.g. chilohcare" />
            </Field>
          )}

          <Field label="Role" required>
            <Select value={form.role} onValueChange={(v) => set("role", v)}>
              <SelectTrigger className="rounded-xl">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="user">User — sees only what admin allows</SelectItem>
                <SelectItem value="admin">Admin — manages their company's data</SelectItem>
                {isSuperAdmin && <SelectItem value="super_admin">Super Admin — sees all companies</SelectItem>}
              </SelectContent>
            </Select>
          </Field>

          {/* Status messages */}
          {status === "success" && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Invitation sent successfully! The user will receive an email to set up their account.
            </div>
          )}
          {status === "error" && (
            <div className="flex items-center gap-2 bg-rose-50 border border-rose-200 rounded-xl px-4 py-3 text-sm text-rose-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <Button
            type="submit"
            disabled={status === "loading" || !form.email || !form.first_name || !form.last_name}
            className="w-full bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-500/20"
          >
            {status === "loading" ? "Sending..." : <><UserPlus className="w-4 h-4 mr-2" /> Send Invitation</>}
          </Button>
        </form>
      </Card>

      {/* Existing users list */}
      <Card className="p-6">
        <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
          <Users className="w-4 h-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">Registered Users ({appUsers.length})</span>
        </div>
        <div className="space-y-2">
          {appUsers.length === 0 && <p className="text-sm text-slate-400">No users yet.</p>}
          {appUsers.map((u) => (
            <div key={u.id} className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-slate-50 transition-colors">
              <div>
                <p className="text-sm font-medium text-slate-700">{u.full_name || "—"}</p>
                <p className="text-xs text-slate-400">{u.email}</p>
              </div>
              <Badge className={
                u.role === "super_admin" ? "bg-emerald-50 text-emerald-700" :
                u.role === "admin" ? "bg-violet-50 text-violet-700" :
                "bg-slate-100 text-slate-500"
              }>
                {u.role || "user"}
              </Badge>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}