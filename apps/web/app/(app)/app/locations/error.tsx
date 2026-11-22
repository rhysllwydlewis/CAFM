'use client';

import { Button } from '@cafm/ui';

export default function LocationError({ reset }: { reset: () => void }) {
  return (
    <div className="page">
      <div className="card card-b stack g3" role="alert">
        <h1 className="page-title">Locations could not load</h1>
        <Button onClick={reset}>Try again</Button>
      </div>
    </div>
  );
}
