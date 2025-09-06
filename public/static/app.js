// M-Pesa Till Daily Reconciliation System - Frontend Application
// Main JavaScript functionality for the web application

// Global state
let currentData = {
    transactions: [],
    summary: {},
    parsedTransactions: []
};

// Initialize application
document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
});

async function checkAuthentication() {
    try {
        const response = await fetch('/api/auth/me');
        const result = await response.json();
        
        if (result.success) {
            // User is authenticated, initialize app
            initializeApp();
        } else {
            // Redirect to SaaS landing page
            window.location.href = 'https://tillsync-saas.pages.dev';
        }
    } catch (error) {
        // Network error or not authenticated, redirect to SaaS
        window.location.href = 'https://tillsync-saas.pages.dev';
    }
}

function initializeApp() {
    // Set current date in header
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-KE', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    // Set current time in transaction form
    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5);
    const timeInput = document.getElementById('transaction-time');
    if (timeInput) {
        timeInput.value = timeString;
    }

    // Initialize tab functionality
    initializeTabs();
    
    // Initialize form handlers
    initializeFormHandlers();
    
    // Initialize transactions table functionality
    initializeTransactionsTable();
    
    // Load dashboard data (includes business settings)
    loadDashboard();
    
    // Load fee structure
    loadFeeStructure();
}

// Tab Management
function initializeTabs() {
    const tabButtons = document.querySelectorAll('.tab-button');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', function() {
            const targetTab = this.getAttribute('data-tab');
            
            // Update button styles
            tabButtons.forEach(btn => {
                btn.classList.remove('text-mpesa-blue', 'border-b-2', 'border-mpesa-green', 'bg-mpesa-light-gray');
                btn.classList.add('text-gray-600');
            });
            
            this.classList.remove('text-gray-600');
            this.classList.add('text-mpesa-blue', 'border-b-2', 'border-mpesa-green', 'bg-mpesa-light-gray');

            // Show/hide content
            tabContents.forEach(content => {
                content.classList.add('hidden');
            });
            
            const targetContent = document.getElementById(targetTab + '-content');
            if (targetContent) {
                targetContent.classList.remove('hidden');
                
                // Load tab-specific data
                if (targetTab === 'reports') {
                    loadReportsData();
                } else if (targetTab === 'profile') {
                    initializeProfileTab();
                }
            }
        });
    });
}

// Form Handlers
function initializeFormHandlers() {
    // Transaction type change handler
    const transactionType = document.getElementById('transaction-type');
    if (transactionType) {
        transactionType.addEventListener('change', function() {
            const mpesaFields = document.getElementById('mpesa-fields');
            const cashFields = document.getElementById('cash-fields');
            
            if (this.value === 'mpesa') {
                mpesaFields.classList.remove('hidden');
                cashFields.classList.add('hidden');
                document.getElementById('mpesa-amount').required = true;
                document.getElementById('cash-amount').required = false;
            } else if (this.value === 'cash') {
                mpesaFields.classList.add('hidden');
                cashFields.classList.remove('hidden');
                document.getElementById('mpesa-amount').required = false;
                document.getElementById('cash-amount').required = true;
            }
        });
    }

    // Transaction form submission
    const transactionForm = document.getElementById('transaction-form');
    if (transactionForm) {
        transactionForm.addEventListener('submit', function(e) {
            e.preventDefault();
            submitTransaction();
        });
    }

    // Load products for transaction dropdown
    loadProductsForTransactionForm();
}

