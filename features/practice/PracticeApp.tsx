"use client";

import {
  type FormEvent,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "../../lib/supabase";
import {
  PHRASE_TOPICS,
  formatDate,
  PROGRAM_TARGET,
  SESSIONS_PER_WEEK,
  STORAGE_KEY,
  TOPICS,
  toPracticeEntry,
  type Modality,
  type Outcome,
  type PracticeEntry,
  type Topic,
} from "./model";
import type { Database } from "../../lib/supabase";
import {
  decodeEntries,
  getEntrySnapshot,
  getServerEntrySnapshot,
  saveEntries,
  subscribeToEntries,
} from "./storage";

function subscribeToClock(callback: () => void) {
  const interval = window.setInterval(callback, 60_000);
  return () => window.clearInterval(interval);
}

function getClockSnapshot() {
  return Math.floor(Date.now() / 60_000);
}

function getServerClockSnapshot() {
  return 0;
}

type Phrase = Database["public"]["Tables"]["phrases"]["Row"];

export default function WritingPracticeApp() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");
  const [accountSync, setAccountSync] = useState<{
    userId: string;
    status: "ready" | "error";
  } | null>(null);
  const [phraseCollection, setPhraseCollection] = useState<{
    userId: string;
    phrases: Phrase[];
    status: "ready" | "error";
  } | null>(null);
  const authReady = !supabase || authChecked;
  const syncStatus = user
    ? accountSync?.userId === user.id
      ? accountSync.status
      : "loading"
    : "local";
  const storageKey = user ? `${STORAGE_KEY}:${user.id}` : STORAGE_KEY;
  const entrySnapshot = useSyncExternalStore(
    subscribeToEntries,
    () => getEntrySnapshot(storageKey),
    getServerEntrySnapshot,
  );
  const decodedEntries = useMemo(
    () => decodeEntries(entrySnapshot),
    [entrySnapshot],
  );
  const entries = decodedEntries.entries;
  const currentMinute = useSyncExternalStore(
    subscribeToClock,
    getClockSnapshot,
    getServerClockSnapshot,
  );
  const [topic, setTopic] = useState<Topic>("structuring");
  const [selectedPhraseId, setSelectedPhraseId] = useState<string | null>(null);
  const [modality, setModality] = useState<Modality>("written");
  const [original, setOriginal] = useState(
    "We need to stop doing this activity for a short period of time.",
  );
  const [revision, setRevision] = useState("");
  const [reflection, setReflection] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("progress");
  const [historyFilter, setHistoryFilter] = useState<"all" | Outcome>("all");
  const [saving, setSaving] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!supabase) {
      return;
    }

    const client = supabase;
    let active = true;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      setAuthChecked(true);
      setAuthError("");
      setAuthMessage("");
      setStorageError("");
    });

    void client.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) {
        setAuthError(`Could not check your sign-in status: ${error.message}`);
      } else {
        setUser(data.session?.user ?? null);
      }
      setAuthChecked(true);
    }).catch((error: unknown) => {
      if (!active) return;
      setAuthError(
        error instanceof Error
          ? `Could not check your sign-in status: ${error.message}`
          : "Could not check your sign-in status.",
      );
      setAuthChecked(true);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  useEffect(() => {
    if (!user || !supabase) {
      return;
    }

    const accountUser = user;
    const client = supabase;
    let active = true;

    async function loadCloudPractice() {
      try {
        const { data, error } = await client
          .from("practice_sessions")
          .select("*")
          .order("created_at", { ascending: false });
        if (!active) return;
        if (error) {
          setAccountSync({ userId: accountUser.id, status: "error" });
          setStorageError(`Could not load your cloud practice: ${error.message}`);
          return;
        }

        try {
          saveEntries(data.map(toPracticeEntry), storageKey);
          setAccountSync({ userId: accountUser.id, status: "ready" });
        } catch (cacheError) {
          setAccountSync({ userId: accountUser.id, status: "error" });
          setStorageError(
            cacheError instanceof Error
              ? `Cloud practice loaded, but the local cache could not be updated: ${cacheError.message}`
              : "Cloud practice loaded, but the local cache could not be updated.",
          );
        }
      } catch (error) {
        if (!active) return;
        setAccountSync({ userId: accountUser.id, status: "error" });
        setStorageError(
          error instanceof Error
            ? `Could not load your cloud practice: ${error.message}`
            : "Could not load your cloud practice.",
        );
      }
    }

    void loadCloudPractice();

    return () => {
      active = false;
    };
  }, [storageKey, supabase, user]);

  useEffect(() => {
    if (!user || !supabase) return;

    const accountUser = user;
    const client = supabase;
    let active = true;

    async function loadPhrases() {
      try {
        const { data, error } = await client
          .from("phrases")
          .select("*")
          .eq("is_public", true)
          .order("topic");
        if (!active) return;
        if (error) {
          setPhraseCollection({
            userId: accountUser.id,
            phrases: [],
            status: "error",
          });
          setStorageError(`Could not load the phrase collection: ${error.message}`);
          return;
        }
        setPhraseCollection({
          userId: accountUser.id,
          phrases: data,
          status: "ready",
        });
      } catch (error) {
        if (!active) return;
        setPhraseCollection({
          userId: accountUser.id,
          phrases: [],
          status: "error",
        });
        setStorageError(
          error instanceof Error
            ? `Could not load the phrase collection: ${error.message}`
            : "Could not load the phrase collection.",
        );
      }
    }

    void loadPhrases();

    return () => {
      active = false;
    };
  }, [supabase, user]);

  const currentPhrases =
    user && phraseCollection?.userId === user.id
      ? phraseCollection.phrases.filter((phrase) => phrase.topic === topic)
      : [];
  const selectedPhrase =
    currentPhrases.find((phrase) => phrase.id === selectedPhraseId) ??
    currentPhrases[0] ??
    null;

  const sessionsThisWeek = useMemo(() => {
    const weekAgo = currentMinute * 60_000 - 7 * 24 * 60 * 60 * 1000;
    return entries.filter(
      (entry) => new Date(entry.createdAt).getTime() >= weekAgo,
    ).length;
  }, [currentMinute, entries]);

  const filteredEntries = useMemo(
    () =>
      entries
        .filter((entry) => historyFilter === "all" || entry.outcome === historyFilter)
        .slice(0, 5),
    [entries, historyFilter],
  );

  async function handleMagicLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setAuthBusy(true);
    setAuthError("");
    setAuthMessage("");
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: authEmail.trim(),
        options: { emailRedirectTo: window.location.origin },
      });

      if (error) {
        setAuthError(`Could not send sign-in link: ${error.message}`);
        return;
      }
      setAuthMessage("Check your email for a sign-in link.");
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? `Could not send sign-in link: ${error.message}`
          : "Could not send sign-in link.",
      );
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleSignOut() {
    if (!supabase) return;
    setAuthError("");
    try {
      const { error } = await supabase.auth.signOut();
      if (error) setAuthError(`Could not sign out: ${error.message}`);
    } catch (error) {
      setAuthError(
        error instanceof Error
          ? `Could not sign out: ${error.message}`
          : "Could not sign out.",
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const cleanRevision = revision.trim();
    if (!cleanRevision) {
      setNotice("Add your revision before saving this practice.");
      return;
    }
    if (user && syncStatus !== "ready") {
      setNotice("Wait for your cloud practice to finish loading before saving.");
      return;
    }

    setSaving(true);
    let entry: PracticeEntry;
    try {
      if (user && supabase) {
        const { data, error } = await supabase
          .from("practice_sessions")
          .insert({
            modality,
            topic,
            phrase_id: selectedPhrase?.id ?? null,
            prompt: selectedPhrase
              ? `Use the example as a guide for ${TOPICS[topic].toLowerCase()}, then express your own idea in your own words.`
              : "Make the meaning clear with fewer, more natural words.",
            original_text: original.trim(),
            revised_text: cleanRevision,
            reflection: reflection.trim(),
            outcome,
          })
          .select("*")
          .single();
        if (error) throw new Error(error.message);
        entry = toPracticeEntry(data);
      } else {
        entry = {
          id: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          phraseId: null,
          modality,
          topic,
          prompt: "Make the meaning clear with fewer, more natural words.",
          original: original.trim(),
          revision: cleanRevision,
          reflection: reflection.trim(),
          outcome,
        };
      }
    } catch (error) {
      setStorageError(
        error instanceof Error
          ? `This session could not be saved to your account: ${error.message}`
          : "This session could not be saved to your account.",
      );
      setSaving(false);
      return;
    }

    try {
      saveEntries([entry, ...entries], storageKey);
      setStorageError("");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Storage is unavailable.";
      setStorageError(
        user
          ? `Practice was saved to your account, but the local cache could not be updated: ${message}`
          : `This session could not be saved on this device: ${message}`,
      );
      if (!user) {
        setSaving(false);
        return;
      }
    }
    setOriginal(cleanRevision);
    setRevision("");
    setReflection("");
    setNotice(
      outcome === "progress"
        ? user
          ? "Practice saved to your account. Notice what made this version clearer."
          : "Practice saved on this device. Notice what made this version clearer."
        : user
          ? "Setback saved to your account. It is useful information for your next attempt."
          : "Setback saved on this device. It is useful information for your next attempt.",
    );
    setSaving(false);
  }

  const goalPercent = Math.min(
    100,
    Math.round((entries.length / PROGRAM_TARGET) * 100),
  );
  const weekPercent = Math.min(
    100,
    Math.round((sessionsThisWeek / SESSIONS_PER_WEEK) * 100),
  );
  const hasStorageIssue = Boolean(
    storageError || decodedEntries.error || syncStatus === "error",
  );

  return (
    <main className="min-h-screen bg-[#f5f4ef] text-[#202820]">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-7 sm:py-12 lg:px-10">
        <div className="mb-9 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#31483d] text-[#eff2e9]">
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.7"
                className="h-5 w-5"
              >
                <path d="M5 19.5 19 5.5M7 5.5h12v12" />
                <path d="M5 10v9.5h9.5" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold tracking-tight">Phrasecraft</p>
              <p className="text-xs text-[#70776e]">Find the clearest way to say it</p>
            </div>
          </div>
          <div className="flex flex-col items-start gap-2 sm:items-end">
            {user ? (
              <div className="flex items-center gap-3">
                <span className="max-w-48 truncate text-xs text-[#566258]">
                  {user.email}
                </span>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="rounded-full border border-[#d9ddd3] bg-white/70 px-3 py-1.5 text-xs font-medium text-[#566258] hover:bg-white"
                >
                  Sign out
                </button>
              </div>
            ) : supabase ? (
              <form onSubmit={handleMagicLink} className="flex items-center gap-2">
                <label className="sr-only" htmlFor="sign-in-email">
                  Email for sign-in link
                </label>
                <input
                  id="sign-in-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={authEmail}
                  onChange={(event) => setAuthEmail(event.target.value)}
                  placeholder="Email for cloud sync"
                  className="w-48 rounded-full border border-[#d9ddd3] bg-white/80 px-3 py-2 text-xs outline-none focus:border-[#81927a] sm:w-56"
                />
                <button
                  type="submit"
                  disabled={!authReady || authBusy}
                  className="rounded-full bg-[#31483d] px-3 py-2 text-xs font-medium text-white hover:bg-[#253a30] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {authBusy ? "Sending…" : "Email me a link"}
                </button>
              </form>
            ) : (
              <p className="text-xs text-[#737b71]">Supabase environment is not configured.</p>
            )}
            <div className="flex items-center gap-2 rounded-full border border-[#d9ddd3] bg-white/70 px-3 py-1.5 text-xs text-[#566258]">
              <span
                className={`h-2 w-2 rounded-full ${
                  hasStorageIssue ? "bg-[#bd8052]" : "bg-[#69866e]"
                }`}
              />
              {hasStorageIssue
                ? "Storage issue · see practice notes"
                : user
                  ? syncStatus === "ready"
                    ? "Synced to your account"
                    : syncStatus === "loading"
                      ? "Loading cloud practice…"
                      : "Cloud sync unavailable"
                  : "Saved on this device"}
            </div>
          </div>
        </div>
        {(authError || authMessage) && (
          <p
            role={authError ? "alert" : "status"}
            className={`-mt-5 mb-6 text-right text-xs ${
              authError ? "text-[#805a3b]" : "text-[#52644f]"
            }`}
          >
            {authError || authMessage}
          </p>
        )}

        <section className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(290px,0.65fr)]">
          <div>
            <div className="mb-7 max-w-3xl">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[#74806e]">
                The practice
              </p>
              <h1 className="font-[family-name:var(--font-heading)] text-4xl font-medium leading-[1.08] tracking-[-0.04em] text-[#26352b] sm:text-5xl">
                Shape the words.
                <br />
                <span className="text-[#829078]">Find your voice.</span>
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-6 text-[#636c62] sm:text-base">
                Practice in writing or aloud. Find a clear, natural expression,
                then notice what helped—and what got in the way.
              </p>
            </div>

            <div className="rounded-2xl border border-[#e1e3dc] bg-white p-5 shadow-[0_12px_40px_-32px_rgba(32,40,32,0.35)] sm:p-8">
              <div className="mb-7 flex flex-wrap items-center justify-between gap-3 border-b border-[#eceee8] pb-5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7b8579]">
                    Today&apos;s exercise
                  </p>
                  <h2 className="mt-1 text-lg font-semibold tracking-tight">
                    A pause, plainly put
                  </h2>
                </div>
                <span className="rounded-full bg-[#f1f3ed] px-3 py-1.5 text-xs text-[#52644f]">
                  15 min · Clarity
                </span>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <label className="block">
                  <span className="mb-2 block text-sm font-medium">Choose a practice mode</span>
                  <div className="mb-3 grid grid-cols-2 gap-2" role="group" aria-label="Practice mode">
                    {(["written", "spoken"] as const).map((value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={modality === value}
                        onClick={() => setModality(value)}
                        className={`rounded-xl border px-3 py-2.5 text-sm font-medium capitalize transition ${
                          modality === value
                            ? "border-[#718a72] bg-[#edf3eb] text-[#405c42]"
                            : "border-[#dfe3da] bg-white text-[#737b71] hover:bg-[#f7f7f3]"
                        }`}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <span className="mb-2 block text-sm font-medium">Choose a communication focus</span>
                  <select
                    value={topic}
                    onChange={(event) => setTopic(event.target.value as Topic)}
                    className="w-full rounded-xl border border-[#dfe3da] bg-[#fbfbf8] px-3.5 py-3 text-sm text-[#303a31] outline-none transition focus:border-[#81927a] focus:ring-2 focus:ring-[#81927a]/20"
                  >
                    {PHRASE_TOPICS.map((value) => (
                      <option key={value} value={value}>
                        {TOPICS[value]}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="rounded-xl bg-[#f4f5ef] p-4 sm:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#7b8579]">
                    A phrase to study
                  </p>
                  {selectedPhrase ? (
                    <>
                      <blockquote className="mt-2 font-[family-name:var(--font-heading)] text-xl leading-snug text-[#34473a] sm:text-2xl">
                        “{selectedPhrase.phrase_text}”
                      </blockquote>
                      {selectedPhrase.meaning && (
                        <p className="mt-2 text-xs leading-5 text-[#6d766b]">
                          {selectedPhrase.meaning}
                        </p>
                      )}
                      <p className="mt-2 text-xs leading-5 text-[#6d766b]">
                        Notice how this phrase connects ideas. Try it in a new sentence
                        about something you want to say; choose it only if it sounds natural.
                      </p>
                      {currentPhrases.length > 1 && (
                        <button
                          type="button"
                          onClick={() => {
                            const alternatives = currentPhrases.filter(
                              (phrase) => phrase.id !== selectedPhrase.id,
                            );
                            const nextPhrase =
                              alternatives[Math.floor(Math.random() * alternatives.length)];
                            if (nextPhrase) setSelectedPhraseId(nextPhrase.id);
                          }}
                          className="mt-3 text-xs font-medium text-[#52644f] underline underline-offset-2"
                        >
                          Show another phrase
                        </button>
                      )}
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-6 text-[#6d766b]">
                      {user
                        ? phraseCollection?.userId === user.id &&
                          phraseCollection.status === "error"
                          ? "The phrase collection could not be loaded. See the notice below."
                          : phraseCollection?.userId === user.id
                            ? "No phrases are available for this topic yet. Apply the phrase collection migration in Supabase."
                            : "Loading phrases…"
                        : "Sign in to load the shared phrase collection. You can still practice without an example."}
                    </p>
                  )}
                </div>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    {modality === "spoken" ? "Starting thought" : "Starting sentence"}
                  </span>
                  <textarea
                    value={original}
                    onChange={(event) => setOriginal(event.target.value)}
                    rows={2}
                    className="w-full resize-y rounded-xl border border-[#dfe3da] bg-white px-3.5 py-3 text-sm leading-6 outline-none transition focus:border-[#81927a] focus:ring-2 focus:ring-[#81927a]/20"
                  />
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    {modality === "spoken" ? "Your spoken version" : "Your revision"}
                  </span>
                  <textarea
                    value={revision}
                    onChange={(event) => setRevision(event.target.value)}
                    rows={3}
                    placeholder={
                      modality === "spoken"
                        ? "Say it aloud, then note the version that feels clear and natural…"
                        : "Try a version that feels clear, natural, and complete…"
                    }
                    className="w-full resize-y rounded-xl border border-[#dfe3da] bg-[#fbfbf8] px-3.5 py-3 text-sm leading-6 outline-none transition placeholder:text-[#9ca398] focus:border-[#81927a] focus:ring-2 focus:ring-[#81927a]/20"
                  />
                  <span className="mt-1.5 block text-right text-xs text-[#8a9287]">
                    {revision.trim().split(/\s+/).filter(Boolean).length} words
                  </span>
                </label>

                <label className="block">
                  <span className="mb-2 block text-sm font-medium">
                    {modality === "spoken"
                      ? "How did it sound aloud?"
                      : "What did you notice?"}
                    <span className="ml-1 font-normal text-[#8a9287]">Optional reflection</span>
                  </span>
                  <input
                    value={reflection}
                    onChange={(event) => setReflection(event.target.value)}
                    placeholder={
                      modality === "spoken"
                        ? "Pace, confidence, a phrase that felt natural…"
                        : "A word I removed… a meaning I kept…"
                    }
                    className="w-full rounded-xl border border-[#dfe3da] bg-white px-3.5 py-3 text-sm outline-none transition placeholder:text-[#9ca398] focus:border-[#81927a] focus:ring-2 focus:ring-[#81927a]/20"
                  />
                </label>

                <div className="flex flex-col gap-3 border-t border-[#eceee8] pt-5 sm:flex-row sm:items-end sm:justify-between">
                  <fieldset>
                    <legend className="mb-2 text-xs font-medium text-[#687267]">
                      How did this session feel?
                    </legend>
                    <div className="flex gap-2">
                      {(["progress", "setback"] as const).map((value) => (
                        <button
                          key={value}
                          type="button"
                          aria-pressed={outcome === value}
                          onClick={() => setOutcome(value)}
                          className={`rounded-full border px-3.5 py-2 text-xs font-medium transition ${
                            outcome === value
                              ? value === "progress"
                                ? "border-[#718a72] bg-[#edf3eb] text-[#405c42]"
                                : "border-[#c89b79] bg-[#fbf0e7] text-[#805a3b]"
                              : "border-[#e1e4dc] bg-white text-[#737b71] hover:bg-[#f7f7f3]"
                          }`}
                        >
                          {value === "progress" ? "A step forward" : "A setback"}
                        </button>
                      ))}
                    </div>
                  </fieldset>
                  <button
                    type="submit"
                    disabled={
                      !authReady ||
                      saving ||
                      Boolean(user && syncStatus !== "ready")
                    }
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#31483d] px-5 py-2.5 text-sm font-medium text-white transition hover:bg-[#253a30] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#31483d] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {saving ? "Saving…" : "Save this practice"}
                    <span aria-hidden="true">→</span>
                  </button>
                </div>
                <p aria-live="polite" className="min-h-5 text-xs text-[#65735f]">
                  {notice}
                </p>
              </form>
            </div>
          </div>

          <aside className="space-y-5">
            <section className="rounded-2xl bg-[#31483d] p-6 text-[#f4f3ec] shadow-[0_16px_40px_-28px_rgba(32,40,32,0.65)]">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.17em] text-[#bdcbb7]">
                    Your SMART goal
                  </p>
                  <h2 className="mt-2 text-xl font-semibold">A six-week expression practice</h2>
                </div>
                <span className="rounded-full border border-white/20 px-2.5 py-1 text-xs text-[#d9e1d4]">
                  {entries.length}/{PROGRAM_TARGET}
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-[#d2dbcd]">
                Spend 15 minutes refining a short expression in writing or aloud,
                four times a week, for six weeks.
              </p>
              <div className="mt-5">
                <div className="mb-2 flex justify-between text-xs text-[#c5d0c0]">
                  <span>Overall progress</span>
                  <span>{goalPercent}%</span>
                </div>
                <div
                  className="h-2 overflow-hidden rounded-full bg-white/15"
                  role="progressbar"
                  aria-label="Six-week goal progress"
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={goalPercent}
                >
                  <div
                    className="h-full rounded-full bg-[#cfdbb7] transition-[width]"
                    style={{ width: `${goalPercent}%` }}
                  />
                </div>
              </div>
              <div className="mt-6 space-y-3 border-t border-white/15 pt-5">
                {[
                  ["S", "Specific", "Refine written and spoken expression for clarity and economy."],
                  ["M", "Measurable", "Log 4 sessions each week; aim for 24."],
                  ["A", "Achievable", "Keep each practice to 15 minutes."],
                  ["R", "Relevant", "Speak and write with precision, elegance, and less repetition."],
                  ["T", "Time-bound", "Complete the cycle in six weeks."],
                ].map(([letter, title, detail]) => (
                  <div key={letter} className="flex gap-3">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[#d7e2c6]">
                      {letter}
                    </span>
                    <p className="text-xs leading-5 text-[#d2dbcd]">
                      <span className="font-semibold text-white">{title}.</span> {detail}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-[#e1e3dc] bg-white p-5 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7b8579]">
                    This week
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">Keep a gentle rhythm</h2>
                </div>
                <p className="font-[family-name:var(--font-heading)] text-2xl text-[#405c42]">
                  {sessionsThisWeek}
                  <span className="text-sm text-[#899287]"> / {SESSIONS_PER_WEEK}</span>
                </p>
              </div>
              <div className="mt-4 flex gap-1.5" aria-label={`${sessionsThisWeek} of 4 weekly sessions`}>
                {Array.from({ length: SESSIONS_PER_WEEK }, (_, index) => (
                  <span
                    key={index}
                    className={`h-1.5 flex-1 rounded-full ${
                      index < sessionsThisWeek ? "bg-[#819777]" : "bg-[#e9ece5]"
                    }`}
                  />
                ))}
              </div>
              <p className="mt-3 text-xs leading-5 text-[#727b70]">
                {weekPercent >= 100
                  ? "You reached this week's target. Let the practice settle."
                  : `${SESSIONS_PER_WEEK - sessionsThisWeek} ${
                      SESSIONS_PER_WEEK - sessionsThisWeek === 1 ? "session" : "sessions"
                    } left to meet this week's intention.`}
              </p>
            </section>

            <section className="rounded-2xl border border-[#e1e3dc] bg-white p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7b8579]">
                    The six-week arc
                  </p>
                  <h2 className="mt-1 text-lg font-semibold">Build one layer at a time</h2>
                </div>
                <span className="text-xs text-[#899287]">15 min · 4× weekly</span>
              </div>
              <div className="mt-5 space-y-4">
                {[
                  ["01–02", "Clarity", "Find the sentence’s essential meaning."],
                  ["03–04", "Rhythm", "Vary pace; remove repeated ideas."],
                  ["05–06", "Voice", "Choose words that sound like you."],
                ].map(([weeks, title, detail], index) => (
                  <div key={weeks} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <span
                        className={`mt-1 h-2.5 w-2.5 rounded-full ${
                          index === 0 ? "bg-[#819777]" : "bg-[#dce2d7]"
                        }`}
                      />
                      {index < 2 && <span className="mt-1 h-8 w-px bg-[#e6e9e2]" />}
                    </div>
                    <div className="-mt-0.5 pb-1">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-[#899287]">
                        Weeks {weeks}
                      </p>
                      <p className="mt-0.5 text-sm font-semibold">{title}</p>
                      <p className="mt-0.5 text-xs leading-5 text-[#727b70]">{detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </section>

        <section className="mt-2 rounded-2xl border border-[#e1e3dc] bg-white p-5 sm:p-7" aria-labelledby="history-heading">
          <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#eceee8] pb-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#7b8579]">
                Notice the pattern
              </p>
              <h2 id="history-heading" className="mt-1 text-xl font-semibold tracking-tight">
                Practice notes
              </h2>
            </div>
            <div className="flex gap-1 rounded-full bg-[#f3f4ef] p-1" aria-label="Filter practice notes">
              {(["all", "progress", "setback"] as const).map((filter) => (
                <button
                  key={filter}
                  type="button"
                  aria-pressed={historyFilter === filter}
                  onClick={() => setHistoryFilter(filter)}
                  className={`rounded-full px-3 py-1.5 text-xs capitalize transition ${
                    historyFilter === filter
                      ? "bg-white text-[#34473a] shadow-sm"
                      : "text-[#737b71] hover:text-[#34473a]"
                  }`}
                >
                  {filter === "all" ? "All notes" : filter}
                </button>
              ))}
            </div>
          </div>

          {filteredEntries.length === 0 ? (
            <div className="py-9 text-center">
              <p className="text-sm font-medium text-[#4c5c4d]">
                {entries.length === 0
                  ? "Your first note starts with one expression."
                  : "No notes in this view yet."}
              </p>
              <p className="mt-1 text-xs text-[#899287]">
                {entries.length === 0
                  ? "Save a practice above to begin noticing your progress and setbacks."
                  : "Try another filter to see your practice history."}
              </p>
            </div>
          ) : (
            <ol className="divide-y divide-[#eceee8]">
              {filteredEntries.map((entry) => (
                <li key={entry.id} className="grid gap-3 py-5 sm:grid-cols-[100px_1fr_auto] sm:items-start">
                  <div>
                    <p className="text-xs font-medium text-[#697367]">{formatDate(entry.createdAt)}</p>
                    <p className="mt-1 text-[11px] font-medium capitalize text-[#52644f]">
                      {entry.modality ?? "written"}
                    </p>
                    <p className="mt-1 text-[11px] text-[#92998e]">
                      {TOPICS[entry.topic] ?? entry.topic}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm leading-6 text-[#737b71] line-through decoration-[#c5cbc1]">
                      {entry.original || "—"}
                    </p>
                    <p className="mt-1 text-sm font-medium leading-6 text-[#334438]">
                      {entry.revision}
                    </p>
                    {entry.reflection && (
                      <p className="mt-2 text-xs leading-5 text-[#7a8377]">
                        <span className="font-medium">Reflection:</span> {entry.reflection}
                      </p>
                    )}
                  </div>
                  <span
                    className={`w-fit rounded-full px-2.5 py-1 text-[11px] font-medium ${
                      entry.outcome === "progress"
                        ? "bg-[#edf3eb] text-[#4b694c]"
                        : "bg-[#fbf0e7] text-[#805a3b]"
                    }`}
                  >
                    {entry.outcome === "progress" ? "A step forward" : "A setback"}
                  </span>
                </li>
              ))}
            </ol>
          )}
          {(storageError || decodedEntries.error) && (
            <p role="alert" className="mt-4 rounded-lg bg-[#fbf0e7] px-3 py-2 text-xs text-[#805a3b]">
              {storageError || decodedEntries.error}
            </p>
          )}
        </section>

        <p className="pb-2 text-center text-xs text-[#899287]">
          Notice → Revise → Reflect → Repeat
        </p>
      </div>
    </main>
  );
}
