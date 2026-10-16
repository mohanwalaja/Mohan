import React from 'react';
import { CalendarDays } from 'lucide-react';
import { ReportPage } from '../components/light/ReportPage';
import type { PageKey } from '../appConfig';

/** Subha Muhurtham — the live page's own header, six-month inclusions, FAQ and links. */
export const MuhurthamPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => (
  <ReportPage service="MUHURTHAM" icon={CalendarDays} onNavigate={onNavigate} />
);