// Dashboard Functions
async function loadDashboard() {
    showLoading(true);
    
    try {
        const response = await fetch('/api/dashboard');
        const result = await response.json();
        
        if (result.success) {
            currentData = result.data;
            updateDashboardUI();
        } else {
            showError('Failed to load dashboard data: ' + result.error);
        }
    } catch (error) {
        showError('Network error loading dashboard: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function updateDashboardUI() {
    const { summary, transactions, businessSettings } = currentData;
    
    // Update business name in header
    const businessNameDisplay = document.getElementById('business-name-display');
    if (businessNameDisplay && businessSettings?.business_name) {
        businessNameDisplay.textContent = businessSettings.business_name;
    }
    
    // Update summary cards
    document.getElementById('mpesa-sales').textContent = formatCurrency(summary.total_mpesa_sales || 0);
    document.getElementById('cash-sales').textContent = formatCurrency(summary.total_cash_sales || 0);
    document.getElementById('total-revenue').textContent = formatCurrency(summary.combined_daily_revenue || 0);
    
    // Update cash management display
    updateCashManagementDisplay();
    
    // Update variance card
    const variance = summary.variance || 0;
    const varianceCard = document.getElementById('variance-card');
    const varianceAmount = document.getElementById('variance-amount');
    const varianceIcon = document.getElementById('variance-icon');
    
    varianceAmount.textContent = formatCurrency(Math.abs(variance));
    
    if (summary.variance_alert) {
        // Red alert for high variance
        varianceCard.classList.remove('border-green-500');
        varianceCard.classList.add('border-red-500', 'variance-alert');
        varianceAmount.classList.remove('text-green-600');
        varianceAmount.classList.add('text-red-600');
        varianceIcon.classList.remove('text-green-500');
        varianceIcon.classList.add('text-red-500');
    } else {
        // Green for acceptable variance
        varianceCard.classList.remove('border-red-500', 'variance-alert');
        varianceCard.classList.add('border-green-500');
        varianceAmount.classList.remove('text-red-600');
        varianceAmount.classList.add('text-green-600');
        varianceIcon.classList.remove('text-red-500');
        varianceIcon.classList.add('text-green-500');
    }
    
    // Update transactions table with new functionality
    updateTransactionsData(transactions);
}

// Old updateTransactionsTable function removed - now using updateTransactionsData with enhanced features

// SMS Import Functions
async function parseSMS() {
    const smsContent = document.getElementById('sms-input').value.trim();
    
    if (!smsContent) {
        showError('Please paste SMS messages to parse');
        return;
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/sms/parse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ smsContent })
        });
        
        const result = await response.json();
        
        if (result.success) {
            currentData.parsedTransactions = result.data.transactions;
            await displayParsedResults(result.data);
            showSuccess(`Parsed ${result.data.validCount} valid transactions out of ${result.data.count} SMS messages`);
        } else {
            showError('Failed to parse SMS: ' + result.error);
        }
    } catch (error) {
        showError('Network error parsing SMS: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function displayParsedResults(data) {
    const resultsDiv = document.getElementById('parsed-results');
    const importSection = document.getElementById('import-section');
    
    if (!data.transactions || data.transactions.length === 0) {
        resultsDiv.innerHTML = `
            <div class="text-center text-gray-500 py-8">
                <i class="fas fa-exclamation-triangle text-2xl mb-2 block"></i>
                <p>No valid transactions found in SMS messages.</p>
            </div>
        `;
        importSection.classList.add('hidden');
        return;
    }
    
    // Load custom products for the dropdown
    let customProducts = [];
    try {
        const response = await fetch('/api/products');
        const result = await response.json();
        if (result.success) {
            customProducts = result.data || [];
        }
    } catch (error) {
        console.log('Could not load custom products for SMS dropdown');
    }
    
    const validTransactions = data.transactions.filter(t => t.isValid);
    const invalidTransactions = data.transactions.filter(t => !t.isValid);
    
    // Create product options HTML
    function generateProductOptions() {
        let options = `
            <option value="M-Pesa Payment">M-Pesa Payment (default)</option>
            <option value="Airtime">Airtime</option>
            <option value="Sugar">Sugar</option>
            <option value="Cooking Oil">Cooking Oil</option>
            <option value="Maize Flour">Maize Flour</option>
            <option value="Rice">Rice</option>
            <option value="Bread">Bread</option>
            <option value="Milk">Milk</option>
            <option value="Soap">Soap</option>
            <option value="Tea Leaves">Tea Leaves</option>
        `;
        
        // Add custom products if any
        if (customProducts.length > 0) {
            options += `<option disabled>--- Your Products ---</option>`;
            customProducts.forEach(product => {
                options += `<option value="${product.name}">${product.name}</option>`;
            });
        }
        
        options += `<option value="Other">Other</option>`;
        return options;
    }
    
    resultsDiv.innerHTML = `
        <div class="space-y-4">
            ${validTransactions.length > 0 ? `
                <div>
                    <h4 class="font-semibold text-mpesa-green mb-3">
                        <i class="fas fa-check-circle mr-2"></i>
                        Valid Transactions (${validTransactions.length})
                    </h4>
                    <div class="space-y-2">
                        ${validTransactions.map((t, index) => `
                            <div class="bg-green-50 border border-green-200 rounded-lg p-3">
                                <div class="flex justify-between items-start mb-2">
                                    <div class="flex-1">
                                        <p class="font-medium">${t.customerName}</p>
                                        <p class="text-sm text-gray-600">${formatCurrency(t.amount)} - ${t.transactionReference}</p>
                                        <p class="text-xs text-gray-500">${t.time || 'Time not parsed'}</p>
                                    </div>
                                    <span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Ready</span>
                                </div>
                                <div class="mt-2">
                                    <label class="block text-xs font-medium text-gray-700 mb-1">Product/Service:</label>
                                    <select id="sms-product-${index}" class="w-full px-2 py-1 text-xs border border-gray-300 rounded focus:ring-1 focus:ring-mpesa-green">
                                        ${generateProductOptions()}
                                    </select>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
            
            ${invalidTransactions.length > 0 ? `
                <div>
                    <h4 class="font-semibold text-red-600 mb-3">
                        <i class="fas fa-exclamation-triangle mr-2"></i>
                        Invalid/Incomplete (${invalidTransactions.length})
                    </h4>
                    <div class="space-y-2">
                        ${invalidTransactions.map(t => `
                            <div class="bg-red-50 border border-red-200 rounded-lg p-3">
                                <p class="text-sm text-red-800">${t.errorMessage || 'Parsing failed'}</p>
                                <p class="text-xs text-gray-600 mt-1">Amount: ${t.amount || 'Not found'}, Customer: ${t.customerName || 'Not found'}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>
    `;
    
    if (validTransactions.length > 0) {
        importSection.classList.remove('hidden');
    } else {
        importSection.classList.add('hidden');
    }
}

async function importTransactions() {
    const validTransactions = currentData.parsedTransactions.filter(t => t.isValid);
    
    if (validTransactions.length === 0) {
        showError('No valid transactions to import');
        return;
    }
    
    // Collect selected products for each transaction
    const transactionsWithProducts = validTransactions.map((transaction, index) => {
        const productSelect = document.getElementById(`sms-product-${index}`);
        const selectedProduct = productSelect ? productSelect.value : 'M-Pesa Payment';
        
        return {
            ...transaction,
            selectedProduct: selectedProduct
        };
    });
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/sms/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ transactions: transactionsWithProducts })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess(result.data.message);
            
            // Clear SMS input and results
            document.getElementById('sms-input').value = '';
            document.getElementById('parsed-results').innerHTML = `
                <div class="text-center text-gray-500 py-8">
                    <i class="fas fa-check-circle text-2xl mb-2 block text-mpesa-green"></i>
                    <p>Transactions imported successfully!</p>
                </div>
            `;
            document.getElementById('import-section').classList.add('hidden');
            
            // Refresh dashboard
            await loadDashboard();
        } else {
            showError('Failed to import transactions: ' + result.error);
        }
    } catch (error) {
        showError('Network error importing transactions: ' + error.message);
    } finally {
        showLoading(false);
    }
}

async function loadSampleSMS() {
    try {
        const response = await fetch('/api/sms/samples');
        const result = await response.json();
        
        if (result.success && result.data.samples) {
            const sampleText = result.data.samples.join('\\n\\n');
            document.getElementById('sms-input').value = sampleText;
            showSuccess('Sample SMS messages loaded. Click "Parse SMS" to test.');
        }
    } catch (error) {
        showError('Failed to load sample SMS: ' + error.message);
    }
}

// Transaction Form Functions
async function submitTransaction() {
    const form = document.getElementById('transaction-form');
    const formData = new FormData(form);
    
    const transactionType = document.getElementById('transaction-type').value;
    const time = document.getElementById('transaction-time').value;
    const customerName = document.getElementById('customer-name').value;
    const productService = document.getElementById('product-service').value;
    const notes = document.getElementById('transaction-notes').value;
    
    let transactionData = {
        transaction_type: transactionType,
        time: convertTo12HourFromInput(time),
        customer_name: customerName,
        product_service: productService,
        notes: notes
    };
    
    if (transactionType === 'mpesa') {
        const mpesaAmount = parseFloat(document.getElementById('mpesa-amount').value);
        const transactionRef = document.getElementById('transaction-ref').value;
        
        if (!mpesaAmount || mpesaAmount <= 0) {
            showError('Please enter a valid M-Pesa amount');
            return;
        }
        
        transactionData.amount_received = mpesaAmount;
        transactionData.transaction_reference = transactionRef;
        transactionData.cash_sale_amount = 0;
    } else if (transactionType === 'cash') {
        const cashAmount = parseFloat(document.getElementById('cash-amount').value);
        
        if (!cashAmount || cashAmount <= 0) {
            showError('Please enter a valid cash amount');
            return;
        }
        
        transactionData.amount_received = 0;
        transactionData.cash_sale_amount = cashAmount;
        transactionData.transaction_reference = '';
    }
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/transactions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(transactionData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('Transaction added successfully!');
            resetTransactionForm();
            
            // Reload dashboard first
            await loadDashboard();
            
            // Then auto-update current cash if this was a cash transaction
            if (transactionData.transaction_type === 'cash' && transactionData.cash_sale_amount > 0) {
                // Get current cash input and add the new transaction amount
                const currentCashInput = document.getElementById('input-current-cash');
                if (currentCashInput) {
                    const currentValue = parseFloat(currentCashInput.value) || 0;
                    const newTotal = currentValue + transactionData.cash_sale_amount;
                    currentCashInput.value = newTotal;
                    
                    // Show notification about auto-update
                    showSuccess(`Current cash automatically updated: +${formatCurrency(transactionData.cash_sale_amount)}`);
                }
            }
        } else {
            showError('Failed to add transaction: ' + result.error);
        }
    } catch (error) {
        showError('Network error adding transaction: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function resetTransactionForm() {
    document.getElementById('transaction-form').reset();
    
    // Reset field visibility
    document.getElementById('mpesa-fields').classList.remove('hidden');
    document.getElementById('cash-fields').classList.add('hidden');
    
    // Reset time to current time
    const now = new Date();
    const timeString = now.toTimeString().slice(0, 5);
    document.getElementById('transaction-time').value = timeString;
}

// Reports Functions
// Global chart instances
let revenueChart = null;
let volumeChart = null;

async function loadReportsData() {
    try {
        showLoading(true);
        
        // Setup period selector event listener
        const periodSelect = document.getElementById('report-period');
        const customDateRange = document.getElementById('custom-date-range');
        
        if (periodSelect && !periodSelect.hasEventListener) {
            periodSelect.addEventListener('change', function() {
                if (this.value === 'custom') {
                    customDateRange?.classList.remove('hidden');
                    // Set default dates
                    const today = new Date().toISOString().split('T')[0];
                    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
                    document.getElementById('start-date').value = weekAgo;
                    document.getElementById('end-date').value = today;
                } else {
                    customDateRange?.classList.add('hidden');
                    loadReportsForPeriod(this.value);
                }
            });
            periodSelect.hasEventListener = true;
        }
        
        // Load data for current period
        const currentPeriod = periodSelect?.value || 'today';
        await loadReportsForPeriod(currentPeriod);
        
        // Load fee structure if not already loaded
        if (!document.getElementById('fee-structure-table')?.innerHTML?.trim()) {
            await loadFeeStructure();
        }
        
    } catch (error) {
        console.error('Error loading reports data:', error);
        showError('Failed to load reports data');
    } finally {
        showLoading(false);
    }
}

async function loadReportsForPeriod(period) {
    let startDate, endDate;
    const today = new Date().toISOString().split('T')[0];
    
    switch (period) {
        case 'today':
            startDate = endDate = today;
            break;
        case 'week':
            startDate = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            endDate = today;
            break;
        case 'month':
            const firstDay = new Date();
            firstDay.setDate(1);
            startDate = firstDay.toISOString().split('T')[0];
            endDate = today;
            break;
        case 'custom':
            startDate = document.getElementById('start-date')?.value;
            endDate = document.getElementById('end-date')?.value;
            if (!startDate || !endDate) {
                showError('Please select both start and end dates');
                return;
            }
            break;
        default:
            startDate = endDate = today;
    }
    
    try {
        const response = await fetch(`/api/reports/transactions?start_date=${startDate}&end_date=${endDate}`);
        const result = await response.json();
        
        if (result.success) {
            currentData = {
                transactions: result.data.transactions,
                summary: result.data.summary,
                reportPeriod: { startDate, endDate, period }
            };
            updateReportsUI();
        } else {
            showError('Failed to load reports data: ' + result.error);
        }
    } catch (error) {
        showError('Network error loading reports: ' + error.message);
    }
}

function updateReportsUI() {
    if (!currentData.summary) return;
    
    const { summary, transactions } = currentData;
    
    // Update key metrics
    document.getElementById('report-total-revenue').textContent = formatCurrency(summary.combined_daily_revenue || 0);
    document.getElementById('report-mpesa-revenue').textContent = formatCurrency(summary.total_mpesa_sales || 0);
    document.getElementById('report-cash-revenue').textContent = formatCurrency(summary.total_cash_sales || 0);
    document.getElementById('report-transaction-count').textContent = (transactions || []).length;
    
    // Update payment method breakdown
    const totalRevenue = (summary.total_mpesa_sales || 0) + (summary.total_cash_sales || 0);
    const mpesaPercentage = totalRevenue > 0 ? Math.round(((summary.total_mpesa_sales || 0) / totalRevenue) * 100) : 0;
    const cashPercentage = 100 - mpesaPercentage;
    
    document.getElementById('mpesa-percentage').textContent = mpesaPercentage + '%';
    document.getElementById('mpesa-amount').textContent = formatCurrency(summary.total_mpesa_sales || 0);
    document.getElementById('cash-percentage').textContent = cashPercentage + '%';
    document.getElementById('cash-amount').textContent = formatCurrency(summary.total_cash_sales || 0);
    
    // Update top products
    updateTopProducts(transactions || []);
    
    // Create charts with debouncing
    setTimeout(() => {
        createRevenueChart();
        createVolumeChart();
    }, 100);
}

function updateTopProducts(transactions) {
    const productCounts = {};
    const productRevenue = {};
    
    transactions.forEach(transaction => {
        const product = transaction.product_service || 'Not specified';
        const amount = parseFloat(transaction.amount_received || transaction.cash_sale_amount || 0);
        
        productCounts[product] = (productCounts[product] || 0) + 1;
        productRevenue[product] = (productRevenue[product] || 0) + amount;
    });
    
    const topProducts = Object.entries(productRevenue)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5);
    
    const container = document.getElementById('top-products');
    if (!container) return;
    
    if (topProducts.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-sm text-center py-4">No products data available</div>';
        return;
    }
    
    container.innerHTML = topProducts.map(([product, revenue]) => `
        <div class="flex justify-between items-center p-3 bg-gray-50 rounded-lg">
            <div>
                <div class="font-medium text-gray-800">${product}</div>
                <div class="text-sm text-gray-600">${productCounts[product]} transactions</div>
            </div>
            <div class="font-bold text-mpesa-green">${formatCurrency(revenue)}</div>
        </div>
    `).join('');
}

function refreshReports() {
    const periodSelect = document.getElementById('report-period');
    const currentPeriod = periodSelect?.value || 'today';
    
    if (currentPeriod === 'custom') {
        loadReportsForPeriod('custom');
    } else {
        loadReportsForPeriod(currentPeriod);
    }
}

async function loadFeeStructure() {
    try {
        const response = await fetch('/api/fees');
        const result = await response.json();
        
        if (result.success) {
            const tbody = document.getElementById('fee-structure-table');
            if (tbody) {
                tbody.innerHTML = result.data.feeStructure.map(fee => `
                    <tr>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${fee.description}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">${formatCurrency(fee.customerFee)}</td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium ${fee.businessFee > 0 ? 'text-red-600' : 'text-green-600'}">
                            ${formatCurrency(fee.businessFee)}
                        </td>
                    </tr>
                `).join('');
            }
        }
    } catch (error) {
        console.error('Failed to load fee structure:', error);
    }
}

function createRevenueChart() {
    const ctx = document.getElementById('revenue-chart');
    if (!ctx) return;
    
    // Destroy existing chart to prevent memory leaks
    if (revenueChart) {
        revenueChart.destroy();
    }
    
    const { summary } = currentData;
    if (!summary) return;
    
    const mpesaSales = summary.total_mpesa_sales || 0;
    const cashSales = summary.total_cash_sales || 0;
    const mpesaFees = summary.total_mpesa_fees || 0;
    
    // Only show chart if there's data
    if (mpesaSales + cashSales + mpesaFees === 0) {
        ctx.parentElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">No revenue data available</div>';
        return;
    }
    
    revenueChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['M-Pesa Sales', 'Cash Sales', 'M-Pesa Fees'],
            datasets: [{
                data: [mpesaSales, cashSales, mpesaFees],
                backgroundColor: [
                    '#00d13b',
                    '#0066cc',
                    '#e74c3c'
                ],
                borderWidth: 2,
                borderColor: '#fff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: {
                        padding: 20,
                        usePointStyle: true
                    }
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = ((context.raw / total) * 100).toFixed(1);
                            return context.label + ': ' + formatCurrency(context.raw) + ' (' + percentage + '%)';
                        }
                    }
                }
            }
        }
    });
}

