import { Skeleton } from '@/components/ui/skeleton';

export default function MeLoading() {
  return (
    <div className="space-y-8 px-4 pt-5 pb-8" aria-hidden>
      <div className="space-y-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-5 w-48" />
      </div>
      <div className="space-y-3">
        <Skeleton className="h-6 w-24" />
        <Skeleton className="h-52 w-full rounded-2xl" />
      </div>
      <Skeleton className="h-36 w-full rounded-2xl" />
    </div>
  );
}
