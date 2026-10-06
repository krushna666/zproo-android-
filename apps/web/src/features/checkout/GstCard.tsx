import { Card, CardContent, FormField, Input } from '@zproo/ui';
import type { UseFormRegisterReturn } from 'react-hook-form';

/** Optional GST details for a business booking (flights and hotels). */
export function GstCard({
  enabled,
  onToggle,
  register,
  errors,
}: {
  enabled: boolean;
  onToggle: (enabled: boolean) => void;
  /** Called only while enabled: unticked, no `gst` value is sent (or validated). */
  register: (field: 'gstin' | 'companyName') => UseFormRegisterReturn;
  errors: { gstin?: string | undefined; companyName?: string | undefined };
}) {
  return (
    <Card>
      <CardContent className="space-y-4 p-4 sm:p-5">
        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={enabled}
            data-testid="checkout-gst-toggle"
            onChange={(e) => onToggle(e.target.checked)}
            className="size-4 accent-primary"
          />
          Add GST details for a business booking (optional)
        </label>
        {enabled && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="GSTIN" name="gstin" error={errors.gstin}>
              <Input data-testid="checkout-gstin" autoComplete="off" {...register('gstin')} />
            </FormField>
            <FormField label="Company name" name="companyName" error={errors.companyName}>
              <Input
                data-testid="checkout-gst-company"
                autoComplete="organization"
                {...register('companyName')}
              />
            </FormField>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
