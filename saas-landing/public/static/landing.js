// TillSync SaaS Landing Page - Frontend JavaScript
// Handles all interactive functionality including auth, pricing, and user engagement

// Global state
let currentUser = null;
let pricingPlans = [];
let pricingMode = 'monthly'; // 'monthly' or 'yearly'

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    initializeLandingPage();
});

function initializeLandingPage() {
    // Load pricing plans
    loadPricingPlans();
    
    // Set up form handlers
    setupFormHandlers();
    
    // Check for existing session
    checkUserSession();
    
    // Add smooth scrolling
    setupSmoothScrolling();
    
    // Add scroll animations
    setupScrollAnimations();
}

// Pricing Functions
async function loadPricingPlans() {
    try {
        const response = await fetch('/api/plans');
        const result = await response.json();
        
        if (result.success) {
            pricingPlans = result.data;
            renderPricingCards();
        } else {
            console.error('Failed to load pricing plans:', result.error);
            // Show default pricing if API fails
            showDefaultPricing();
        }
    } catch (error) {
        console.error('Error loading pricing plans:', error);
        showDefaultPricing();
    }
}

function renderPricingCards() {
    const container = document.getElementById('pricing-cards');
    if (!container) return;
    
    const filteredPlans = pricingMode === 'yearly' 
        ? pricingPlans.filter(plan => plan.name === 'yearly' || plan.name === 'monthly')
        : pricingPlans;
    
    container.innerHTML = filteredPlans.map(plan => {
        const isPopular = plan.is_popular;
        const isTrial = plan.is_trial;
        const actualPrice = pricingMode === 'yearly' && plan.name === 'monthly' 
            ? Math.round(plan.price_ksh * 12 * 0.75) // 25% discount for yearly
            : plan.price_ksh;
        
        const displayPrice = formatKSh(actualPrice);
        const perPeriod = getPricingPeriod(plan.name, pricingMode);
        
        return `
            <div class="pricing-card bg-white rounded-2xl shadow-lg p-8 relative transition-all duration-300 hover:shadow-2xl ${isPopular ? 'ring-2 ring-mpesa-green scale-105' : ''} ${isTrial ? 'border-2 border-mpesa-blue' : ''}">
                ${isPopular ? `
                    <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <div class="bg-gradient-to-r from-mpesa-green to-mpesa-dark-green text-white px-4 py-2 rounded-full text-sm font-semibold">
                            Most Popular
                        </div>
                    </div>
                ` : ''}
                
                ${isTrial ? `
                    <div class="absolute -top-4 left-1/2 transform -translate-x-1/2">
                        <div class="bg-gradient-to-r from-mpesa-blue to-mpesa-dark-blue text-white px-4 py-2 rounded-full text-sm font-semibold">
                            Perfect for Testing
                        </div>
                    </div>
                ` : ''}
                
                <div class="text-center mb-8">
                    <h3 class="text-2xl font-bold text-gray-900 mb-2">${plan.display_name}</h3>
                    <p class="text-gray-600 mb-6">${plan.description}</p>
                    
                    <div class="mb-4">
                        <span class="text-5xl font-bold text-gray-900">${displayPrice}</span>
                        <span class="text-gray-600 text-lg">/${perPeriod}</span>
                    </div>
                    
                    ${pricingMode === 'yearly' && plan.name === 'monthly' ? `
                        <div class="text-sm text-green-600 font-medium">
                            Save KSh ${formatKSh(plan.price_ksh * 12 * 0.25)} per year!
                        </div>
                    ` : ''}
                </div>
                
                <div class="space-y-4 mb-8">
                    ${plan.features.map(feature => `
                        <div class="flex items-center">
                            <i class="fas fa-check text-mpesa-green mr-3"></i>
                            <span class="text-gray-700">${feature}</span>
                        </div>
                    `).join('')}
                </div>
                
                <button onclick="selectPlan('${plan.name}', ${actualPrice})" class="w-full py-4 rounded-xl font-semibold text-lg transition-all ${
                    isPopular 
                        ? 'bg-gradient-to-r from-mpesa-green to-mpesa-dark-green text-white hover:shadow-xl transform hover:scale-105' 
                        : isTrial
                        ? 'bg-gradient-to-r from-mpesa-blue to-mpesa-dark-blue text-white hover:shadow-xl transform hover:scale-105'
                        : 'border-2 border-gray-300 text-gray-700 hover:border-mpesa-green hover:text-mpesa-green'
                }">
                    ${isTrial ? 'Start Free Trial' : isPopular ? 'Get Started' : 'Choose Plan'}
                </button>
                
                ${plan.name === 'yearly' ? `
                    <div class="text-center mt-4">
                        <div class="text-sm text-gray-500">Billed annually</div>
                        <div class="text-xs text-green-600 font-medium">Best value for established businesses</div>
                    </div>
                ` : ''}
            </div>
        `;
    }).join('');
}

