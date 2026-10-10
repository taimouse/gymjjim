import { useTranslations } from 'next-intl';

import { PRIVACY_SECTIONS } from './sections';

/**
 * 개인정보 처리방침 본문 (공개 페이지 `/privacy` 와 첫 로그인 동의 시트가 함께 쓴다)
 * 본문 줄이 `- ` 로 시작하면 목록으로 보여준다.
 */
export function PrivacyPolicy({ center }: { center?: string | null }) {
  const t = useTranslations('privacy');
  const centerName = center || t('defaultCenter');

  return (
    <article className="space-y-6 text-base leading-relaxed">
      <p className="text-sm text-muted-foreground">{t('effective')}</p>
      <p>{t('intro', { center: centerName })}</p>
      <nav aria-label={t('toc')} className="rounded-xl bg-muted/60 p-4">
        <ol className="grid gap-1 text-sm">
          {PRIVACY_SECTIONS.map((key) => (
            <li key={key}>
              <a href={`#privacy-${key}`} className="underline-offset-4 hover:underline">
                {t(`sections.${key}.title`)}
              </a>
            </li>
          ))}
        </ol>
      </nav>
      {PRIVACY_SECTIONS.map((key) => (
        <section key={key} id={`privacy-${key}`} className="scroll-mt-4 space-y-2">
          <h2 className="text-lg font-bold">{t(`sections.${key}.title`)}</h2>
          <PolicyBody text={t(`sections.${key}.body`, { center: centerName })} />
        </section>
      ))}
      <p className="border-t pt-4 text-center text-sm text-muted-foreground">{t('end')}</p>
    </article>
  );
}

function PolicyBody({ text }: { text: string }) {
  const lines = text.split('\n');
  const blocks: Array<{ kind: 'p'; text: string } | { kind: 'ul'; items: string[] }> = [];
  for (const line of lines) {
    if (line.startsWith('- ')) {
      const last = blocks.at(-1);
      if (last?.kind === 'ul') last.items.push(line.slice(2));
      else blocks.push({ kind: 'ul', items: [line.slice(2)] });
    } else if (line.trim()) {
      blocks.push({ kind: 'p', text: line });
    }
  }
  return (
    <div className="space-y-2 text-[15px] text-foreground/90">
      {blocks.map((block, index) =>
        block.kind === 'p' ? (
          <p key={index}>{block.text}</p>
        ) : (
          <ul key={index} className="list-disc space-y-1 pl-5">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
