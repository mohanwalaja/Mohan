import React from 'react';
import { ArrowRight, Clock, MessageCircle } from 'lucide-react';
import { ServicePageHeader } from '../common/ServicePageHeader';
import { PageBreadcrumb } from '../common/PageBreadcrumb';
import { RelatedReports } from '../common/RelatedReports';
import { ServiceFaqSection } from '../common/ServiceFaqSection';
import { AssurancePanel, IncludedPanel, NotePanel, SampleReportPanel } from './ServiceAside';
import { ReportPreview } from './ReportPreview';
import { CATALOGUE, SERVICE_FAQ, type PageKey } from '../../appConfig';
import { SERVICE_PANELS } from '../../servicePanels';
import type { ServiceType } from '@shared/types';
import type { LucideIcon } from 'lucide-react';
import { getServicePrices } from '@shared/services/pricing';

/**
 * One report page, shared by all four services — the live structure:
 * header → breadcrumb → the live report preview beside the page's own
 * inclusion/sample/assurance column → cross-links → the page's FAQ → the
 * closing band. Every string comes from the live page it belongs to.
 */
export const ReportPage: React.FC<{
  service: ServiceType;
  icon: LucideIcon;
  onNavigate: (key: PageKey) => void;
}> = ({ service, icon, onNavigate }) => {
  const entry = CATALOGUE.find((item) => item.service === service)!;
  const panels = SERVICE_PANELS[service];
  const prices = getServicePrices(null, service);

  return (
    <div className="pb-6">
      <ServicePageHeader
        icon={icon}
        eyebrow={entry.header.eyebrow}
        title={entry.header.title}
        description={entry.header.description}
      />

      <PageBreadcrumb label={entry.action.replace(/^Order /, '')} onNavigate={onNavigate} />

      <div className="c-shell mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="space-y-6 lg:col-span-7">
          <NotePanel note={panels.note} />
          <ReportPreview service={service} />

          {/* The same fee block the catalogue prints: US$ base, India INR, review note. */}
          <div className="c-card flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-muted">Service fee</p>
              <p className="c-display mt-1 text-[1.6rem] font-black text-brand-ink">
                US${prices.USD} <span className="text-[0.75rem] font-semibold text-muted">USD</span>
              </p>
              <p className="mt-1 text-[0.82rem] text-ink-soft">
                India (GPay/UPI): ₹{prices.INR.toLocaleString('en-IN')} INR
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              <span className="inline-flex items-center gap-2 text-[0.82rem] font-semibold text-leaf">
                <Clock className="h-4 w-4 shrink-0" aria-hidden />
                Report + invoice after review
              </span>
              <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary">
                <span>View services</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <IncludedPanel panel={panels.aside} accent={entry.accent} />
          <SampleReportPanel sampleNote={panels.sampleNote} />
          <AssurancePanel heading={panels.assurance.heading} body={panels.assurance.body} />
        </div>
      </div>

      <RelatedReports links={panels.related} onNavigate={onNavigate} />
      <ServiceFaqSection heading={panels.faq.heading} intro={panels.faq.intro} items={SERVICE_FAQ[service]} />

      <section className="c-shell mt-14">
        <div className="relative overflow-hidden rounded-[2rem] border border-brand/25 bg-brand-soft px-7 py-9 sm:px-10">
          <div className="c-pattern pointer-events-none absolute inset-0 opacity-40" aria-hidden="true" />
          <div className="relative flex flex-col items-start justify-between gap-5 lg:flex-row lg:items-center">
            <div className="max-w-xl">
              <h2 className="c-display text-[1.5rem] leading-tight text-ink sm:text-[1.8rem]">
                {entry.title}
              </h2>
              <p className="mt-2.5 text-[0.9rem] leading-7 text-ink-soft">{entry.category}</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button type="button" onClick={() => onNavigate('services')} className="c-btn c-btn-primary">
                <span>{entry.action}</span>
                <ArrowRight className="h-4 w-4" aria-hidden />
              </button>
              <button type="button" onClick={() => onNavigate('contact')} className="c-btn c-btn-outline">
                <MessageCircle className="h-4 w-4" aria-hidden />
                <span>Contact</span>
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
