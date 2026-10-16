import React, { useState } from 'react';
import { Building2, Clock, Mail, MapPin, Send } from 'lucide-react';
import { BUSINESS, FAQ_ITEMS } from '../appConfig';
import { SectionHeading, Accordion } from '../components/ui/primitives';
import { useLightUi } from '../lightContext';

/**
 * Contact page.
 *
 * This is the one page allowed to print the registered office address and the
 * Udyam registration number (business identity policy in
 * @shared/data/businessInfo) — both are read from that single source.
 */
export const ContactPage: React.FC<{ onNavigate: (route: string) => void }> = ({ onNavigate }) => {
  const { notify } = useLightUi();
  const [subject, setSubject] = useState('Question before ordering');
  const [message, setMessage] = useState('');

  const mailto = `mailto:${BUSINESS.supportEmail}?subject=${encodeURIComponent(
    subject,
  )}&body=${encodeURIComponent(message)}`;

  const onSend = (event: React.FormEvent) => {
    event.preventDefault();
    if (!message.trim()) {
      notify('Add a short message first, then press send.', 'info');
      return;
    }
    window.location.href = mailto;
    notify('Opening your email app with the message ready to send.', 'good');
  };

  return (
    <div className="pb-6">
      <section className="relative">
        <div className="c-glow pointer-events-none absolute inset-x-0 top-0 h-80" aria-hidden="true" />
        <div className="c-shell relative pt-10 sm:pt-14">
          <SectionHeading
            eyebrow="Contact"
            title="Talk to the priest team"
            lead="Ask about a birth time you are unsure of, which report fits your situation, an order already placed, or how a finding should be read. A person answers — usually the same day."
          />
        </div>
      </section>

      <section className="c-shell mt-10 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
        <div className="c-card p-6 sm:p-7">
          <h2 className="c-display text-[1.25rem] text-ink">Send a message</h2>
          <p className="mt-1.5 text-[0.85rem] leading-6 text-muted">
            This opens your own email app with the message prepared, so nothing is sent through a form you
            cannot see.
          </p>

          <form onSubmit={onSend} className="mt-5 space-y-4">
            <label className="block">
              <span className="c-label">Subject</span>
              <select className="c-input" value={subject} onChange={(event) => setSubject(event.target.value)}>
                <option>Question before ordering</option>
                <option>Birth Jathagam enquiry</option>
                <option>Marriage Porutham enquiry</option>
                <option>Baby Naming enquiry</option>
                <option>Subha Muhurtham enquiry</option>
                <option>About an order already placed</option>
                <option>Report delivery or invoice</option>
                <option>Something else</option>
              </select>
            </label>

            <label className="block">
              <span className="c-label">Message</span>
              <textarea
                className="c-input min-h-[9rem] resize-y"
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Tell us the person’s name, the report you are considering, and anything you would like checked."
              />
            </label>

            <div className="flex flex-wrap items-center gap-3">
              <button type="submit" className="c-btn c-btn-primary">
                <Send className="h-4 w-4" />
                Open email draft
              </button>
              <a href={`mailto:${BUSINESS.supportEmail}`} className="c-btn c-btn-outline">
                <Mail className="h-4 w-4" />
                {BUSINESS.supportEmail}
              </a>
            </div>
          </form>
        </div>

        <div className="space-y-4">
          <div className="c-card p-6">
            <p className="c-eyebrow">
              <Building2 className="h-3.5 w-3.5" />
              Registered office
            </p>
            <address className="mt-3 not-italic">
              <ul className="space-y-1 text-[0.9rem] leading-7 text-ink-soft">
                {BUSINESS.officeAddressLines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </address>
            <dl className="mt-5 space-y-3 border-t border-line pt-4 text-[0.82rem]">
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted">Email</dt>
                <dd>
                  <a
                    href={`mailto:${BUSINESS.supportEmail}`}
                    className="font-semibold text-brand-ink underline decoration-brand/40 underline-offset-4"
                  >
                    {BUSINESS.supportEmail}
                  </a>
                </dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted">{BUSINESS.registrationLabel}</dt>
                <dd className="font-semibold text-ink">{BUSINESS.registrationNumber}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted">Registration scheme</dt>
                <dd className="text-right font-semibold text-ink">{BUSINESS.registrationScheme}</dd>
              </div>
              <div className="flex items-start justify-between gap-4">
                <dt className="text-muted">Enterprise type</dt>
                <dd className="text-right text-ink-soft">{BUSINESS.enterpriseType}</dd>
              </div>
            </dl>
          </div>

          <div className="c-card p-6">
            <p className="c-eyebrow">
              <Clock className="h-3.5 w-3.5" />
              When we answer
            </p>
            <ul className="mt-3 space-y-2.5 text-[0.86rem] leading-6 text-ink-soft">
              <li className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>Reports are prepared daily between 9:00 AM and 11:00 AM IST.</span>
              </li>
              <li className="flex items-start gap-2.5">
                <Clock className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  Questions are answered in the order they arrive. If your order is already placed, include
                  the order reference so we can look it up straight away.
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <Mail className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                <span>
                  Look for the reply from {BUSINESS.supportEmail} — add it to your contacts so the PDF and
                  the invoice do not land in spam.
                </span>
              </li>
            </ul>
          </div>

          <button
            type="button"
            onClick={() => onNavigate('studio')}
            className="c-card c-lift w-full p-5 text-left"
          >
            <p className="text-[0.7rem] font-bold uppercase tracking-[0.14em] text-accent">
              Rather check it yourself?
            </p>
            <p className="c-display mt-1.5 text-[1.1rem] text-ink">Open the Free Preview Lab</p>
            <p className="mt-1 text-[0.82rem] leading-6 text-muted">
              Compute your own panchangam or chart in the browser — no email required.
            </p>
          </button>
        </div>
      </section>

      <section className="c-shell mt-14">
        <div className="grid gap-8 lg:grid-cols-[0.72fr_1.28fr] lg:items-start">
          <SectionHeading eyebrow="Questions" title="Answers before you write to us" />
          <Accordion items={FAQ_ITEMS} />
        </div>
      </section>
    </div>
  );
};
