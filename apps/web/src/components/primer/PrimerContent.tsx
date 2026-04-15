"use client";

import { PrimerHero } from "./PrimerHero";
import { PrimerProblem } from "./PrimerProblem";
import { PrimerWhat } from "./PrimerWhat";
import { PrimerWho } from "./PrimerWho";
import { PrimerNAV } from "./PrimerNAV";
import { PrimerFlywheel } from "./PrimerFlywheel";
import { PrimerSharedLiquidity } from "./PrimerSharedLiquidity";
import { PrimerAttribution } from "./PrimerAttribution";
import { PrimerToken } from "./PrimerToken";
import { PrimerCTA } from "./PrimerCTA";
import { ChapterNav, type Chapter } from "./ChapterNav";

const chapters: Chapter[] = [
  { id: "hero", label: "Intro" },
  { id: "problem", label: "Why" },
  { id: "what", label: "Protocol" },
  { id: "who", label: "For Teams" },
  { id: "nav-insight", label: "NAV" },
  { id: "flywheel", label: "Flywheel" },
  { id: "shared", label: "Liquidity" },
  { id: "attribution", label: "Growth" },
  { id: "token", label: "$FLOW" },
  { id: "cta", label: "Get Started" },
];

export default function PrimerContent() {
  return (
    <div className="relative">
      <ChapterNav chapters={chapters} />
      <PrimerHero />
      <PrimerProblem />
      <PrimerWhat />
      <PrimerWho />
      <PrimerNAV />
      <PrimerFlywheel />
      <PrimerSharedLiquidity />
      <PrimerAttribution />
      <PrimerToken />
      <PrimerCTA />
    </div>
  );
}
