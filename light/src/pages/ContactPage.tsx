import React, { useState } from 'react';
import { Mail, MapPin, MessageSquare, Send, ShieldCheck, Star } from 'lucide-react';
import { BUSINESS, BRAND, CONTACT_PAGE_COPY, LIVE_SITE, type PageKey } from '../appConfig';
import { PageBreadcrumb } from '../components/common/PageBreadcrumb';
import { ServicePageHeader } from '../components/common/ServicePageHeader';
import { useLightUi } from '../lightContext';
import { BUSINESS_REGISTRATION_SHORT, BUSINESS_REGISTRATION_META } from '@shared/data/businessInfo';

/**
 * Contact — the live page: the same header, the same advisory-centre card with
 * the office address (rendered from BUSINESS_INFO, never retyped), the same
 * registration line, the same Administrator Inbox card and the same form with
 * its own labels, placeholders and "Message Received" confirmation.
 *
 * The preview has no backend, so pressing send keeps the message on the page and
 * says so plainly instead of pretending it was delivered.
 */
export const ContactPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => {
  const { notify } = useLightUi();
  const [values, setValues] = useState({ name: '', email: '', subject: '', message: '' });

  const update = (field: keyof typeof values) => (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues((current) => ({ ...current, [field]: event.target.value }));

  const field =
    'w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 text-[0.85rem] text-ink outline-none transition placeholder:text-faint focus:border-brand/60 focus:bg-surface';
  const label = 'block text-[0.72rem] font-bold uppercase tracking-[0.12em] text-muted';

  return (
    <div className="pb-6">
      <ServicePageHeader
        icon={MessageSquare}
        eyebrow={CONTACT_PAGE_COPY.header.eyebrow}
        title={CONTACT_PAGE_COPY.header.title}
        description={CONTACT_PAGE_COPY.header.description}
      />

      <PageBreadcrumb label="Contact" onNavigate={onNavigate} />

      <div className="c-shell mt-6 grid grid-cols-1 items-start gap-8 lg:grid-cols-12">
        <div className="c-card space-y-5 p-6 sm:p-7 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
            <h2 className="c-display text-[1.2rem] font-bold text-ink">{CONTACT_PAGE_COPY.formTitle}</h2>
            <span className="rounded-full border border-brand/30 bg-brand-soft px-3 py-1 text-[0.68rem] font-bold uppercase tracking-[0.1em] text-brand-ink">
              {CONTACT_PAGE_COPY.formTag}
            </span>
          </div>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              notify(
                `This preview does not send messages — the form posts to the administrator inbox at ${BRAND.website}.`
              );
            }}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <label className={label} htmlFor="contact-name">
                  {CONTACT_PAGE_COPY.fields.name.label}
                </label>
                <input
                  id="contact-name"
                  className={field}
                  value={values.name}
                  onChange={update('name')}
                  placeholder={CONTACT_PAGE_COPY.fields.name.placeholder}
                />
              </div>
              <div className="space-y-2">
                <label className={label} htmlFor="contact-email">
                  {CONTACT_PAGE_COPY.fields.email.label}
                </label>
                <input
                  id="contact-email"
                  type="email"
                  className={field}
                  value={values.email}
                  onChange={update('email')}
                  placeholder={CONTACT_PAGE_COPY.fields.email.placeholder}
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className={label} htmlFor="contact-subject">
                {CONTACT_PAGE_COPY.fields.subject.label}
              </label>
              <input
                id="contact-subject"
                className={field}
                value={values.subject}
                onChange={update('subject')}
                placeholder={CONTACT_PAGE_COPY.fields.subject.placeholder}
              />
            </div>

            <div className="space-y-2">
              <label className={label} htmlFor="contact-message">
                {CONTACT_PAGE_COPY.fields.message.label}
              </label>
              <textarea
                id="contact-message"
                rows={5}
                className={field}
                value={values.message}
                onChange={update('message')}
                placeholder={CONTACT_PAGE_COPY.fields.message.placeholder}
              />
            </div>

            <button type="submit" className="c-btn c-btn-primary w-full justify-center">
              <Send className="h-4 w-4" aria-hidden />
              <span>{CONTACT_PAGE_COPY.submit}</span>
            </button>
            <p className="text-center text-[0.72rem] text-faint">
              Messages are saved to the administrator inbox at {BRAND.website}. You can also email{' '}
              <a href={`mailto:${BUSINESS.supportEmail}`} className="font-semibold text-brand-ink underline">
                {BUSINESS.supportEmail}
              </a>
              .
            </p>
          </form>
        </div>

        <div className="space-y-5 lg:col-span-5">
          <section className="c-card space-y-3 p-6">
            <h2 className="text-[0.72rem] font-bold uppercase tracking-[0.14em] text-ink">
              {CONTACT_PAGE_COPY.centre}
            </h2>
            <p className="text-[0.82rem] font-semibold text-brand-ink">{CONTACT_PAGE_COPY.addressLabel}</p>
            <address className="not-italic text-[0.85rem] leading-6 text-ink-soft">
              {BUSINESS.officeAddressLines.map((line) => (
                <span key={line} className="block">
                  {line}
                </span>
              ))}
            </address>
            <p className="flex items-start gap-2 text-[0.78rem] text-muted">
              <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" aria-hidden />
              <span>{CONTACT_PAGE_COPY.addressNote}</span>
            </p>
            <div className="space-y-1.5 border-t border-line pt-3 text-[0.82rem]">
              <p className="self-center text-[0.72rem] font-bold uppercase tracking-[0.12em] text-muted">
                {CONTACT_PAGE_COPY.emailLabel}
              </p>
              <a
                href={`mailto:${BUSINESS.supportEmail}`}
                className="flex items-center gap-2 font-semibold text-ink-soft hover:text-brand-ink"
              >
                <Mail className="h-3.5 w-3.5 text-brand" aria-hidden />
                {BUSINESS.supportEmail}
              </a>
              <a
                href={BRAND.facebook}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 text-ink-soft hover:text-brand-ink"
              >
                <Star className="h-3.5 w-3.5 text-brand" aria-hidden />
                {CONTACT_PAGE_COPY.facebookLabel}
              </a>
              <p className="text-[0.78rem] text-muted">
                {CONTACT_PAGE_COPY.registrationLabel}: {BUSINESS_REGISTRATION_SHORT.replace(/^Udyam Reg\. No\. /, '')}
              </p>
              <p className="text-[0.74rem] leading-5 text-faint">
                {BUSINESS.registrationStatus} · {BUSINESS.registrationScheme},
                <br />
                {BUSINESS.registrationAuthority} · {BUSINESS_REGISTRATION_META}
              </p>
              <p className="text-[0.74rem] text-faint">
                {BUSINESS.legalName} · {BUSINESS.website}
              </p>
            </div>
          </section>

          <section className="rounded-2xl border border-accent/25 bg-accent-soft p-5">
            <h2 className="flex items-center gap-2 text-[0.85rem] font-bold text-accent">
              <ShieldCheck className="h-4 w-4" aria-hidden />
              <span>{CONTACT_PAGE_COPY.inboxTitle}</span>
            </h2>
            <p className="mt-2 text-[0.8rem] leading-6 text-ink-soft">{CONTACT_PAGE_COPY.inboxBody}</p>
            <p className="mt-2 text-[0.78rem] font-semibold text-accent">
              {CONTACT_PAGE_COPY.inboxNote}
            </p>
          </section>

          <p className="text-[0.74rem] leading-5 text-muted">
            This is the layout preview of the light interface. Sign-in, orders and messages are handled
            by the live site at{' '}
            <a href={LIVE_SITE} className="font-semibold text-brand-ink underline">
              {BRAND.website}
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
};
