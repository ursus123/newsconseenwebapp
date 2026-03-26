import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all pending invitations
    const invitations = await base44.asServiceRole.entities.PendingInvitation.list();
    if (!invitations || invitations.length === 0) {
      return Response.json({ ok: true, processed: 0 });
    }

    // Process each invitation in parallel
    const results = await Promise.all(invitations.map(async (invitation) => {
      // Find matching registered user by email (targeted filter, not full list)
      const users = await base44.asServiceRole.entities.User.filter({ email: invitation.email });
      const user = users?.[0];
      if (!user) return false; // Not registered yet

      // Stamp company_id and role if not already set
      if (!user.company_id) {
        const updatePayload = { company_id: invitation.company_id };
        if (invitation.role) updatePayload.role = invitation.role;
        await base44.asServiceRole.entities.User.update(user.id, updatePayload);
      }

      // Clean up the processed invitation
      await base44.asServiceRole.entities.PendingInvitation.delete(invitation.id);
      return true;
    }));

    const processed = results.filter(Boolean).length;
    return Response.json({ ok: true, processed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});