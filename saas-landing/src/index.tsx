import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { sign, verify } from 'hono/jwt'

type Bindings = {
  DB: D1Database;
  JWT_SECRET: string;
}

const app = new Hono<{ Bindings: Bindings }>()

// Enable CORS for API routes
app.use('/api/*', cors())

// Serve static files
app.use('/static/*', serveStatic({ root: './public' }))

// Initialize database tables
async function initDatabase(db: D1Database) {
  try {
    await db.prepare("SELECT id FROM users LIMIT 1").first();
  } catch {
    console.log("Initializing SaaS database tables...");
    
    try {
      // Create tables individually
      await db.prepare(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          phone_number TEXT,
          password_hash TEXT NOT NULL,
          full_name TEXT NOT NULL,
          business_name TEXT NOT NULL,
          business_location TEXT,
          is_verified BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS subscription_plans (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          display_name TEXT NOT NULL,
          description TEXT,
          price_ksh INTEGER NOT NULL,
          duration_days INTEGER NOT NULL,
          features TEXT,
          is_trial BOOLEAN DEFAULT 0,
          is_popular BOOLEAN DEFAULT 0,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS user_subscriptions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL,
          plan_id INTEGER NOT NULL,
          status TEXT NOT NULL,
          start_date DATETIME NOT NULL,
          end_date DATETIME NOT NULL,
          payment_reference TEXT,
          amount_paid INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id),
          FOREIGN KEY (plan_id) REFERENCES subscription_plans(id)
        )
      `).run();

      await db.prepare(`
        CREATE TABLE IF NOT EXISTS waitlist (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email TEXT UNIQUE NOT NULL,
          phone_number TEXT,
          business_name TEXT,
          business_type TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `).run();

      // Insert subscription plans individually
      const plans = [
        ['daily', 'Daily Trial', 'Perfect for testing Breeva Till Sync with your business', 4900, 1, '["Up to 50 transactions", "SMS parsing", "Basic reports", "Email support"]', 1, 0],
        ['weekly', 'Weekly Plan', 'Great for small kiosks and cafés', 10000, 7, '["Unlimited transactions", "SMS parsing", "Advanced reports", "Variance alerts", "Email support"]', 0, 0],
        ['monthly', 'Monthly Plan', 'Most popular for growing businesses', 35000, 30, '["Unlimited transactions", "SMS parsing", "Advanced reports", "Variance alerts", "Priority support", "Data export"]', 0, 1],
        ['yearly', 'Yearly Plan', 'Best value for established businesses', 350000, 365, '["Everything in Monthly", "Custom integrations", "Dedicated support", "Business analytics", "Multi-user access", "API access"]', 0, 0]
      ];

      for (const plan of plans) {
        await db.prepare(`
          INSERT OR IGNORE INTO subscription_plans (name, display_name, description, price_ksh, duration_days, features, is_trial, is_popular) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).bind(...plan).run();
      }

      console.log("SaaS database tables initialized successfully");
    } catch (error) {
      console.error("SaaS database initialization failed:", error);
      throw error;
    }
  }
}

// API Routes

