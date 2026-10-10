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

export const programFormSchema = z
  .object({
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
    /** 이용권(횟수권·기간권)으로 예약 가능. 횟수권은 1회 차감 */
    usePass: z.boolean(),
    allowedProductIds: z.array(z.uuid()),
    /** 크레딧으로 예약 가능 (이용권이 없을 때) */
    useCredit: z.boolean(),
    /** 크레딧으로 예약할 때 쓰는 크레딧 */
    creditCost: z.number().nullable(),
    /** 공개 예약 `yyyy-MM-ddTHH:mm` (센터 시간대). 빈 값 = 바로 공개 */
    publishAt: publishAtField,
  })
  .superRefine((values, context) => {
    if (!values.usePass && !values.useCredit) {
      context.addIssue({ code: 'custom', path: ['useCredit'], message: 'paymentRequired' });
    }
    if (values.usePass && values.allowedProductIds.length === 0) {
      context.addIssue({ code: 'custom', path: ['allowedProductIds'], message: 'productsRequired' });
    }
    const cost = values.creditCost;
    if (values.useCredit && (cost === null || !Number.isInteger(cost) || cost < 1 || cost > 100)) {
      context.addIssue({
        code: 'custom',
        path: ['creditCost'],
        message: cost === null ? 'required' : cost > 100 ? 'max' : 'min',
      });
    }
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
  usePass: true,
  allowedProductIds: [],
  useCredit: false,
  creditCost: 1,
  publishAt: '',
};
