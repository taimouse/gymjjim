import { z } from 'zod';

import { publishAtField } from '@/features/sessions/schema';

/** 캘린더 이벤트 배경으로 쓰는 프로그램 색상 후보 (연한 톤, 글자는 진하게) */
export const PROGRAM_COLORS = [
  '#A7F3D0',
  '#BFDBFE',
  '#DDD6FE',
  '#FECACA',
  '#FDE68A',
  '#FBCFE8',
  '#C7D2FE',
  '#99F6E4',
  '#FED7AA',
  '#E5E7EB',
] as const;

export const programFormSchema = z.object({
  name: z.string().trim().min(1, { error: 'required' }).max(100, { error: 'max' }),
  type: z.enum(['group', 'private']),
  defaultCapacity: z
    .number({ error: 'required' })
    .int({ error: 'invalid' })
    .min(1, { error: 'min' })
    .max(500, { error: 'max' }),
  durationMin: z
    .number({ error: 'required' })
    .int({ error: 'invalid' })
    .min(5, { error: 'min' })
    .max(600, { error: 'max' }),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, { error: 'color' }),
  defaultInstructorId: z.uuid().nullable(),
  description: z.string().trim().max(1000, { error: 'max' }),
  allowedProductIds: z.array(z.uuid()),
  /** 횟수권으로 예약할 때 1회 예약에 차감하는 횟수 (기간권은 차감 없음) */
  passCost: z
    .number({ error: 'required' })
    .int({ error: 'invalid' })
    .min(1, { error: 'min' })
    .max(100, { error: 'max' }),
  /** 공개 예약 `yyyy-MM-ddTHH:mm` (센터 시간대). 빈 값 = 바로 공개 */
  publishAt: publishAtField,
});
export type ProgramFormValues = z.infer<typeof programFormSchema>;

export const saveProgramInput = z.object({
  id: z.uuid().optional(),
  values: programFormSchema,
});
export type SaveProgramInput = z.infer<typeof saveProgramInput>;

export const EMPTY_PROGRAM: ProgramFormValues = {
  name: '',
  type: 'group',
  defaultCapacity: 10,
  durationMin: 60,
  color: PROGRAM_COLORS[0],
  defaultInstructorId: null,
  description: '',
  allowedProductIds: [],
  passCost: 1,
  publishAt: '',
};
