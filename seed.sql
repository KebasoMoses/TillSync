-- Sample data for M-Pesa Till Daily Reconciliation System
-- This provides realistic example data for demonstration

-- Insert sample business settings
UPDATE business_settings SET 
  business_name = 'Mama Njeri Kiosk',
  mpesa_till_number = '174379',
  owner_name = 'Grace Njeri',
  phone_number = '0722123456',
  daily_target = 5000,
  alert_threshold = 100
WHERE id = 1;

-- Insert sample transactions for today (last 3 days)
INSERT OR IGNORE INTO transactions (date, time, transaction_type, customer_name, amount_received, transaction_reference, mpesa_fee, cash_sale_amount, product_service, notes, verified) VALUES 
  -- Day 1 (3 days ago)
  (date('now', '-2 days'), '08:30', 'mpesa', 'JOHN KAMAU', 500.00, 'NLJ7RT545', 0, 0, 'Airtime KSh 500', 'Morning sale', 1),
  (date('now', '-2 days'), '09:15', 'cash', 'Walk-in Customer', 0, '', 0, 150.00, 'Bread & Milk', 'Cash payment', 1),
  (date('now', '-2 days'), '10:45', 'mpesa', 'MARY WANJIKU', 200.00, 'NLK8ST661', 0, 0, 'Sugar 2kg', 'Regular customer', 1),
  (date('now', '-2 days'), '11:30', 'mpesa', 'PETER MWANGI', 1200.00, 'NLM9UV772', 0, 0, 'Cooking Oil 5L', 'Bulk purchase', 1),
  (date('now', '-2 days'), '14:20', 'cash', 'Local Customer', 0, '', 0, 80.00, 'Soap', 'Small item', 1),
  (date('now', '-2 days'), '15:45', 'mpesa', 'ANNE WAITHERA', 350.00, 'NLN0VW883', 0, 0, 'Maize Flour 2kg', 'Evening sale', 1),
  (date('now', '-2 days'), '17:30', 'mpesa', 'SAMUEL KIPROTICH', 800.00, 'NLP1XY994', 0, 0, 'Meat KSh 800', 'Dinner shopping', 1),

  -- Day 2 (2 days ago)  
  (date('now', '-1 days'), '08:00', 'mpesa', 'ELIZABETH MUTHONI', 300.00, 'NLQ2ZA105', 0, 0, 'Tea & Sugar', 'Morning customer', 1),
  (date('now', '-1 days'), '09:30', 'mpesa', 'DAVID OTIENO', 1500.00, 'NLR3AB216', 0, 0, 'Rice 5kg', 'Monthly shopping', 1),
  (date('now', '-1 days'), '11:00', 'cash', 'School Child', 0, '', 0, 50.00, 'Exercise Book', 'School supplies', 1),
  (date('now', '-1 days'), '12:15', 'mpesa', 'FLORENCE AKINYI', 600.00, 'NLS4CD327', 0, 0, 'Detergent & Soap', 'Household items', 1),
  (date('now', '-1 days'), '14:45', 'mpesa', 'JAMES NJOROGE', 250.00, 'NLT5EF438', 0, 0, 'Airtime KSh 250', 'Phone credit', 1),
  (date('now', '-1 days'), '16:20', 'cash', 'Regular Customer', 0, '', 0, 120.00, 'Milk 1L', 'Evening purchase', 1),
  (date('now', '-1 days'), '18:00', 'mpesa', 'GRACE WAIRIMU', 450.00, 'NLU6GH549', 0, 0, 'Vegetables', 'Fresh produce', 1),

  -- Day 3 (today)
  (date('now'), '07:45', 'mpesa', 'ROBERT KIMANI', 400.00, 'NLV7IJ650', 0, 0, 'Bread & Eggs', 'Breakfast items', 1),
  (date('now'), '08:30', 'cash', 'Teacher', 0, '', 0, 200.00, 'Snacks', 'School staff', 1),
  (date('now'), '10:15', 'mpesa', 'HELEN WAMAITHA', 750.00, 'NLW8KL761', 0, 0, 'Cooking Fat 1kg', 'Cooking supplies', 1),
  (date('now'), '11:45', 'mpesa', 'ANTHONY MUCHIRI', 180.00, 'NLX9MN872', 0, 0, 'Soap Bar', 'Personal care', 1),
  (date('now'), '13:30', 'mpesa', 'LUCY NDUTA', 320.00, 'NLY0OP983', 0, 0, 'Maize Flour 1kg', 'Lunch shopping', 1),
  (date('now'), '15:00', 'cash', 'Mama Charity', 0, '', 0, 90.00, 'Sugar 1/2 kg', 'Neighbor purchase', 1),
  (date('now'), '16:45', 'mpesa', 'DANIEL KARIUKI', 650.00, 'NLZ1QR094', 0, 0, 'Rice 2kg', 'Dinner prep', 0); -- Unverified transaction

