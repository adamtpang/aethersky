import { nationalStream } from "@/lib/nationalFeed";

// GET /api/traffic
// Live airborne traffic for the contiguous United States, as a stream of
// JSON lines: one "start", one "region" per region as it arrives, one "end".
// Real traffic only. A failed sweep ends with an error and no aircraft.
// Advisory demo data. May be delayed, incomplete, or wrong.

// One sweep is about 35 seconds of spaced requests.
export const maxDuration = 120;

export async function GET() {
  return new Response(nationalStream(), {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      // Let the CDN hand the same sweep to every visitor and refresh it in
      // the background, so visitors do not each trigger one.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
