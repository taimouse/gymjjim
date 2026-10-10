/** GitHub Pages 하위 경로 (예: /gymjjim). <a href> 처럼 Next 가 basePath 를 붙여 주지 않는 곳에 쓴다 */
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const withBase = (path: string) => `${BASE_PATH}${path}`;