function showDefaultPricing() {
    // Fallback pricing in case API fails
    const defaultPlans = [
        {
            name: 'daily',
            display_name: 'Daily Trial',
            description: 'Perfect for testing TillSync with your business',
            price_ksh: 4900,
            features: ['Up to 50 transactions', 'SMS parsing', 'Basic reports', 'Email support'],
            is_trial: true,
            is_popular: false
        },
        {
            name: 'weekly',
            display_name: 'Weekly Plan',
            description: 'Great for small kiosks and cafés',
            price_ksh: 10000,
            features: ['Unlimited transactions', 'SMS parsing', 'Advanced reports', 'Variance alerts', 'Email support'],
            is_trial: false,
            is_popular: false
        },
        {
            name: 'monthly',
            display_name: 'Monthly Plan',
            description: 'Most popular for growing businesses',
            price_ksh: 35000,
            features: ['Unlimited transactions', 'SMS parsing', 'Advanced reports', 'Variance alerts', 'Priority support', 'Data export'],
            is_trial: false,
            is_popular: true
        },
        {
            name: 'yearly',
            display_name: 'Yearly Plan',
            description: 'Best value for established businesses',
            price_ksh: 350000,
            features: ['Everything in Monthly', 'Custom integrations', 'Dedicated support', 'Business analytics', 'Multi-user access', 'API access'],
            is_trial: false,
            is_popular: false
        }
    ];
    
    pricingPlans = defaultPlans;
    renderPricingCards();
}

function togglePricing(mode) {
    pricingMode = mode;
    
    // Update tab styles
    const monthlyTab = document.getElementById('monthly-tab');
    const yearlyTab = document.getElementById('yearly-tab');
    
    if (mode === 'monthly') {
        monthlyTab.classList.add('bg-white', 'text-gray-900', 'shadow');
        monthlyTab.classList.remove('text-gray-600');
        yearlyTab.classList.remove('bg-white', 'text-gray-900', 'shadow');
        yearlyTab.classList.add('text-gray-600');
    } else {
        yearlyTab.classList.add('bg-white', 'text-gray-900', 'shadow');
        yearlyTab.classList.remove('text-gray-600');
        monthlyTab.classList.remove('bg-white', 'text-gray-900', 'shadow');
        monthlyTab.classList.add('text-gray-600');
    }
    
    renderPricingCards();
}

function getPricingPeriod(planName, mode) {
    if (mode === 'yearly' && planName === 'monthly') return 'year';
    if (planName === 'daily') return 'day';
    if (planName === 'weekly') return 'week';
    if (planName === 'monthly') return 'month';
    if (planName === 'yearly') return 'year';
    return 'month';
}

function selectPlan(planName, price) {
    // Store selected plan
    localStorage.setItem('selectedPlan', JSON.stringify({ planName, price, mode: pricingMode }));
    
    // Show signup modal
    showSignupModal();
}

// Authentication Functions
function setupFormHandlers() {
    // Signup form
    const signupForm = document.getElementById('signup-form');
    if (signupForm) {
        signupForm.addEventListener('submit', handleSignup);
    }
    
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', handleLogin);
    }
    
    // Waitlist form
    const waitlistForm = document.getElementById('waitlist-form');
    if (waitlistForm) {
        waitlistForm.addEventListener('submit', handleWaitlistSignup);
    }
}

