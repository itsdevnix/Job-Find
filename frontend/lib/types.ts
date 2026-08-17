export type PollStatus = "running" | "complete" | "not_found";

export type PollResponse = {
  status: PollStatus;
  resultsCount: number;
  highScoreSheetUrl?: string | null;
  lowScoreSheetUrl?: string | null;
};

export type SearchResponse = {
  runId: string;
};

export type SearchStatus = "idle" | "running" | "complete" | "not_found" | "error";
