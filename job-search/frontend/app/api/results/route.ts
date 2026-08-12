import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const webhookUrl = process.env.N8N_JOB_RESULTS_WEBHOOK_URL;
  if (!webhookUrl) {
    return NextResponse.json(
      { error: "N8N_JOB_RESULTS_WEBHOOK_URL is not configured on the server." },
      { status: 500 }
    );
  }

  const runId = new URL(request.url).searchParams.get("runId");
  if (!runId) {
    return NextResponse.json({ error: "runId query param is required." }, { status: 400 });
  }

  const target = new URL(webhookUrl);
  target.searchParams.set("runId", runId);

  const upstream = await fetch(target, { method: "GET" });
  const raw = await upstream.text();

  let data: unknown;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!upstream.ok || data === null) {
    return NextResponse.json(
      {
        error: `n8n poll request did not return usable data (HTTP ${upstream.status}).`,
        detail: raw.slice(0, 500),
      },
      { status: 502 }
    );
  }

  return NextResponse.json(data);
}
