/* global self, URL */
self.addEventListener('push', (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    return;
  }
  if (!payload || typeof payload.id !== 'string') return;
  const asset = /^\/app\/assets\/[a-f0-9-]{36}\/operations#warranties$/i.test(payload.path);
  const job = /^\/app\/work-orders\/[a-f0-9-]{36}$/i.test(payload.path);
  const path = asset || job || /^\/portal\/requests\/[a-f0-9-]{36}$/i.test(payload.path) ? payload.path : '/app';
  event.waitUntil(
    self.registration.showNotification(
      asset ? 'CAFM asset update' : job ? 'CAFM work order alert' : 'CAFM request update',
      {
        body: 'Open CAFM to see your latest update.',
        tag: 'cafm-' + payload.id,
        data: { path },
      },
    ),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data.path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then(async (clients) => {
      const open = clients.find((client) => client.url === url);
      if (open) await open.focus();
      else await self.clients.openWindow(url);
    }),
  );
});
