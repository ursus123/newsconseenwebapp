import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ChevronLeft, ChevronRight, CheckCircle2, Loader2 } from 'lucide-react';
import ClientStep1PersonalInfo from '@/components/onboarding/ClientStep1PersonalInfo';
import ClientStep2TypeRole from '@/components/onboarding/ClientStep2TypeRole';
import ClientStep3ClassAssignment from '@/components/onboarding/ClientStep3ClassAssignment';
import ClientStep4EmergencyContact from '@/components/onboarding/ClientStep4EmergencyContact';
import ClientStep5Medical from '@/components/onboarding/ClientStep5Medical';
import { toast } from 'sonner';

const STEPS = [
  { id: 1, title: 'Personal Information', description: 'Basic name and contact details' },
  { id: 2, title: 'Role & Type', description: 'Select person type and role' },
  { id: 3, title: 'Class Assignment', description: 'Assign to a class or enterprise' },
  { id: 4, title: 'Emergency Contact', description: 'Emergency contact information' },
  { id: 5, title: 'Medical Details', description: 'Health and medical information (optional)' },
];

export default function ClientOnboarding() {
  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    // Step 1: Personal Info
    first_name: '',
    last_name: '',
    date_of_birth: '',
    gender: '',
    phone: '',
    email: '',

    // Step 2: Type & Role
    person_type: '',
    primary_role: '',

    // Step 3: Class Assignment
    enterprise_id: '',
    enterprise_name: '',

    // Step 4: Emergency Contact
    emergency_contact: '',
    emergency_phone: '',

    // Step 5: Medical
    health_conditions: '',
    allergies: '',
    medications: '',
  });

  const handleNextStep = () => {
    if (currentStep < STEPS.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handlePreviousStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleFormChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async () => {
    if (!formData.first_name || !formData.last_name) {
      toast.error('First and last name are required');
      return;
    }

    if (!formData.person_type || !formData.primary_role) {
      toast.error('Person type and role are required');
      return;
    }

    if (!formData.enterprise_id) {
      toast.error('Class assignment is required');
      return;
    }

    setIsSubmitting(true);

    try {
      // Create Person record
      const personData = {
        first_name: formData.first_name,
        last_name: formData.last_name,
        date_of_birth: formData.date_of_birth || undefined,
        gender: formData.gender || undefined,
        phone: formData.phone || undefined,
        email: formData.email || undefined,
        person_type: formData.person_type,
        primary_role: formData.primary_role,
        emergency_contact: formData.emergency_contact || undefined,
        emergency_phone: formData.emergency_phone || undefined,
      };

      const personResponse = await base44.functions.invoke('createPersonWithRelationship', {
        personData,
        enterpriseId: formData.enterprise_id,
        medicalData: formData.health_conditions || formData.allergies || formData.medications ? {
          health_conditions: formData.health_conditions,
          allergies: formData.allergies,
          medications: formData.medications,
        } : null,
      });

      if (personResponse.data.success) {
        toast.success(`${formData.first_name} ${formData.last_name} successfully enrolled!`);
        setTimeout(() => {
          window.location.href = '/People';
        }, 1500);
      } else {
        toast.error(personResponse.data.error || 'Failed to create record');
      }
    } catch (error) {
      toast.error(error.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const progressPercentage = (currentStep / STEPS.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-900 mb-2">Enroll a New Student/Client</h1>
          <p className="text-slate-600">Complete this guided form to add them to the system</p>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-slate-700">Step {currentStep} of {STEPS.length}</span>
            <span className="text-sm text-slate-500">{Math.round(progressPercentage)}%</span>
          </div>
          <div className="w-full bg-slate-200 rounded-full h-2">
            <div
              className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Step Indicators */}
        <div className="grid grid-cols-5 gap-2 mb-8">
          {STEPS.map((step) => (
            <div key={step.id} className="text-center">
              <button
                onClick={() => setCurrentStep(step.id)}
                disabled={step.id > currentStep}
                className={`w-10 h-10 rounded-full mx-auto mb-2 font-semibold transition-all flex items-center justify-center ${
                  currentStep === step.id
                    ? 'bg-emerald-500 text-white ring-2 ring-emerald-300'
                    : step.id < currentStep
                    ? 'bg-emerald-100 text-emerald-700'
                    : 'bg-slate-200 text-slate-500 cursor-not-allowed'
                }`}
              >
                {step.id < currentStep ? <CheckCircle2 className="w-5 h-5" /> : step.id}
              </button>
              <p className="text-xs font-medium text-slate-700 hidden sm:block">{step.title}</p>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <Card className="p-6 shadow-lg">
          <div className="mb-8">
            <h2 className="text-2xl font-bold text-slate-900 mb-1">{STEPS[currentStep - 1].title}</h2>
            <p className="text-slate-600">{STEPS[currentStep - 1].description}</p>
          </div>

          <div className="min-h-96">
            {currentStep === 1 && (
              <ClientStep1PersonalInfo formData={formData} onChange={handleFormChange} />
            )}
            {currentStep === 2 && (
              <ClientStep2TypeRole formData={formData} onChange={handleFormChange} />
            )}
            {currentStep === 3 && (
              <ClientStep3ClassAssignment formData={formData} onChange={handleFormChange} />
            )}
            {currentStep === 4 && (
              <ClientStep4EmergencyContact formData={formData} onChange={handleFormChange} />
            )}
            {currentStep === 5 && (
              <ClientStep5Medical formData={formData} onChange={handleFormChange} />
            )}
          </div>

          {/* Navigation Buttons */}
          <div className="flex justify-between gap-3 mt-8 pt-6 border-t border-slate-200">
            <Button
              variant="outline"
              onClick={handlePreviousStep}
              disabled={currentStep === 1}
              className="gap-2"
            >
              <ChevronLeft className="w-4 h-4" /> Previous
            </Button>

            {currentStep === STEPS.length ? (
              <Button
                onClick={handleSubmit}
                disabled={isSubmitting}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Enrolling...
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" /> Complete Enrollment
                  </>
                )}
              </Button>
            ) : (
              <Button onClick={handleNextStep} className="gap-2">
                Next <ChevronRight className="w-4 h-4" />
              </Button>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}