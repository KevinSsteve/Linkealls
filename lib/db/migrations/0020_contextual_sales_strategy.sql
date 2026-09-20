CREATE TABLE IF NOT EXISTS sales_strategy_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id integer NOT NULL,
  version serial NOT NULL,
  name text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  config jsonb NOT NULL,
  gaps jsonb NOT NULL DEFAULT '[]'::jsonb,
  based_on_id uuid,
  approved_at timestamp,
  activated_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_strategy_business_idx ON sales_strategy_versions (business_id, created_at);
CREATE UNIQUE INDEX IF NOT EXISTS sales_strategy_business_version_unique ON sales_strategy_versions (business_id, version);
CREATE UNIQUE INDEX IF NOT EXISTS sales_strategy_one_active_per_business ON sales_strategy_versions (business_id) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS sales_strategy_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id integer NOT NULL,
  source_type text NOT NULL,
  source_id uuid NOT NULL,
  strategy_version_id uuid REFERENCES sales_strategy_versions(id),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  approved boolean NOT NULL DEFAULT false,
  approved_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sales_strategy_override_source_unique ON sales_strategy_overrides (business_id, source_type, source_id);

CREATE TABLE IF NOT EXISTS sales_outcome_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id integer NOT NULL,
  lead_id uuid,
  strategy_version_id uuid,
  source_type text,
  source_id uuid,
  event text NOT NULL,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sales_outcome_business_idx ON sales_outcome_events (business_id, created_at);

ALTER TABLE leads ADD COLUMN IF NOT EXISTS commercial_memory jsonb NOT NULL DEFAULT '{"revision":0,"interests":[],"criteria":[],"constraints":[],"answeredQuestions":[],"objections":[],"stage":"welcome","missingData":[],"humanControl":"ai"}'::jsonb;