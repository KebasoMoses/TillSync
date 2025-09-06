import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { getCookie, setCookie } from 'hono/cookie'
import { serveStatic } from 'hono/cloudflare-workers'
import { parseMpesaSMS, parseMultipleSMS, SAMPLE_SMS_FORMATS } from './utils/sms-parser'
import { calculateMpesaBusinessFee, calculateNetAmount, formatKSh, getAllFeeStructures } from './utils/mpesa-fees'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Super simple authentication for demo
const DEMO_TOKEN = 'tillsync-demo-authenticated-2024'

// Create demo token
function createDemoToken(): string {
  return DEMO_TOKEN + '-' + Date.now()
}

// Verify demo token
function verifyDemoToken(token: string): boolean {
  if (!token) return false
  
  const parts = token.split('-')
  if (parts.length < 4) return false
  
  const timestamp = parseInt(parts[parts.length - 1])
  if (!timestamp) return false
  
  // Check if token is less than 24 hours old
  const age = Date.now() - timestamp
  const maxAge = 24 * 60 * 60 * 1000 // 24 hours
  
  return age < maxAge && token.startsWith('tillsync-demo-authenticated')
}

// Authentication middleware for protected routes
const authMiddleware = async (c: any, next: any) => {
  const token = getCookie(c, 'auth-token')
  
  if (!token || !verifyDemoToken(token)) {
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }
  
  c.set('user', { username: 'demo' })
  await next()
}

// Auth routes
app.post('/api/auth/login', async (c) => {
  const { username, password } = await c.req.json()
  
  // Simple demo authentication (replace with real auth)
  if (username === 'demo' && password === 'demo') {
    // Create demo token
    const token = createDemoToken()
    
    setCookie(c, 'auth-token', token, {
      httpOnly: true,
      secure: true,
      maxAge: 24 * 60 * 60, // 24 hours
      sameSite: 'Strict',
      path: '/'
    })
    
    return c.json({ success: true, user: { username: 'demo' } })
  }
  
  return c.json({ success: false, error: 'Invalid credentials' }, 401)
})

app.post('/api/auth/logout', (c) => {
  setCookie(c, 'auth-token', '', { 
    maxAge: 0,
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'Strict'
  })
  return c.json({ success: true })
})

// Check authentication status
app.get('/api/auth/me', authMiddleware, (c) => {
  const user = c.get('user')
  return c.json({ success: true, user })
})

// Authentication redirect handler from SaaS
app.get('/auth/redirect', async (c) => {
  const redirectToken = c.req.query('token')
  
  if (!redirectToken) {
    return c.redirect('https://5fad663e.tillsync-saas.pages.dev', 302)
  }
  
  try {
    // Decode the redirect token
    const redirectData = JSON.parse(atob(redirectToken))
    
    // Validate the token (ensure it's not too old - 5 minutes max)
    const maxAge = 5 * 60 * 1000 // 5 minutes
    if (Date.now() - redirectData.timestamp > maxAge) {
      return c.redirect('https://5fad663e.tillsync-saas.pages.dev', 302)
    }
    
    // Create a local session token for the main app
    const localToken = createDemoToken()
    
    setCookie(c, 'auth-token', localToken, {
      httpOnly: true,
      secure: true,
      maxAge: 24 * 60 * 60, // 24 hours
      sameSite: 'Strict',
      path: '/'
    })
    
    // Redirect to dashboard
    return c.redirect('/', 302)
    
  } catch (error) {
    return c.redirect('https://5fad663e.tillsync-saas.pages.dev', 302)
  }
})

