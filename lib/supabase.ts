import { createClient } from "@supabase/supabase-js";

type RightsBasis =
  | "public_domain"
  | "not_copyrightable"
  | "licensed"
  | "permission_granted"
  | "user_authored"
  | "reference_only";

type PhraseSource = {
  id: string;
  title: string;
  creator: string | null;
  publisher: string | null;
  isbn: string | null;
  source_url: string | null;
  license_name: string | null;
  license_url: string | null;
  rights_verified_at: string | null;
  citation: string | null;
  rights_basis: RightsBasis;
  reproduction_allowed: boolean;
  rights_notes: string | null;
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type Phrase = {
  id: string;
  source_id: string;
  phrase_text: string;
  meaning: string | null;
  usage_notes: string | null;
  example_text: string | null;
  source_locator: string | null;
  modality: "written" | "spoken" | "both";
  topic: string | null;
  tags: string[];
  is_public: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export type Database = {
  public: {
    Tables: {
      phrase_sources: {
        Row: PhraseSource;
        Insert: {
          id?: string;
          title: string;
          creator?: string | null;
          publisher?: string | null;
          isbn?: string | null;
          source_url?: string | null;
          license_name?: string | null;
          license_url?: string | null;
          rights_verified_at?: string | null;
          citation?: string | null;
          rights_basis: RightsBasis;
          reproduction_allowed?: boolean;
          rights_notes?: string | null;
          is_public?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["phrase_sources"]["Insert"]>;
        Relationships: [];
      };
      phrases: {
        Row: Phrase;
        Insert: {
          id?: string;
          source_id: string;
          phrase_text: string;
          meaning?: string | null;
          usage_notes?: string | null;
          example_text?: string | null;
          source_locator?: string | null;
          modality?: "written" | "spoken" | "both";
          topic?: string | null;
          tags?: string[];
          is_public?: boolean;
          created_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["phrases"]["Insert"]>;
        Relationships: [];
      };
      practice_sessions: {
        Row: {
          id: string;
          user_id: string;
          goal_id: string | null;
          phrase_id: string | null;
          modality: "written" | "spoken";
          topic: string;
          prompt: string | null;
          original_text: string;
          revised_text: string;
          reflection: string;
          outcome: "progress" | "setback";
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          goal_id?: string | null;
          phrase_id?: string | null;
          modality?: "written" | "spoken";
          topic: string;
          prompt?: string | null;
          original_text?: string;
          revised_text: string;
          reflection?: string;
          outcome: "progress" | "setback";
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          goal_id?: string | null;
          phrase_id?: string | null;
          modality?: "written" | "spoken";
          topic?: string;
          prompt?: string | null;
          original_text?: string;
          revised_text?: string;
          reflection?: string;
          outcome?: "progress" | "setback";
          created_at?: string;
        };
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

export function createSupabaseBrowserClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !publishableKey) return null;

  return createClient<Database>(url, publishableKey);
}
