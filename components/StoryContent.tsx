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
        <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
        <div className="mt-1.5 space-y-2.5 text-[15px] leading-relaxed text-muted">
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * The plain-language story: what happened, the proposed fix, what this site
 * is and is not, and what a real version would take. Shown on the About
 * page, which is linked from the nav bar on every page.
 */
export default function StoryContent() {
  return (
    <div className="space-y-7">
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

      <Step n={3} title="The proposed fix">
        <p>
          It is not about flying farther apart. It is about who does the
          watching. Today a controller on the ground spots two aircraft
          converging and radios one of them to climb, descend, or turn.
          That only works while the ground network is up.
        </p>
        <p>
          Most aircraft already broadcast their own position, altitude,
          and speed by radio, a system called ADS-B. So each aircraft
          could listen to the others directly, spot a conflict minutes
          ahead, and agree on a small change (one climbs, one descends)
          with no ground network in the loop.
        </p>
      </Step>

      <Step n={4} title="What you are looking at">
        <p>
          Real aircraft over the contiguous United States, from volunteer
          ADS-B receivers. For each pair, the page assumes both keep
          flying straight and asks one question: in the next two minutes,
          will they pass within 5 nautical miles and 1,000 feet? Pairs
          that would are marked and listed as conflicts. Click any
          aircraft to see what it is doing and whether it was flagged.
          The numbers are demo defaults, not official separation rules,
          and you can change them.
        </p>
      </Step>

      <Step n={5} title="What this is not">
        <p>
          <strong className="text-fg">
            It would not have prevented the ground stop.
          </strong>{" "}
          It is a website. It needs the internet, a server, and ground
          receivers, so it is more fragile than the system that failed,
          not less. It only watches. No pilot sees it, and the changes
          it suggests are an illustration that nobody receives.
        </p>
        <p>
          Certified equipment on aircraft already warns pilots about
          nearby traffic. This page is a picture of the idea, drawn in
          the open so people can argue with it and improve it.
        </p>
      </Step>

      <Step n={6} title="What you can do here">
        <p>
          Look at the live picture, switch to &quot;Conflicts only&quot;,
          and click a flagged aircraft to see what the check predicts
          and one small change that would clear it. Move the sliders and
          watch how much the answer depends on the numbers. Stretch the
          lookahead and notice that more warning means smaller changes. If you build things, fork the code and make the check
          better.
        </p>
      </Step>

      <Step n={7} title="What a real version would take">
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
      <Step n={8} title="Related work">
        <p>
          Casey Handmer, whose post started this project, built{" "}
          <a
            className="text-accent hover:underline"
            href="https://faa.caseyhandmer.com/"
            target="_blank"
            rel="noreferrer"
          >
            US airspace on a toothbrush CPU
          </a>
          . It detects and resolves conflicts for a simulated day of US
          traffic on the chip from a Wi-Fi toothbrush, to show how little
          computing the job needs. This site is the other half: real, live
          traffic, and open code.
        </p>
      </Step>
    </div>
  );
}