// Initialize database tables
async function initDatabase(db: D1Database) {
  try {
    // Check if tables exist by trying to query business_settings
    await db.prepare("SELECT id FROM business_settings LIMIT 1").first();
  } catch {
    // Tables don't exist, create them individually
    console.log("Initializing database tables...");
    
    try {
      // Create business_settings table
      await db.prepare(`CREATE TABLE IF NOT EXISTS business_settings (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        business_name TEXT DEFAULT 'My Kiosk',
        mpesa_till_number TEXT,
        owner_name TEXT,
        phone_number TEXT,
        daily_target REAL DEFAULT 0,
        alert_threshold REAL DEFAULT 100,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`).run();

      // Create transactions table
      await db.prepare(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT NOT NULL,
        time TEXT NOT NULL,
        transaction_type TEXT NOT NULL,
        customer_name TEXT,
        amount_received REAL NOT NULL,
        transaction_reference TEXT,
        mpesa_fee REAL DEFAULT 0,
        cash_sale_amount REAL DEFAULT 0,
        product_service TEXT,
        notes TEXT,
        verified BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`).run();

      // Create daily_summaries table
      await db.prepare(`CREATE TABLE IF NOT EXISTS daily_summaries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        total_mpesa_sales REAL DEFAULT 0,
        total_cash_sales REAL DEFAULT 0,
        total_mpesa_fees REAL DEFAULT 0,
        net_mpesa_revenue REAL DEFAULT 0,
        combined_daily_revenue REAL DEFAULT 0,
        opening_float REAL DEFAULT 0,
        closing_float REAL DEFAULT 0,
        expected_cash_in_till REAL DEFAULT 0,
        actual_cash_count REAL DEFAULT 0,
        variance REAL DEFAULT 0,
        variance_alert BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`).run();

      // Create products table
      await db.prepare(`CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        category TEXT DEFAULT 'General',
        is_active BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )`).run();

      // Insert default business settings
      await db.prepare(`INSERT OR IGNORE INTO business_settings (id, business_name, alert_threshold) VALUES (1, 'My Kiosk', 100)`).run();

      console.log("Database tables initialized successfully");
    } catch (error) {
      console.error("Database initialization failed:", error);
      throw error;
    }
  }
}

// API Routes

// Get today's dashboard data (protected)
app.get('/api/dashboard', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Get business settings
    const businessSettings = await DB.prepare(`
      SELECT * FROM business_settings WHERE id = 1
    `).first();

    // Get today's transactions
    const transactions = await DB.prepare(`
      SELECT * FROM transactions 
      WHERE date = ? 
      ORDER BY time DESC
    `).bind(today).all();

    // Get today's summary
    let summary = await DB.prepare(`
      SELECT * FROM daily_summaries WHERE date = ?
    `).bind(today).first();

    // If no summary exists, create one
    if (!summary) {
      await DB.prepare(`
        INSERT INTO daily_summaries (date) VALUES (?)
      `).bind(today).run();
      
      summary = await DB.prepare(`
        SELECT * FROM daily_summaries WHERE date = ?
      `).bind(today).first();
    }

    // Calculate real-time totals from transactions
    const mpesaTransactions = transactions.results?.filter((t: any) => t.transaction_type === 'mpesa') || [];
    const cashTransactions = transactions.results?.filter((t: any) => t.transaction_type === 'cash') || [];
    
    const totalMpesaSales = mpesaTransactions.reduce((sum: number, t: any) => sum + (t.amount_received || 0), 0);
    const totalCashSales = cashTransactions.reduce((sum: number, t: any) => sum + (t.cash_sale_amount || 0), 0);
    const totalMpesaFees = mpesaTransactions.reduce((sum: number, t: any) => sum + (t.mpesa_fee || 0), 0);
    
    const calculatedSummary = {
      ...summary,
      total_mpesa_sales: totalMpesaSales,
      total_cash_sales: totalCashSales,
      total_mpesa_fees: totalMpesaFees,
      net_mpesa_revenue: totalMpesaSales - totalMpesaFees,
      combined_daily_revenue: totalMpesaSales + totalCashSales,
      expected_cash_in_till: (summary.opening_float || 0) + totalCashSales,
      variance: (summary.actual_cash_count || 0) - ((summary.opening_float || 0) + totalCashSales),
      variance_alert: Math.abs((summary.actual_cash_count || 0) - ((summary.opening_float || 0) + totalCashSales)) > (summary.alert_threshold || 100)
    };

    return c.json({
      success: true,
      data: {
        transactions: transactions.results || [],
        summary: calculatedSummary,
        businessSettings: businessSettings || { business_name: 'My Kiosk' },
        date: today
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Add new transaction (protected)
app.post('/api/transactions', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const body = await c.req.json();
    const { 
      date, 
      time, 
      transaction_type, 
      customer_name, 
      amount_received, 
      transaction_reference, 
      cash_sale_amount, 
      product_service, 
      notes 
    } = body;

    // Calculate M-Pesa fee if it's an M-Pesa transaction
    let mpesa_fee = 0;
    if (transaction_type === 'mpesa' && amount_received) {
      mpesa_fee = calculateMpesaBusinessFee(amount_received);
    }

    const result = await DB.prepare(`
      INSERT INTO transactions (
        date, time, transaction_type, customer_name, amount_received,
        transaction_reference, mpesa_fee, cash_sale_amount, product_service, notes, verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).bind(
      date || new Date().toISOString().split('T')[0],
      time,
      transaction_type,
      customer_name || '',
      amount_received || 0,
      transaction_reference || '',
      mpesa_fee,
      cash_sale_amount || 0,
      product_service || '',
      notes || '',
      1 // Verified by default
    ).run();

    return c.json({
      success: true,
      data: { 
        id: result.meta.last_row_id,
        message: 'Transaction added successfully' 
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Parse SMS and return extracted data (protected)
app.post('/api/sms/parse', authMiddleware, async (c) => {
  try {
    const body = await c.req.json();
    const { smsContent } = body;

    if (!smsContent) {
      return c.json({
        success: false,
        error: 'SMS content is required'
      }, 400);
    }

    // Parse multiple SMS messages
    const parsedTransactions = parseMultipleSMS(smsContent);

    return c.json({
      success: true,
      data: {
        transactions: parsedTransactions,
        count: parsedTransactions.length,
        validCount: parsedTransactions.filter(t => t.isValid).length
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Import parsed SMS transactions (protected)
app.post('/api/sms/import', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const body = await c.req.json();
    const { transactions } = body;

    if (!transactions || !Array.isArray(transactions)) {
      return c.json({
        success: false,
        error: 'Transactions array is required'
      }, 400);
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (const transaction of transactions) {
      if (!transaction.isValid) {
        skipped++;
        continue;
      }

      try {
        // Check for duplicate transaction reference
        const existing = await DB.prepare(`
          SELECT id FROM transactions WHERE transaction_reference = ?
        `).bind(transaction.transactionReference).first();

        if (existing) {
          skipped++;
          continue;
        }

        // Calculate M-Pesa fee
        const mpesa_fee = calculateMpesaBusinessFee(transaction.amount);
        const today = new Date().toISOString().split('T')[0];

        await DB.prepare(`
          INSERT INTO transactions (
            date, time, transaction_type, customer_name, amount_received,
            transaction_reference, mpesa_fee, product_service, verified
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(
          today,
          transaction.time || new Date().toLocaleTimeString('en-US', { 
            hour12: true, 
            hour: 'numeric', 
            minute: '2-digit' 
          }),
          'mpesa',
          transaction.customerName,
          transaction.amount,
          transaction.transactionReference,
          mpesa_fee,
          transaction.selectedProduct || 'M-Pesa Payment',
          1 // Verified by default
        ).run();

        imported++;
      } catch (error) {
        errors.push(`Error importing ${transaction.transactionReference}: ${error}`);
        skipped++;
      }
    }

    return c.json({
      success: true,
      data: {
        imported,
        skipped,
        errors,
        message: `Successfully imported ${imported} transactions, skipped ${skipped}`
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Update daily summary (protected)
app.put('/api/summary', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const body = await c.req.json();
    const { date, opening_float, closing_float, actual_cash_count } = body;

    const result = await DB.prepare(`
      UPDATE daily_summaries 
      SET opening_float = ?, closing_float = ?, actual_cash_count = ?, updated_at = CURRENT_TIMESTAMP
      WHERE date = ?
    `).bind(
      opening_float || 0,
      closing_float || 0,
      actual_cash_count || 0,
      date || new Date().toISOString().split('T')[0]
    ).run();

    return c.json({
      success: true,
      data: { message: 'Summary updated successfully' }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Get M-Pesa fee structure
app.get('/api/fees', async (c) => {
  return c.json({
    success: true,
    data: {
      feeStructure: getAllFeeStructures(),
      description: 'M-Pesa Customer-to-Business fee structure (KSh)'
    }
  });
});

// Get sample SMS formats
app.get('/api/sms/samples', async (c) => {
  return c.json({
    success: true,
    data: {
      samples: SAMPLE_SMS_FORMATS,
      description: 'Sample M-Pesa SMS formats for testing'
    }
  });
});

// Get transactions by date range for reports (protected)
app.get('/api/reports/transactions', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  const { start_date, end_date } = c.req.query();
  
  if (!start_date || !end_date) {
    return c.json({
      success: false,
      error: 'start_date and end_date parameters are required'
    }, 400);
  }
  
  try {
    // Get transactions in date range
    const transactions = await DB.prepare(`
      SELECT * FROM transactions 
      WHERE date >= ? AND date <= ? 
      ORDER BY date DESC, time DESC
    `).bind(start_date, end_date).all();

    // Calculate totals
    const mpesaTransactions = transactions.results?.filter((t: any) => t.transaction_type === 'mpesa') || [];
    const cashTransactions = transactions.results?.filter((t: any) => t.transaction_type === 'cash') || [];
    
    const totalMpesaSales = mpesaTransactions.reduce((sum: number, t: any) => sum + (t.amount_received || 0), 0);
    const totalCashSales = cashTransactions.reduce((sum: number, t: any) => sum + (t.cash_sale_amount || 0), 0);
    const totalMpesaFees = mpesaTransactions.reduce((sum: number, t: any) => sum + (t.mpesa_fee || 0), 0);
    
    const summary = {
      total_mpesa_sales: totalMpesaSales,
      total_cash_sales: totalCashSales,
      total_mpesa_fees: totalMpesaFees,
      net_mpesa_revenue: totalMpesaSales - totalMpesaFees,
      combined_daily_revenue: totalMpesaSales + totalCashSales,
      transaction_count: transactions.results?.length || 0,
      date_range: `${start_date} to ${end_date}`
    };

    return c.json({
      success: true,
      data: {
        transactions: transactions.results || [],
        summary: summary,
        start_date,
        end_date
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Business Settings API Routes

// Get business settings (protected)
app.get('/api/business-settings', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const settings = await DB.prepare(`
      SELECT * FROM business_settings WHERE id = 1
    `).first();
    
    return c.json({
      success: true,
      data: settings || {
        business_name: 'My Kiosk',
        mpesa_till_number: '',
        owner_name: '',
        phone_number: '',
        daily_target: 0,
        alert_threshold: 100
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Update business settings (protected)
app.put('/api/business-settings', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const body = await c.req.json();
    const { business_name, mpesa_till_number, owner_name, phone_number, daily_target, alert_threshold } = body;
    
    await DB.prepare(`
      INSERT OR REPLACE INTO business_settings (id, business_name, mpesa_till_number, owner_name, phone_number, daily_target, alert_threshold, updated_at)
      VALUES (1, ?, ?, ?, ?, ?, ?, datetime('now'))
    `).bind(business_name, mpesa_till_number, owner_name, phone_number, daily_target || 0, alert_threshold || 100).run();
    
    return c.json({
      success: true,
      message: 'Business settings updated successfully'
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Products API Routes

// Get all products (protected)
app.get('/api/products', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const products = await DB.prepare(`
      SELECT * FROM products WHERE is_active = 1 ORDER BY name ASC
    `).all();
    
    return c.json({
      success: true,
      data: products.results || []
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Add new product (protected)
app.post('/api/products', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const body = await c.req.json();
    const { name, category } = body;
    
    if (!name) {
      return c.json({
        success: false,
        error: 'Product name is required'
      }, 400);
    }
    
    const result = await DB.prepare(`
      INSERT INTO products (name, category) VALUES (?, ?)
    `).bind(name.trim(), category || 'General').run();
    
    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        name: name.trim(),
        category: category || 'General'
      }
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('UNIQUE constraint failed')) {
      return c.json({
        success: false,
        error: 'Product already exists'
      }, 400);
    }
    
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Delete product (protected)
app.delete('/api/products/:id', authMiddleware, async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const id = c.req.param('id');
    
    await DB.prepare(`
      UPDATE products SET is_active = 0 WHERE id = ?
    `).bind(id).run();
    
    return c.json({
      success: true,
      message: 'Product removed successfully'
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Main dashboard route (check authentication first)
app.get('/', async (c) => {
  // Check if user is authenticated
  const token = getCookie(c, 'auth-token')
  
  if (!token) {
    // Redirect to SaaS landing page for authentication
    return c.redirect('https://5fad663e.tillsync-saas.pages.dev', 302)
  }
  
  // Check if token is valid
  if (!verifyDemoToken(token)) {
    return c.redirect('https://5fad663e.tillsync-saas.pages.dev', 302)
  }
  
  // User is authenticated, show dashboard
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TillSync - M-Pesa Till Reconciliation System</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  'mpesa': {
                    'green': '#00d13b',
                    'dark-green': '#00a82f',
                    'blue': '#0066cc',
                    'dark-blue': '#004d99',
                    'light-gray': '#f5f5f5',
                    'red': '#e74c3c'
                  }
                }
              }
            }
          }
        </script>
        <style>
          .mpesa-gradient {
            background: linear-gradient(135deg, #00d13b 0%, #0066cc 100%);
          }
          .btn-mpesa {
            background: linear-gradient(135deg, #00d13b 0%, #00a82f 100%);
            transition: all 0.3s ease;
          }
          .btn-mpesa:hover {
            background: linear-gradient(135deg, #00a82f 0%, #008a27 100%);
            transform: translateY(-1px);
            box-shadow: 0 4px 12px rgba(0, 209, 59, 0.3);
          }
          .card-shadow {
            box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
          }
          .variance-alert {
            animation: pulse 2s infinite;
          }
          @keyframes pulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.7; }
          }
        </style>
    </head>
    <body class="bg-gray-50 min-h-screen">
        <!-- Header -->
        <header class="mpesa-gradient text-white shadow-lg">
            <div class="container mx-auto px-4 py-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center space-x-3">
                        <i class="fas fa-mobile-alt text-2xl"></i>
                        <div>
                            <h1 class="text-2xl font-bold">TillSync</h1>
                            <p class="text-mpesa-light-gray text-sm">M-Pesa Till Reconciliation System</p>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-lg font-semibold" id="current-date"></div>
                        <div class="text-sm opacity-90" id="business-name-display">My Kiosk</div>
                    </div>
                </div>
            </div>
        </header>

        <!-- Main Content -->
        <main class="container mx-auto px-4 py-8">
            <!-- Navigation Tabs -->
            <div class="bg-white rounded-lg shadow-md mb-6">
                <nav class="flex flex-wrap border-b overflow-x-auto">
                    <button class="tab-button px-3 md:px-6 py-3 font-medium text-mpesa-blue border-b-2 border-mpesa-green bg-mpesa-light-gray flex-shrink-0 text-sm md:text-base" data-tab="dashboard">
                        <i class="fas fa-tachometer-alt mr-1 md:mr-2"></i>
                        <span class="hidden sm:inline">Dashboard</span>
                        <span class="sm:hidden">Dash</span>
                    </button>
                    <button class="tab-button px-3 md:px-6 py-3 font-medium text-gray-600 hover:text-mpesa-blue flex-shrink-0 text-sm md:text-base" data-tab="sms-import">
                        <i class="fas fa-sms mr-1 md:mr-2"></i>
                        <span class="hidden sm:inline">SMS Import</span>
                        <span class="sm:hidden">SMS</span>
                    </button>
                    <button class="tab-button px-3 md:px-6 py-3 font-medium text-gray-600 hover:text-mpesa-blue flex-shrink-0 text-sm md:text-base" data-tab="transactions">
                        <i class="fas fa-list mr-1 md:mr-2"></i>
                        <span class="hidden sm:inline">Add Transaction</span>
                        <span class="sm:hidden">Add</span>
                    </button>
                    <button class="tab-button px-3 md:px-6 py-3 font-medium text-gray-600 hover:text-mpesa-blue flex-shrink-0 text-sm md:text-base" data-tab="reports">
                        <i class="fas fa-chart-bar mr-1 md:mr-2"></i>
                        <span class="hidden sm:inline">Reports</span>
                        <span class="sm:hidden">Reports</span>
                    </button>
                    <button class="tab-button px-3 md:px-6 py-3 font-medium text-gray-600 hover:text-mpesa-blue flex-shrink-0 text-sm md:text-base" data-tab="help">
                        <i class="fas fa-question-circle mr-1 md:mr-2"></i>
                        <span class="hidden sm:inline">Help</span>
                        <span class="sm:hidden">Help</span>
                    </button>
                    <button class="tab-button px-3 md:px-6 py-3 font-medium text-gray-600 hover:text-mpesa-blue flex-shrink-0 text-sm md:text-base" data-tab="profile">
                        <i class="fas fa-user-cog mr-1 md:mr-2"></i>
                        <span class="hidden sm:inline">Profile</span>
                        <span class="sm:hidden">Profile</span>
                    </button>
                </nav>
            </div>

            <!-- Dashboard Tab Content -->
            <div id="dashboard-content" class="tab-content">
                <!-- Summary Cards -->
                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <!-- M-Pesa Sales Card -->
                    <div class="bg-white rounded-lg card-shadow p-6 border-l-4 border-mpesa-green">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-600 text-sm font-medium">M-Pesa Sales Today</p>
                                <p class="text-2xl font-bold text-mpesa-dark-green" id="mpesa-sales">KSh 0</p>
                            </div>
                            <i class="fas fa-mobile-alt text-3xl text-mpesa-green"></i>
                        </div>
                    </div>

                    <!-- Cash Sales Card -->
                    <div class="bg-white rounded-lg card-shadow p-6 border-l-4 border-mpesa-blue">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-600 text-sm font-medium">Cash Sales Today</p>
                                <p class="text-2xl font-bold text-mpesa-dark-blue" id="cash-sales">KSh 0</p>
                            </div>
                            <i class="fas fa-coins text-3xl text-mpesa-blue"></i>
                        </div>
                    </div>

                    <!-- Total Revenue Card -->
                    <div class="bg-white rounded-lg card-shadow p-6 border-l-4 border-green-500">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-600 text-sm font-medium">Total Revenue</p>
                                <p class="text-2xl font-bold text-green-600" id="total-revenue">KSh 0</p>
                            </div>
                            <i class="fas fa-chart-line text-3xl text-green-500"></i>
                        </div>
                    </div>

                    <!-- Variance Alert Card -->
                    <div class="bg-white rounded-lg card-shadow p-6 border-l-4" id="variance-card">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="text-gray-600 text-sm font-medium">Cash Variance</p>
                                <p class="text-2xl font-bold" id="variance-amount">KSh 0</p>
                            </div>
                            <i class="fas fa-exclamation-triangle text-3xl" id="variance-icon"></i>
                        </div>
                    </div>
                </div>

                <!-- Cash Management Section -->
                <div class="bg-white rounded-lg card-shadow mb-6">
                    <div class="p-4 border-b border-gray-200">
                        <div class="flex items-center justify-between">
                            <h3 class="text-lg font-semibold text-gray-800">
                                <i class="fas fa-wallet mr-2 text-mpesa-blue"></i>
                                Cash Till Management
                            </h3>
                            <button onclick="toggleCashManagement()" class="text-mpesa-blue hover:text-mpesa-dark-blue">
                                <i class="fas fa-chevron-down" id="cash-toggle-icon"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div id="cash-management-content" class="p-4 hidden">
                        <!-- Cash Status Display -->
                        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                            <div class="bg-blue-50 p-3 rounded-lg">
                                <p class="text-xs text-gray-600 font-medium">Opening Float</p>
                                <p class="text-lg font-bold text-blue-600" id="display-opening-float">KSh 0</p>
                            </div>
                            <div class="bg-green-50 p-3 rounded-lg">
                                <p class="text-xs text-gray-600 font-medium">Cash Sales</p>
                                <p class="text-lg font-bold text-green-600" id="display-cash-sales">KSh 0</p>
                            </div>
                            <div class="bg-purple-50 p-3 rounded-lg">
                                <p class="text-xs text-gray-600 font-medium">Expected Cash</p>
                                <p class="text-lg font-bold text-purple-600" id="display-expected-cash">KSh 0</p>
                            </div>
                            <div class="bg-orange-50 p-3 rounded-lg">
                                <p class="text-xs text-gray-600 font-medium">Current Cash</p>
                                <p class="text-lg font-bold text-orange-600" id="display-current-cash">KSh 0</p>
                            </div>
                        </div>

                        <!-- Cash Management Form -->
                        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Opening Float (KSh)</label>
                                <input type="number" id="input-opening-float" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="0" step="0.01">
                                <p class="text-xs text-gray-500 mt-1">Cash you started with today</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Current Cash Count (KSh)</label>
                                <input type="number" id="input-current-cash" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="0" step="0.01">
                                <p class="text-xs text-gray-500 mt-1">Physical cash in till right now</p>
                            </div>
                            <div class="flex items-end">
                                <button onclick="updateCashManagement()" class="btn-mpesa text-white px-6 py-2 rounded-lg font-medium w-full">
                                    <i class="fas fa-save mr-2"></i>Update Cash
                                </button>
                            </div>
                        </div>

                        <!-- Variance Explanation -->
                        <div class="mt-4 p-3 bg-gray-50 rounded-lg">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm font-medium text-gray-800">Variance Analysis</p>
                                    <p class="text-xs text-gray-600" id="variance-explanation">Expected KSh 0 - Current KSh 0 = Variance KSh 0</p>
                                </div>
                                <div class="text-right">
                                    <p class="text-lg font-bold" id="variance-status">KSh 0</p>
                                    <p class="text-xs" id="variance-label">Balanced</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- Recent Transactions -->
                <div class="bg-white rounded-lg card-shadow">
                    <div class="p-6 border-b border-gray-200">
                        <div class="flex items-center justify-between">
                            <h2 class="text-xl font-semibold text-gray-800">
                                <i class="fas fa-history mr-2 text-mpesa-blue"></i>
                                Today's Transactions
                            </h2>
                            <button class="btn-mpesa text-white px-4 py-2 rounded-lg font-medium" onclick="refreshDashboard()">
                                <i class="fas fa-sync-alt mr-2"></i>Refresh
                            </button>
                        </div>
                    </div>
                    <!-- Search and Controls -->
                    <div class="mb-4 flex flex-col sm:flex-row gap-2 sm:gap-4">
                        <div class="flex-1">
                            <input type="text" id="search-transactions" placeholder="Search transactions..." class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent text-sm">
                        </div>
                        <div class="flex gap-2">
                            <select id="sort-transactions" class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green text-sm">
                                <option value="">Sort by...</option>
                                <option value="time-desc">Time (Newest)</option>
                                <option value="time-asc">Time (Oldest)</option>
                                <option value="amount_received-desc">Amount (High-Low)</option>
                                <option value="amount_received-asc">Amount (Low-High)</option>
                                <option value="customer">Customer Name</option>
                            </select>
                            <select id="rows-per-page" class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green text-sm">
                                <option value="10">10 rows</option>
                                <option value="25">25 rows</option>
                                <option value="50">50 rows</option>
                                <option value="100">100 rows</option>
                            </select>
                        </div>
                    </div>

                    <!-- Mobile-First Responsive Table -->
                    <div class="w-full">
                        <!-- Desktop Table View -->
                        <div class="hidden md:block overflow-x-auto">
                            <table class="min-w-full divide-y divide-gray-200">
                                <thead class="bg-gray-50">
                                    <tr>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onclick="sortTable('time')">
                                            Time <i class="fas fa-sort ml-1"></i>
                                        </th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onclick="sortTable('type')">
                                            Type <i class="fas fa-sort ml-1"></i>
                                        </th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onclick="sortTable('customer')">
                                            Customer <i class="fas fa-sort ml-1"></i>
                                        </th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" onclick="sortTable('amount')">
                                            Amount <i class="fas fa-sort ml-1"></i>
                                        </th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reference</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                                        <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                                    </tr>
                                </thead>
                                <tbody id="transactions-table" class="bg-white divide-y divide-gray-200">
                                    <!-- Transactions will be loaded here -->
                                </tbody>
                            </table>
                        </div>

                        <!-- Mobile Card View -->
                        <div class="md:hidden">
                            <div id="transactions-mobile" class="space-y-3">
                                <!-- Mobile transaction cards will be loaded here -->
                            </div>
                        </div>

                        <!-- Pagination -->
                        <div class="flex flex-col sm:flex-row items-center justify-between mt-4 gap-2">
                            <div class="text-sm text-gray-700">
                                Showing <span id="showing-start">1</span> to <span id="showing-end">10</span> of <span id="total-transactions">0</span> transactions
                            </div>
                            <div class="flex gap-2">
                                <button id="prev-page" class="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                    <i class="fas fa-chevron-left"></i> Previous
                                </button>
                                <span id="page-info" class="px-3 py-2 text-sm">Page 1 of 1</span>
                                <button id="next-page" class="px-3 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" disabled>
                                    Next <i class="fas fa-chevron-right"></i>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SMS Import Tab Content -->
            <div id="sms-import-content" class="tab-content hidden">
                <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                    <!-- SMS Input Section -->
                    <div class="bg-white rounded-lg card-shadow p-6">
                        <h2 class="text-xl font-semibold text-gray-800 mb-4">
                            <i class="fas fa-sms mr-2 text-mpesa-blue"></i>
                            Paste M-Pesa SMS Messages
                        </h2>
                        <div class="space-y-4">
                            <textarea 
                                id="sms-input" 
                                rows="10" 
                                class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green focus:border-transparent"
                                placeholder="Copy and paste your M-Pesa SMS messages here...

Example:
NLJ7RT545 Confirmed. Ksh500.00 received from JOHN KAMAU 254722123456. Account balance is Ksh15,430.00. Transaction cost, Ksh0.00. Time: 14/01/25 2:15 PM"
                            ></textarea>
                            <div class="flex space-x-3">
                                <button 
                                    class="btn-mpesa text-white px-6 py-2 rounded-lg font-medium flex-1"
                                    onclick="parseSMS()"
                                >
                                    <i class="fas fa-search mr-2"></i>Parse SMS
                                </button>
                                <button 
                                    class="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg font-medium"
                                    onclick="loadSampleSMS()"
                                >
                                    <i class="fas fa-file-alt mr-2"></i>Load Sample
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- Parsed Results Section -->
                    <div class="bg-white rounded-lg card-shadow p-6">
                        <h2 class="text-xl font-semibold text-gray-800 mb-4">
                            <i class="fas fa-list-check mr-2 text-mpesa-green"></i>
                            Parsed Transactions
                        </h2>
                        <div id="parsed-results" class="text-gray-500 text-center py-8">
                            <i class="fas fa-inbox text-4xl mb-4"></i>
                            <p>No SMS messages parsed yet.</p>
                            <p class="text-sm">Paste SMS messages and click "Parse SMS" to extract transaction data.</p>
                        </div>
                        <div id="import-section" class="hidden mt-4 pt-4 border-t border-gray-200">
                            <button 
                                class="btn-mpesa text-white px-6 py-2 rounded-lg font-medium w-full"
                                onclick="importTransactions()"
                            >
                                <i class="fas fa-download mr-2"></i>Import All Valid Transactions
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Add Transaction Tab Content -->
            <div id="transactions-content" class="tab-content hidden">
                <div class="max-w-2xl mx-auto">
                    <div class="bg-white rounded-lg card-shadow p-6">
                        <h2 class="text-xl font-semibold text-gray-800 mb-6">
                            <i class="fas fa-plus-circle mr-2 text-mpesa-blue"></i>
                            Add New Transaction
                        </h2>
                        <form id="transaction-form" class="space-y-4">
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Transaction Type</label>
                                    <select id="transaction-type" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green" required>
                                        <option value="">Select Type</option>
                                        <option value="mpesa">M-Pesa Payment</option>
                                        <option value="cash">Cash Payment</option>
                                    </select>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Time</label>
                                    <input type="time" id="transaction-time" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green" required>
                                </div>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Customer Name</label>
                                <input type="text" id="customer-name" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green" placeholder="Enter customer name">
                            </div>

                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4" id="mpesa-fields">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">M-Pesa Amount (KSh)</label>
                                    <input type="number" id="mpesa-amount" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green" placeholder="0.00" step="0.01">
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Transaction Reference</label>
                                    <input type="text" id="transaction-ref" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green" placeholder="e.g., NLJ7RT545">
                                </div>
                            </div>

                            <div id="cash-fields" class="hidden">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Cash Amount (KSh)</label>
                                    <input type="number" id="cash-amount" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green" placeholder="0.00" step="0.01">
                                </div>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Product/Service Sold</label>
                                <select id="product-service" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green">
                                    <option value="">Loading products...</option>
                                </select>
                                <p class="text-xs text-gray-500 mt-1">Add custom products in Profile → Product Management</p>
                            </div>

                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                                <textarea id="transaction-notes" rows="3" class="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-mpesa-green" placeholder="Additional notes or details..."></textarea>
                            </div>

                            <div class="flex space-x-4">
                                <button type="submit" class="btn-mpesa text-white px-6 py-2 rounded-lg font-medium flex-1">
                                    <i class="fas fa-save mr-2"></i>Add Transaction
                                </button>
                                <button type="button" class="bg-gray-500 hover:bg-gray-600 text-white px-6 py-2 rounded-lg font-medium" onclick="resetTransactionForm()">
                                    <i class="fas fa-undo mr-2"></i>Reset
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            </div>

            <!-- Reports Tab Content -->
            <div id="reports-content" class="tab-content hidden">
                <div class="max-w-7xl mx-auto">
                    <!-- Reports Header -->
                    <div class="bg-white rounded-lg card-shadow p-6 mb-6">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <h2 class="text-2xl font-semibold text-gray-800">
                                <i class="fas fa-chart-bar mr-2 text-mpesa-blue"></i>
                                Business Reports & Analytics
                            </h2>
                            <div class="flex flex-col sm:flex-row gap-2">
                                <select id="report-period" class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green text-sm">
                                    <option value="today">Today</option>
                                    <option value="week">This Week</option>
                                    <option value="month">This Month</option>
                                    <option value="custom">Custom Range</option>
                                </select>
                                <div id="custom-date-range" class="hidden flex gap-2">
                                    <input type="date" id="start-date" class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green text-sm">
                                    <input type="date" id="end-date" class="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green text-sm">
                                </div>
                                <div class="flex gap-2">
                                    <button onclick="refreshReports()" class="bg-mpesa-blue hover:bg-mpesa-dark-blue text-white px-4 py-2 rounded-lg text-sm">
                                        <i class="fas fa-sync-alt mr-2"></i>Refresh
                                    </button>
                                    <button onclick="exportReportsData('csv')" class="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm">
                                        <i class="fas fa-file-csv mr-2"></i>CSV
                                    </button>
                                    <button onclick="exportReportsData('pdf')" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm">
                                        <i class="fas fa-file-pdf mr-2"></i>PDF
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- Key Metrics Cards -->
                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                        <div class="bg-white rounded-lg card-shadow p-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-600 text-sm font-medium">Total Revenue</p>
                                    <p class="text-2xl font-bold text-mpesa-dark-green" id="report-total-revenue">KSh 0</p>
                                </div>
                                <i class="fas fa-money-bill-wave text-3xl text-mpesa-green"></i>
                            </div>
                        </div>
                        
                        <div class="bg-white rounded-lg card-shadow p-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-600 text-sm font-medium">M-Pesa Revenue</p>
                                    <p class="text-2xl font-bold text-green-600" id="report-mpesa-revenue">KSh 0</p>
                                </div>
                                <i class="fas fa-mobile-alt text-3xl text-green-500"></i>
                            </div>
                        </div>
                        
                        <div class="bg-white rounded-lg card-shadow p-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-600 text-sm font-medium">Cash Revenue</p>
                                    <p class="text-2xl font-bold text-blue-600" id="report-cash-revenue">KSh 0</p>
                                </div>
                                <i class="fas fa-coins text-3xl text-blue-500"></i>
                            </div>
                        </div>
                        
                        <div class="bg-white rounded-lg card-shadow p-6">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-gray-600 text-sm font-medium">Transactions</p>
                                    <p class="text-2xl font-bold text-gray-800" id="report-transaction-count">0</p>
                                </div>
                                <i class="fas fa-receipt text-3xl text-gray-500"></i>
                            </div>
                        </div>
                    </div>

                    <!-- Charts Section -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        <!-- Revenue Breakdown Chart -->
                        <div class="bg-white rounded-lg card-shadow p-6">
                            <h3 class="text-lg font-semibold text-gray-800 mb-4">
                                <i class="fas fa-chart-pie mr-2 text-mpesa-blue"></i>
                                Revenue Sources
                            </h3>
                            <div class="relative" style="height: 300px;">
                                <canvas id="revenue-chart"></canvas>
                            </div>
                        </div>

                        <!-- Transaction Types Chart -->
                        <div class="bg-white rounded-lg card-shadow p-6">
                            <h3 class="text-lg font-semibold text-gray-800 mb-4">
                                <i class="fas fa-chart-bar mr-2 text-mpesa-green"></i>
                                Transaction Volume
                            </h3>
                            <div class="relative" style="height: 300px;">
                                <canvas id="volume-chart"></canvas>
                            </div>
                        </div>
                    </div>

                    <!-- Summary Tables -->
                    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                        <!-- Top Products -->
                        <div class="bg-white rounded-lg card-shadow p-6">
                            <h3 class="text-lg font-semibold text-gray-800 mb-4">
                                <i class="fas fa-star mr-2 text-yellow-500"></i>
                                Top Products/Services
                            </h3>
                            <div id="top-products" class="space-y-3">
                                <div class="text-gray-500 text-sm text-center py-4">Loading products data...</div>
                            </div>
                        </div>

                        <!-- Payment Methods -->
                        <div class="bg-white rounded-lg card-shadow p-6">
                            <h3 class="text-lg font-semibold text-gray-800 mb-4">
                                <i class="fas fa-credit-card mr-2 text-mpesa-blue"></i>
                                Payment Method Breakdown
                            </h3>
                            <div id="payment-methods" class="space-y-3">
                                <div class="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                                    <div class="flex items-center">
                                        <i class="fas fa-mobile-alt text-green-600 mr-2"></i>
                                        <span class="font-medium">M-Pesa</span>
                                    </div>
                                    <div class="text-right">
                                        <div class="font-bold text-green-600" id="mpesa-percentage">0%</div>
                                        <div class="text-sm text-gray-600" id="mpesa-amount">KSh 0</div>
                                    </div>
                                </div>
                                <div class="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                                    <div class="flex items-center">
                                        <i class="fas fa-coins text-blue-600 mr-2"></i>
                                        <span class="font-medium">Cash</span>
                                    </div>
                                    <div class="text-right">
                                        <div class="font-bold text-blue-600" id="cash-percentage">0%</div>
                                        <div class="text-sm text-gray-600" id="cash-amount">KSh 0</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- M-Pesa Fee Structure -->
                <div class="bg-white rounded-lg card-shadow p-6 mt-8">
                    <h2 class="text-xl font-semibold text-gray-800 mb-4">
                        <i class="fas fa-calculator mr-2 text-mpesa-blue"></i>
                        M-Pesa Fee Structure (Customer-to-Business)
                    </h2>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200">
                            <thead class="bg-gray-50">
                                <tr>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount Range</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer Fee</th>
                                    <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Business Fee</th>
                                </tr>
                            </thead>
                            <tbody id="fee-structure-table" class="bg-white divide-y divide-gray-200">
                                <!-- Fee structure will be loaded here -->
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <!-- Help Tab Content -->
            <div id="help-content" class="tab-content hidden">
                <div class="max-w-4xl mx-auto">
                    <div class="bg-white rounded-lg card-shadow p-6">
                        <h2 class="text-xl font-semibold text-gray-800 mb-6">
                            <i class="fas fa-question-circle mr-2 text-mpesa-blue"></i>
                            How to Use the M-Pesa Till Reconciliation System
                        </h2>
                        
                        <div class="space-y-8">
                            <!-- Quick Start Guide -->
                            <div>
                                <h3 class="text-lg font-semibold text-mpesa-dark-blue mb-4">
                                    <i class="fas fa-rocket mr-2"></i>Quick Start Guide (5 minutes daily)
                                </h3>
                                <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div class="text-center p-4 border rounded-lg">
                                        <div class="bg-mpesa-green text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <span class="font-bold text-lg">1</span>
                                        </div>
                                        <h4 class="font-semibold mb-2">Import SMS</h4>
                                        <p class="text-sm text-gray-600">Copy M-Pesa SMS messages and paste in SMS Import tab</p>
                                    </div>
                                    <div class="text-center p-4 border rounded-lg">
                                        <div class="bg-mpesa-blue text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <span class="font-bold text-lg">2</span>
                                        </div>
                                        <h4 class="font-semibold mb-2">Add Manual Entries</h4>
                                        <p class="text-sm text-gray-600">Enter cash sales and any missing transactions</p>
                                    </div>
                                    <div class="text-center p-4 border rounded-lg">
                                        <div class="bg-green-500 text-white w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3">
                                            <span class="font-bold text-lg">3</span>
                                        </div>
                                        <h4 class="font-semibold mb-2">Reconcile Cash</h4>
                                        <p class="text-sm text-gray-600">Count physical cash and check for variances</p>
                                    </div>
                                </div>
                            </div>

                            <!-- SMS Format Guide -->
                            <div>
                                <h3 class="text-lg font-semibold text-mpesa-dark-blue mb-4">
                                    <i class="fas fa-sms mr-2"></i>Supported SMS Formats
                                </h3>
                                <div class="bg-gray-50 p-4 rounded-lg">
                                    <p class="text-sm font-medium mb-2">The system automatically parses these M-Pesa SMS formats:</p>
                                    <div class="space-y-2 text-sm text-gray-700">
                                        <div class="font-mono bg-white p-2 rounded border">
                                            "NLJ7RT545 Confirmed. Ksh500.00 received from JOHN KAMAU 254722123456. Account balance is Ksh15,430.00. Transaction cost, Ksh0.00. Time: 14/01/25 2:15 PM"
                                        </div>
                                        <p><strong>Extracted:</strong> Amount (500.00), Customer (JOHN KAMAU), Reference (NLJ7RT545), Time (2:15 PM)</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Features Overview -->
                            <div>
                                <h3 class="text-lg font-semibold text-mpesa-dark-blue mb-4">
                                    <i class="fas fa-star mr-2"></i>Key Features
                                </h3>
                                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <ul class="space-y-2">
                                        <li class="flex items-center"><i class="fas fa-check text-mpesa-green mr-2"></i>Automatic SMS parsing</li>
                                        <li class="flex items-center"><i class="fas fa-check text-mpesa-green mr-2"></i>Real-time calculations</li>
                                        <li class="flex items-center"><i class="fas fa-check text-mpesa-green mr-2"></i>Variance detection</li>
                                        <li class="flex items-center"><i class="fas fa-check text-mpesa-green mr-2"></i>Duplicate prevention</li>
                                    </ul>
                                    <ul class="space-y-2">
                                        <li class="flex items-center"><i class="fas fa-check text-mpesa-green mr-2"></i>Mobile-friendly design</li>
                                        <li class="flex items-center"><i class="fas fa-check text-mpesa-green mr-2"></i>Daily/weekly reports</li>
                                        <li class="flex items-center"><i class="fas fa-check text-mpesa-green mr-2"></i>Fee calculations</li>
                                        <li class="flex items-center"><i class="fas fa-check text-mpesa-green mr-2"></i>Cash flow tracking</li>
                                    </ul>
                                </div>
                            </div>

                            <!-- Support Info -->
                            <div class="bg-mpesa-light-gray p-6 rounded-lg">
                                <h3 class="text-lg font-semibold text-mpesa-dark-blue mb-4">
                                    <i class="fas fa-life-ring mr-2"></i>Need Help?
                                </h3>
                                <p class="text-gray-700 mb-4">
                                    This system is designed to solve the daily challenge of reconciling M-Pesa transactions with cash book records. 
                                    It helps identify profit leakage and maintain accurate financial records for your business.
                                </p>
                                <div class="text-sm text-gray-600">
                                    <p><strong>Version:</strong> 1.0</p>
                                    <p><strong>Target Users:</strong> Kenyan retail kiosks, food cafés, and small businesses</p>
                                    <p><strong>Data Storage:</strong> All data is stored securely in your browser and cloud database</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Profile Tab Content -->
            <div id="profile-content" class="tab-content hidden">
                <div class="max-w-4xl mx-auto">
                    <!-- Profile Header -->
                    <div class="bg-white rounded-lg card-shadow p-6 mb-6">
                        <div class="flex items-center justify-between mb-6">
                            <h2 class="text-xl font-semibold text-gray-800">
                                <i class="fas fa-user-cog mr-2 text-mpesa-blue"></i>
                                Profile & Settings
                            </h2>
                            <button onclick="logout()" class="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors">
                                <i class="fas fa-sign-out-alt mr-2"></i>
                                Logout
                            </button>
                        </div>
                        
                        <!-- Business Information -->
                        <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            <div>
                                <h3 class="text-lg font-semibold text-gray-800 mb-4">
                                    <i class="fas fa-store mr-2 text-mpesa-green"></i>
                                    Business Information
                                </h3>
                                <form id="business-settings-form" class="space-y-4">
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Business Name</label>
                                        <input type="text" id="business-name" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="My Kiosk">
                                    </div>

                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Owner Name</label>
                                        <input type="text" id="owner-name" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="John Kamau">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                                        <input type="tel" id="phone-number" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="+254 712 345 678">
                                    </div>
                                    <div>
                                        <label class="block text-sm font-medium text-gray-700 mb-2">Daily Sales Target (KSh)</label>
                                        <input type="number" id="daily-target" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="5000">
                                    </div>
                                    <button type="submit" class="bg-mpesa-green hover:bg-mpesa-dark-green text-white px-6 py-2 rounded-lg transition-colors">
                                        <i class="fas fa-save mr-2"></i>
                                        Save Business Settings
                                    </button>
                                </form>
                            </div>
                            
                            <div>
                                <h3 class="text-lg font-semibold text-gray-800 mb-4">
                                    <i class="fas fa-box mr-2 text-mpesa-blue"></i>
                                    Product Management
                                </h3>
                                <div class="mb-4">
                                    <label class="block text-sm font-medium text-gray-700 mb-2">Add New Product/Service</label>
                                    <div class="flex gap-2">
                                        <input type="text" id="new-product-name" class="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-blue focus:border-transparent" placeholder="Product name">
                                        <button onclick="addProduct()" class="bg-mpesa-blue hover:bg-mpesa-dark-blue text-white px-4 py-2 rounded-lg transition-colors">
                                            <i class="fas fa-plus"></i>
                                        </button>
                                    </div>
                                </div>
                                
                                <!-- Products List -->
                                <div class="bg-gray-50 rounded-lg p-4">
                                    <h4 class="font-medium text-gray-800 mb-3">Your Products/Services</h4>
                                    <div id="products-list" class="space-y-2">
                                        <!-- Products will be loaded here -->
                                        <div class="text-gray-500 text-sm">No products added yet. Add your first product above.</div>
                                    </div>
                                </div>
                                
                                <!-- Quick Add Common Products -->
                                <div class="mt-4">
                                    <h4 class="font-medium text-gray-800 mb-3">Quick Add Common Items</h4>
                                    <div class="flex flex-wrap gap-2">
                                        <button onclick="addProduct('Soda')" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-full text-sm transition-colors">Soda</button>
                                        <button onclick="addProduct('Bread')" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-full text-sm transition-colors">Bread</button>
                                        <button onclick="addProduct('Milk')" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-full text-sm transition-colors">Milk</button>
                                        <button onclick="addProduct('Airtime')" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-full text-sm transition-colors">Airtime</button>
                                        <button onclick="addProduct('Sugar')" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-full text-sm transition-colors">Sugar</button>
                                        <button onclick="addProduct('Tea Leaves')" class="px-3 py-1 bg-gray-200 hover:bg-gray-300 rounded-full text-sm transition-colors">Tea Leaves</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- Additional Settings -->
                    <div class="bg-white rounded-lg card-shadow p-6">
                        <h3 class="text-lg font-semibold text-gray-800 mb-4">
                            <i class="fas fa-cogs mr-2 text-gray-600"></i>
                            System Settings
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Variance Alert Threshold (KSh)</label>
                                <input type="number" id="alert-threshold" class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent" placeholder="100">
                                <p class="text-xs text-gray-500 mt-1">Alert when cash variance exceeds this amount</p>
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-2">Data Export</label>
                                <div class="space-y-2">
                                    <button onclick="exportData('csv')" class="w-full bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg transition-colors">
                                        <i class="fas fa-file-csv mr-2"></i>
                                        Export to CSV
                                    </button>
                                    <button onclick="exportData('pdf')" class="w-full bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg transition-colors">
                                        <i class="fas fa-file-pdf mr-2"></i>
                                        Export to PDF
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- Loading Overlay -->
        <div id="loading-overlay" class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center hidden z-50">
            <div class="bg-white p-6 rounded-lg flex items-center space-x-4">
                <i class="fas fa-spinner fa-spin text-2xl text-mpesa-blue"></i>
                <span class="text-lg font-medium">Processing...</span>
            </div>
        </div>

        <!-- Success Toast -->
        <div id="success-toast" class="fixed top-4 right-4 bg-mpesa-green text-white px-6 py-4 rounded-lg shadow-lg hidden z-40">
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-2"></i>
                <span id="success-message">Operation completed successfully!</span>
            </div>
        </div>

        <!-- Error Toast -->
        <div id="error-toast" class="fixed top-4 right-4 bg-mpesa-red text-white px-6 py-4 rounded-lg shadow-lg hidden z-40">
            <div class="flex items-center">
                <i class="fas fa-exclamation-circle mr-2"></i>
                <span id="error-message">An error occurred!</span>
            </div>
        </div>

        <script src="/static/app.js"></script>
    </body>
    </html>
    `)

})

// Login page route (if accessed directly)
app.get('/login', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>TillSync - Login</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                colors: {
                  'mpesa': {
                    'green': '#00d13b',
                    'dark-green': '#00a82f',
                    'blue': '#0066cc',
                    'dark-blue': '#004d99'
                  }
                }
              }
            }
          }
        </script>
    </head>
    <body class="bg-gray-50 min-h-screen flex items-center justify-center">
        <div class="max-w-md w-full">
            <div class="bg-white rounded-lg shadow-lg p-8">
                <div class="text-center mb-8">
                    <h1 class="text-3xl font-bold text-gray-800 mb-2">TillSync</h1>
                    <p class="text-gray-600">M-Pesa Till Reconciliation System</p>
                </div>
                
                <form id="loginForm" class="space-y-6">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Username</label>
                        <input type="text" id="username" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="demo">
                    </div>
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                        <input type="password" id="password" required class="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="demo">
                    </div>
                    <button type="submit" class="w-full bg-mpesa-green hover:bg-mpesa-dark-green text-white py-2 px-4 rounded-lg transition-colors">
                        Login
                    </button>
                </form>
                
                <div class="mt-6 text-center">
                    <p class="text-sm text-gray-500">Demo credentials: demo / demo</p>
                </div>
            </div>
        </div>
        
        <script>
          document.getElementById('loginForm').addEventListener('submit', async (e) => {
            e.preventDefault()
            
            const username = document.getElementById('username').value
            const password = document.getElementById('password').value
            
            try {
              const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
              })
              
              const result = await response.json()
              
              if (result.success) {
                window.location.href = '/'
              } else {
                alert('Login failed: ' + result.error)
              }
            } catch (error) {
              alert('Network error: ' + error.message)
            }
          })
        </script>
    </body>
    </html>
  `)
})

export default app