function createVolumeChart() {
    const ctx = document.getElementById('volume-chart');
    if (!ctx) return;
    
    // Destroy existing chart to prevent memory leaks
    if (volumeChart) {
        volumeChart.destroy();
    }
    
    const { transactions } = currentData;
    if (!transactions || transactions.length === 0) {
        ctx.parentElement.innerHTML = '<div class="flex items-center justify-center h-full text-gray-500">No transaction data available</div>';
        return;
    }
    
    // Count transactions by type
    const mpesaCount = transactions.filter(t => t.transaction_type === 'mpesa').length;
    const cashCount = transactions.filter(t => t.transaction_type === 'cash').length;
    
    volumeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: ['M-Pesa', 'Cash'],
            datasets: [{
                label: 'Number of Transactions',
                data: [mpesaCount, cashCount],
                backgroundColor: [
                    'rgba(0, 209, 59, 0.8)',
                    'rgba(0, 102, 204, 0.8)'
                ],
                borderColor: [
                    '#00d13b',
                    '#0066cc'
                ],
                borderWidth: 2,
                borderRadius: 8
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((context.raw / total) * 100).toFixed(1) : '0';
                            return context.label + ': ' + context.raw + ' transactions (' + percentage + '%)';
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        callback: function(value) {
                            return Number.isInteger(value) ? value : '';
                        }
                    }
                }
            }
        }
    });
}

