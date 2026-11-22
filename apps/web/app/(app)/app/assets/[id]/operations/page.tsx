import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Icon } from '@cafm/ui';
import { can, feature, type AssetOperations } from '@cafm/shared';
import { AttachmentPanel } from '@/components/attachment-panel';
import { apiGet } from '@/lib/api';
import { attachmentList } from '@/lib/attachments';
import { configuredAppUrl } from '@/lib/public-url';
import { currentUser } from '@/lib/session';
import { assetDetail } from '../../asset-data';
import { validAssetId } from '../../asset-labels';
import styles from '../../assets.module.css';
import { MeterPanel, TagPanel, WarrantyPanel } from './record-panels';

export const metadata = { title: 'Asset records' };

const dateInUk = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/London',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export default async function OperationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!validAssetId(id)) notFound();
  const user = await currentUser('/app/assets/' + id + '/operations');
  if (!can(user, 'assets.read') || !feature(user.entitlements, 'assets')) notFound();
  const path = '/assets/' + id;
  const [asset, response, files] = await Promise.all([
    assetDetail(id),
    apiGet(path + '/operations'),
    attachmentList(path + '/attachments'),
  ]);
  if (!asset || response.status === 404) notFound();
  if (!response.ok) throw new Error('Could not load asset records.');
  const data: AssetOperations = await response.json();
  const canManage = can(user, 'assets.manage');
  return (
    <div className="page stack g4">
      <header className={styles.pageHeader}>
        <div>
          <p className="eyebrow">
            <span className="mono">{asset.number}</span> · Asset records
          </p>
          <h1 className="page-title">{asset.name}</h1>
        </div>
        <div className="row wrap g2">
          <Link className="btn" href={'/app' + path}>
            Back to asset
          </Link>
          <Link className="btn" href={'/app/assets/labels?asset=' + id}>
            <Icon name="qr-code" /> Print labels
          </Link>
        </div>
      </header>
      <nav aria-label="Asset records" className="row wrap g2">
        <a className="btn" href="#tags">
          Tags
        </a>
        <a className="btn" href="#meters">
          Meters
        </a>
        <a className="btn" href="#warranties">
          Warranties
        </a>
        <a className="btn" href="#documents">
          Documents
        </a>
      </nav>
      <div className={styles.recordGrid}>
        <TagPanel base={path + '/operations'} tags={data.tags} canManage={canManage} origin={configuredAppUrl()} />
        <MeterPanel
          base={path + '/operations'}
          meters={data.meters}
          canManage={canManage}
          canRecord={can(user, 'assets.record_readings') && asset.status !== 'decommissioned'}
        />
        <WarrantyPanel
          base={path + '/operations'}
          warranties={data.warranties}
          canManage={canManage}
          today={dateInUk.format(new Date())}
        />
        <AttachmentPanel path={path + '/attachments'} items={files} canUpload={canManage} />
      </div>
    </div>
  );
}
