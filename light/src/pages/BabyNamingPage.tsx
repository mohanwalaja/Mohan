import React from 'react';
import { Baby } from 'lucide-react';
import { ReportPage } from '../components/light/ReportPage';
import type { PageKey } from '../appConfig';

/** Baby Naming — the live page's own header, Namakaran panels, FAQ and links. */
export const BabyNamingPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({ onNavigate }) => (
  <ReportPage service="BABY_NAMING" icon={Baby} onNavigate={onNavigate} />
);
