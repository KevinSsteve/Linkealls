-- Payments: Multicaixa Express (e-kwanza / AppyPay GPO)
-- Run with: psql "$DATABASE_URL" -f lib/db/migrations/0005_add_payments_tables.sql

CREATE TABLE IF NOT EXISTS orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id integer NOT NULL,
  offering_name text NOT NULL,
  unit_price numeric(14,2) NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  amount numeric(14,2) NOT NULL,
  buyer_phone text NOT NULL,
  buyer_name text,
  merchant_transaction_id text NOT NULL UNIQUE,
  ekwanza_transaction_id text,
  status text NOT NULL DEFAULT 'pendente',
  paid_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS orders_business_idx ON orders (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id integer NOT NULL,
  plan text NOT NULL DEFAULT 'linkealls',
  amount numeric(14,2) NOT NULL,
  merchant_transaction_id text NOT NULL UNIQUE,
  ekwanza_transaction_id text,
  status text NOT NULL DEFAULT 'pendente',
  starts_at timestamp,
  expires_at timestamp,
  paid_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS subscriptions_business_idx ON subscriptions (business_id, created_at DESC);

CREATE TABLE IF NOT EXISTS wallet_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id integer NOT NULL,
  type text NOT NULL,
  amount numeric(14,2) NOT NULL,
  order_id uuid,
  payout_id uuid,
  description text NOT NULL DEFAULT '',
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_ledger_business_idx ON wallet_ledger (business_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_ledger_order_credit_uq ON wallet_ledger (order_id) WHERE order_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id integer NOT NULL,
  amount numeric(14,2) NOT NULL,
  destination_type text NOT NULL,
  destination text NOT NULL,
  operation_code text NOT NULL UNIQUE,
  ekz_operation_code text,
  ekz_transaction_code text,
  status text NOT NULL DEFAULT 'pendente',
  error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS payouts_business_idx ON payouts (business_id, created_at DESC);
