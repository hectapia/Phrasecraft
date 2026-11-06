import { isPracticeEntry, type PracticeEntry } from "./model";

const entryListeners = new Set<() => void>();

export function subscribeToEntries(callback: () => void) {
  entryListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    entryListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

export function getEntrySnapshot(storageKey: string) {
  try {
    return window.localStorage.getItem(storageKey);
  } catch (error) {
    return `!error:${error instanceof Error ? error.message : "Storage is unavailable."}`;
  }
}

export function getServerEntrySnapshot() {
  return null;
}

export function decodeEntries(snapshot: string | null) {
  if (!snapshot) return { entries: [] as PracticeEntry[], error: "" };
  if (snapshot.startsWith("!error:")) {
    return {
      entries: [] as PracticeEntry[],
      error: `Your saved practice could not be loaded: ${snapshot.slice(7)}`,
    };
  }

  try {
    const parsed: unknown = JSON.parse(snapshot);
    if (!Array.isArray(parsed) || !parsed.every(isPracticeEntry)) {
      return {
        entries: [] as PracticeEntry[],
        error: "Your saved practice has an unexpected format.",
      };
    }
    return { entries: parsed, error: "" };
  } catch (error) {
    return {
      entries: [] as PracticeEntry[],
      error:
        error instanceof Error
          ? `Your saved practice could not be loaded: ${error.message}`
          : "Your saved practice could not be loaded.",
    };
  }
}

export function saveEntries(entries: PracticeEntry[], storageKey: string) {
  window.localStorage.setItem(storageKey, JSON.stringify(entries));
  entryListeners.forEach((listener) => listener());
}
