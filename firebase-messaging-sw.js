// オーナーズポータル：プッシュ通知用 Service Worker
// このファイルは、サイトの実際のトップページと「同じ階層」に置く必要があります。
// 例：サイトが https://mpg023.github.io/OwnersPortal/ にある場合は、
// 　　https://mpg023.github.io/OwnersPortal/firebase-messaging-sw.js になるように、
// 　　OwnersPortalリポジトリの一番上（index.htmlと同じ場所）に置いてください。
// 　　ドメインの一番上（https://mpg023.github.io/ 直下）に置いても認識されません。

importScripts("https://www.gstatic.com/firebasejs/12.2.1/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.2.1/firebase-messaging-compat.js");

// script.js内のfirebaseConfigと同じ内容
firebase.initializeApp({
  apiKey: "AIzaSyCqfKoF0x5dkdsj83_lczbsm8tLQN3hzyQ",
  authDomain: "owners-login.firebaseapp.com",
  projectId: "owners-login",
  storageBucket: "owners-login.firebasestorage.app",
  messagingSenderId: "860477366916",
  appId: "1:860477366916:web:5a92f334a5b3a22c2e98d1",
  measurementId: "G-MP2N6KGMPT"
});

const messaging = firebase.messaging();

// アプリを閉じている・バックグラウンドの時に通知を受け取った場合の表示内容
messaging.onBackgroundMessage((payload) => {
  const title = (payload.notification && payload.notification.title) || "オーナーズポータル";
  const options = {
    body: (payload.notification && payload.notification.body) || "",
    icon: "https://mpg023.github.io/OwnersPortal/favicon.png"
  };

  self.registration.showNotification(title, options);
});

// 通知をタップした時、サイトを開く（すでに開いていればそちらを前面に出す）
self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if ("focus" in client) return client.focus();
      }
      if (clients.openWindow) {
        return clients.openWindow("./");
      }
    })
  );
});
