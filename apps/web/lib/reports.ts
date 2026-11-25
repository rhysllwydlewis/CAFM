import 'server-only';
import type {
  BusiestSitesReport,
  CostAnalysisReport,
  SatisfactionReport,
  HomeSummary,
  OpenJobsByAgeReport,
  PpmComplianceReport,
  SlaPerformanceReport,
  WorkMixReport,
} from '@cafm/shared';
import { apiGet } from './api';

async function read<T>(path: string, params: Record<string, string | undefined> = {}): Promise<T> {
  const search = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (value ? [[key, value]] : [])));
  const response = await apiGet('/reports/' + path + (search.size ? '?' + search.toString() : ''));
  if (!response.ok) throw new Error('Could not load this report.');
  return response.json() as Promise<T>;
}

export const openJobsByAge = () => read<OpenJobsByAgeReport>('open-jobs-by-age');
export const slaPerformance = (period: { from?: string; to?: string }) =>
  read<SlaPerformanceReport>('sla-performance', period);
export const ppmCompliance = (period: { from?: string; to?: string }) =>
  read<PpmComplianceReport>('ppm-compliance', period);
export const workMix = (period: { from?: string; to?: string }) => read<WorkMixReport>('work-mix', period);
export const busiestSites = (period: { from?: string; to?: string }) =>
  read<BusiestSitesReport>('busiest-sites', period);

export const satisfaction = (period: { from?: string; to?: string }) =>
  read<SatisfactionReport>('satisfaction', period);
export const costAnalysis = (period: { from?: string; to?: string }) =>
  read<CostAnalysisReport>('cost-analysis', period);

export async function homeSummary(): Promise<HomeSummary> {
  const response = await apiGet('/home/summary');
  if (!response.ok) throw new Error('Could not load the key figures.');
  return response.json() as Promise<HomeSummary>;
}
