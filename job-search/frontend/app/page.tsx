"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import SearchForm from "@/components/SearchForm";
import ResultsLinks from "@/components/ResultsLinks";
import type { PollResponse, SearchStatus } from "@/lib/types";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

type ResultsSummary = Pick<PollResponse, "resultsCount" | "highScoreSheetUrl" | "lowScoreSheetUrl">;

export default function Home() {
  const [status, setStatus] = useState<SearchStatus>("idle");
  const [summary, setSummary] = useState<ResultsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollDeadline = useRef<number | null>(null);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) {
      clearInterval(pollTimer.current);
      pollTimer.current = null;
    }
  }, []);

  useEffect(() => stopPolling, [stopPolling]);

  const pollOnce = useCallback(
    async (runId: string) => {
      try {
        const res = await fetch(`/api/results?runId=${encodeURIComponent(runId)}`);
        const data: PollResponse = await res.json();

        if (!res.ok) {
          setError("error" in data ? String((data as { error?: string }).error) : "Something went wrong while checking results.");
          setStatus("error");
          stopPolling();
          return;
        }

        if (data.status === "complete") {
          setSummary({
            resultsCount: data.resultsCount,
            highScoreSheetUrl: data.highScoreSheetUrl,
            lowScoreSheetUrl: data.lowScoreSheetUrl,
          });
          setStatus("complete");
          stopPolling();
          return;
        }

        if (data.status === "not_found") {
          setStatus("not_found");
          stopPolling();
          return;
        }

        if (pollDeadline.current && Date.now() > pollDeadline.current) {
          setError(
            "This search is taking longer than expected. It may still finish in the background — try checking again in a few minutes."
          );
          setStatus("error");
          stopPolling();
        }
      } catch {
        setError("Lost connection while checking results.");
        setStatus("error");
        stopPolling();
      }
    },
    [stopPolling]
  );

  const handleStarted = useCallback(
    (runId: string) => {
      setSummary(null);
      setError(null);
      setStatus("running");
      pollDeadline.current = Date.now() + POLL_TIMEOUT_MS;
      stopPolling();
      pollOnce(runId);
      pollTimer.current = setInterval(() => pollOnce(runId), POLL_INTERVAL_MS);
    },
    [pollOnce, stopPolling]
  );

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Job Search</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Upload your resume, tell us what you&apos;re looking for, and we&apos;ll grade matching jobs across 6 job
          boards.
        </p>
      </header>
      <main className="grid flex-1 grid-cols-1 items-start gap-8 lg:grid-cols-[380px_1fr]">
        <SearchForm onStarted={handleStarted} disabled={status === "running"} />
        <ResultsLinks status={status} summary={summary} error={error} />
      </main>
    </div>
  );
}