async function handleSignup(e) {
    e.preventDefault();
    
    const formData = {
        full_name: document.getElementById('signup-name').value,
        business_name: document.getElementById('signup-business').value,
        email: document.getElementById('signup-email').value,
        phone_number: document.getElementById('signup-phone').value,
        business_location: document.getElementById('signup-location').value,
        password: document.getElementById('signup-password').value
    };
    
    // Basic validation
    if (!formData.full_name || !formData.business_name || !formData.email || !formData.password) {
        showError('Please fill in all required fields');
        return;
    }
    
    if (formData.password.length < 6) {
        showError('Password must be at least 6 characters long');
        return;
    }
    
    try {
        showLoading('Creating your account...');
        
        const response = await fetch('/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            // Store user data and token
            currentUser = result.user;
            localStorage.setItem('tillsync_token', result.token);
            localStorage.setItem('tillsync_user', JSON.stringify(result.user));
            
            showSuccess('Account created successfully! Welcome to TillSync!');
            hideSignupModal();
            
            // Redirect to dashboard or payment
            setTimeout(() => {
                const selectedPlan = localStorage.getItem('selectedPlan');
                if (selectedPlan) {
                    // Go to payment page
                    redirectToPayment();
                } else {
                    // Go to dashboard
                    redirectToDashboard();
                }
            }, 2000);
        } else {
            showError(result.error || 'Registration failed. Please try again.');
        }
    } catch (error) {
        showError('Network error. Please check your connection and try again.');
        console.error('Signup error:', error);
    } finally {
        hideLoading();
    }
}

async function handleLogin(e) {
    e.preventDefault();
    
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    
    if (!email || !password) {
        showError('Please enter both email and password');
        return;
    }
    
    try {
        showLoading('Signing you in...');
        
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password })
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentUser = result.user;
            localStorage.setItem('tillsync_token', result.token);
            localStorage.setItem('tillsync_user', JSON.stringify(result.user));
            
            showSuccess(`Welcome back, ${result.user.full_name}!`);
            hideLoginModal();
            
            // Redirect to dashboard
            setTimeout(() => {
                redirectToDashboard();
            }, 1500);
        } else {
            showError(result.error || 'Login failed. Please try again.');
        }
    } catch (error) {
        showError('Network error. Please check your connection and try again.');
        console.error('Login error:', error);
    } finally {
        hideLoading();
    }
}

async function handleWaitlistSignup(e) {
    e.preventDefault();
    
    const formData = {
        business_name: document.getElementById('waitlist-business').value,
        email: document.getElementById('waitlist-email').value,
        phone_number: document.getElementById('waitlist-phone').value,
        business_type: document.getElementById('waitlist-type').value
    };
    
    if (!formData.business_name || !formData.email) {
        showError('Please fill in business name and email');
        return;
    }
    
    try {
        showLoading('Adding you to waitlist...');
        
        const response = await fetch('/api/waitlist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('Successfully added to waitlist! We\'ll contact you soon.');
            hideWaitlistModal();
            
            // Reset form
            document.getElementById('waitlist-form').reset();
        } else {
            showError(result.error || 'Failed to join waitlist. Please try again.');
        }
    } catch (error) {
        showError('Network error. Please check your connection and try again.');
        console.error('Waitlist error:', error);
    } finally {
        hideLoading();
    }
}

function checkUserSession() {
    const token = localStorage.getItem('tillsync_token');
    const user = localStorage.getItem('tillsync_user');
    
    if (token && user) {
        try {
            currentUser = JSON.parse(user);
            // Update UI to show logged in state
            updateNavForLoggedInUser();
        } catch (error) {
            // Clear invalid session data
            localStorage.removeItem('tillsync_token');
            localStorage.removeItem('tillsync_user');
        }
    }
}

function updateNavForLoggedInUser() {
    // Update navigation to show user account instead of login/signup
    // This would be implemented based on the specific UI requirements
}

