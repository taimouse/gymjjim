import { ImageResponse } from 'next/og';

// 앱 아이콘 (빌드 때 PNG 로 만든다). maskable 은 안전 영역을 넓게, badge 는 알림 표시줄용 단색
const ICONS = {
  '192': { size: 192, radius: 42, glyph: 112, background: '#4d51de', color: '#ffffff' },
  '512': { size: 512, radius: 112, glyph: 300, background: '#4d51de', color: '#ffffff' },
  maskable: { size: 512, radius: 0, glyph: 240, background: '#4d51de', color: '#ffffff' },
  apple: { size: 180, radius: 0, glyph: 104, background: '#4d51de', color: '#ffffff' },
  badge: { size: 96, radius: 0, glyph: 72, background: 'transparent', color: '#000000' },
} as const;

// 브랜드 마크와 같은 덤벨 모양 (lucide "dumbbell", ISC). 아이콘 컴포넌트는 클라이언트 전용이라 경로를 직접 쓴다
const DUMBBELL_PATHS = [
  'M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z',
  'm2.5 21.5 1.4-1.4',
  'm20.1 3.9 1.4-1.4',
  'M5.343 21.485a2 2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z',
  'm9.6 14.4 4.8-4.8',
];

type IconName = keyof typeof ICONS;
const isIcon = (value: string): value is IconName => Object.hasOwn(ICONS, value);

export const dynamic = 'force-static';

export function generateStaticParams() {
  return Object.keys(ICONS).map((size) => ({ size }));
}

export async function GET(_: Request, { params }: RouteContext<'/icons/[size]'>) {
  const { size } = await params;
  if (!isIcon(size)) return new Response(null, { status: 404 });
  const icon = ICONS[size];
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: icon.background,
        borderRadius: icon.radius,
      }}
    >
      <svg
        width={icon.glyph}
        height={icon.glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke={icon.color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {DUMBBELL_PATHS.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </div>,
    { width: icon.size, height: icon.size },
  );
}
