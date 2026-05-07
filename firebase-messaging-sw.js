// Firebase Messaging Service Worker - OBLIGATOIRE pour les notifications en arrière-plan
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Config chargée dynamiquement depuis le serveur
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'FIREBASE_CONFIG') {
    firebase.initializeApp(event.data.config);
    var messaging = firebase.messaging();
    messaging.onBackgroundMessage(function(payload) {
      var n = payload.notification || {};
      self.registration.showNotification(n.title || 'Nexstay', {
        body: n.body || '',
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        vibrate: [200, 100, 200],
        data: payload.data || {}
      });
    });
  }
});



// Clic sur la notification → ouvrir l'app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
