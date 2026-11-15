import type { NextRequest } from "next/server";
import { isValidBbox } from "@/lib/bbox";
import { getLiveFeed } from "@/lib/liveFeed";
import type { AircraftFeed, BoundingBox } from "@/lib/types";

// GET /api/aircraft?lamin=&lomin=&lamax=&lomax=
// Real traffic only. Returns live aircraft inside the bounding box, or a 503
// with an error when no live feed answers. There is no mock fallback.
// Advisory demo data. May be delayed, incomplete, or wrong.

const BBOX_KEYS = ["lamin", "lomin", "lamax", "lomax"] as const;

const json = (body: AircraftFeed | { error: string }, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;

  const raw = BBOX_KEYS.map((key) => params.get(key));
  if (raw.some((value) => value === null || value === "")) {
    return json({ error: "Provide all four of lamin, lomin, lamax, lomax" }, 400);
  }

  const [lamin, lomin, lamax, lomax] = raw.map(Number);
  const bbox: BoundingBox = { lamin, lomin, lamax, lomax };
  if (!isValidBbox(bbox)) {
    return json({ error: "Invalid bounding box" }, 400);
  }

  const result = await getLiveFeed(bbox);
  if (!result.ok) return json({ error: result.error }, 503);
  return json(result.feed);
}
