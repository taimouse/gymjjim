import type { MetadataRoute } from 'next';

import messages from '@/i18n/messages/ko.json';

/** PWA 매니페스트: 회원은 홈 화면에 추가해 앱처럼 쓴다 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: messages.app.pwaName,
    short_name: messages.app.name,
    description: messages.app.description,
    lang: 'ko',
    start_url: '/m',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#ffffff',
    theme_color: '#4d51de',
    icons: [
      { src: '/icons/192', sizes: '192x192', type: 'image/png' },
      { src: '/icons/512', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
