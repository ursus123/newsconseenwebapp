import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function ClientStep4EmergencyContact({ formData, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="emergency_contact">Emergency Contact Name *</Label>
        <Input
          id="emergency_contact"
          placeholder="John Smith"
          value={formData.emergency_contact}
          onChange={(e) => onChange('emergency_contact', e.target.value)}
          className="mt-1"
        />
      </div>

      <div>
        <Label htmlFor="emergency_phone">Emergency Contact Phone *</Label>
        <Input
          id="emergency_phone"
          type="tel"
          placeholder="(555) 987-6543"
          value={formData.emergency_phone}
          onChange={(e) => onChange('emergency_phone', e.target.value)}
          className="mt-1"
        />
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>Important:</strong> Emergency contact information is critical. Please ensure the name and phone number
          are accurate and belong to someone who can be reached immediately in case of emergency.
        </p>
      </div>
    </div>
  );
}