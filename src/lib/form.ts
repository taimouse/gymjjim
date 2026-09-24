/** react-hook-form register 옵션: 빈 칸은 null, 나머지는 숫자로 */
export const numberInput = {
  setValueAs: (value: unknown): number | null => {
    if (value === '' || value === null || value === undefined) return null;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  },
};
