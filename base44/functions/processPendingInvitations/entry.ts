import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);

    // Get all pending invitations
    const invitations = await base44.asServiceRole.entities.PendingInvitation.list();
    if (!invitations || invitations.length === 0) {
      return Response.json({ ok: true, processed: 0 });
    }

    // Get all registered users
    const users = await base44.asServiceRole.entities.User.list();

    let processed = 0;
    for (const invitation of invitations) {
      // Find matching registered user by email
      const user = users.find((u) => u.email === invitation.email);
      if (!user) continue; // Not registered yet

      // If already has company_id, just clean up
      if (!user.company_id) {
        const updatePayload = { company_id: invitation.company_id };
        if (invitation.role) {
          updatePayload.role = invitation.role;
        }
        await base44.asServiceRole.entities.User.update(user.id, updatePayload);
      }

      // Clean up the processed invitation
      await base44.asServiceRole.entities.PendingInvitation.delete(invitation.id);
      processed++;
    }

    return Response.json({ ok: true, processed });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});