// Utility Functions
function refreshDashboard() {
    loadDashboard();
}

function formatCurrency(amount) {
    return 'KSh ' + (amount || 0).toLocaleString('en-KE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    });
}

function convertTo12Hour(time24) {
    if (!time24) return '';
    
    const [hours, minutes] = time24.split(':');
    const hour24 = parseInt(hours);
    
    if (hour24 === 0) {
        return `12:${minutes} AM`;
    } else if (hour24 < 12) {
        return `${hour24}:${minutes} AM`;
    } else if (hour24 === 12) {
        return `12:${minutes} PM`;
    } else {
        return `${hour24 - 12}:${minutes} PM`;
    }
}

function convertTo12HourFromInput(time24) {
    if (!time24) return '';
    
    const [hours, minutes] = time24.split(':');
    const hour24 = parseInt(hours);
    
    if (hour24 === 0) {
        return `12:${minutes} AM`;
    } else if (hour24 < 12) {
        return `${hour24}:${minutes} AM`;
    } else if (hour24 === 12) {
        return `12:${minutes} PM`;
    } else {
        return `${hour24 - 12}:${minutes} PM`;
    }
}

// Toast Functions
function showSuccess(message) {
    const toast = document.getElementById('success-toast');
    const messageEl = document.getElementById('success-message');
    messageEl.textContent = message;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 4000);
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

function showLoading(show) {
    const overlay = document.getElementById('loading-overlay');
    if (show) {
        overlay.classList.remove('hidden');
    } else {
        overlay.classList.add('hidden');
    }
}

// Profile Management Functions
let userProducts = [];
let businessSettings = {};

async function loadProfileData() {
    try {
        // Load business settings
        const settingsResponse = await fetch('/api/business-settings');
        const settingsResult = await settingsResponse.json();
        
        if (settingsResult.success) {
            businessSettings = settingsResult.data;
            populateBusinessForm();
        }
        
        // Load products
        const productsResponse = await fetch('/api/products');
        const productsResult = await productsResponse.json();
        
        if (productsResult.success) {
            userProducts = productsResult.data;
            renderProductsList();
        }
        
    } catch (error) {
        console.error('Error loading profile data:', error);
        showError('Failed to load profile data');
    }
}

function populateBusinessForm() {
    const fields = ['business-name', 'owner-name', 'phone-number', 'daily-target', 'alert-threshold'];
    
    fields.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        const key = fieldId.replace('-', '_');
        
        if (element && businessSettings[key] !== undefined) {
            element.value = businessSettings[key];
        }
    });
}

