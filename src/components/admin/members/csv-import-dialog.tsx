'use client';

import { useQueryClient } from '@tanstack/react-query';
import { FileUp } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useAdmin } from '@/components/admin/admin-context';
import { ErrorAlert } from '@/components/form-messages';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { importMembers } from '@/features/members/actions';
import { buildPreview, type CsvMapping, summarize } from '@/features/members/csv-import';
import { memberKeys } from '@/features/members/queries';
import { CSV_FIELDS, decodeCsv, guessMapping, parseCsv } from '@/lib/csv';
import type { AppErrorCode } from '@/lib/errors';
import { createClient } from '@/lib/supabase/client';

import { CsvPreviewTable } from './csv-preview-table';

type Step = 'upload' | 'mapping' | 'preview';
const NONE = 'none';

async function fetchExistingPhones(centerId: string, phones: string[]): Promise<Set<string>> {
  const supabase = createClient();
  const existing = new Set<string>();
  for (let i = 0; i < phones.length; i += 200) {
    const { data } = await supabase
      .from('members')
      .select('phone')
      .eq('center_id', centerId)
      .is('deleted_at', null)
      .in('phone', phones.slice(i, i + 200));
    for (const row of data ?? []) if (row.phone) existing.add(row.phone);
  }
  return existing;
}

/** CSV 가져오기: 업로드 → 컬럼 매핑 → 미리보기(오류 행 표시) → 확정 */
export function CsvImportDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations('members.csv');
  const { centerId } = useAdmin();
  const queryClient = useQueryClient();
  const [step, setStep] = useState<Step>('upload');
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<CsvMapping>(() => guessMapping([]));
  const [existing, setExisting] = useState<Set<string>>(new Set());
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState<AppErrorCode | null>(null);
  const [readError, setReadError] = useState(false);
  const [pending, startTransition] = useTransition();

  const headers = useMemo(() => {
    const first = rows[0] ?? [];
    return first.map((value, index) =>
      hasHeader && value.trim() ? value.trim() : t('column', { index: index + 1 }),
    );
  }, [rows, hasHeader, t]);
  const preview = useMemo(
    () => buildPreview(rows, mapping, hasHeader, existing),
    [rows, mapping, hasHeader, existing],
  );
  const summary = summarize(preview);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      const parsed = parseCsv(decodeCsv(await file.arrayBuffer()));
      if (parsed.length === 0) throw new Error('empty');
      setRows(parsed);
      setMapping(guessMapping(parsed[0] ?? []));
      setReadError(false);
      setStep('mapping');
    } catch {
      setReadError(true);
    }
  };

  const toPreview = () =>
    startTransition(async () => {
      const phones = buildPreview(rows, mapping, hasHeader, new Set()).flatMap((row) =>
        row.output ? [row.output.phone] : [],
      );
      setExisting(await fetchExistingPhones(centerId, phones));
      setStep('preview');
    });

  const submit = () =>
    startTransition(async () => {
      setError(null);
      const valid = preview.filter((row) => row.status === 'ok').map((row) => row.input);
      const result = await importMembers(valid);
      if (!result.ok) {
        setError(result.code);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: memberKeys.all });
      toast.success(t('done', { inserted: result.data.inserted, skipped: result.data.skipped.length }));
      onClose();
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>

        <ol className="flex gap-2 text-sm" aria-label={t('title')}>
          {(['upload', 'mapping', 'preview'] as const).map((item, index) => (
            <li
              key={item}
              aria-current={step === item ? 'step' : undefined}
              className={step === item ? 'font-semibold text-primary' : 'text-muted-foreground'}
            >
              {t('stepLabel', { index: index + 1, label: t(`steps.${item}`) })}
            </li>
          ))}
        </ol>

        {step === 'upload' && (
          <div className="space-y-3">
            <label className="flex min-h-32 cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-6 text-center hover:bg-muted/50">
              <FileUp className="size-8 text-muted-foreground" aria-hidden />
              <span className="font-medium">{t('choose')}</span>
              <input
                type="file"
                accept=".csv,.txt,text/csv"
                className="sr-only"
                onChange={(event) => onFile(event.target.files?.[0])}
              />
            </label>
            {readError && <p className="text-danger">{t('unreadable')}</p>}
          </div>
        )}

        {step === 'mapping' && (
          <div className="space-y-4">
            <label className="flex min-h-11 cursor-pointer items-center gap-3">
              <Checkbox checked={hasHeader} onCheckedChange={(value) => setHasHeader(value === true)} />
              {t('hasHeader')}
            </label>
            <p className="text-sm text-muted-foreground">{t('rowsRead', { count: rows.length })}</p>
            <FieldGroup className="grid gap-3 sm:grid-cols-2">
              {CSV_FIELDS.map((field) => (
                <Field key={field}>
                  <FieldLabel>{t(`fields.${field}`)}</FieldLabel>
                  <Select
                    value={mapping[field] === null ? NONE : String(mapping[field])}
                    onValueChange={(value) =>
                      setMapping((current) => ({
                        ...current,
                        [field]: value === NONE ? null : Number(value),
                      }))
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{t('notMapped')}</SelectItem>
                      {headers.map((header, index) => (
                        <SelectItem key={index} value={String(index)}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              ))}
            </FieldGroup>
          </div>
        )}

        {step === 'preview' && (
          <div className="space-y-3">
            <p className="font-medium">{t('summary', summary)}</p>
            <CsvPreviewTable rows={preview} />
            <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg bg-muted px-3 font-medium">
              <Checkbox checked={consent} onCheckedChange={(value) => setConsent(value === true)} />
              {t('consent')}
            </label>
            <ErrorAlert code={error} />
          </div>
        )}

        <DialogFooter>
          {step !== 'upload' && (
            <Button variant="outline" onClick={() => setStep(step === 'preview' ? 'mapping' : 'upload')}>
              {t('back')}
            </Button>
          )}
          {step === 'mapping' && (
            <Button onClick={toPreview} disabled={pending || mapping.name === null || mapping.phone === null}>
              {pending && <Spinner />}
              {t('next')}
            </Button>
          )}
          {step === 'preview' && (
            <Button onClick={submit} disabled={pending || !consent || summary.valid === 0}>
              {pending && <Spinner />}
              {t('submit', { count: summary.valid })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
