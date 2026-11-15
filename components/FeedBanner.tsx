interface FeedBannerProps {
  message: string;
}

/**
 * Shown when no live feed answers. The app never substitutes simulated
 * traffic, so this banner makes sure an empty map is not read as an empty sky.
 */
export default function FeedBanner({ message }: FeedBannerProps) {
  return (
    <div
      role="alert"
      className="z-[1050] shrink-0 border-b border-danger/60 bg-[#3a1512] px-4 py-1.5 text-center text-[13px] leading-snug text-[#ffc9c3]"
    >
      <strong className="mr-2 font-mono text-sm font-bold tracking-[0.14em]">
        LIVE DATA UNAVAILABLE
      </strong>
      <span>
        No aircraft are shown. An empty map does not mean an empty sky. {message}
      </span>
    </div>
  );
}
