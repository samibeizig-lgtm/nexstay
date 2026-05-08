// Firebase Messaging Service Worker v2
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

// Config publique Firebase (pas de secrets ici)
firebase.initializeApp({
  apiKey:            'AIzaSyCzsSjx9i9eM-gT1LWR2fmAcp8NZqEMBsM',
  authDomain:        'nexstay-3d8b5.firebaseapp.com',
  projectId:         'nexstay-3d8b5',
  storageBucket:     'nexstay-3d8b5.firebasestorage.app',
  messagingSenderId: '1056265022279',
  appId:             '1:1056265022279:web:7b697d14295d8c3b863a62'
});

const messaging = firebase.messaging();

// Notification reçue en arrière-plan
messaging.onBackgroundMessage(function(payload) {
  console.log('[SW] Background message:', payload);
  const n = payload.notification || {};
  const title = n.title || 'Nexstay';
  const options = {
    body:    n.body || '',
    icon:    '/icon-192.png',
    badge:   '/icon-192.png',
    vibrate: [200, 100, 200],
    data:    payload.data || {},
    requireInteraction: false
  };
  return self.registration.showNotification(title, options);
});

// Clic sur la notification
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({type:'window', includeUncontrolled:true}).then(function(list) {
      for (var c of list) {
        if (c.url.includes(self.location.origin) && 'focus' in c) return c.focus();
      }
      return clients.openWindow('/');
    })
  );
});
