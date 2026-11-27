'use client';

import { Button } from '@fmstead/ui';

export default function AssetsError({ reset }: { reset: () => void }) {
  return (
    <div className="page">
      <div className="card card-b stack g3" role="alert">
        <h1 className="page-title">Assets could not load</h1>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
