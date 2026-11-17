self.addEventListener('push', (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {
      title: 'Pesan Baru MASDETA',
      body: event.data ? String(event.data.text()) : 'Anda menerima pesan baru.',
    };
  }

  const title = payload.title || 'Pesan Baru MASDETA';
  const body = payload.body || 'Anda menerima pesan obrolan baru.';
  const senderId = payload.senderId || '';
  const tag = payload.tag || (senderId ? `masdeta-chat-${senderId}` : 'masdeta-chat');

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag,
      renotify: true,
      data: {
        senderId,
        url: senderId ? `/?chatPeer=${encodeURIComponent(senderId)}` : '/',
      },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const senderId = typeof data.senderId === 'string' ? data.senderId : '';
  const targetUrl =
    typeof data.url === 'string' && data.url
      ? data.url
      : senderId
        ? `/?chatPeer=${encodeURIComponent(senderId)}`
        : '/';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          return client.focus().then(() => {
            if (senderId && typeof client.postMessage === 'function') {
              client.postMessage({ type: 'masdeta:open-chat', senderId });
            }
          });
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    })
  );
});
