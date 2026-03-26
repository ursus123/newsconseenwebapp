import React from 'react';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';

export default function ClientStep5Medical({ formData, onChange }) {
  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="health_conditions">Health Conditions</Label>
        <Textarea
          id="health_conditions"
          placeholder="e.g., Asthma, Diabetes, Eczema (optional)"
          value={formData.health_conditions}
          onChange={(e) => onChange('health_conditions', e.target.value)}
          className="mt-1 min-h-24"
        />
      </div>

      <div>
        <Label htmlFor="allergies">Allergies</Label>
        <Textarea
          id="allergies"
          placeholder="e.g., Peanuts, Penicillin, Shellfish (optional)"
          value={formData.allergies}
          onChange={(e) => onChange('allergies', e.target.value)}
          className="mt-1 min-h-24"
        />
      </div>

      <div>
        <Label htmlFor="medications">Current Medications</Label>
        <Textarea
          id="medications"
          placeholder="e.g., Inhaler (Albuterol), Insulin, Antihistamine (optional)"
          value={formData.medications}
          onChange={(e) => onChange('medications', e.target.value)}
          className="mt-1 min-h-24"
        />
      </div>

      <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
        <p className="text-sm text-blue-900">
          <strong>Note:</strong> Medical information is optional but highly recommended for student safety. Staff
          should have quick access to this information in case of medical emergencies.
        </p>
      </div>
    </div>
  );
}