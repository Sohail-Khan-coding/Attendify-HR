self.addEventListener('push', event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: 'Attendify HR', body: event.data?.text() || 'You have a new update.' };
  }

  const title = payload.title || 'Attendify HR';
  const options = {
    body: payload.body || 'You have a new update.',
    icon: '/assets/images/favicon.png',
    badge: '/assets/images/favicon.png',
    tag: payload.id || 'attendify-notification',
    renotify: true,
    silent: false,
    vibrate: [180, 90, 180],
    data: { url: payload.url || '/' }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const targetUrl = new URL('/', self.location.origin);
  const requestedPage = String(event.notification.data?.url || '').replace(/^\//, '');
  if (/^[a-z-]+$/.test(requestedPage)) targetUrl.searchParams.set('page', requestedPage);

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      if (new URL(client.url).origin === self.location.origin) {
        if ('navigate' in client) await client.navigate(targetUrl.href);
        await client.focus();
        return;
      }
    }
    await self.clients.openWindow(targetUrl.href);
  })());
});
