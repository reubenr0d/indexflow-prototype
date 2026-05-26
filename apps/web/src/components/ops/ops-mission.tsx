import { Compass } from "lucide-react";
import {
  ShortLivedSVG,
  OpaqueNAVSVG,
  FragmentedSVG,
} from "@/components/primer/primer-svgs";

interface OpsMissionProps {
  mission: string;
}

interface MissionParts {
  lead: string;
  gapsIntro: string;
}

function splitMission(mission: string): MissionParts {
  const gapsMarker = /We close (?:the )?three gaps[^:]*:/i;
  const gapsMatch = mission.match(gapsMarker);
  if (gapsMatch && gapsMatch.index !== undefined) {
    const lead = mission.slice(0, gapsMatch.index).trim();
    const gapsIntro = mission.slice(gapsMatch.index, gapsMatch.index + gapsMatch[0].length).trim();
    return { lead, gapsIntro };
  }

  return { lead: mission.trim(), gapsIntro: "Three gaps we close:" };
}

const gaps = [
  {
    title: "Mercenary capital, no attribution",
    body: "Liquidity programs attract capital that exits when incentives fade. Chains can't prove what their spend actually bought.",
    visual: ShortLivedSVG,
  },
  {
    title: "Unclear exit paths",
    body: "Product structures hide how quickly a holder can redeem under real operating conditions.",
    visual: OpaqueNAVSVG,
  },
  {
    title: "Capital fragmented across venues",
    body: "Each product reinvents its own execution surface. Depth gets diluted exactly where depth matters most.",
    visual: FragmentedSVG,
  },
];

export function OpsMission({ mission }: OpsMissionProps) {
  const { lead, gapsIntro } = splitMission(mission);

  return (
    <>
      <section className="border-b border-app-accent/25 bg-gradient-to-b from-app-accent/12 via-app-accent/6 to-transparent">
        <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-10">
          <p className="flex items-center gap-2 font-mono text-xs font-semibold uppercase tracking-[0.24em] text-app-accent">
            <Compass className="h-4 w-4" />
            Mission
          </p>
          <blockquote className="mt-4 w-full border-l-4 border-app-accent pl-5 sm:pl-6">
            <p className="whitespace-pre-line text-base font-medium leading-relaxed text-app-text sm:text-lg lg:text-xl">
              {lead}
            </p>
          </blockquote>
        </div>
      </section>

      <section className="mx-auto mb-10 max-w-6xl px-4 pt-10 sm:px-6">
        <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.2em] text-app-accent">
          {gapsIntro}
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {gaps.map((g) => (
            <div
              key={g.title}
              className="flex flex-col rounded-xl border border-app-border bg-app-surface p-5"
            >
              <div className="mb-4 flex h-32 items-center justify-center">
                <g.visual />
              </div>
              <h3 className="text-sm font-semibold leading-snug text-app-text">{g.title}</h3>
              <p className="mt-1.5 text-xs leading-relaxed text-app-muted">{g.body}</p>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
