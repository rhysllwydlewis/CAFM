import 'server-only';
import type {
  PpmAssigneeOption,
  PpmForecast,
  PpmOverdueItem,
  PpmPlanner,
  PpmScheduleRecord,
  PpmScheduleSummary,
  PpmSummary,
  PpmTaskTemplate,
} from '@fmstead/shared';
import { apiGet } from './api';

async function read<T>(path: string): Promise<T> {
  const response = await apiGet('/ppm' + path);
  if (!response.ok) throw new Error('Could not load planned maintenance.');
  return response.json() as Promise<T>;
}

const query = (params: Record<string, string | undefined>) => {
  const search = new URLSearchParams(Object.entries(params).flatMap(([key, value]) => (value ? [[key, value]] : [])));
  return search.size ? '?' + search.toString() : '';
};

export const ppmSummary = () => read<PpmSummary>('/summary');
export const ppmPlanner = (filters: Record<string, string | undefined>) =>
  read<PpmPlanner>('/planner' + query(filters));
export const ppmForecast = (months = 12) => read<PpmForecast>('/forecast?months=' + months);
export const ppmOverdue = () => read<PpmOverdueItem[]>('/overdue');
export const ppmTemplates = () => read<PpmTaskTemplate[]>('/templates');
export const ppmAssignees = () => read<PpmAssigneeOption[]>('/assignees');
export const ppmSchedules = (filters: Record<string, string | undefined>) =>
  read<{ total: number; items: PpmScheduleSummary[] }>('/schedules' + query(filters));

export async function ppmSchedule(id: string): Promise<PpmScheduleRecord | null> {
  const response = await apiGet('/ppm/schedules/' + encodeURIComponent(id));
  if ([400, 403, 404].includes(response.status)) return null;
  if (!response.ok) throw new Error('Could not load this schedule.');
  return response.json() as Promise<PpmScheduleRecord>;
}
