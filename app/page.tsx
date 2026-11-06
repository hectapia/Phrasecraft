import type { Metadata } from "next";
import WritingPracticeApp from "../features/practice/PracticeApp";

export const metadata: Metadata = {
  title: "Phrasecraft",
  description:
    "Build clear writing and spoken expression with a six-week SMART goal and a reflection loop.",
};

export default function WritingPage() {
  return <WritingPracticeApp />;
}
