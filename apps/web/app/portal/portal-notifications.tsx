'use client';

import { useCallback, useState } from 'react';
import { Button } from '@fmstead/ui';
import { NotificationsDrawer } from '../(app)/shell/notifications';

export function PortalNotifications() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button icon="notifications" variant="ghost" aria-expanded={open} onClick={() => setOpen(true)}>
        Notifications
      </Button>
      {open && <NotificationsDrawer onClose={close} />}
    </>
  );
}
