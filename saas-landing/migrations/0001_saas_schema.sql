-- TillSync SaaS Platform Database Schema
-- Created: 2025-09-05

-- Users table - customer registration and authentication
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  phone_number TEXT,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_location TEXT,
  is_verified BOOLEAN DEFAULT 0,
  verification_token TEXT,
  reset_token TEXT,
  reset_token_expires DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login_at DATETIME
);

-- Subscription plans table
CREATE TABLE IF NOT EXISTS subscription_plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL, -- 'daily', 'weekly', 'monthly', 'yearly'
  display_name TEXT NOT NULL, -- 'Daily Trial', 'Weekly', 'Monthly', 'Yearly'
  description TEXT,
  price_ksh INTEGER NOT NULL, -- Price in Kenyan Shillings (cents)
  duration_days INTEGER NOT NULL,
  features TEXT, -- JSON array of features
  is_trial BOOLEAN DEFAULT 0,
  is_popular BOOLEAN DEFAULT 0,
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- User subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  status TEXT NOT NULL, -- 'active', 'expired', 'cancelled', 'pending_payment'
  start_date DATETIME NOT NULL,
  end_date DATETIME NOT NULL,
  auto_renew BOOLEAN DEFAULT 1,
  payment_method TEXT, -- 'mpesa', 'card', 'bank'
  payment_reference TEXT,
  amount_paid INTEGER, -- Amount in KSh cents
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
);

-- Payment transactions table
CREATE TABLE IF NOT EXISTS payment_transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  subscription_id INTEGER,
  transaction_reference TEXT UNIQUE NOT NULL,
  mpesa_receipt_number TEXT,
  phone_number TEXT,
  amount INTEGER NOT NULL, -- Amount in KSh cents
  status TEXT NOT NULL, -- 'pending', 'completed', 'failed', 'cancelled'
  payment_method TEXT NOT NULL, -- 'mpesa', 'card', 'bank'
  callback_data TEXT, -- JSON data from payment provider
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subscription_id) REFERENCES user_subscriptions(id)
);

-- Business metrics and usage tracking
CREATE TABLE IF NOT EXISTS usage_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  date DATE NOT NULL,
  sms_parsed INTEGER DEFAULT 0,
  transactions_recorded INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  login_count INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  UNIQUE(user_id, date)
);

-- Waitlist for beta/early access
CREATE TABLE IF NOT EXISTS waitlist (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  phone_number TEXT,
  business_name TEXT,
  business_type TEXT,
  expected_volume TEXT, -- 'low', 'medium', 'high'
  referral_source TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending', -- 'pending', 'invited', 'converted'
  priority INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- System settings and configuration
CREATE TABLE IF NOT EXISTS system_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT UNIQUE NOT NULL,
  value TEXT,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone_number);
CREATE INDEX IF NOT EXISTS idx_users_verification ON users(verification_token);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_payments_user ON payment_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_reference ON payment_transactions(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_usage_user_date ON usage_metrics(user_id, date);
CREATE INDEX IF NOT EXISTS idx_waitlist_email ON waitlist(email);

-- Insert default subscription plans
INSERT OR IGNORE INTO subscription_plans (name, display_name, description, price_ksh, duration_days, features, is_trial, is_popular) VALUES
  ('daily', 'Daily Trial', 'Perfect for testing TillSync with your business', 4900, 1, '["Up to 50 transactions", "SMS parsing", "Basic reports", "Email support"]', 1, 0),
  ('weekly', 'Weekly Plan', 'Great for small kiosks and cafés', 10000, 7, '["Unlimited transactions", "SMS parsing", "Advanced reports", "Variance alerts", "Email support"]', 0, 0),
  ('monthly', 'Monthly Plan', 'Most popular for growing businesses', 35000, 30, '["Unlimited transactions", "SMS parsing", "Advanced reports", "Variance alerts", "Priority support", "Data export"]', 0, 1),
  ('yearly', 'Yearly Plan', 'Best value for established businesses', 350000, 365, '["Everything in Monthly", "Custom integrations", "Dedicated support", "Business analytics", "Multi-user access", "API access"]', 0, 0);

-- Insert default system settings
INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
  ('mpesa_paybill', '174379', 'M-Pesa Paybill number for payments'),
  ('mpesa_shortcode', '174379', 'M-Pesa shortcode'),
  ('support_email', 'support@tillsync.co.ke', 'Customer support email'),
  ('support_phone', '+254702376223', 'Customer support phone number'),
  ('trial_duration_days', '7', 'Default trial period duration'),
  ('max_trial_transactions', '100', 'Maximum transactions allowed in trial'),
  ('site_maintenance', 'false', 'Site maintenance mode flag'),
  ('beta_access', 'true', 'Beta access enabled flag');