import { Loader2 } from 'lucide-react';

export default function Loading() {
  return (
    <div className="flex min-h-screen w-full flex-col items-center justify-center bg-background">
      <Loader2
        role="status"
        aria-label="Loading"
        className="size-8 animate-spin text-primary"
      />
    </div>
  );
}
