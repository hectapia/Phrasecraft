export type Outcome = "progress" | "setback";
export type Topic =
  | "everyday"
  | "professional"
  | "narrative"
  | "agreement"
  | "clarification"
  | "concluding"
  | "disagreement"
  | "evaluating"
  | "inquiry"
  | "proposing"
  | "structuring"
  | "transitions";
export type Modality = "written" | "spoken";

export interface PracticeEntry {
  id: string;
  createdAt: string;
  phraseId?: string | null;
  modality?: Modality;
  topic: Topic;
  prompt: string;
  original: string;
  revision: string;
  reflection: string;
  outcome: Outcome;
}

export const STORAGE_KEY = "writing-lab-practice-v1";
export const SESSIONS_PER_WEEK = 4;
export const PROGRAM_WEEKS = 6;
export const PROGRAM_TARGET = SESSIONS_PER_WEEK * PROGRAM_WEEKS;
export const TOPICS: Record<Topic, string> = {
  everyday: "Everyday expression",
  professional: "Professional communication",
  narrative: "Narrative & essays",
  agreement: "Agreement",
  clarification: "Clarification",
  concluding: "Concluding",
  disagreement: "Disagreement",
  evaluating: "Evaluating",
  inquiry: "Inquiry",
  proposing: "Proposing",
  structuring: "Structuring",
  transitions: "Transitions",
};

export const PHRASE_TOPICS: Topic[] = [
  "structuring",
  "transitions",
  "agreement",
  "disagreement",
  "clarification",
  "inquiry",
  "proposing",
  "evaluating",
  "concluding",
];

function isTopic(value: string): value is Topic {
  return Object.hasOwn(TOPICS, value);
}

export function toPracticeEntry(row: {
  id: string;
  created_at: string;
  phrase_id: string | null;
  modality: Modality;
  topic: string;
  prompt: string | null;
  original_text: string;
  revised_text: string;
  reflection: string;
  outcome: Outcome;
}): PracticeEntry {
  if (!isTopic(row.topic)) {
    throw new Error(`Unsupported practice topic "${row.topic}" in the database.`);
  }

  return {
    id: row.id,
    createdAt: row.created_at,
    phraseId: row.phrase_id,
    modality: row.modality,
    topic: row.topic,
    prompt: row.prompt ?? "",
    original: row.original_text,
    revision: row.revised_text,
    reflection: row.reflection,
    outcome: row.outcome,
  };
}

export function isPracticeEntry(value: unknown): value is PracticeEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;

  return (
    typeof entry.id === "string" &&
    typeof entry.createdAt === "string" &&
    (entry.phraseId === undefined ||
      entry.phraseId === null ||
      typeof entry.phraseId === "string") &&
    (entry.modality === undefined ||
      entry.modality === "written" ||
      entry.modality === "spoken") &&
    typeof entry.topic === "string" &&
    isTopic(entry.topic) &&
    typeof entry.prompt === "string" &&
    typeof entry.original === "string" &&
    typeof entry.revision === "string" &&
    typeof entry.reflection === "string" &&
    (entry.outcome === "progress" || entry.outcome === "setback")
  );
}

export function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
