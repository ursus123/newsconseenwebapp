import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();

    const { event, data } = body;

    // Only handle create events
    if (event?.type !== 'create') {
      return Response.json({ ok: true, skipped: true });
    }

    const userEmail = data?.email;
    if (!userEmail) {
      return Response.json({ ok: true, skipped: 'no email' });
    }

    // Look up pending invitation for this email
    const invitations = await base44.asServiceRole.entities.PendingInvitation.filter({ email: userEmail });
    const invitation = invitations?.[0];

    if (!invitation) {
      return Response.json({ ok: true, skipped: 'no pending invitation' });
    }

    // Stamp company_id (and role if set) on the new User record
    const updatePayload = { company_id: invitation.company_id };
    if (invitation.role && invitation.role !== data?.role) {
      updatePayload.role = invitation.role;
    }

    await base44.asServiceRole.entities.User.update(data.id, updatePayload);

    // Clean up the invitation record
    await base44.asServiceRole.entities.PendingInvitation.delete(invitation.id);

    return Response.json({ ok: true, stamped: true, company_id: invitation.company_id });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});