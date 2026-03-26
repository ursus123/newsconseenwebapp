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
import { Card } from '@/components/ui/card';

export default function ClientStep3ClassAssignment({ formData, onChange }) {
  const [enterprises, setEnterprises] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchEnterprises = async () => {
      try {
        const data = await base44.entities.Enterprise.filter({
          status: 'active',
        });
        setEnterprises(data);
      } catch (error) {
        console.error('Error fetching enterprises:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchEnterprises();
  }, []);

  const selectedEnterprise = enterprises.find(e => e.id === formData.enterprise_id);

  return (
    <div className="space-y-4">
      <div>
        <Label htmlFor="enterprise_id">Select Class or School *</Label>
        <Select
          value={formData.enterprise_id}
          onValueChange={(value) => {
            const selected = enterprises.find(e => e.id === value);
            onChange('enterprise_id', value);
            onChange('enterprise_name', selected?.enterprise_name || '');
          }}
        >
          <SelectTrigger className="mt-1">
            <SelectValue placeholder="Choose a class or school" />
          </SelectTrigger>
          <SelectContent>
            {loading ? (
              <div className="p-2 text-sm text-slate-500">Loading...</div>
            ) : enterprises.length > 0 ? (
              enterprises.map((ent) => (
                <SelectItem key={ent.id} value={ent.id}>
                  {ent.enterprise_name}
                </SelectItem>
              ))
            ) : (
              <div className="p-2 text-sm text-slate-500">No active classes found</div>
            )}
          </SelectContent>
        </Select>
      </div>

      {selectedEnterprise && (
        <Card className="p-4 bg-emerald-50 border-emerald-200">
          <div className="space-y-2">
            <div>
              <p className="text-sm font-medium text-slate-700">Name</p>
              <p className="text-base font-semibold text-emerald-900">{selectedEnterprise.enterprise_name}</p>
            </div>
            {selectedEnterprise.description && (
              <div>
                <p className="text-sm font-medium text-slate-700">Description</p>
                <p className="text-sm text-emerald-800">{selectedEnterprise.description}</p>
              </div>
            )}
            {selectedEnterprise.city && (
              <div>
                <p className="text-sm font-medium text-slate-700">Location</p>
                <p className="text-sm text-emerald-800">
                  {selectedEnterprise.city}{selectedEnterprise.region ? `, ${selectedEnterprise.region}` : ''}
                </p>
              </div>
            )}
          </div>
        </Card>
      )}

      <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
        <p className="text-sm text-amber-900">
          <strong>Note:</strong> If the class or school you're looking for doesn't exist, you'll need to create it first
          in the Enterprises section.
        </p>
      </div>
    </div>
  );
}