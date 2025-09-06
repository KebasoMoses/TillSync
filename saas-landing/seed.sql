-- Sample data for TillSync SaaS platform
-- This provides realistic example data for testing

-- Sample users (passwords are hashed versions of 'password123')
INSERT OR IGNORE INTO users (email, phone_number, password_hash, full_name, business_name, business_location, is_verified) VALUES 
  ('grace.njeri@example.com', '+254722123456', 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', 'Grace Njeri', 'Mama Njeri Kiosk', 'Nairobi, Kenya', 1),
  ('samuel.kiprotich@example.com', '+254733987654', 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', 'Samuel Kiprotich', 'Kiprotich General Store', 'Eldoret, Kenya', 1),
  ('mary.wanjiku@example.com', '+254711222333', 'a665a45920422f9d417e4867efdc4fb8a04a1f3fff1fa07e998e86f7f7a27ae3', 'Mary Wanjiku', 'Wanjiku Foods', 'Nakuru, Kenya', 1);

-- Sample active subscriptions
INSERT OR IGNORE INTO user_subscriptions (user_id, plan_id, status, start_date, end_date, payment_reference, amount_paid) VALUES
  (1, 3, 'active', date('now', '-15 days'), date('now', '+15 days'), 'PAY001', 35000),
  (2, 2, 'active', date('now', '-3 days'), date('now', '+4 days'), 'PAY002', 10000),
  (3, 4, 'active', date('now', '-45 days'), date('now', '+320 days'), 'PAY003', 350000);

-- Sample payment transactions
INSERT OR IGNORE INTO payment_transactions (user_id, subscription_id, transaction_reference, mpesa_receipt_number, phone_number, amount, status, payment_method) VALUES
  (1, 1, 'TXN001', 'NLJ7RT545', '+254722123456', 35000, 'completed', 'mpesa'),
  (2, 2, 'TXN002', 'NLK8ST661', '+254733987654', 10000, 'completed', 'mpesa'),
  (3, 3, 'TXN003', 'NLM9UV772', '+254711222333', 350000, 'completed', 'mpesa');

-- Sample usage metrics
INSERT OR IGNORE INTO usage_metrics (user_id, date, sms_parsed, transactions_recorded, api_calls, login_count) VALUES
  (1, date('now'), 45, 78, 156, 3),
  (1, date('now', '-1 days'), 52, 89, 178, 2),
  (1, date('now', '-2 days'), 38, 65, 130, 1),
  (2, date('now'), 23, 34, 68, 2),
  (2, date('now', '-1 days'), 28, 41, 82, 1),
  (3, date('now'), 67, 145, 290, 4),
  (3, date('now', '-1 days'), 72, 158, 316, 3);

-- Sample waitlist entries
INSERT OR IGNORE INTO waitlist (email, phone_number, business_name, business_type, status) VALUES
  ('john.muthomi@example.com', '+254712345678', 'Muthomi Electronics', 'electronics', 'pending'),
  ('elizabeth.achieng@example.com', '+254734567890', 'Mama Liz Restaurant', 'restaurant', 'pending'),
  ('peter.kamau@example.com', '+254756789012', 'Kamau Retail Outlets', 'supermarket', 'invited'),
  ('jane.wanjiru@example.com', '+254778901234', 'Wanjiru Pharmacy', 'pharmacy', 'pending'),
  ('david.otieno@example.com', '+254790123456', 'Otieno General Store', 'kiosk', 'converted');

-- Sample system settings
INSERT OR IGNORE INTO system_settings (key, value, description) VALUES
  ('mpesa_paybill', '174379', 'M-Pesa Paybill number for payments'),
  ('support_email', 'support@tillsync.co.ke', 'Customer support email'),
  ('support_phone', '+254712345678', 'Customer support phone number'),
  ('beta_access', 'true', 'Beta access enabled flag'),
  ('trial_duration_days', '7', 'Default trial period duration'),
  ('maintenance_mode', 'false', 'Site maintenance mode flag');