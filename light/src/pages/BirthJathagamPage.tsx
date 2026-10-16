import React from 'react';
import { Compass } from 'lucide-react';
import { ReportPage } from '../components/light/ReportPage';
import type { PageKey } from '../appConfig';

/** Birth Jathagam — the live page's own header, inclusions, FAQ and links. */
export const BirthJathagamPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => (
  <ReportPage service="BIRTH_JATHAGAM" icon={Compass} onNavigate={onNavigate} />
);
