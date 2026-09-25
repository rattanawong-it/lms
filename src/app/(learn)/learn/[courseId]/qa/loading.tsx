import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="mx-auto max-w-[860px] space-y-4">
      <Skeleton className="h-9 w-48" />
      <Skeleton className="h-11 w-full rounded-xl" />
      <Skeleton className="h-[280px] w-full rounded-xl" />
    </div>
  );
}
