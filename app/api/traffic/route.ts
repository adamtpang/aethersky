import { getNationalSnapshot } from "@/lib/nationalFeed";

// GET /api/traffic
// Live airborne traffic for the contiguous United States, as one shared
// snapshot. Real traffic only: a 503 with an error when the feed fails.
// Advisory demo data. May be delayed, incomplete, or wrong.

// One sweep is about 35 seconds of spaced requests.
export const maxDuration = 120;

export async function GET() {
  const result = await getNationalSnapshot();
  if (!result.ok) {
    return Response.json(
      { error: result.error },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  return Response.json(result.snapshot, {
    headers: {
      // Let the CDN hand the same snapshot to every visitor and refresh it
      // in the background, so visitors do not each trigger a sweep.
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120",
    },
  });
}
