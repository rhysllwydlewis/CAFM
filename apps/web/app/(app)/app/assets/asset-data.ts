import 'server-only';
import type { FieldDefinition } from '@fmstead/config-engine';
import type {
  AssetAttribute,
  AssetClassRecord,
  AssetImpact,
  AssetPage,
  AssetRecord,
  AssetServesRecord,
  AssetSummary,
} from '@fmstead/shared';
import { apiGet } from '@/lib/api';

export type AssetDetail = AssetRecord & {
  parent: { id: string; number: string; name: string } | null;
  site: { id: string; name: string } | null;
  componentCount: number;
  /** The class's attribute template, kept even when the class is retired. */
  classAttributes: AssetAttribute[];
};

async function get<T>(path: string, failure: string): Promise<T> {
  const response = await apiGet(path);
  if (!response.ok) throw new Error(failure);
  return response.json() as Promise<T>;
}

export const assetPage = (params: Record<string, string> = {}) =>
  get<AssetPage>('/assets?' + new URLSearchParams({ limit: '25', ...params }), 'Could not load assets.');

export const assetSummary = () => get<AssetSummary>('/assets/summary', 'Could not load the asset summary.');
export const assetClasses = () => get<AssetClassRecord[]>('/asset-classes', 'Could not load asset classes.');
export const assetCustomFields = () => get<FieldDefinition[]>('/assets/custom-fields', 'Could not load asset fields.');

export async function assetDetail(id: string): Promise<AssetDetail | null> {
  const response = await apiGet('/assets/' + encodeURIComponent(id));
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('Could not load this asset.');
  return response.json() as Promise<AssetDetail>;
}

export const assetServes = (id: string) =>
  get<AssetServesRecord>(`/assets/${encodeURIComponent(id)}/serves`, 'Could not load what this asset serves.');
export const assetImpact = (id: string) =>
  get<AssetImpact>(`/assets/${encodeURIComponent(id)}/impact`, 'Could not load the impact of this asset.');