async function saveBusinessSettings(event) {
    event.preventDefault();
    
    const formData = {
        business_name: document.getElementById('business-name').value,
        mpesa_till_number: '', // Remove till number field
        owner_name: document.getElementById('owner-name').value,
        phone_number: document.getElementById('phone-number').value,
        daily_target: parseFloat(document.getElementById('daily-target').value) || 0,
        alert_threshold: parseFloat(document.getElementById('alert-threshold').value) || 100
    };
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/business-settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        
        if (result.success) {
            businessSettings = formData;
            showSuccess('Business settings saved successfully!');
            
            // Update business name in header display
            const businessNameDisplay = document.getElementById('business-name-display');
            if (businessNameDisplay && formData.business_name) {
                businessNameDisplay.textContent = formData.business_name;
            }
        } else {
            showError(result.error || 'Failed to save settings');
        }
    } catch (error) {
        showError('Network error while saving settings');
        console.error('Error saving business settings:', error);
    } finally {
        showLoading(false);
    }
}

async function addProduct(productName = null) {
    const name = productName || document.getElementById('new-product-name').value.trim();
    
    if (!name) {
        showError('Please enter a product name');
        return;
    }
    
    try {
        const response = await fetch('/api/products', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ name, category: 'General' })
        });
        
        const result = await response.json();
        
        if (result.success) {
            userProducts.push(result.data);
            renderProductsList();
            
            // Clear input if it was used
            const input = document.getElementById('new-product-name');
            if (input && !productName) {
                input.value = '';
            }
            
            // Update product dropdown in transaction form
            updateProductDropdown();
            
            showSuccess(`Product "${name}" added successfully!`);
        } else {
            showError(result.error || 'Failed to add product');
        }
    } catch (error) {
        showError('Network error while adding product');
        console.error('Error adding product:', error);
    }
}

