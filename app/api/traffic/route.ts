import type { NextRequest } from "next/server";
import {
  getNationalSweep,
  lastSnapshot,
  nationalStream,
  snapshotOf,
} from "@/lib/nationalFeed";

// GET /api/traffic
// Live airborne traffic for the contiguous United States, as a stream of
// JSON lines: one "clock", one "start", one "region" per region as it
// arrives, one "end".
//
// GET /api/traffic?snapshot=1
// The last finished sweep as one JSON object. The CDN keeps handing out its
// copy while a new one is made, so a visitor who arrives cold gets a full
// (older, clearly labeled) picture at once instead of an empty map.
//
// Real traffic only. A failed sweep ends with an error and no aircraft.
// Advisory demo data. May be delayed, incomplete, or wrong.

// One sweep is about 35 seconds of spaced requests.
export const maxDuration = 120;

export async function GET(request: NextRequest) {
  if (request.nextUrl.searchParams.get("snapshot") === "1") {
    // If this server already holds a finished sweep, answer with it and do
    // nothing else. It must not start a sweep here: once this response is
    // sent the host may freeze the process, and a sweep left running in the
    // background would be caught half done. Sweeps are run by the live
    // stream, whose open response keeps the process alive until the end.
    let snapshot = lastSnapshot();
    if (!snapshot) {
      const sweep = getNationalSweep();
      await sweep.done;
      snapshot = snapshotOf(sweep);
    }
    if (!snapshot) {
      return Response.json(
        { error: "No finished sweep is available." },
        { status: 503, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(snapshot, {
      headers: {
        // Fresh for a short while, then served as-is for up to a day while
        // a new copy is fetched in the background. The page decides whether
        // a copy is too old to show.
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=86400",
      },
    });
  }

  return new Response(nationalStream(), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Let the CDN hand the same sweep to every visitor and refresh it in
      // the background, so visitors do not each trigger one. Kept short:
      // a cached copy older than about a minute holds positions too old to
      // project, and the page would have to throw them away.
      "Cache-Control": "public, s-maxage=15, stale-while-revalidate=30",
    },
  });
}
