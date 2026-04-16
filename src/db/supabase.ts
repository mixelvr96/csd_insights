import { createClient } from "@supabase/supabase-js";
import { config } from "../config.js";

export const supabase = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey
);

export interface NewsItem {
  id?: string;
  category: string;
  title: string;
  url: string;
  source_name: string;
  raw_content: string | null;
  summary: string | null;
  implication: string | null;
  related_entity: string | null;
  relevance_score: number | null;
  published_at: string | null;
  collected_at?: string;
  processed_at: string | null;
  status: "raw" | "processed" | "ready" | "sent" | "duplicate" | "rejected";
  digest_id: string | null;
}

export interface Client {
  id?: string;
  company_name: string;
  hubspot_deal_id: string;
  hubspot_company_id?: string | null;
  pipeline_stage: string;
  industry: string | null;
  competitors: string[] | null;
  last_synced_at?: string;
  active: boolean;
}

export interface Digest {
  id?: string;
  sent_at: string | null;
  item_count: number;
  teams_response: string | null;
  status: "draft" | "sent" | "failed";
  created_at?: string;
}