-- Insert corresponding daily summaries
INSERT OR IGNORE INTO daily_summaries (date, total_mpesa_sales, total_cash_sales, total_mpesa_fees, net_mpesa_revenue, combined_daily_revenue, opening_float, closing_float, expected_cash_in_till, actual_cash_count, variance, variance_alert) VALUES
  -- Day 1 summary
  (date('now', '-2 days'), 3050.00, 230.00, 0.00, 3050.00, 3280.00, 500.00, 730.00, 730.00, 720.00, -10.00, 0),
  
  -- Day 2 summary  
  (date('now', '-1 days'), 3100.00, 170.00, 0.00, 3100.00, 3270.00, 720.00, 890.00, 890.00, 900.00, 10.00, 0),
  
  -- Day 3 summary (today - incomplete)
  (date('now'), 2300.00, 290.00, 0.00, 2300.00, 2590.00, 900.00, 1190.00, 1190.00, 0.00, 0.00, 0);

-- Insert float management records
INSERT OR IGNORE INTO float_management (date, opening_cash_amount, mpesa_withdrawals_to_till, total_expected_cash, banking_deposits_made, closing_cash_count, missing_extra_cash, running_float_balance, notes) VALUES
  (date('now', '-2 days'), 500.00, 0.00, 730.00, 2000.00, 720.00, -10.00, 720.00, 'Small variance, acceptable'),
  (date('now', '-1 days'), 720.00, 0.00, 890.00, 2500.00, 900.00, 10.00, 900.00, 'Slight overage, customer returned change'),
  (date('now'), 900.00, 0.00, 1190.00, 0.00, 0.00, 0.00, 0.00, 'Day in progress');

-- Insert sample SMS import log (showing successful parsing)
INSERT OR IGNORE INTO sms_import_log (sms_content, transaction_reference, parsed_amount, parsed_customer, parsed_time, import_status) VALUES
  ('NLJ7RT545 Confirmed. Ksh500.00 received from JOHN KAMAU 254722123456. Account balance is Ksh15,430.00. Transaction cost, Ksh0.00. Time: 14/01/25 8:30 AM', 'NLJ7RT545', 500.00, 'JOHN KAMAU', '08:30', 'imported'),
  ('NLK8ST661 Confirmed. Ksh200.00 received from MARY WANJIKU 254733987654. Account balance is Ksh15,630.00. Transaction cost, Ksh0.00. Time: 14/01/25 10:45 AM', 'NLK8ST661', 200.00, 'MARY WANJIKU', '10:45', 'imported'),
  ('NLM9UV772 Confirmed. Ksh1200.00 received from PETER MWANGI 254711222333. Account balance is Ksh16,830.00. Transaction cost, Ksh0.00. Time: 14/01/25 11:30 AM', 'NLM9UV772', 1200.00, 'PETER MWANGI', '11:30', 'imported');