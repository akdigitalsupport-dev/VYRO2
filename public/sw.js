self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { body: event.data ? event.data.text() : "" };
  }
  const title = typeof payload.title === "string" ? payload.title : "VYRO notification";
  const body = typeof payload.body === "string" ? payload.body : "You have a new gym notification.";
  const tag = typeof payload.tag === "string" ? payload.tag : "vyro-notification";
  const url = typeof payload.url === "string" && payload.url.startsWith("/") && !payload.url.startsWith("//")
    ? payload.url
    : "/gym/command-center";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    data: { url },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data && typeof event.notification.data.url === "string"
    ? event.notification.data.url
    : "/gym/command-center";
  event.waitUntil((async () => {
    const target = new URL(url, self.location.origin);
    if (target.origin !== self.location.origin) return;
    const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of clientsList) {
      if (new URL(client.url).origin === self.location.origin) {
        await client.navigate(target.href);
        return client.focus();
      }
    }
    return self.clients.openWindow(target.href);
  })());
});
