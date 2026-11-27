import { can, VIEW_ENTITY_ACCESS, type ViewEntity } from '@fmstead/shared';
import { filtersFromQuery, savedViews } from '@/lib/views';
import { ViewBar } from './view-bar';

type Query = Record<string, string | string[] | undefined>;

/** The saved-views bar for a list screen. Reads the list's filters from its address. */
export async function ListViewBar({
  entity,
  route,
  query,
  user,
}: {
  entity: ViewEntity;
  route: string;
  query: Query;
  user: Parameters<typeof can>[0];
}) {
  if (!can(user, VIEW_ENTITY_ACCESS[entity].permission)) return null;
  const views = await savedViews(entity);
  const active = typeof query.view_id === 'string' ? query.view_id : undefined;
  return (
    <ViewBar
      entity={entity}
      route={route}
      filters={filtersFromQuery(query)}
      layout={query.layout === 'board' || query.layout === 'calendar' ? query.layout : 'list'}
      views={views}
      canShare={can(user, 'views.share')}
      activeId={views.some((view) => view.id === active) ? active : undefined}
    />
  );
}
