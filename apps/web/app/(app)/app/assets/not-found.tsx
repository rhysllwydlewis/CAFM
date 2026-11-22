import Link from 'next/link';
import { route } from './asset-labels';

/** The same page whether the asset doesn't exist or belongs to someone else, so it reveals nothing. */
export default function AssetNotFound() {
  return (
    <div className="page">
      <div className="card card-b stack g3">
        <h1 className="page-title">Asset not found</h1>
        <p className="muted">It may have been removed, or you may not have access to it.</p>
        <div>
          <Link className="btn" href={route}>
            Back to assets
          </Link>
        </div>
      </div>
    </div>
  );
}
