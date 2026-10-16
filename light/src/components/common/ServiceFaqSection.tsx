import React from 'react';
import { Accordion, SectionHeading } from '../ui/primitives';
import type { FaqItem } from '@shared/data/homeFaq';

/**
 * The live <ServiceFaqSection>: the same eyebrow ("Frequently asked questions"),
 * the page's own heading and intro, and the page's own FAQ array.
 */
export const ServiceFaqSection: React.FC<{
  heading: string;
  intro: string;
  items: readonly FaqItem[];
}> = ({ heading, intro, items }) => (
  <section className="c-shell mt-14">
    <SectionHeading eyebrow="Frequently asked questions" title={heading} lead={intro} />
    <div className="mt-8">
      <Accordion items={items} />
    </div>
  </section>
);
