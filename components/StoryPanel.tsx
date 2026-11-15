"use client";

import { useEffect, useRef } from "react";

interface StoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const SEEN_KEY = "aethersky-story-seen";

const FAA_QA =
  "https://www.faa.gov/newsroom/nationwide-ground-stop-questions-and-answers";

function Step({
  n,
  title,
  children,
}: {
  n: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid grid-cols-[2rem_1fr] gap-x-3">
      <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-accent/60 font-mono text-xs text-accent">
        {n}
      </span>
      <div>
        <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
        <div className="mt-1 space-y-2 text-[13px] leading-relaxed text-muted">
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * The plain-language story: what happened, the idea, what this page is and
 * is not, and what a real version would take. Opens once on a first visit
 * and from the "What is this?" button. It never covers the disclaimer bar.
 */
export default function StoryPanel({ open, onOpenChange }: StoryPanelProps) {
  const closeRef = useRef<HTMLButtonElement | null>(null);

  // Open by itself the first time someone visits.
  useEffect(() => {
    let seen = true;
    try {
      seen = window.localStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Storage can be blocked. Then the panel simply does not auto-open.
    }
    if (seen) return;
    const timer = setTimeout(() => onOpenChange(true), 0);
    return () => clearTimeout(timer);
  }, [onOpenChange]);

  useEffect(() => {
    if (!open) return;
    try {
      window.localStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Ignore blocked storage.
    }
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[1200] flex items-start justify-center overflow-y-auto bg-black/70 p-3 sm:p-6"
      onClick={(event) => {
        if (event.target === event.currentTarget) onOpenChange(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="story-title"
        className="w-full max-w-2xl rounded-lg border border-line bg-panel shadow-2xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h2 id="story-title" className="text-lg font-semibold text-fg">
              What is aethersky?
            </h2>
            <p className="mt-0.5 text-[13px] text-muted">
              A live map that shows one idea for keeping aircraft apart. A
              demo, not a safety system.
            </p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded border border-line px-2.5 py-1 text-[13px] text-fg hover:border-accent hover:text-accent"
          >
            Close
          </button>
        </header>

        <div className="space-y-5 px-5 py-5">
          <Step n={1} title="What happened">
            <p>
              On November 13, 2026, the FAA stopped every departure in the
              United States for about five hours. A new router at one radio
              site flooded the FAA&apos;s own ground network, and the radio
              and radar feeds that controllers rely on became unstable.
              Operators canceled about 12,462 flights. The roughly 3,500
              aircraft already in the air landed safely.
            </p>
            <p>
              <a
                className="text-accent hover:underline"
                href={FAA_QA}
                target="_blank"
                rel="noreferrer"
              >
                Read the FAA&apos;s account
              </a>
              .
            </p>
          </Step>

          <Step n={2} title="The problem underneath">
            <p>
              Aircraft are kept apart by people on the ground, using ground
              radar and ground radio, joined by one network. When that
              network had a bad afternoon, the whole country stopped.
            </p>
          </Step>

          <Step n={3} title="The idea">
            <p>
              Most aircraft already broadcast their own position, altitude,
              and speed by radio, a system called ADS-B. So in principle each
              aircraft could work out for itself whether another is about to
              come too close, with no ground network in the loop.
            </p>
          </Step>

          <Step n={4} title="What you are looking at">
            <p>
              Real aircraft over the contiguous United States, from volunteer
              ADS-B receivers. For each pair, the page assumes both keep
              flying straight and asks one question: in the next two minutes,
              will they pass within 5 nautical miles and 1,000 feet? Pairs
              that would are drawn in amber. The numbers are demo defaults,
              not official separation rules, and you can change them.
            </p>
          </Step>

          <Step n={5} title="What this is not">
            <p>
              <strong className="text-fg">
                It would not have prevented the ground stop.
              </strong>{" "}
              It is a website. It needs the internet, a server, and ground
              receivers, so it is more fragile than the system that failed,
              not less. It only watches. No pilot sees it, and it cannot tell
              anyone what to do.
            </p>
            <p>
              Certified equipment on aircraft already warns pilots about
              nearby traffic. This page is a picture of the idea, drawn in
              the open so people can argue with it and improve it.
            </p>
          </Step>

          <Step n={6} title="What a real version would take">
            <ol className="list-decimal space-y-1 pl-4">
              <li>Run on the aircraft and hear other aircraft directly by radio.</li>
              <li>Handle broadcasts that are missing, late, or faked.</li>
              <li>
                Use a proven method that understands turns and climbs, not a
                straight-line guess.
              </li>
              <li>Tell both pilots what to do, and make them agree.</li>
              <li>Years of testing and certification by an avionics maker.</li>
            </ol>
            <p>
              The first useful steps are open to anyone: a better method,
              measured against recorded traffic, running from a cheap radio
              receiver instead of the internet.{" "}
              <a
                className="text-accent hover:underline"
                href="https://github.com/adamtpang/aethersky"
                target="_blank"
                rel="noreferrer"
              >
                The code is open source
              </a>
              .
            </p>
          </Step>
        </div>

        <footer className="border-t border-line px-5 py-3 text-[12px] text-muted">
          Traffic data may be delayed, incomplete, or wrong. Every position
          on the map is an estimate.
        </footer>
      </div>
    </div>
  );
}