async function removeProduct(productId, productName) {
    if (!confirm(`Are you sure you want to remove "${productName}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(`/api/products/${productId}`, {
            method: 'DELETE'
        });
        
        const result = await response.json();
        
        if (result.success) {
            userProducts = userProducts.filter(p => p.id !== productId);
            renderProductsList();
            updateProductDropdown();
            showSuccess(`Product "${productName}" removed successfully!`);
        } else {
            showError(result.error || 'Failed to remove product');
        }
    } catch (error) {
        showError('Network error while removing product');
        console.error('Error removing product:', error);
    }
}

function renderProductsList() {
    const container = document.getElementById('products-list');
    if (!container) return;
    
    if (userProducts.length === 0) {
        container.innerHTML = '<div class="text-gray-500 text-sm">No products added yet. Add your first product above.</div>';
        return;
    }
    
    container.innerHTML = userProducts.map(product => `
        <div class="flex items-center justify-between bg-white p-3 rounded border">
            <div class="flex items-center">
                <i class="fas fa-box text-mpesa-blue mr-2"></i>
                <span class="font-medium">${product.name}</span>
                <span class="text-gray-500 text-sm ml-2">(${product.category})</span>
            </div>
            <button onclick="removeProduct(${product.id}, '${product.name}')" class="text-red-500 hover:text-red-700 transition-colors">
                <i class="fas fa-trash"></i>
            </button>
        </div>
    `).join('');
}

function updateProductDropdown() {
    // Use the new function with current userProducts data
    updateProductDropdownWithData(userProducts);
}

async function logout() {
    if (confirm('Are you sure you want to logout? This will redirect you to the landing page.')) {
        try {
            // Call logout API to clear server-side session
            await fetch('/api/auth/logout', { method: 'POST' });
        } catch (error) {
            console.error('Logout API call failed:', error);
        }
        
        // Clear any stored session data and cookies
        localStorage.clear();
        sessionStorage.clear();
        
        // Clear cookies
        document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
        
        // Show logout message
        showSuccess('Logged out successfully! Redirecting to SaaS landing page...');
        
        // Redirect to SaaS landing page immediately
        setTimeout(() => {
            window.location.href = 'https://tillsync-saas.pages.dev';
        }, 1500);
    }
}

function exportData(format) {
    if (format === 'csv') {
        exportToCSV();
    } else if (format === 'pdf') {
        exportToPDF();
    }
}

function exportToCSV() {
    // Simple CSV export of transactions
    const transactions = currentData.transactions || [];
    
    if (transactions.length === 0) {
        showError('No transactions to export');
        return;
    }
    
    const headers = ['Date', 'Time', 'Type', 'Customer', 'Amount', 'Reference', 'Product/Service'];
    const csvContent = [
        headers.join(','),
        ...transactions.map(t => [
            t.date,
            t.time,
            t.transaction_type,
            t.customer_name || '',
            t.amount_received,
            t.transaction_reference || '',
            t.product_service || ''
        ].join(','))
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tillsync-transactions-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showSuccess('CSV export downloaded successfully!');
}

function exportToPDF() {
    // Simple PDF export (in a real app, you'd use a proper PDF library)
    showSuccess('PDF export feature coming soon!');
}

// Export reports data (for date-range specific exports)
function exportReportsData(format) {
    if (format === 'csv') {
        exportReportsToCSV();
    } else if (format === 'pdf') {
        exportReportsToPDF();
    }
}

function exportReportsToCSV() {
    const transactions = currentData?.transactions || [];
    
    if (transactions.length === 0) {
        showError('No transactions to export for the selected period');
        return;
    }
    
    const reportPeriod = currentData?.reportPeriod || {};
    const periodDescription = reportPeriod.period === 'custom' 
        ? `${reportPeriod.startDate}_to_${reportPeriod.endDate}`
        : reportPeriod.period || 'today';
    
    // Enhanced headers for reports
    const headers = [
        'Date', 'Time', 'Type', 'Customer', 'Amount (KSh)', 'Reference', 
        'Product/Service', 'M-Pesa Fee (KSh)', 'Net Amount (KSh)', 'Status'
    ];
    
    const csvContent = [
        `# TillSync Transaction Report - ${periodDescription.toUpperCase()}`,
        `# Generated on: ${new Date().toLocaleString('en-KE')}`,
        `# Total Transactions: ${transactions.length}`,
        `# Total Revenue: KSh ${(currentData.summary?.combined_daily_revenue || 0).toLocaleString('en-KE')}`,
        '',
        headers.join(','),
        ...transactions.map(t => {
            const amount = t.transaction_type === 'mpesa' ? (t.amount_received || 0) : (t.cash_sale_amount || 0);
            const mpesaFee = t.mpesa_fee || 0;
            const netAmount = amount - mpesaFee;
            
            return [
                t.date,
                t.time,
                t.transaction_type === 'mpesa' ? 'M-Pesa' : 'Cash',
                `"${t.customer_name || 'N/A'}"`,
                amount.toFixed(2),
                t.transaction_reference || 'N/A',
                `"${t.product_service || 'N/A'}"`,
                mpesaFee.toFixed(2),
                netAmount.toFixed(2),
                t.verified ? 'Verified' : 'Pending'
            ].join(',');
        })
    ].join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tillsync-report-${periodDescription}-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showSuccess('CSV report exported successfully!');
}

function exportReportsToPDF() {
    showSuccess('PDF export for reports coming soon!');
}

// Cash Management Functions
function toggleCashManagement() {
    const content = document.getElementById('cash-management-content');
    const icon = document.getElementById('cash-toggle-icon');
    
    if (content && icon) {
        const isHidden = content.classList.contains('hidden');
        
        if (isHidden) {
            content.classList.remove('hidden');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
        } else {
            content.classList.add('hidden');
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
        }
    }
}

async function updateCashManagement() {
    const openingFloat = parseFloat(document.getElementById('input-opening-float').value) || 0;
    const currentCash = parseFloat(document.getElementById('input-current-cash').value) || 0;
    
    const today = new Date().toISOString().split('T')[0];
    
    try {
        showLoading(true);
        
        const response = await fetch('/api/summary', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                date: today,
                opening_float: openingFloat,
                actual_cash_count: currentCash
            })
        });
        
        const result = await response.json();
        
        if (result.success) {
            showSuccess('Cash management updated successfully!');
            
            // Refresh dashboard to show updated values
            await loadDashboard();
        } else {
            showError('Failed to update cash management: ' + result.error);
        }
    } catch (error) {
        showError('Network error updating cash management: ' + error.message);
    } finally {
        showLoading(false);
    }
}

function updateCashManagementDisplay() {
    const { summary } = currentData;
    
    if (!summary) return;
    
    // Update display values
    const openingFloat = summary.opening_float || 0;
    const cashSales = summary.total_cash_sales || 0;
    const expectedCash = openingFloat + cashSales;
    const currentCash = summary.actual_cash_count || 0;
    const variance = currentCash - expectedCash;
    
    // Update display elements
    const elements = {
        'display-opening-float': formatCurrency(openingFloat),
        'display-cash-sales': formatCurrency(cashSales),
        'display-expected-cash': formatCurrency(expectedCash),
        'display-current-cash': formatCurrency(currentCash)
    };
    
    Object.entries(elements).forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    });
    
    // Update input fields
    const openingFloatInput = document.getElementById('input-opening-float');
    const currentCashInput = document.getElementById('input-current-cash');
    
    if (openingFloatInput) openingFloatInput.value = openingFloat;
    if (currentCashInput) currentCashInput.value = currentCash;
    
    // Update variance analysis
    const varianceExplanation = document.getElementById('variance-explanation');
    const varianceStatus = document.getElementById('variance-status');
    const varianceLabel = document.getElementById('variance-label');
    
    if (varianceExplanation) {
        if (variance === 0) {
            varianceExplanation.textContent = `Expected ${formatCurrency(expectedCash)} = Current ${formatCurrency(currentCash)} = Balanced`;
        } else if (variance > 0) {
            varianceExplanation.textContent = `Current ${formatCurrency(currentCash)} - Expected ${formatCurrency(expectedCash)} = Overage ${formatCurrency(variance)}`;
        } else {
            varianceExplanation.textContent = `Expected ${formatCurrency(expectedCash)} - Current ${formatCurrency(currentCash)} = Shortage ${formatCurrency(Math.abs(variance))}`;
        }
    }
    
    if (varianceStatus) {
        varianceStatus.textContent = formatCurrency(Math.abs(variance));
        
        // Color coding
        if (variance === 0) {
            varianceStatus.className = 'text-lg font-bold text-green-600';
            if (varianceLabel) {
                varianceLabel.textContent = 'Balanced';
                varianceLabel.className = 'text-xs text-green-600';
            }
        } else if (variance > 0) {
            varianceStatus.className = 'text-lg font-bold text-blue-600';
            if (varianceLabel) {
                varianceLabel.textContent = 'Overage';
                varianceLabel.className = 'text-xs text-blue-600';
            }
        } else {
            varianceStatus.className = 'text-lg font-bold text-red-600';
            if (varianceLabel) {
                varianceLabel.textContent = 'Shortage';
                varianceLabel.className = 'text-xs text-red-600';
            }
        }
    }
}

