import type { ServiceType } from '@zproo/types';
import { Tabs, TabsContent, TabsList, TabsTrigger, cn } from '@zproo/ui';
import { lazy, Suspense, useState, type ComponentType } from 'react';
import { PageLoader } from '@/components/feedback/PageLoader';
import { SERVICES } from '@/config/services';
import { FlightSearchForm } from '../forms/FlightSearchForm';

// Flights is the default tab and loads with the page; the others load when first opened.
const named = <K extends string>(load: () => Promise<Record<K, ComponentType>>, name: K) =>
  lazy(async () => ({ default: (await load())[name] }));

const FORMS: Record<ServiceType, ComponentType> = {
  FLIGHT: FlightSearchForm,
  BUS: named(() => import('../forms/BusSearchForm'), 'BusSearchForm'),
  TRAIN: named(() => import('../forms/TrainSearchForm'), 'TrainSearchForm'),
  HOTEL: named(() => import('../forms/HotelSearchForm'), 'HotelSearchForm'),
  CAB: named(() => import('../forms/RideSearchForm'), 'CabSearchForm'),
  BIKE: named(() => import('../forms/RideSearchForm'), 'BikeSearchForm'),
  HOLIDAY: named(() => import('../forms/HolidaySearchForm'), 'HolidaySearchForm'),
  PARCEL: named(() => import('../forms/ParcelSearchForm'), 'ParcelSearchForm'),
  CORPORATE: named(() => import('../forms/CorporatePanel'), 'CorporatePanel'),
};

const SHORT_LABEL: Partial<Record<ServiceType, string>> = { BUS: 'Bus', TRAIN: 'Train' };

/** The booking widget: one tab per service, each with its own validated search form. */
export function SearchWidget({
  initial = 'FLIGHT',
  className,
}: {
  initial?: ServiceType;
  className?: string;
}) {
  const [service, setService] = useState<ServiceType>(initial);
  return (
    <Tabs
      value={service}
      onValueChange={(v) => setService(v as ServiceType)}
      className={cn('rounded-[1.75rem] border border-border bg-card shadow-raised', className)}
    >
      <TabsList
        aria-label="Choose a service"
        className="gap-1 overflow-x-auto border-b border-border px-3 pt-3 [scrollbar-width:none] sm:px-5 lg:justify-between"
      >
        {SERVICES.map(({ type, label, icon: Icon }) => (
          <TabsTrigger
            key={type}
            value={type}
            className="relative min-w-[4.75rem] shrink-0 flex-col rounded-t-xl px-3 pb-3 pt-2 text-xs text-foreground/70 hover:text-foreground data-[state=active]:text-primary after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:bg-transparent data-[state=active]:after:bg-primary sm:text-sm"
          >
            <span className="grid size-10 place-items-center rounded-2xl bg-background transition-colors [[data-state=active]_&]:bg-primary-light">
              <Icon aria-hidden className="size-5" />
            </span>
            {SHORT_LABEL[type] ?? label}
          </TabsTrigger>
        ))}
      </TabsList>
      {SERVICES.map(({ type }) => {
        const Form = FORMS[type];
        return (
          <TabsContent key={type} value={type} className="p-4 sm:p-6">
            <Suspense fallback={<PageLoader />}>
              <Form />
            </Suspense>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
