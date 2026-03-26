import { createClientFromRequest } from 'npm:@base44/sdk@0.8.23';

const MASTER_DATA_OPTIONS = [
  // Person Type options (base types)
  { entity_type: 'person', field_name: 'person_type', value: 'staff', label: 'Staff' },
  { entity_type: 'person', field_name: 'person_type', value: 'client', label: 'Client' },
  { entity_type: 'person', field_name: 'person_type', value: 'contact', label: 'Contact' },
  { entity_type: 'person', field_name: 'person_type', value: 'volunteer', label: 'Volunteer' },

  // Primary Role options for Staff
  { entity_type: 'person', field_name: 'primary_role', value: 'teacher', label: 'Teacher', parent_value: 'staff' },
  { entity_type: 'person', field_name: 'primary_role', value: 'manager', label: 'Manager', parent_value: 'staff' },
  { entity_type: 'person', field_name: 'primary_role', value: 'admin', label: 'Administrator', parent_value: 'staff' },
  { entity_type: 'person', field_name: 'primary_role', value: 'coordinator', label: 'Coordinator', parent_value: 'staff' },
  { entity_type: 'person', field_name: 'primary_role', value: 'staff_member', label: 'Staff Member', parent_value: 'staff' },

  // Primary Role options for Client
  { entity_type: 'person', field_name: 'primary_role', value: 'student', label: 'Student', parent_value: 'client' },
  { entity_type: 'person', field_name: 'primary_role', value: 'patient', label: 'Patient', parent_value: 'client' },
  { entity_type: 'person', field_name: 'primary_role', value: 'customer', label: 'Customer', parent_value: 'client' },
  { entity_type: 'person', field_name: 'primary_role', value: 'client_member', label: 'Client Member', parent_value: 'client' },

  // Primary Role options for Contact
  { entity_type: 'person', field_name: 'primary_role', value: 'vendor', label: 'Vendor', parent_value: 'contact' },
  { entity_type: 'person', field_name: 'primary_role', value: 'supplier', label: 'Supplier', parent_value: 'contact' },
  { entity_type: 'person', field_name: 'primary_role', value: 'partner', label: 'Partner', parent_value: 'contact' },

  // Primary Role options for Volunteer
  { entity_type: 'person', field_name: 'primary_role', value: 'volunteer_member', label: 'Volunteer', parent_value: 'volunteer' },

  // Engagement Model options
  { entity_type: 'person', field_name: 'engagement_model', value: 'employed', label: 'Employed' },
  { entity_type: 'person', field_name: 'engagement_model', value: 'contracted', label: 'Contracted' },
  { entity_type: 'person', field_name: 'engagement_model', value: 'freelance', label: 'Freelance' },
  { entity_type: 'person', field_name: 'engagement_model', value: 'volunteer', label: 'Volunteer' },
  { entity_type: 'person', field_name: 'engagement_model', value: 'enrolled', label: 'Enrolled' },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get company_id from user (or use null for system defaults)
    const companyId = user.company_id || null;

    // Fetch existing master data options to avoid duplicates
    const existingOptions = await base44.entities.MasterDataOption.filter({});
    const existingKeys = new Set(existingOptions.map(o => `${o.entity_type}:${o.field_name}:${o.value}`));

    // Filter out options that already exist
    const optionsToCreate = MASTER_DATA_OPTIONS.filter(opt => {
      const key = `${opt.entity_type}:${opt.field_name}:${opt.value}`;
      return !existingKeys.has(key);
    }).map(opt => ({
      ...opt,
      company_id: companyId,
      is_system_default: true,
      is_active: true,
      sort_order: 0,
    }));

    if (optionsToCreate.length === 0) {
      return Response.json({
        success: true,
        message: 'All master data options already exist',
        created: 0,
      });
    }

    // Bulk create the options
    await base44.entities.MasterDataOption.bulkCreate(optionsToCreate);

    return Response.json({
      success: true,
      message: `Successfully created ${optionsToCreate.length} master data options`,
      created: optionsToCreate.length,
    });
  } catch (error) {
    console.error('Seed error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});