// Modal Functions
function showSignupModal() {
    document.getElementById('signup-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function hideSignupModal() {
    document.getElementById('signup-modal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

function showLoginModal() {
    document.getElementById('login-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function hideLoginModal() {
    document.getElementById('login-modal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

function showWaitlistModal() {
    document.getElementById('waitlist-modal').classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

function hideWaitlistModal() {
    document.getElementById('waitlist-modal').classList.add('hidden');
    document.body.style.overflow = 'auto';
}

function switchToLogin() {
    hideSignupModal();
    showLoginModal();
}

function switchToSignup() {
    hideLoginModal();
    showSignupModal();
}

// Navigation Functions
function toggleMobileMenu() {
    const mobileMenu = document.getElementById('mobile-menu');
    mobileMenu.classList.toggle('hidden');
}

function scrollToDemo() {
    const demoSection = document.getElementById('features');
    if (demoSection) {
        demoSection.scrollIntoView({ behavior: 'smooth' });
    }
}

function joinWaitlist() {
    showWaitlistModal();
}

// Smooth scrolling for navigation links
function setupSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// Scroll animations
function setupScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                entry.target.classList.add('animate-fade-in');
            }
        });
    });

    // Observe all elements with animation classes
    document.querySelectorAll('.animate-slide-up, .animate-fade-in').forEach((el) => {
        observer.observe(el);
    });
}

// Redirect Functions
function redirectToDashboard() {
    showSuccess('Redirecting to your TillSync dashboard...');
    
    // Create a temporary redirect token and redirect to main app
    const token = localStorage.getItem('tillsync_token');
    const user = localStorage.getItem('tillsync_user');
    
    if (token && user) {
        // Create a one-time redirect token for authentication handoff
        const redirectData = {
            token: token,
            user: user,
            timestamp: Date.now()
        };
        
        // Encode the redirect data
        const redirectToken = btoa(JSON.stringify(redirectData));
        
        // Redirect to main TillSync app with the redirect token
        setTimeout(() => {
            window.location.href = `https://9cf5d93d.tillsync.pages.dev/auth/redirect?token=${redirectToken}`;
        }, 2000);
    } else {
        showError('Authentication error. Please login again.');
    }
}

function redirectToPayment() {
    const selectedPlan = JSON.parse(localStorage.getItem('selectedPlan') || '{}');
    
    // In a real implementation, this would redirect to M-Pesa payment integration
    showSuccess(`Redirecting to payment for ${selectedPlan.planName} plan...`);
    
    // For demo purposes, simulate payment process
    setTimeout(() => {
        showSuccess('Payment successful! Welcome to TillSync!');
        setTimeout(() => {
            redirectToDashboard();
        }, 2000);
    }, 3000);
}

// Utility Functions
function formatKSh(amount) {
    return `KSh ${(amount / 100).toLocaleString('en-KE')}`;
}

function showSuccess(message) {
    const toast = document.getElementById('success-toast');
    const messageEl = document.getElementById('success-message');
    messageEl.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000);
}

function showError(message) {
    const toast = document.getElementById('error-toast');
    const messageEl = document.getElementById('error-message');
    messageEl.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 5000);
}

function showLoading(message = 'Loading...') {
    // You could implement a loading overlay here
    console.log('Loading:', message);
}

function hideLoading() {
    // Hide loading overlay
    console.log('Loading complete');
}

// Make functions available globally
window.showSignupModal = showSignupModal;
window.hideSignupModal = hideSignupModal;
window.showLoginModal = showLoginModal;
window.hideLoginModal = hideLoginModal;
window.showWaitlistModal = showWaitlistModal;
window.hideWaitlistModal = hideWaitlistModal;
window.switchToLogin = switchToLogin;
window.switchToSignup = switchToSignup;
window.toggleMobileMenu = toggleMobileMenu;
window.scrollToDemo = scrollToDemo;
window.joinWaitlist = joinWaitlist;
window.togglePricing = togglePricing;
window.selectPlan = selectPlan;

// Analytics and tracking (placeholder for future implementation)
function trackEvent(eventName, properties = {}) {
    // Implement analytics tracking here (Google Analytics, Mixpanel, etc.)
    console.log('Track event:', eventName, properties);
}

// Track page view
trackEvent('page_view', {
    page: 'landing_page',
    timestamp: new Date().toISOString()
});