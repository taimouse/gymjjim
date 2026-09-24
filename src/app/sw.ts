/// <reference lib="esnext" />
/// <reference lib="webworker" />
// 서비스 워커 (Serwist). tsconfig.sw.json 으로 따로 타입 검사한다.
import { defaultCache } from '@serwist/turbopack/worker';
import { NetworkOnly, type PrecacheEntry, Serwist, type SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    // Supabase(API·Auth·Realtime)는 캐시하지 않는다: 정원·예약·개인정보는 항상 최신이어야 한다
    {
      matcher: ({ url }) => url.hostname.endsWith('.supabase.co') || url.port === '54321',
      handler: new NetworkOnly(),
    },
    ...defaultCache,
  ],
  fallbacks: {
    entries: [{ url: '/offline', matcher: ({ request }) => request.destination === 'document' }],
  },
});

/* ───────────── 웹 푸시 (알림톡 보조 채널) ───────────── */

interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

function readPush(data: PushMessageData | null): PushMessage | null {
  try {
    const value: unknown = data?.json();
    if (!value || typeof value !== 'object') return null;
    const { title, body, url, tag } = value as Record<string, unknown>;
    if (typeof title !== 'string' || typeof body !== 'string') return null;
    return {
      title,
      body,
      url: typeof url === 'string' && url.startsWith('/') ? url : '/m/my-bookings',
      tag: typeof tag === 'string' ? tag : undefined,
    };
  } catch {
    return null;
  }
}

self.addEventListener('push', (event) => {
  const message = readPush(event.data);
  if (!message) return;
  event.waitUntil(
    self.registration.showNotification(message.title, {
      body: message.body,
      icon: '/icons/192',
      badge: '/icons/badge',
      tag: message.tag,
      data: { url: message.url },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data: unknown = event.notification.data;
  const path =
    data && typeof data === 'object' && typeof (data as { url?: unknown }).url === 'string'
      ? (data as { url: string }).url
      : '/m/my-bookings';
  const target = new URL(path, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const client = clients.find((item) => item.url.startsWith(self.location.origin));
      if (client) {
        await client.navigate(target);
        return client.focus();
      }
      return self.clients.openWindow(target);
    }),
  );
});

serwist.addEventListeners();
