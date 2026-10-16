import React from 'react';
import { Heart } from 'lucide-react';
import { ReportPage } from '../components/light/ReportPage';
import type { PageKey } from '../appConfig';

/** Marriage Compatibility — the live page's own header, 10-Porutham list, FAQ and links. */
export const MarriageCompatibilityPage: React.FC<{ onNavigate: (key: PageKey) => void }> = ({
  onNavigate
}) => <ReportPage service="MARRIAGE_COMPATIBILITY" icon={Heart} onNavigate={onNavigate} />;
