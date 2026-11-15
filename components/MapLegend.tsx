/**
 * What the map symbols mean. Every state has its own shape as well as its
 * own color, so nothing depends on color alone.
 */
export default function MapLegend({ inline = false }: { inline?: boolean }) {
  return (
    <div
      className={
        inline
          ? "border-b border-line px-4 py-3 text-[11px] leading-relaxed text-muted sm:hidden"
          : "pointer-events-none absolute bottom-7 left-3 z-[1000] hidden border border-line bg-bg/90 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted sm:block"
      }
    >
      <p className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M6 1 L10 6 L6 11 L2 6 Z" fill="none" stroke="#35d0e0" strokeWidth="1.4" />
        </svg>
        Hollow diamond: airborne aircraft
      </p>
      <p className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <circle cx="6" cy="6" r="4.5" fill="#ffb000" />
        </svg>
        Filled circle: in a pair flagged by the demo check
      </p>
      <p className="flex items-center gap-2">
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <rect x="1.5" y="1.5" width="9" height="9" fill="#ff4d3d" />
        </svg>
        Filled square: the pair you selected
      </p>
      <p className="mt-0.5">
        Tag: altitude in hundreds of feet, speed in tens of knots
      </p>
    </div>
  );
}
