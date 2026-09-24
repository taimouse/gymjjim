'use client';

import { Check } from 'lucide-react';

import { cn } from '@/lib/utils';

/** 미리 정한 색 중에서 고르는 스와치 (radio 그룹) */
export function ColorPicker({
  value,
  onChange,
  colors,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (color: string) => void;
  colors: readonly string[];
  label: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
      {colors.map((color) => {
        const selected = color.toLowerCase() === value.toLowerCase();
        return (
          <button
            key={color}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={color}
            disabled={disabled}
            onClick={() => onChange(color)}
            className={cn(
              'grid size-11 place-items-center rounded-full border-2 transition outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50',
              selected ? 'border-foreground' : 'border-transparent',
            )}
          >
            <span
              className="grid size-8 place-items-center rounded-full border border-black/10"
              style={{ backgroundColor: color }}
            >
              {selected && <Check className="size-4 text-black/70" aria-hidden />}
            </span>
          </button>
        );
      })}
    </div>
  );
}
