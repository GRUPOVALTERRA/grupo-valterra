import { Navbar } from "@/components/layout/Navbar";

export default function PropiedadesLoading() {
  return (
    <div className="min-h-screen bg-[#F8F7F4] text-[#0A2342]">
      <Navbar />

      <div className="pt-24 md:pt-32">
        {/* Header skeleton */}
        <div className="mx-auto max-w-7xl px-4 pb-8 lg:px-8">
          <div className="mb-2 h-3 w-32 animate-pulse rounded bg-slate-200" />
          <div className="h-9 w-52 animate-pulse rounded bg-slate-200" />
          <div className="mt-2 h-4 w-40 animate-pulse rounded bg-slate-200" />
        </div>

        {/* Filter bar skeleton */}
        <div className="mx-auto max-w-7xl px-4 pb-8 lg:px-8">
          <div className="h-[72px] w-full animate-pulse rounded-2xl bg-slate-200" />
        </div>

        {/* Cards grid skeleton */}
        <div className="mx-auto max-w-7xl px-4 pb-24 lg:px-8">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="overflow-hidden rounded-2xl bg-white shadow-[0_4px_24px_-8px_rgba(10,35,66,0.12)]"
              >
                <div className="aspect-[4/3] animate-pulse bg-slate-200" />
                <div className="space-y-3 p-5">
                  <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                  <div className="h-7 w-36 animate-pulse rounded bg-slate-200" />
                  <div className="h-5 w-full animate-pulse rounded bg-slate-200" />
                  <div className="h-4 w-3/4 animate-pulse rounded bg-slate-200" />
                  <div className="h-px w-full bg-slate-100" />
                  <div className="flex gap-4">
                    <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                    <div className="h-3 w-16 animate-pulse rounded bg-slate-200" />
                  </div>
                  <div className="h-10 w-full animate-pulse rounded-lg bg-slate-200" />
                  <div className="h-9 w-full animate-pulse rounded-lg bg-slate-100" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
