"use client";

import type { PollResponse, SearchStatus } from "@/lib/types";

type ResultsSummary = Pick<PollResponse, "resultsCount" | "highScoreSheetUrl" | "lowScoreSheetUrl">;

export default function ResultsLinks({
  status,
  summary,
  error,
}: {
  status: SearchStatus;
  summary: ResultsSummary | null;
  error: string | null;
}) {
  if (status === "idle") {
    return (
      <section className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-zinc-300 p-10 text-center text-sm text-zinc-500 dark:border-zinc-700">
        Fill in the form and search to see graded job matches here.
      </section>
    );
  }

  if (status === "running") {
    return (
      <section className="flex flex-1 items-center justify-center rounded-xl border border-zinc-200 p-10 text-center dark:border-zinc-800">
        <div className="flex flex-col items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-zinc-300 border-t-zinc-900 dark:border-zinc-700 dark:border-t-zinc-100" />
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Searching 6 job boards and grading matches — this can take a few minutes.
          </p>
        </div>
      </section>
    );
  }

  if (status === "not_found") {
    return (
      <section className="rounded-xl border border-zinc-200 p-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
        Couldn&apos;t find that search. Try running it again.
      </section>
    );
  }

  if (status === "error") {
    return (
      <section className="rounded-xl border border-red-200 bg-red-50 p-10 text-center text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300">
        {error ?? "Something went wrong."}
      </section>
    );
  }

  if (!summary) {
    return (
      <section className="rounded-xl border border-zinc-200 p-10 text-center text-sm text-zinc-500 dark:border-zinc-800">
        No results to show.
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
      <p className="text-sm text-zinc-500">
        {summary.resultsCount} job{summary.resultsCount === 1 ? "" : "s"} processed
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        {summary.highScoreSheetUrl ? (
          <a
            href={summary.highScoreSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-zinc-300 bg-white px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-sm hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-100 dark:hover:bg-zinc-900"
          >
            View high-score matches →
          </a>
        ) : (
          <p className="flex-1 rounded-lg border border-dashed border-zinc-300 px-4 py-2.5 text-center text-sm text-zinc-400 dark:border-zinc-700">
            High-score link not available for this run
          </p>
        )}
        {summary.lowScoreSheetUrl ? (
          <a
            href={summary.lowScoreSheetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex flex-1 items-center justify-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-900"
          >
            View declined jobs →
          </a>
        ) : (
          <p className="flex-1 rounded-lg border border-dashed border-zinc-300 px-4 py-2.5 text-center text-sm text-zinc-400 dark:border-zinc-700">
            Declined-jobs link not available for this run
          </p>
        )}
      </div>
    </section>
  );
}