// Auto-update current cash when cash transactions are added
function autoUpdateCurrentCash(newCashAmount) {
    const currentCashInput = document.getElementById('input-current-cash');
    
    if (currentCashInput) {
        const currentValue = parseFloat(currentCashInput.value) || 0;
        const newTotal = currentValue + newCashAmount;
        currentCashInput.value = newTotal;
        
        // Auto-save the updated cash count
        updateCashManagement();
    }
}

// Load products for transaction form dropdown
async function loadProductsForTransactionForm() {
    try {
        const response = await fetch('/api/products');
        const result = await response.json();
        
        if (result.success) {
            updateProductDropdownWithData(result.data);
        }
    } catch (error) {
        console.error('Error loading products for transaction form:', error);
    }
}

function updateProductDropdownWithData(products) {
    const dropdown = document.getElementById('product-service');
    if (!dropdown) return;
    
    // Store current value
    const currentValue = dropdown.value;
    
    // Clear existing options and rebuild
    dropdown.innerHTML = `
        <option value="">Select product/service...</option>
        <option value="Airtime">Airtime</option>
        <option value="Sugar 2kg">Sugar 2kg</option>
        <option value="Cooking Oil 1L">Cooking Oil 1L</option>
        <option value="Maize Flour 2kg">Maize Flour 2kg</option>
        <option value="Rice 2kg">Rice 2kg</option>
        <option value="Bread">Bread</option>
        <option value="Milk 1L">Milk 1L</option>
        <option value="Soap">Soap</option>
        <option value="Tea Leaves">Tea Leaves</option>
    `;
    
    // Add separator if user products exist
    if (products && products.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '--- Your Custom Products ---';
        separator.style.fontStyle = 'italic';
        dropdown.appendChild(separator);
        
        // Add user products
        products.forEach(product => {
            const option = document.createElement('option');
            option.value = product.name;
            option.textContent = product.name;
            dropdown.appendChild(option);
        });
    }
    
    // Add "Other" option at the end
    const otherOption = document.createElement('option');
    otherOption.value = 'Other';
    otherOption.textContent = 'Other (specify in notes)';
    dropdown.appendChild(otherOption);
    
    // Restore previous value if it still exists
    if (currentValue) {
        dropdown.value = currentValue;
    }
}

// Initialize profile tab when it's activated
function initializeProfileTab() {
    // Setup form handler
    const businessForm = document.getElementById('business-settings-form');
    if (businessForm) {
        businessForm.addEventListener('submit', saveBusinessSettings);
    }
    
    // Load profile data
    loadProfileData();
}

// Transactions Table Management
let transactionsData = [];
let filteredTransactions = [];
let currentPage = 1;
let rowsPerPage = 10;
let sortColumn = '';
let sortDirection = 'desc';

function initializeTransactionsTable() {
    // Setup search functionality
    const searchInput = document.getElementById('search-transactions');
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            filterAndRenderTransactions();
        });
    }

    // Setup sort functionality
    const sortSelect = document.getElementById('sort-transactions');
    if (sortSelect) {
        sortSelect.addEventListener('change', function() {
            const [column, direction] = this.value.split('-');
            if (column) {
                sortColumn = column;
                sortDirection = direction || 'desc';
                filterAndRenderTransactions();
            }
        });
    }

    // Setup rows per page
    const rowsSelect = document.getElementById('rows-per-page');
    if (rowsSelect) {
        rowsSelect.addEventListener('change', function() {
            rowsPerPage = parseInt(this.value);
            currentPage = 1;
            filterAndRenderTransactions();
        });
    }

    // Setup pagination
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');
    
    if (prevBtn) {
        prevBtn.addEventListener('click', function() {
            if (currentPage > 1) {
                currentPage--;
                renderTransactionsTable();
            }
        });
    }

    if (nextBtn) {
        nextBtn.addEventListener('click', function() {
            const totalPages = Math.ceil(filteredTransactions.length / rowsPerPage);
            if (currentPage < totalPages) {
                currentPage++;
                renderTransactionsTable();
            }
        });
    }
}

function filterAndRenderTransactions() {
    const searchTerm = document.getElementById('search-transactions')?.value.toLowerCase() || '';
    
    // Filter transactions
    filteredTransactions = transactionsData.filter(transaction => {
        const displayAmount = transaction.transaction_type === 'mpesa' ? (transaction.amount_received || 0) : (transaction.cash_sale_amount || 0);
        const searchableText = [
            transaction.customer_name || '',
            displayAmount.toString() || '',
            transaction.time || '',
            transaction.transaction_reference || '',
            transaction.product_service || ''
        ].join(' ').toLowerCase();
        
        return searchableText.includes(searchTerm);
    });

    // Sort transactions
    if (sortColumn) {
        filteredTransactions.sort((a, b) => {
            let aVal = a[sortColumn] || '';
            let bVal = b[sortColumn] || '';
            
            // Special handling for different data types
            if (sortColumn === 'amount_received') {
                // Use correct amount field based on transaction type
                aVal = parseFloat(a.transaction_type === 'mpesa' ? (a.amount_received || 0) : (a.cash_sale_amount || 0));
                bVal = parseFloat(b.transaction_type === 'mpesa' ? (b.amount_received || 0) : (b.cash_sale_amount || 0));
            } else if (sortColumn === 'time') {
                aVal = new Date(`2000-01-01 ${aVal}`);
                bVal = new Date(`2000-01-01 ${bVal}`);
            } else {
                aVal = aVal.toString().toLowerCase();
                bVal = bVal.toString().toLowerCase();
            }
            
            if (sortDirection === 'asc') {
                return aVal > bVal ? 1 : -1;
            } else {
                return aVal < bVal ? 1 : -1;
            }
        });
    }

    // Reset to first page and render
    currentPage = 1;
    renderTransactionsTable();
}

