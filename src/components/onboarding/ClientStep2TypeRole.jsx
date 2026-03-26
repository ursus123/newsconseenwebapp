import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export default function ClientStep2TypeRole({ formData, onChange }) {
  const [personTypes, setPersonTypes] = useState([]);
  const [primaryRoles, setPrimaryRoles] = useState([]);
  const [loadingTypes, setLoadingTypes] = useState(true);
  const [loadingRoles, setLoadingRoles] = useState(false);

  useEffect(() => {
    const fetchPersonTypes = async () => {
      try {
        const options = await base44.entities.MasterDataOption.filter({
          entity_type: 'person',
          field_name: 'person_type',
          is_active: true,
        });
        setPersonTypes(options);
      } catch (error) {
        console.error('Error fetching person types:', error);
      } finally {
        setLoadingTypes(false);
      }
    };

    fetchPersonTypes();
  }, []);

  useEffect(() => {
    const fetchPrimaryRoles = async () => {
      if (!formData.person_type) return;

      setLoadingRoles(true);
      try {
        const options = await base44.entities.MasterDataOption.filter({
          entity_type: 'person',
          field_name: 'primary_role',
          parent_value: formData.person_type,
          is_active: true,
        });
        setPrimaryRoles(options);
      } catch (error) {
        console.error('Error fetching roles:', error);
      } finally {
        setLoadingRoles(false);
      }
    };

    fetchPrimaryRoles();
  }, [formData.person_type]);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="person_type">Person Type *</Label>
        <Select
          value={formData.person_type}
          onValueChange={(value) => {
            onChange('person_type', value);
            onChange('primary_role', ''); // Reset role when type changes
          }}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Select person type" />
          </SelectTrigger>
          <SelectContent>
            {loadingTypes ? (
              <div className="p-2 text-sm text-slate-500">Loading...</div>
            ) : personTypes.length > 0 ? (
              personTypes.map((type) => (
                <SelectItem key={type.id} value={type.value}>
                  {type.label || type.value}
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-slate-500">No person types available</div>
            )}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label htmlFor="primary_role">Role *</Label>
        <Select value={formData.primary_role} onValueChange={(value) => onChange('primary_role', value)}>
          <SelectTrigger className="mt-1" disabled={!formData.person_type || loadingRoles}>
            <SelectValue placeholder={loadingRoles ? 'Loading roles...' : 'Select role'} />
          </SelectTrigger>
          <SelectContent>
            {loadingRoles ? (
              <div className="p-2 text-sm text-slate-500">Loading...</div>
            ) : primaryRoles.length > 0 ? (
              primaryRoles.map((role) => (
                <SelectItem key={role.id} value={role.value}>
                  {role.label || role.value}
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-slate-500">No roles available for this type</div>
            )}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>Tip:</strong> Select the person type first (e.g., "Client" for students, "Staff" for teachers),
          then the specific role will be available below.
        </p>
      </div>
    </div>
  );
}