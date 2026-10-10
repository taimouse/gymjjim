/** node:crypto 대신 (브라우저 Web Crypto) */
export const randomUUID = () => crypto.randomUUID();
