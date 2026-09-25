/**
 * 모달(시트·대화상자)이 열려 있어도 토스트의 [되돌리기]를 누를 수 있게 한다.
 * Radix 모달은 바깥 클릭을 막고 닫으므로, 토스트를 누른 것은 '바깥 클릭'으로 보지 않는다.
 */
export function isToastInteraction(event: Event): boolean {
  const target = event.target;
  return target instanceof Element && target.closest('[data-sonner-toaster]') !== null;
}
