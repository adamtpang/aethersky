import type { NextRequest } from "next/server";
import { buildMockFeed } from "@/lib/mockTraffic";
import { getLiveFeed, isValidBbox } from "@/lib/opensky";
import type { AircraftFeed, BoundingBox } from "@/lib/types";

// GET /api/aircraft
//   lamin, lomin, lamax, lomax: bounding box (all four or none)
//   source: "live" or "mock" (default live when a bbox is present, else mock)
// Advisory demo data only. Falls back to mock traffic on any live failure.

const BBOX_KEYS = ["lamin", "lomin", "lamax", "lomax"] as const;

const json = (body: AircraftFeed | { error: string }, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const source = params.get("source");
  if (source !== null && source !== "live" && source !== "mock") {
    return json({ error: "source must be live or mock" }, 400);
  }

  const raw = BBOX_KEYS.map((key) => params.get(key));
  const present = raw.filter((value) => value !== null && value !== "").length;
  if (present !== 0 && present !== BBOX_KEYS.length) {
    return json(
      { error: "Provide all four of lamin, lomin, lamax, lomax, or none" },
      400,
    );
  }

  if (source === "mock" || present === 0) {
    return json(buildMockFeed());
  }

  const [lamin, lomin, lamax, lomax] = raw.map(Number);
  const bbox: BoundingBox = { lamin, lomin, lamax, lomax };
  if (!isValidBbox(bbox)) {
    return json({ error: "Invalid bounding box" }, 400);
  }

  return json(await getLiveFeed(bbox));
}
