import type { Metadata } from 'next';
import Link from 'next/link';
import { can, feature } from '@fmstead/shared';
import { currentUser } from '@/lib/session';
import { AssetForm } from '../asset-form';
import { assetClasses, assetCustomFields, assetDetail } from '../asset-data';
import { locationLabel, route, validAssetId } from '../asset-labels';
import styles from '../assets.module.css';

export const metadata: Metadata = { title: 'Add asset' };

export default async function NewAssetPage({ searchParams }: { searchParams: Promise<{ parent?: string }> }) {
  const [{ parent: parentId }, user] = await Promise.all([searchParams, currentUser()]);
  if (!can(user, 'assets.manage') || !feature(user.entitlements, 'assets')) {
    return (
      <div className="page">
        <div className="page-head">
          <h1 className="page-title">Add asset</h1>
        </div>
        <div className="card card-b">
          <p>
            {!can(user, 'assets.manage')
              ? 'Your role doesn’t include adding assets.'
              : 'Assets is unavailable on your plan.'}
          </p>
        </div>
      </div>
    );
  }
  // Adding a component starts from its parent and the parent's location.
  const parent = validAssetId(parentId) ? await assetDetail(parentId) : null;
  const [classes, customFields] = await Promise.all([assetClasses(), assetCustomFields()]);
  return (
    <div className="page stack g4">
      <header className={styles.pageHeader}>
        <div>
          <h1 className="page-title">{parent ? `Add a component to ${parent.name}` : 'Add asset'}</h1>
        </div>
        <Link className="btn" href={parent ? `${route}/${parent.id}` : route}>
          Cancel
        </Link>
      </header>
      <AssetForm
        classes={classes}
        customFields={customFields}
        parent={parent && { id: parent.id, label: parent.name, hint: parent.number }}
        location={parent && { id: parent.locationId, label: locationLabel(parent.locationPath) }}
      />
    </div>
  );
}
