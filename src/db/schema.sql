-- CSD Insights Database Schema

-- News items collected from all sources
CREATE TABLE IF NOT EXISTS news_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL CHECK (category IN ('zorka_agency', 'industry', 'research', 'vertical', 'competitor', 'client')),
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  source_name TEXT,
  raw_content TEXT,
  summary TEXT,
  implication TEXT,
  related_entity TEXT,
  relevance_score FLOAT,
  published_at TIMESTAMPTZ,
  collected_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'raw' CHECK (status IN ('raw', 'processed', 'ready', 'sent', 'duplicate', 'rejected')),
  digest_id UUID,
  UNIQUE(url)
);

-- Sent digest log
CREATE TABLE IF NOT EXISTS digests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sent_at TIMESTAMPTZ,
  item_count INTEGER,
  teams_response TEXT,
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'failed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cached HubSpot client list
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  hubspot_deal_id TEXT,
  pipeline_stage TEXT,
  industry TEXT,
  competitors JSONB DEFAULT '[]',
  last_synced_at TIMESTAMPTZ DEFAULT now(),
  active BOOLEAN DEFAULT true
);

-- Add foreign key after both tables exist
ALTER TABLE news_items
  ADD CONSTRAINT fk_digest
  FOREIGN KEY (digest_id) REFERENCES digests(id)
  ON DELETE SET NULL;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_news_items_status ON news_items(status);
CREATE INDEX IF NOT EXISTS idx_news_items_category ON news_items(category);
CREATE INDEX IF NOT EXISTS idx_news_items_collected_at ON news_items(collected_at);
CREATE INDEX IF NOT EXISTS idx_clients_active ON clients(active);
