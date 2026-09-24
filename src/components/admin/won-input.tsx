'use client';

import { forwardRef, type InputHTMLAttributes } from 'react';

import { InputGroup, InputGroupAddon, InputGroupInput, InputGroupText } from '@/components/ui/input-group';
import { formatNumber, parseWon } from '@/lib/format';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: number | null;
  onChange: (value: number | null) => void;
  unit: string;
};

/** 원 단위 콤마 입력: 150000 → "150,000" 으로 보여주고 숫자로 돌려준다 */
export const WonInput = forwardRef<HTMLInputElement, Props>(function WonInput(
  { value, onChange, unit, ...props },
  ref,
) {
  return (
    <InputGroup>
      <InputGroupInput
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        className="text-right tabular-nums"
        value={value === null ? '' : formatNumber(value)}
        onChange={(event) => onChange(parseWon(event.target.value))}
        {...props}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupText>{unit}</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  );
});
