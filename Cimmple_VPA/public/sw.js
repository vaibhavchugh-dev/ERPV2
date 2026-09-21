self.addEventListener("install", function (event) {
  self.skipWaiting();
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    self.registration
      .unregister()
      .then(function () {
        return self.clients.matchAll({ type: "window" });
      })
      .then(function (clients) {
        return Promise.all(
          clients.map(function (client) {
            if (client.navigate) return client.navigate(client.url);
            return undefined;
          })
        );
      })
      .then(function () {
        if (!self.caches) return;
        return self.caches.keys().then(function (keys) {
          return Promise.all(keys.map(function (key) { return self.caches.delete(key); }));
        });
      })
  );
});
