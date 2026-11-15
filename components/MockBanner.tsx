interface MockBannerProps {
  warning?: string;
}

/** Shown whenever the feed source is mock. A banner, not a tooltip. */
export default function MockBanner({ warning }: MockBannerProps) {
  return (
    <div
      role="status"
      className="mock-stripes z-[1050] shrink-0 border-b border-mock/50 bg-[#22163a] px-4 py-1.5 text-center text-[13px] leading-snug text-mock"
    >
      <strong className="mr-2 font-mono text-sm font-bold tracking-[0.18em]">
        MOCK DATA
      </strong>
      <span>
        Scripted, frozen test scenario. Not real traffic.
        {warning ? ` ${warning}` : ""}
      </span>
    </div>
  );
}
