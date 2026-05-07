// Firebase Messaging Service Worker - OBLIGATOIRE pour les notifications en arrière-plan
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyCzsSjx9i9eM-gT1LWR2fmAcp8NZqEMBsM",
  authDomain: "nexstay-3d8b5.firebaseapp.com",
  projectId: "nexstay-3d8b5",
  storageBucket: "nexstay-3d8b5.firebasestorage.app",
  messagingSenderId: "1056265022279",
  appId: "1:1056265022279:web:7b697d14295d8c3b863a62"
});

var messaging = firebase.messaging();

// Afficher la notification quand l'app est en arrière-plan
messaging.onBackgroundMessage(function(payload) {
  var n = payload.notification || {};
  self.registration.showNotification(n.title || 'Nexstay', {
    body: n.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    vibrate: [200, 100, 200],
    data: payload.data || {},
    actions: [{ action: 'open', title: 'Ouvrir' }]
  });
});

// Clic sur la notification → ouvrir l'app
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
