'use client';

import { useEffect, useState } from 'react';

/** 값이 delay 동안 바뀌지 않으면 반영한다 (입력 즉시 검색용) */
export function useDebouncedValue<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