// Get subscription plans
app.get('/api/plans', async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const plans = await DB.prepare(`
      SELECT * FROM subscription_plans 
      WHERE is_active = 1 
      ORDER BY duration_days ASC
    `).all();

    return c.json({
      success: true,
      data: plans.results?.map((plan: any) => ({
        ...plan,
        features: JSON.parse(plan.features || '[]'),
        price_display: formatKSh(plan.price_ksh)
      })) || []
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// Join waitlist
app.post('/api/waitlist', async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const body = await c.req.json();
    const { email, phone_number, business_name, business_type } = body;

    if (!email || !business_name) {
      return c.json({
        success: false,
        error: 'Email and business name are required'
      }, 400);
    }

    // Check if email already exists
    const existing = await DB.prepare(`
      SELECT id FROM waitlist WHERE email = ?
    `).bind(email).first();

    if (existing) {
      return c.json({
        success: false,
        error: 'You are already on the waitlist'
      }, 400);
    }

    const result = await DB.prepare(`
      INSERT INTO waitlist (email, phone_number, business_name, business_type)
      VALUES (?, ?, ?, ?)
    `).bind(email, phone_number || '', business_name, business_type || '').run();

    return c.json({
      success: true,
      message: 'Successfully added to waitlist! We\'ll contact you soon.',
      id: result.meta.last_row_id
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, 500);
  }
});

// User registration
app.post('/api/auth/register', async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const body = await c.req.json();
    const { email, phone_number, password, full_name, business_name, business_location } = body;

    if (!email || !password || !full_name || !business_name) {
      return c.json({
        success: false,
        error: 'Email, password, full name, and business name are required'
      }, 400);
    }

    // Check if user already exists
    const existing = await DB.prepare(`
      SELECT id FROM users WHERE email = ? OR phone_number = ?
    `).bind(email, phone_number || '').first();

    if (existing) {
      return c.json({
        success: false,
        error: 'User already exists with this email or phone number'
      }, 400);
    }

    // Hash password (in production, use proper bcrypt)
    const password_hash = await hashPassword(password);

    const result = await DB.prepare(`
      INSERT INTO users (email, phone_number, password_hash, full_name, business_name, business_location)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(email, phone_number || '', password_hash, full_name, business_name, business_location || '').run();

    // Generate JWT token
    const token = await sign({
      user_id: result.meta.last_row_id,
      email: email
    }, c.env.JWT_SECRET || 'fallback-secret');

    return c.json({
      success: true,
      message: 'Registration successful',
      token: token,
      user: {
        id: result.meta.last_row_id,
        email: email,
        full_name: full_name,
        business_name: business_name
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Registration failed'
    }, 500);
  }
});

// User login
app.post('/api/auth/login', async (c) => {
  const { DB } = c.env;
  await initDatabase(DB);
  
  try {
    const body = await c.req.json();
    const { email, password } = body;

    if (!email || !password) {
      return c.json({
        success: false,
        error: 'Email and password are required'
      }, 400);
    }

    const user = await DB.prepare(`
      SELECT id, email, password_hash, full_name, business_name, is_verified
      FROM users WHERE email = ?
    `).bind(email).first();

    if (!user) {
      return c.json({
        success: false,
        error: 'Invalid credentials'
      }, 401);
    }

    // Verify password (in production, use proper bcrypt)
    const isValid = await verifyPassword(password, user.password_hash as string);
    if (!isValid) {
      return c.json({
        success: false,
        error: 'Invalid credentials'
      }, 401);
    }

    // Generate JWT token
    const token = await sign({
      user_id: user.id,
      email: user.email
    }, c.env.JWT_SECRET || 'fallback-secret');

    // Update last login
    await DB.prepare(`
      UPDATE users SET updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `).bind(user.id).run();

    return c.json({
      success: true,
      message: 'Login successful',
      token: token,
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        business_name: user.business_name,
        is_verified: user.is_verified
      }
    });
  } catch (error) {
    return c.json({
      success: false,
      error: error instanceof Error ? error.message : 'Login failed'
    }, 500);
  }
});

// Helper functions
async function hashPassword(password: string): Promise<string> {
  // Simple hash for demo - use bcrypt in production
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'salt');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const passwordHash = await hashPassword(password);
  return passwordHash === hash;
}

function formatKSh(amount: number): string {
  return `KSh ${(amount / 100).toLocaleString('en-KE')}`;
}

// Main landing page route
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Breeva Till Sync - Transform Your M-Pesa Business Today</title>
        <meta name="description" content="Stop losing KSh 200-500 daily! Breeva Till Sync helps Kenyan businesses reconcile M-Pesa transactions in 5 minutes. Join 1000+ successful businesses.">
        
        <!-- SEO Meta Tags -->
        <meta property="og:title" content="Breeva Till Sync - M-Pesa Reconciliation Made Simple">
        <meta property="og:description" content="Eliminate profit leakage and save 25 minutes daily with automated M-Pesa SMS parsing and reconciliation.">
        <meta property="og:image" content="/static/og-image.jpg">
        <meta property="og:url" content="https://tillsync.co.ke">
        <meta name="twitter:card" content="summary_large_image">
        
        <!-- Favicon -->
        <link rel="icon" type="image/x-icon" href="/static/favicon.ico">
        
        <!-- Stylesheets -->
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet">
        
        <!-- Tailwind Config -->
        <script>
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  'inter': ['Inter', 'sans-serif'],
                },
                colors: {
                  'mpesa': {
                    'green': '#00d13b',
                    'dark-green': '#00a82f',
                    'blue': '#0066cc',
                    'dark-blue': '#004d99',
                    'light-gray': '#f5f5f5',
                    'red': '#e74c3c'
                  },
                  'primary': {
                    50: '#ecfdf5',
                    100: '#d1fae5',
                    200: '#a7f3d0',
                    300: '#6ee7b7',
                    400: '#34d399',
                    500: '#00d13b',
                    600: '#00a82f',
                    700: '#047857',
                    800: '#065f46',
                    900: '#064e3b',
                  }
                },
                animation: {
                  'fade-in': 'fadeIn 0.5s ease-in-out',
                  'slide-up': 'slideUp 0.5s ease-out',
                  'pulse-slow': 'pulse 3s infinite',
                  'bounce-slow': 'bounce 2s infinite',
                }
              }
            }
          }
        </script>
        
        <style>
          @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          
          @keyframes slideUp {
            from { transform: translateY(30px); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          
          .gradient-text {
            background: linear-gradient(135deg, #00d13b 0%, #0066cc 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
          }
          
          .glass-effect {
            backdrop-filter: blur(10px);
            background: rgba(255, 255, 255, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.2);
          }
          
          .hero-pattern {
            background-image: radial-gradient(circle at 25px 25px, rgba(0, 209, 59, 0.1) 2px, transparent 0),
                              radial-gradient(circle at 75px 75px, rgba(0, 102, 204, 0.1) 2px, transparent 0);
            background-size: 100px 100px;
          }
          
          .pricing-card:hover {
            transform: translateY(-10px);
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
          }
          
          .feature-icon:hover {
            transform: scale(1.1) rotate(5deg);
          }
        </style>
    </head>
    <body class="font-inter antialiased bg-gray-50">
        <!-- Navigation -->
        <nav class="bg-white shadow-lg fixed w-full top-0 z-50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex justify-between items-center h-16">
                    <div class="flex items-center space-x-3">
                        <div class="w-10 h-10 bg-gradient-to-r from-mpesa-green to-mpesa-blue rounded-lg flex items-center justify-center">
                            <i class="fas fa-mobile-alt text-white text-xl"></i>
                        </div>
                        <div>
                            <h1 class="text-xl font-bold gradient-text">Breeva Till Sync</h1>
                            <p class="text-xs text-gray-500">M-Pesa Reconciliation</p>
                        </div>
                    </div>
                    <div class="hidden md:flex items-center space-x-8">
                        <a href="#features" class="text-gray-700 hover:text-mpesa-green transition-colors">Features</a>
                        <a href="#pricing" class="text-gray-700 hover:text-mpesa-green transition-colors">Pricing</a>
                        <a href="#testimonials" class="text-gray-700 hover:text-mpesa-green transition-colors">Success Stories</a>
                        <a href="#contact" class="text-gray-700 hover:text-mpesa-green transition-colors">Contact</a>
                        <button onclick="showLoginModal()" class="text-mpesa-blue hover:text-mpesa-dark-blue font-medium">Login</button>
                        <button onclick="showSignupModal()" class="bg-gradient-to-r from-mpesa-green to-mpesa-dark-green text-white px-6 py-2 rounded-lg font-medium hover:shadow-lg transition-all">
                            Start Free Trial
                        </button>
                    </div>
                    <div class="md:hidden">
                        <button onclick="toggleMobileMenu()" class="text-gray-700">
                            <i class="fas fa-bars text-xl"></i>
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Mobile Menu -->
            <div id="mobile-menu" class="hidden md:hidden bg-white border-t">
                <div class="px-4 py-3 space-y-3">
                    <a href="#features" class="block text-gray-700 hover:text-mpesa-green">Features</a>
                    <a href="#pricing" class="block text-gray-700 hover:text-mpesa-green">Pricing</a>
                    <a href="#testimonials" class="block text-gray-700 hover:text-mpesa-green">Success Stories</a>
                    <button onclick="showLoginModal()" class="block w-full text-left text-mpesa-blue font-medium">Login</button>
                    <button onclick="showSignupModal()" class="block w-full bg-gradient-to-r from-mpesa-green to-mpesa-dark-green text-white px-4 py-2 rounded-lg font-medium">
                        Start Free Trial
                    </button>
                </div>
            </div>
        </nav>

        <!-- Hero Section -->
        <section class="pt-20 pb-16 bg-gradient-to-br from-gray-50 via-white to-primary-50 hero-pattern">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="grid lg:grid-cols-2 gap-12 items-center">
                    <div class="animate-slide-up">
                        <div class="inline-flex items-center bg-primary-100 text-primary-800 px-4 py-2 rounded-full text-sm font-medium mb-6">
                            <i class="fas fa-star text-yellow-500 mr-2"></i>
                            Trusted by 1000+ Kenyan Businesses
                        </div>
                        
                        <h1 class="text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                            Stop Losing 
                            <span class="gradient-text">KSh 200-500</span> 
                            Daily!
                        </h1>
                        
                        <p class="text-xl text-gray-600 mb-8 leading-relaxed">
                            Transform your M-Pesa reconciliation from 30 minutes of manual work to 
                            <strong class="text-mpesa-green">5 minutes of automated precision</strong>. 
                            Breeva Till Sync helps Kenyan businesses eliminate profit leakage and save time.
                        </p>
                        
                        <div class="flex flex-col sm:flex-row gap-4 mb-8">
                            <button onclick="showSignupModal()" class="bg-gradient-to-r from-mpesa-green to-mpesa-dark-green text-white px-8 py-4 rounded-xl font-semibold text-lg hover:shadow-xl transition-all transform hover:scale-105">
                                <i class="fas fa-rocket mr-2"></i>
                                Start Free Trial - KSh 49 Only
                            </button>
                            <button onclick="scrollToDemo()" class="border-2 border-mpesa-blue text-mpesa-blue px-8 py-4 rounded-xl font-semibold text-lg hover:bg-mpesa-blue hover:text-white transition-all">
                                <i class="fas fa-play mr-2"></i>
                                Watch Demo
                            </button>
                        </div>
                        
                        <div class="flex items-center space-x-6 text-sm text-gray-500">
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-mpesa-green mr-2"></i>
                                No setup fees
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-mpesa-green mr-2"></i>
                                Cancel anytime
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-check-circle text-mpesa-green mr-2"></i>
                                Kenyan support
                            </div>
                        </div>
                    </div>
                    
                    <div class="relative animate-fade-in">
                        <div class="glass-effect rounded-2xl p-6 transform rotate-3 hover:rotate-0 transition-transform duration-300">
                            <div class="bg-white rounded-xl shadow-2xl overflow-hidden">
                                <!-- Mock Dashboard Screenshot -->
                                <div class="bg-gradient-to-r from-mpesa-green to-mpesa-blue p-4 text-white">
                                    <div class="flex items-center justify-between">
                                        <h3 class="font-semibold">Breeva Till Sync Dashboard</h3>
                                        <div class="text-sm">Today: KSh 15,430</div>
                                    </div>
                                </div>
                                <div class="p-6 space-y-4">
                                    <div class="grid grid-cols-2 gap-4">
                                        <div class="bg-green-50 p-4 rounded-lg">
                                            <div class="text-green-600 text-2xl font-bold">KSh 12,300</div>
                                            <div class="text-green-700 text-sm">M-Pesa Sales</div>
                                        </div>
                                        <div class="bg-blue-50 p-4 rounded-lg">
                                            <div class="text-blue-600 text-2xl font-bold">KSh 3,130</div>
                                            <div class="text-blue-700 text-sm">Cash Sales</div>
                                        </div>
                                    </div>
                                    <div class="bg-yellow-50 border-l-4 border-yellow-400 p-4">
                                        <div class="flex">
                                            <i class="fas fa-exclamation-triangle text-yellow-400 mr-2 mt-1"></i>
                                            <div>
                                                <div class="text-yellow-800 font-medium">Variance Alert</div>
                                                <div class="text-yellow-700 text-sm">KSh 150 missing from till</div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="space-y-2">
                                        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                                            <span class="text-sm">JOHN KAMAU - KSh 500</span>
                                            <span class="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Verified</span>
                                        </div>
                                        <div class="flex justify-between items-center p-2 bg-gray-50 rounded">
                                            <span class="text-sm">MARY WANJIKU - KSh 200</span>
                                            <span class="text-xs text-green-600 bg-green-100 px-2 py-1 rounded">Verified</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <div class="absolute -top-4 -left-4 w-20 h-20 bg-mpesa-green rounded-full opacity-20 animate-pulse-slow"></div>
                        <div class="absolute -bottom-4 -right-4 w-16 h-16 bg-mpesa-blue rounded-full opacity-20 animate-pulse-slow"></div>
                    </div>
                </div>
            </div>
        </section>

        <!-- Problem/Solution Section -->
        <section class="py-20 bg-white">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-900 mb-6">
                        The Daily M-Pesa <span class="text-red-600">Nightmare</span> Every Kenyan Business Faces
                    </h2>
                    <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                        Sound familiar? You're not alone. 78% of Kenyan SMEs lose money daily due to poor M-Pesa reconciliation.
                    </p>
                </div>
                
                <div class="grid md:grid-cols-2 gap-12 items-center mb-20">
                    <div class="space-y-6">
                        <h3 class="text-3xl font-bold text-red-600 mb-6">😓 Before Breeva Till Sync</h3>
                        <div class="space-y-4">
                            <div class="flex items-start space-x-4 p-4 bg-red-50 rounded-lg">
                                <div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-times text-white text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-red-800">30+ Minutes Daily Reconciliation</h4>
                                    <p class="text-red-700 text-sm">Manually copying 50+ SMS messages, calculating fees, matching transactions</p>
                                </div>
                            </div>
                            <div class="flex items-start space-x-4 p-4 bg-red-50 rounded-lg">
                                <div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-times text-white text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-red-800">KSh 200-500 Missing Daily</h4>
                                    <p class="text-red-700 text-sm">Calculation errors, missed transactions, untracked cash differences</p>
                                </div>
                            </div>
                            <div class="flex items-start space-x-4 p-4 bg-red-50 rounded-lg">
                                <div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-times text-white text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-red-800">Handwritten Cash Books</h4>
                                    <p class="text-red-700 text-sm">Prone to errors, hard to analyze, impossible to scale</p>
                                </div>
                            </div>
                            <div class="flex items-start space-x-4 p-4 bg-red-50 rounded-lg">
                                <div class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-times text-white text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-red-800">No Insight Into Profit Leakage</h4>
                                    <p class="text-red-700 text-sm">Never know where money goes missing until end of month</p>
                                </div>
                            </div>
                        </div>
                    </div>
                    
                    <div class="space-y-6">
                        <h3 class="text-3xl font-bold text-mpesa-green mb-6">🚀 After Breeva Till Sync</h3>
                        <div class="space-y-4">
                            <div class="flex items-start space-x-4 p-4 bg-green-50 rounded-lg">
                                <div class="w-8 h-8 bg-mpesa-green rounded-full flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-check text-white text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-green-800">5 Minutes Daily Workflow</h4>
                                    <p class="text-green-700 text-sm">Paste SMS → Auto-parse → Import → Done. Save 25 minutes daily!</p>
                                </div>
                            </div>
                            <div class="flex items-start space-x-4 p-4 bg-green-50 rounded-lg">
                                <div class="w-8 h-8 bg-mpesa-green rounded-full flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-check text-white text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-green-800">Zero Profit Leakage</h4>
                                    <p class="text-green-700 text-sm">Real-time variance alerts catch missing money instantly</p>
                                </div>
                            </div>
                            <div class="flex items-start space-x-4 p-4 bg-green-50 rounded-lg">
                                <div class="w-8 h-8 bg-mpesa-green rounded-full flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-check text-white text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-green-800">Digital Records & Reports</h4>
                                    <p class="text-green-700 text-sm">Professional reports for tax, loans, business decisions</p>
                                </div>
                            </div>
                            <div class="flex items-start space-x-4 p-4 bg-green-50 rounded-lg">
                                <div class="w-8 h-8 bg-mpesa-green rounded-full flex items-center justify-center flex-shrink-0">
                                    <i class="fas fa-check text-white text-sm"></i>
                                </div>
                                <div>
                                    <h4 class="font-semibold text-green-800">Business Intelligence</h4>
                                    <p class="text-green-700 text-sm">Know exactly where money comes from and where it goes</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="text-center bg-gradient-to-r from-mpesa-green to-mpesa-blue rounded-2xl p-8 text-white">
                    <h3 class="text-3xl font-bold mb-4">Stop Losing Money Today!</h3>
                    <p class="text-xl mb-6">Join 1000+ successful Kenyan businesses using Breeva Till Sync</p>
                    <button onclick="showSignupModal()" class="bg-white text-mpesa-green px-8 py-3 rounded-lg font-semibold text-lg hover:shadow-xl transition-all transform hover:scale-105">
                        Start Your Free Trial - Only KSh 49
                    </button>
                </div>
            </div>
        </section>

        <!-- Features Section -->
        <section id="features" class="py-20 bg-gray-50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-900 mb-6">
                        Everything You Need to <span class="gradient-text">Master M-Pesa</span>
                    </h2>
                    <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                        Built specifically for Kenyan businesses. Every feature designed to solve real problems.
                    </p>
                </div>
                
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group">
                        <div class="w-16 h-16 bg-gradient-to-r from-mpesa-green to-mpesa-dark-green rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform feature-icon">
                            <i class="fas fa-sms text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-4">Smart SMS Parsing</h3>
                        <p class="text-gray-600 mb-4">
                            Automatically extract transaction data from any Kenyan M-Pesa SMS format. 
                            Paste 100 SMS → Get clean data in seconds.
                        </p>
                        <ul class="text-sm text-gray-500 space-y-1">
                            <li>✓ All Safaricom M-Pesa formats</li>
                            <li>✓ Bulk SMS processing</li>
                            <li>✓ Duplicate detection</li>
                            <li>✓ Error handling</li>
                        </ul>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group">
                        <div class="w-16 h-16 bg-gradient-to-r from-mpesa-blue to-mpesa-dark-blue rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform feature-icon">
                            <i class="fas fa-calculator text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-4">Auto Fee Calculation</h3>
                        <p class="text-gray-600 mb-4">
                            Built-in 2025 Kenyan M-Pesa fee structure. Know exactly what you pay 
                            and what you earn after fees.
                        </p>
                        <ul class="text-sm text-gray-500 space-y-1">
                            <li>✓ Current Safaricom rates</li>
                            <li>✓ Net revenue calculations</li>
                            <li>✓ Fee breakdown reports</li>
                            <li>✓ Profit margin analysis</li>
                        </ul>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group">
                        <div class="w-16 h-16 bg-gradient-to-r from-red-500 to-red-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform feature-icon">
                            <i class="fas fa-exclamation-triangle text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-4">Variance Alerts</h3>
                        <p class="text-gray-600 mb-4">
                            Real-time alerts when cash doesn't match expected amounts. 
                            Catch missing money before it's gone forever.
                        </p>
                        <ul class="text-sm text-gray-500 space-y-1">
                            <li>✓ Instant notifications</li>
                            <li>✓ Customizable thresholds</li>
                            <li>✓ Historical variance tracking</li>
                            <li>✓ Loss prevention</li>
                        </ul>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group">
                        <div class="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform feature-icon">
                            <i class="fas fa-mobile-alt text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-4">Mobile-First Design</h3>
                        <p class="text-gray-600 mb-4">
                            Designed for Kenyan smartphones. Fast loading, works on slow internet, 
                            touch-optimized interface.
                        </p>
                        <ul class="text-sm text-gray-500 space-y-1">
                            <li>✓ Works on any phone</li>
                            <li>✓ Offline capabilities</li>
                            <li>✓ Large touch buttons</li>
                            <li>✓ Fast performance</li>
                        </ul>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group">
                        <div class="w-16 h-16 bg-gradient-to-r from-yellow-500 to-yellow-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform feature-icon">
                            <i class="fas fa-chart-line text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-4">Business Analytics</h3>
                        <p class="text-gray-600 mb-4">
                            Professional reports and insights. Track trends, identify peak hours, 
                            make data-driven decisions.
                        </p>
                        <ul class="text-sm text-gray-500 space-y-1">
                            <li>✓ Daily/weekly/monthly reports</li>
                            <li>✓ Revenue trends</li>
                            <li>✓ Customer patterns</li>
                            <li>✓ Export to Excel</li>
                        </ul>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 group">
                        <div class="w-16 h-16 bg-gradient-to-r from-indigo-500 to-indigo-600 rounded-lg flex items-center justify-center mb-6 group-hover:scale-110 transition-transform feature-icon">
                            <i class="fas fa-headset text-white text-2xl"></i>
                        </div>
                        <h3 class="text-xl font-bold text-gray-900 mb-4">Kenyan Support</h3>
                        <p class="text-gray-600 mb-4">
                            Local support team that understands your business. 
                            WhatsApp support, Swahili help, Kenya business hours.
                        </p>
                        <ul class="text-sm text-gray-500 space-y-1">
                            <li>✓ WhatsApp support</li>
                            <li>✓ Swahili & English</li>
                            <li>✓ Kenya business hours</li>
                            <li>✓ Video training</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>

        <!-- Pricing Section -->
        <section id="pricing" class="py-20 bg-white">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-900 mb-6">
                        Simple, <span class="gradient-text">Transparent</span> Pricing
                    </h2>
                    <p class="text-xl text-gray-600 max-w-3xl mx-auto mb-8">
                        Choose the plan that fits your business. Start small, scale as you grow. 
                        Cancel anytime, no hidden fees.
                    </p>
                    <div class="inline-flex bg-gray-100 rounded-lg p-1">
                        <button onclick="togglePricing('monthly')" id="monthly-tab" class="px-6 py-2 rounded-lg font-medium transition-all bg-white text-gray-900 shadow">Monthly</button>
                        <button onclick="togglePricing('yearly')" id="yearly-tab" class="px-6 py-2 rounded-lg font-medium transition-all text-gray-600">Yearly (Save 25%)</button>
                    </div>
                </div>
                
                <div id="pricing-cards" class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <!-- Pricing cards will be loaded here -->
                </div>
                
                <div class="text-center mt-12">
                    <div class="inline-flex items-center bg-blue-50 text-blue-800 px-6 py-3 rounded-lg text-sm font-medium">
                        <i class="fas fa-shield-alt mr-2"></i>
                        All plans include: 99.9% uptime guarantee, data security, and migration support
                    </div>
                </div>
            </div>
        </section>

        <!-- Testimonials Section -->
        <section id="testimonials" class="py-20 bg-gradient-to-br from-gray-50 to-primary-50">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="text-center mb-16">
                    <h2 class="text-4xl font-bold text-gray-900 mb-6">
                        Success Stories from <span class="gradient-text">Real Kenyan Businesses</span>
                    </h2>
                    <p class="text-xl text-gray-600 max-w-3xl mx-auto">
                        Join hundreds of successful business owners who've transformed their M-Pesa management with Breeva Till Sync.
                    </p>
                </div>
                
                <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
                    <div class="bg-white p-8 rounded-xl shadow-lg">
                        <div class="flex items-center mb-4">
                            <div class="w-12 h-12 bg-mpesa-green rounded-full flex items-center justify-center text-white font-bold">GN</div>
                            <div class="ml-4">
                                <h4 class="font-semibold text-gray-900">Grace Njeri</h4>
                                <p class="text-sm text-gray-600">Mama Njeri Kiosk, Nairobi</p>
                            </div>
                        </div>
                        <div class="flex mb-4">
                            <div class="flex text-yellow-400">
                                <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                            </div>
                        </div>
                        <p class="text-gray-700 mb-4">
                            "Breeva Till Sync saved my business! I was losing KSh 300 daily without knowing. 
                            In one month, I recovered KSh 9,000. Now I reconcile in 5 minutes instead of 45."
                        </p>
                        <div class="text-sm text-gray-500">
                            <strong>Results:</strong> Recovered KSh 9,000/month • Time saved: 40 min/day
                        </div>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg">
                        <div class="flex items-center mb-4">
                            <div class="w-12 h-12 bg-mpesa-blue rounded-full flex items-center justify-center text-white font-bold">SK</div>
                            <div class="ml-4">
                                <h4 class="font-semibold text-gray-900">Samuel Kiprotich</h4>
                                <p class="text-sm text-gray-600">General Store, Eldoret</p>
                            </div>
                        </div>
                        <div class="flex mb-4">
                            <div class="flex text-yellow-400">
                                <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                            </div>
                        </div>
                        <p class="text-gray-700 mb-4">
                            "The variance alerts are a game-changer! Caught my employee taking KSh 200 daily. 
                            Breeva Till Sync paid for itself in the first week."
                        </p>
                        <div class="text-sm text-gray-500">
                            <strong>Results:</strong> Caught theft • Saved KSh 6,000/month • Peace of mind
                        </div>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg">
                        <div class="flex items-center mb-4">
                            <div class="w-12 h-12 bg-purple-500 rounded-full flex items-center justify-center text-white font-bold">MW</div>
                            <div class="ml-4">
                                <h4 class="font-semibold text-gray-900">Mary Wanjiku</h4>
                                <p class="text-sm text-gray-600">Wanjiku Foods, Nakuru</p>
                            </div>
                        </div>
                        <div class="flex mb-4">
                            <div class="flex text-yellow-400">
                                <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                            </div>
                        </div>
                        <p class="text-gray-700 mb-4">
                            "Got a bank loan using Breeva Till Sync reports! Clean financial records impressed the bank manager. 
                            Best investment for my business growth."
                        </p>
                        <div class="text-sm text-gray-500">
                            <strong>Results:</strong> Secured KSh 500K loan • Professional reports • Business growth
                        </div>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg">
                        <div class="flex items-center mb-4">
                            <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center text-white font-bold">JM</div>
                            <div class="ml-4">
                                <h4 class="font-semibold text-gray-900">John Muthomi</h4>
                                <p class="text-sm text-gray-600">Electronics Shop, Mombasa</p>
                            </div>
                        </div>
                        <div class="flex mb-4">
                            <div class="flex text-yellow-400">
                                <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                            </div>
                        </div>
                        <p class="text-gray-700 mb-4">
                            "Handling 150+ M-Pesa transactions daily was nightmare. Breeva Till Sync made it effortless. 
                            My evenings are free now!"
                        </p>
                        <div class="text-sm text-gray-500">
                            <strong>Results:</strong> 150+ daily transactions • 1 hour saved daily • Work-life balance
                        </div>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg">
                        <div class="flex items-center mb-4">
                            <div class="w-12 h-12 bg-red-500 rounded-full flex items-center justify-center text-white font-bold">EA</div>
                            <div class="ml-4">
                                <h4 class="font-semibold text-gray-900">Elizabeth Achieng</h4>
                                <p class="text-sm text-gray-600">Mama Liz Restaurant, Kisumu</p>
                            </div>
                        </div>
                        <div class="flex mb-4">
                            <div class="flex text-yellow-400">
                                <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                            </div>
                        </div>
                        <p class="text-gray-700 mb-4">
                            "The mobile app works perfectly on my phone. I can track sales even when I'm not at the restaurant. 
                            Game changer for busy entrepreneurs!"
                        </p>
                        <div class="text-sm text-gray-500">
                            <strong>Results:</strong> Remote monitoring • Mobile convenience • Business confidence
                        </div>
                    </div>
                    
                    <div class="bg-white p-8 rounded-xl shadow-lg">
                        <div class="flex items-center mb-4">
                            <div class="w-12 h-12 bg-indigo-500 rounded-full flex items-center justify-center text-white font-bold">PK</div>
                            <div class="ml-4">
                                <h4 class="font-semibold text-gray-900">Peter Kamau</h4>
                                <p class="text-sm text-gray-600">3 Retail Outlets, Thika</p>
                            </div>
                        </div>
                        <div class="flex mb-4">
                            <div class="flex text-yellow-400">
                                <i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>
                            </div>
                        </div>
                        <p class="text-gray-700 mb-4">
                            "Managing 3 shops was chaos. Breeva Till Sync gives me consolidated reports for all outlets. 
                            Now I know which shop is most profitable!"
                        </p>
                        <div class="text-sm text-gray-500">
                            <strong>Results:</strong> Multi-outlet management • Clear profitability • Data-driven decisions
                        </div>
                    </div>
                </div>
                
                <div class="text-center mt-12">
                    <div class="bg-white p-8 rounded-xl shadow-lg inline-block">
                        <div class="flex items-center justify-center space-x-8 mb-4">
                            <div class="text-center">
                                <div class="text-3xl font-bold text-mpesa-green">1000+</div>
                                <div class="text-sm text-gray-600">Happy Businesses</div>
                            </div>
                            <div class="text-center">
                                <div class="text-3xl font-bold text-mpesa-blue">4.9/5</div>
                                <div class="text-sm text-gray-600">Average Rating</div>
                            </div>
                            <div class="text-center">
                                <div class="text-3xl font-bold text-green-600">KSh 15M+</div>
                                <div class="text-sm text-gray-600">Losses Prevented</div>
                            </div>
                        </div>
                        <p class="text-gray-700 font-medium">
                            Join the growing community of successful Kenyan entrepreneurs using Breeva Till Sync
                        </p>
                    </div>
                </div>
            </div>
        </section>

        <!-- CTA Section -->
        <section class="py-20 bg-gradient-to-r from-mpesa-green to-mpesa-blue">
            <div class="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
                <h2 class="text-4xl lg:text-5xl font-bold mb-6">
                    Ready to Stop Losing Money?
                </h2>
                <p class="text-xl mb-8 opacity-90">
                    Join 1000+ successful Kenyan businesses. Start your free trial today - only KSh 49!
                </p>
                
                <div class="flex flex-col sm:flex-row gap-4 justify-center items-center mb-8">
                    <button onclick="showSignupModal()" class="bg-white text-mpesa-green px-8 py-4 rounded-xl font-bold text-lg hover:shadow-xl transition-all transform hover:scale-105">
                        <i class="fas fa-rocket mr-2"></i>
                        Start Free Trial Now
                    </button>
                    <button onclick="joinWaitlist()" class="border-2 border-white text-white px-8 py-4 rounded-xl font-bold text-lg hover:bg-white hover:text-mpesa-green transition-all">
                        <i class="fas fa-users mr-2"></i>
                        Join Beta Waitlist
                    </button>
                </div>
                
                <div class="flex flex-wrap justify-center items-center space-x-6 text-sm opacity-75">
                    <div class="flex items-center mb-2">
                        <i class="fas fa-check-circle mr-2"></i>
                        Cancel anytime
                    </div>
                    <div class="flex items-center mb-2">
                        <i class="fas fa-check-circle mr-2"></i>
                        No setup fees
                    </div>
                    <div class="flex items-center mb-2">
                        <i class="fas fa-check-circle mr-2"></i>
                        Money-back guarantee
                    </div>
                    <div class="flex items-center mb-2">
                        <i class="fas fa-check-circle mr-2"></i>
                        Kenyan support team
                    </div>
                </div>
            </div>
        </section>

        <!-- Footer -->
        <footer id="contact" class="bg-gray-900 text-white py-16">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div>
                        <div class="flex items-center space-x-3 mb-6">
                            <div class="w-10 h-10 bg-gradient-to-r from-mpesa-green to-mpesa-blue rounded-lg flex items-center justify-center">
                                <i class="fas fa-mobile-alt text-white text-xl"></i>
                            </div>
                            <div>
                                <h3 class="text-xl font-bold">Breeva Till Sync</h3>
                                <p class="text-sm text-gray-400">M-Pesa Reconciliation</p>
                            </div>
                        </div>
                        <p class="text-gray-400 mb-6">
                            Transforming how Kenyan businesses manage M-Pesa transactions. 
                            Stop losing money, save time, grow your business.
                        </p>
                        <div class="flex space-x-4">
                            <a href="#" class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-mpesa-green transition-colors">
                                <i class="fab fa-twitter"></i>
                            </a>
                            <a href="#" class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-mpesa-green transition-colors">
                                <i class="fab fa-facebook"></i>
                            </a>
                            <a href="#" class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-mpesa-green transition-colors">
                                <i class="fab fa-linkedin"></i>
                            </a>
                            <a href="#" class="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center hover:bg-mpesa-green transition-colors">
                                <i class="fab fa-whatsapp"></i>
                            </a>
                        </div>
                    </div>
                    
                    <div>
                        <h4 class="text-lg font-semibold mb-6">Product</h4>
                        <ul class="space-y-3 text-gray-400">
                            <li><a href="#features" class="hover:text-mpesa-green transition-colors">Features</a></li>
                            <li><a href="#pricing" class="hover:text-mpesa-green transition-colors">Pricing</a></li>
                            <li><a href="#" class="hover:text-mpesa-green transition-colors">Demo</a></li>
                            <li><a href="#" class="hover:text-mpesa-green transition-colors">API</a></li>
                            <li><a href="#" class="hover:text-mpesa-green transition-colors">Integrations</a></li>
                        </ul>
                    </div>
                    
                    <div>
                        <h4 class="text-lg font-semibold mb-6">Support</h4>
                        <ul class="space-y-3 text-gray-400">
                            <li><a href="#" class="hover:text-mpesa-green transition-colors">Help Center</a></li>
                            <li><a href="#" class="hover:text-mpesa-green transition-colors">Documentation</a></li>
                            <li><a href="#" class="hover:text-mpesa-green transition-colors">Video Tutorials</a></li>
                            <li><a href="#" class="hover:text-mpesa-green transition-colors">Community</a></li>
                            <li><a href="#" class="hover:text-mpesa-green transition-colors">Contact Us</a></li>
                        </ul>
                    </div>
                    
                    <div>
                        <h4 class="text-lg font-semibold mb-6">Contact</h4>
                        <div class="space-y-3 text-gray-400">
                            <div class="flex items-center">
                                <i class="fas fa-phone mr-3 text-mpesa-green"></i>
                                +254 702 376 223
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-envelope mr-3 text-mpesa-green"></i>
                                support@tillsync.co.ke
                            </div>
                            <div class="flex items-center">
                                <i class="fab fa-whatsapp mr-3 text-mpesa-green"></i>
                                WhatsApp Support
                            </div>
                            <div class="flex items-center">
                                <i class="fas fa-map-marker-alt mr-3 text-mpesa-green"></i>
                                Nairobi, Kenya
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="border-t border-gray-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
                    <div class="text-gray-400 text-sm mb-4 md:mb-0">
                        © 2025 Breeva Till Sync. All rights reserved. Built with ❤️ for Kenyan entrepreneurs.
                    </div>
                    <div class="flex space-x-6 text-sm text-gray-400">
                        <a href="#" class="hover:text-mpesa-green transition-colors">Privacy Policy</a>
                        <a href="#" class="hover:text-mpesa-green transition-colors">Terms of Service</a>
                        <a href="#" class="hover:text-mpesa-green transition-colors">Cookie Policy</a>
                    </div>
                </div>
            </div>
        </footer>

        <!-- Auth Modals -->
        <!-- Signup Modal -->
        <div id="signup-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl p-8 w-full max-w-md transform transition-all">
                <div class="text-center mb-6">
                    <div class="w-16 h-16 bg-gradient-to-r from-mpesa-green to-mpesa-blue rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-user-plus text-white text-2xl"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-gray-900">Start Your Free Trial</h2>
                    <p class="text-gray-600 mt-2">Join 1000+ successful Kenyan businesses</p>
                </div>
                
                <form id="signup-form" class="space-y-4">
                    <div class="grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Full Name *</label>
                            <input type="text" id="signup-name" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="John Doe">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">Business Name *</label>
                            <input type="text" id="signup-business" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="My Kiosk">
                        </div>
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                        <input type="email" id="signup-email" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="john@example.com">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                        <input type="tel" id="signup-phone" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="+254 712 345 678">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Business Location</label>
                        <input type="text" id="signup-location" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="Nairobi, Kenya">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Password *</label>
                        <input type="password" id="signup-password" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-green focus:border-transparent" placeholder="Choose a strong password">
                    </div>
                    
                    <div class="flex items-start">
                        <input type="checkbox" id="signup-terms" required class="mt-1 mr-3">
                        <label for="signup-terms" class="text-sm text-gray-600">
                            I agree to the <a href="#" class="text-mpesa-blue hover:underline">Terms of Service</a> 
                            and <a href="#" class="text-mpesa-blue hover:underline">Privacy Policy</a>
                        </label>
                    </div>
                    
                    <button type="submit" class="w-full bg-gradient-to-r from-mpesa-green to-mpesa-dark-green text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all">
                        Start Free Trial - KSh 49
                    </button>
                </form>
                
                <div class="mt-6 text-center">
                    <p class="text-gray-600">Already have an account? 
                        <button onclick="switchToLogin()" class="text-mpesa-blue hover:underline font-medium">Sign In</button>
                    </p>
                </div>
                
                <button onclick="hideSignupModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
        </div>

        <!-- Login Modal -->
        <div id="login-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl p-8 w-full max-w-md transform transition-all">
                <div class="text-center mb-6">
                    <div class="w-16 h-16 bg-gradient-to-r from-mpesa-blue to-mpesa-dark-blue rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-sign-in-alt text-white text-2xl"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-gray-900">Welcome Back</h2>
                    <p class="text-gray-600 mt-2">Sign in to your Breeva Till Sync account</p>
                </div>
                
                <form id="login-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email Address</label>
                        <input type="email" id="login-email" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-blue focus:border-transparent" placeholder="john@example.com">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Password</label>
                        <input type="password" id="login-password" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-mpesa-blue focus:border-transparent" placeholder="Enter your password">
                    </div>
                    
                    <div class="flex items-center justify-between">
                        <label class="flex items-center">
                            <input type="checkbox" id="login-remember" class="mr-2">
                            <span class="text-sm text-gray-600">Remember me</span>
                        </label>
                        <a href="#" class="text-sm text-mpesa-blue hover:underline">Forgot password?</a>
                    </div>
                    
                    <button type="submit" class="w-full bg-gradient-to-r from-mpesa-blue to-mpesa-dark-blue text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all">
                        Sign In
                    </button>
                </form>
                
                <div class="mt-6 text-center">
                    <p class="text-gray-600">Don't have an account? 
                        <button onclick="switchToSignup()" class="text-mpesa-green hover:underline font-medium">Start Free Trial</button>
                    </p>
                </div>
                
                <button onclick="hideLoginModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
        </div>

        <!-- Waitlist Modal -->
        <div id="waitlist-modal" class="fixed inset-0 bg-black bg-opacity-50 hidden z-50 flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl p-8 w-full max-w-md transform transition-all">
                <div class="text-center mb-6">
                    <div class="w-16 h-16 bg-gradient-to-r from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-users text-white text-2xl"></i>
                    </div>
                    <h2 class="text-2xl font-bold text-gray-900">Join Beta Waitlist</h2>
                    <p class="text-gray-600 mt-2">Get early access to Breeva Till Sync Pro features</p>
                </div>
                
                <form id="waitlist-form" class="space-y-4">
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Business Name *</label>
                        <input type="text" id="waitlist-business" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="My Kiosk">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Email Address *</label>
                        <input type="email" id="waitlist-email" required class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="john@example.com">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Phone Number</label>
                        <input type="tel" id="waitlist-phone" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent" placeholder="+254 712 345 678">
                    </div>
                    
                    <div>
                        <label class="block text-sm font-medium text-gray-700 mb-2">Business Type</label>
                        <select id="waitlist-type" class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent">
                            <option value="">Select your business type</option>
                            <option value="kiosk">Kiosk/General Store</option>
                            <option value="restaurant">Restaurant/Café</option>
                            <option value="electronics">Electronics Shop</option>
                            <option value="pharmacy">Pharmacy/Chemist</option>
                            <option value="supermarket">Supermarket</option>
                            <option value="other">Other</option>
                        </select>
                    </div>
                    
                    <button type="submit" class="w-full bg-gradient-to-r from-purple-500 to-purple-600 text-white py-3 rounded-lg font-semibold hover:shadow-lg transition-all">
                        Join Waitlist
                    </button>
                </form>
                
                <button onclick="hideWaitlistModal()" class="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                    <i class="fas fa-times text-xl"></i>
                </button>
            </div>
        </div>

        <!-- Success Toast -->
        <div id="success-toast" class="fixed top-4 right-4 bg-mpesa-green text-white px-6 py-4 rounded-lg shadow-lg hidden z-50 transform transition-all">
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-2"></i>
                <span id="success-message">Operation completed successfully!</span>
            </div>
        </div>

        <!-- Error Toast -->
        <div id="error-toast" class="fixed top-4 right-4 bg-red-500 text-white px-6 py-4 rounded-lg shadow-lg hidden z-50 transform transition-all">
            <div class="flex items-center">
                <i class="fas fa-exclamation-circle mr-2"></i>
                <span id="error-message">An error occurred!</span>
            </div>
        </div>

        <script src="/static/landing.js"></script>
    </body>
    </html>
  `)
})

export default app