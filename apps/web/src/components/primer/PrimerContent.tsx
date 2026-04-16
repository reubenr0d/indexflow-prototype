"use client";

import type { ReactNode } from "react";
import dynamic from "next/dynamic";
import { PrimerHero } from "./PrimerHero";
import PrimerProblem from "./PrimerProblem";
import { ChapterNav, type Chapter } from "./ChapterNav";

const PrimerWhat = dynamic(() => import("./PrimerWhat"));
const PrimerWho = dynamic(() => import("./PrimerWho"));
const PrimerNAV = dynamic(() => import("./PrimerNAV"));
const PrimerFlywheel = dynamic(() => import("./PrimerFlywheel"));
const PrimerSharedLiquidity = dynamic(() => import("./PrimerSharedLiquidity"));
const PrimerAttribution = dynamic(() => import("./PrimerAttribution"));
const PrimerToken = dynamic(() => import("./PrimerToken"));
const PrimerCTA = dynamic(() => import("./PrimerCTA"));

const chapters: Chapter[] = [
  { id: "hero", label: "Intro" },
  { id: "problem", label: "Why" },
  { id: "what", label: "Protocol" },
  { id: "who", label: "For Teams" },
  { id: "shared", label: "Liquidity" },
  { id: "nav-insight", label: "NAV" },
  { id: "flywheel", label: "Flywheel" },
  { id: "attribution", label: "Growth" },
  { id: "token", label: "$FLOW" },
  { id: "blog", label: "Blog" },
  { id: "cta", label: "Get Started" },
];

export default function PrimerContent({ blogSection }: { blogSection?: ReactNode }) {
  return (
    <div className="landing-reveal relative">
      <ChapterNav chapters={chapters} />
      <PrimerHero />
      <PrimerProblem />
      <PrimerWhat />
      <PrimerWho />
      <PrimerSharedLiquidity />
      <PrimerNAV />
      <PrimerFlywheel />
      <PrimerAttribution />
      <PrimerToken />
      {blogSection}
      <PrimerCTA />
    </div>
  );
}
