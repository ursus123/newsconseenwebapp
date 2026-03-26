import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { personData, enterpriseId, medicalData } = await req.json();

    // Validate required fields
    if (!personData.first_name || !personData.last_name) {
      return Response.json(
        { success: false, error: 'First and last name are required' },
        { status: 400 }
      );
    }

    if (!personData.person_type || !personData.primary_role) {
      return Response.json(
        { success: false, error: 'Person type and role are required' },
        { status: 400 }
      );
    }

    if (!enterpriseId) {
      return Response.json(
        { success: false, error: 'Enterprise ID is required' },
        { status: 400 }
      );
    }

    // Create Person record
    const person = await base44.entities.Person.create(personData);

    // Create Relationship record
    const relationship = await base44.entities.Relationship.create({
      relationship_type: 'person_enterprise',
      person_name: `${person.first_name} ${person.last_name}`,
      enterprise_name: enterpriseId, // Will be populated from the enterprise ID
      role: personData.primary_role,
      status: 'active',
      start_date: new Date().toISOString().split('T')[0],
    });

    // If medical data is provided, create medical records (note: using internal notes for now)
    let medicationProfile = null;
    if (medicalData && (medicalData.health_conditions || medicalData.allergies || medicalData.medications)) {
      // Create a medication profile if medications are provided
      if (medicalData.medications) {
        try {
          medicationProfile = await base44.entities.MedicationProfile.create({
            client_name: `${person.first_name} ${person.last_name}`,
            client_id: person.id,
            medication_name: 'Health Profile',
            route: 'oral',
            status: 'active',
            notes: `Health Conditions: ${medicalData.health_conditions || 'None'}\n\nAllergies: ${medicalData.allergies || 'None'}\n\nMedications: ${medicalData.medications || 'None'}`,
          });
        } catch (error) {
          console.error('Error creating medication profile:', error);
          // Don't fail the entire enrollment if medication profile fails
        }
      }

      // Update person with medical notes
      await base44.entities.Person.update(person.id, {
        internal_notes: `Health Conditions: ${medicalData.health_conditions || 'None'}\nAllergies: ${medicalData.allergies || 'None'}\nMedications: ${medicalData.medications || 'None'}`,
      });
    }

    return Response.json({
      success: true,
      message: 'Person successfully created and assigned to class',
      data: {
        person,
        relationship,
        medicationProfile,
      },
    });
  } catch (error) {
    console.error('Error creating person with relationship:', error);
    return Response.json(
      { success: false, error: error.message || 'Failed to create person' },
      { status: 500 }
    );
  }
});