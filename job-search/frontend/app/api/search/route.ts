import { NextResponse } from "next/server";
import type { SearchResponse } from "@/lib/types";

function normalizeJobTitle(raw: string): string {
  return raw
    .replace(/,/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function POST(request: Request) {
  const webhookUrl = process.env.N8N_JOB_SEARCH_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "N8N_JOB_SEARCH_WEBHOOK_URL is not configured on the server." },
      { status: 500 }
    );
  }

  const incoming = await request.formData();
  const jobTitle = incoming.get("jobTitle");
  const location = incoming.get("location");
  const resume = incoming.get("resume");

  if (typeof jobTitle !== "string" || jobTitle.trim() === "") {
    return NextResponse.json({ error: "jobTitle is required." }, { status: 400 });
  }
  if (typeof location !== "string" || location.trim() === "") {
    return NextResponse.json({ error: "location is required." }, { status: 400 });
  }
  if (!(resume instanceof File) || resume.size === 0) {
    return NextResponse.json({ error: "resume file is required." }, { status: 400 });
  }

  const runId = crypto.randomUUID();

  const outgoing = new FormData();
  outgoing.set("jobTitle", normalizeJobTitle(jobTitle));
  outgoing.set("location", location.trim());
  outgoing.set("runId", runId);
  outgoing.set("resume", resume, resume.name);

  const upstream = await fetch(webhookUrl, {
    method: "POST",
    body: outgoing,
  });

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `n8n rejected the search request (${upstream.status}).`, detail },
      { status: 502 }
    );
  }

  const body: SearchResponse = { runId };
  return NextResponse.json(body);
}
