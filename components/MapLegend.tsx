/** What the map symbols mean. Shape and color both carry the meaning. */
export default function MapLegend() {
  return (
    <div className="pointer-events-none absolute bottom-7 left-3 z-[1000] rounded-md border border-line bg-panel/90 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted">
      <p className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 0 L10 11 L6 8.5 L2 11 Z" fill="#7eb6d6" />
        </svg>
        Airborne aircraft, pointing along its track
      </p>
      <p className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="5" fill="none" stroke="#f5b942" strokeWidth="1.5" />
          <path d="M6 2.5 L8 9 L6 7.6 L4 9 Z" fill="#f5b942" />
        </svg>
        Pair flagged by the demo check, ringed
      </p>
      <p className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M1 6 H11" stroke="#ff6b5e" strokeWidth="2.5" />
        </svg>
        Selected pair
      </p>
    </div>
  );
}
