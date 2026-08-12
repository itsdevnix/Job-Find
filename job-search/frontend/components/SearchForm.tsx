"use client";

import { useState, type FormEvent } from "react";

const LOCATION_CHIPS = ["Remote", "Hybrid"];

export default function SearchForm({
  onStarted,
  disabled,
}: {
  onStarted: (runId: string) => void;
  disabled: boolean;
}) {
  const [jobTitle, setJobTitle] = useState("");
  const [location, setLocation] = useState("");
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = jobTitle.trim() !== "" && location.trim() !== "" && resumeFileName !== null;
  const busy = submitting || disabled;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const formData = new FormData(event.currentTarget);
    const title = String(formData.get("jobTitle") ?? "").trim();
    const loc = String(formData.get("location") ?? "").trim();
    const resume = formData.get("resume");

    if (!title || !loc || !(resume instanceof File) || resume.size === 0) {
      setError("Fill in job title, location, and attach your resume before searching.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/search", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start the search.");
        return;
      }
      onStarted(data.runId);
    } catch {
      setError("Could not reach the search service. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  }

  function addChip(value: string) {
    setLocation((current) => (current.trim() === "" ? value : `${current}, ${value}`));
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex h-fit flex-col gap-5 rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950"
    >
      <div className="flex flex-col gap-1.5">
        <label htmlFor="jobTitle" className="text-sm font-medium">
          Job title
        </label>
        <input
          id="jobTitle"
          name="jobTitle"
          type="text"
          value={jobTitle}
          onChange={(e) => setJobTitle(e.target.value)}
          placeholder="e.g. automation manager, operations manager"
          disabled={busy}
          required
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
        />
        <p className="text-xs text-zinc-500">Separate multiple titles with commas.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="location" className="text-sm font-medium">
          Location
        </label>
        <div className="flex gap-2">
          {LOCATION_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => addChip(chip)}
              disabled={busy}
              className="rounded-full border border-zinc-300 px-3 py-1 text-xs text-zinc-600 hover:border-zinc-500 hover:text-zinc-900 disabled:opacity-60 dark:border-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-100"
            >
              {chip}
            </button>
          ))}
        </div>
        <input
          id="location"
          name="location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Remote, Hybrid, or Austin, TX"
          disabled={busy}
          required
          className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="resume" className="text-sm font-medium">
          Resume (PDF)
        </label>
        <input
          id="resume"
          name="resume"
          type="file"
          accept="application/pdf"
          disabled={busy}
          required
          onChange={(e) => setResumeFileName(e.target.files?.[0]?.name ?? null)}
          className="text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-zinc-900 file:px-3 file:py-2 file:text-sm file:text-white disabled:opacity-60 dark:file:bg-zinc-100 dark:file:text-zinc-900"
        />
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <button
        type="submit"
        disabled={!isValid || busy}
        className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-500"
      >
        {busy ? "Searching…" : "Search jobs"}
      </button>
    </form>
  );
}
