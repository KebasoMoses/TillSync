-- M-Pesa Till Daily Reconciliation System Database Schema
-- Created: 2025-09-05

-- Transactions table - stores all M-Pesa and cash transactions
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- YYYY-MM-DD format
  time TEXT NOT NULL, -- HH:MM format
  transaction_type TEXT NOT NULL, -- 'mpesa' or 'cash'
  customer_name TEXT,
  amount_received REAL NOT NULL, -- KSh amount received
  transaction_reference TEXT, -- M-Pesa reference code
  mpesa_fee REAL DEFAULT 0, -- M-Pesa fee charged
  cash_sale_amount REAL DEFAULT 0, -- For cash transactions
  product_service TEXT, -- What was sold
  notes TEXT,
  verified BOOLEAN DEFAULT 0, -- Whether transaction is verified
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Daily summaries table - aggregated daily data
CREATE TABLE IF NOT EXISTS daily_summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL, -- YYYY-MM-DD format
  total_mpesa_sales REAL DEFAULT 0,
  total_cash_sales REAL DEFAULT 0,
  total_mpesa_fees REAL DEFAULT 0,
  net_mpesa_revenue REAL DEFAULT 0, -- after fees
  combined_daily_revenue REAL DEFAULT 0,
  opening_float REAL DEFAULT 0,
  closing_float REAL DEFAULT 0,
  expected_cash_in_till REAL DEFAULT 0,
  actual_cash_count REAL DEFAULT 0,
  variance REAL DEFAULT 0, -- difference between expected and actual
  variance_alert BOOLEAN DEFAULT 0, -- RED if >KSh 100
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Float management table - tracks daily float operations
CREATE TABLE IF NOT EXISTS float_management (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, -- YYYY-MM-DD format
  opening_cash_amount REAL DEFAULT 0,
  mpesa_withdrawals_to_till REAL DEFAULT 0,
  total_expected_cash REAL DEFAULT 0,
  banking_deposits_made REAL DEFAULT 0,
  closing_cash_count REAL DEFAULT 0,
  missing_extra_cash REAL DEFAULT 0,
  running_float_balance REAL DEFAULT 0,
  notes TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Business settings table - configuration and preferences
CREATE TABLE IF NOT EXISTS business_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  business_name TEXT DEFAULT 'My Kiosk',
  mpesa_till_number TEXT,
  owner_name TEXT,
  phone_number TEXT,
  daily_target REAL DEFAULT 0,
  alert_threshold REAL DEFAULT 100, -- KSh variance threshold
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- SMS import log - tracks imported SMS messages
CREATE TABLE IF NOT EXISTS sms_import_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  sms_content TEXT NOT NULL,
  transaction_reference TEXT,
  parsed_amount REAL,
  parsed_customer TEXT,
  parsed_time TEXT,
  import_status TEXT DEFAULT 'pending', -- 'pending', 'imported', 'duplicate', 'error'
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions(transaction_reference);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(transaction_type);
CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date);
CREATE INDEX IF NOT EXISTS idx_float_management_date ON float_management(date);
CREATE INDEX IF NOT EXISTS idx_sms_import_reference ON sms_import_log(transaction_reference);

-- Insert default business settings
INSERT OR IGNORE INTO business_settings (id, business_name, alert_threshold) 
VALUES (1, 'My Kiosk', 100);