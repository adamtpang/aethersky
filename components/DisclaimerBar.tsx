import { DISCLAIMER_TEXT } from "@/lib/disclaimer";

/**
 * Fixed advisory disclaimer. Rendered from the root layout so it is on every
 * page. It must stay visible and must never get a close, dismiss, or
 * "don't show again" control. See docs/safety.md.
 */
export default function DisclaimerBar() {
  return (
    <div
      role="note"
      aria-label="Safety disclaimer"
      className="z-[1100] shrink-0 border-b border-warn/50 bg-[#2a1f08] px-4 py-2 text-center text-[13px] font-semibold leading-snug text-[#ffdf9a] sm:text-sm"
    >
      {DISCLAIMER_TEXT}
    </div>
  );
}
