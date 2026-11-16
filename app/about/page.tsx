import type { Metadata } from "next";
import Link from "next/link";
import StoryContent from "@/components/StoryContent";

export const metadata: Metadata = {
  title: "About aethersky: what it is, and what it is not",
  description:
    "What happened on November 13, 2026, the idea of aircraft keeping themselves apart, what this live map shows, and why it would not have prevented the ground stop.",
};

export default function AboutPage() {
  return (
    <div className="h-full overflow-y-auto">
      <article className="mx-auto max-w-2xl px-4 py-8 font-[family-name:var(--font-prose)] sm:py-10">
        <h1 className="text-2xl font-semibold text-fg">What is aethersky?</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          A live map that shows one idea for keeping aircraft apart. A demo,
          not a safety system.
        </p>

        <div className="mt-8">
          <StoryContent />
        </div>

        <p className="mt-8 border-t border-line pt-4 text-[13px] leading-relaxed text-muted">
          Traffic data may be delayed, incomplete, or wrong. Every position
          on the map is an estimate.
        </p>
        <p className="mt-4">
          <Link
            href="/"
            className="inline-block border border-accent bg-accent/10 px-3 py-1.5 text-[14px] font-medium text-accent hover:bg-accent/20"
          >
            Open the live map
          </Link>
        </p>
      </article>
    </div>
  );
}
