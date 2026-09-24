import { getRequestConfig } from 'next-intl/server';

import { APP_LOCALE, APP_TIME_ZONE } from './config';
import messages from './messages/ko.json';

// 한국어 전용 앱이라 locale 라우팅 없이 항상 ko 메시지를 쓴다.
export default getRequestConfig(async () => ({
  locale: APP_LOCALE,
  timeZone: APP_TIME_ZONE,
  messages,
}));
