import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-9 w-56" />
      <Skeleton className="h-10 w-full max-w-[220px] self-end" />
      <Skeleton className="h-[320px] w-full rounded-xl" />
    </div>
  );
}