function renderTransactionsTable() {
    const startIndex = (currentPage - 1) * rowsPerPage;
    const endIndex = startIndex + rowsPerPage;
    const pageTransactions = filteredTransactions.slice(startIndex, endIndex);
    
    // Render desktop table
    const tableBody = document.getElementById('transactions-table');
    if (tableBody) {
        if (pageTransactions.length === 0) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="7" class="px-6 py-4 text-center text-gray-500">
                        No transactions found
                    </td>
                </tr>
            `;
        } else {
            tableBody.innerHTML = pageTransactions.map(transaction => `
                <tr class="hover:bg-gray-50">
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${transaction.time}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            transaction.transaction_type === 'mpesa' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-blue-100 text-blue-800'
                        }">
                            ${transaction.transaction_type === 'mpesa' ? 'M-Pesa' : 'Cash'}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${transaction.customer_name || 'N/A'}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-green-600">
                        KSh ${parseFloat(transaction.transaction_type === 'mpesa' ? (transaction.amount_received || 0) : (transaction.cash_sale_amount || 0)).toLocaleString('en-KE', {minimumFractionDigits: 2})}
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${transaction.transaction_reference || 'N/A'}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500">${transaction.product_service || 'N/A'}</td>
                    <td class="px-4 py-3 whitespace-nowrap">
                        <span class="px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            transaction.verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                        }">
                            ${transaction.verified ? 'Verified' : 'Pending'}
                        </span>
                    </td>
                </tr>
            `).join('');
        }
    }

    // Render mobile cards
    const mobileContainer = document.getElementById('transactions-mobile');
    if (mobileContainer) {
        if (pageTransactions.length === 0) {
            mobileContainer.innerHTML = `
                <div class="bg-white rounded-lg p-4 text-center text-gray-500">
                    No transactions found
                </div>
            `;
        } else {
            mobileContainer.innerHTML = pageTransactions.map(transaction => `
                <div class="bg-white rounded-lg border border-gray-200 p-4">
                    <div class="flex justify-between items-start mb-2">
                        <span class="text-lg font-bold text-green-600">
                            KSh ${parseFloat(transaction.transaction_type === 'mpesa' ? (transaction.amount_received || 0) : (transaction.cash_sale_amount || 0)).toLocaleString('en-KE', {minimumFractionDigits: 2})}
                        </span>
                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${
                            transaction.transaction_type === 'mpesa' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-blue-100 text-blue-800'
                        }">
                            ${transaction.transaction_type === 'mpesa' ? 'M-Pesa' : 'Cash'}
                        </span>
                    </div>
                    <div class="space-y-1 text-sm">
                        <div class="flex justify-between">
                            <span class="text-gray-500">Customer:</span>
                            <span class="font-medium">${transaction.customer_name || 'N/A'}</span>
                        </div>
                        <div class="flex justify-between">
                            <span class="text-gray-500">Time:</span>
                            <span>${transaction.time}</span>
                        </div>
                        ${transaction.transaction_reference ? `
                            <div class="flex justify-between">
                                <span class="text-gray-500">Reference:</span>
                                <span class="font-mono text-xs">${transaction.transaction_reference}</span>
                            </div>
                        ` : ''}
                        ${transaction.product_service ? `
                            <div class="flex justify-between">
                                <span class="text-gray-500">Product:</span>
                                <span>${transaction.product_service}</span>
                            </div>
                        ` : ''}
                        <div class="flex justify-between">
                            <span class="text-gray-500">Status:</span>
                            <span class="px-2 py-1 text-xs font-semibold rounded-full ${
                                transaction.verified ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                            }">
                                ${transaction.verified ? 'Verified' : 'Pending'}
                            </span>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    }

    // Update pagination info
    updatePaginationInfo();
}

function updatePaginationInfo() {
    const totalItems = filteredTransactions.length;
    const totalPages = Math.ceil(totalItems / rowsPerPage);
    const startItem = totalItems === 0 ? 0 : (currentPage - 1) * rowsPerPage + 1;
    const endItem = Math.min(currentPage * rowsPerPage, totalItems);

    // Update counters
    const showingStart = document.getElementById('showing-start');
    const showingEnd = document.getElementById('showing-end');
    const totalTransactions = document.getElementById('total-transactions');
    const pageInfo = document.getElementById('page-info');

    if (showingStart) showingStart.textContent = startItem;
    if (showingEnd) showingEnd.textContent = endItem;
    if (totalTransactions) totalTransactions.textContent = totalItems;
    if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

    // Update button states
    const prevBtn = document.getElementById('prev-page');
    const nextBtn = document.getElementById('next-page');

    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= totalPages;
    }
}

function sortTable(column) {
    if (sortColumn === column) {
        sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
        sortColumn = column;
        sortDirection = 'desc';
    }
    
    // Update sort select
    const sortSelect = document.getElementById('sort-transactions');
    if (sortSelect) {
        sortSelect.value = `${column}-${sortDirection}`;
    }
    
    filterAndRenderTransactions();
}

// Update loadDashboard function to initialize table
function updateTransactionsData(transactions) {
    transactionsData = transactions || [];
    filteredTransactions = [...transactionsData];
    
    // Initialize table functionality if not already done
    if (!document.getElementById('search-transactions')?.hasEventListener) {
        initializeTransactionsTable();
        // Mark as initialized
        const searchInput = document.getElementById('search-transactions');
        if (searchInput) {
            searchInput.hasEventListener = true;
        }
    }
    
    filterAndRenderTransactions();
}

// Export functions for use in HTML
window.refreshDashboard = refreshDashboard;
window.parseSMS = parseSMS;
window.importTransactions = importTransactions;
window.loadSampleSMS = loadSampleSMS;
window.resetTransactionForm = resetTransactionForm;
window.addProduct = addProduct;
window.removeProduct = removeProduct;
window.logout = logout;
window.exportData = exportData;
window.sortTable = sortTable;
window.refreshReports = refreshReports;