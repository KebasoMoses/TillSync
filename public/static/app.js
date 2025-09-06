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
    initializeApp();
});

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
    
    // Load dashboard data
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
    const { summary, transactions } = currentData;
    
    // Update summary cards
    document.getElementById('mpesa-sales').textContent = formatCurrency(summary.total_mpesa_sales || 0);
    document.getElementById('cash-sales').textContent = formatCurrency(summary.total_cash_sales || 0);
    document.getElementById('total-revenue').textContent = formatCurrency(summary.combined_daily_revenue || 0);
    
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
            displayParsedResults(result.data);
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

function displayParsedResults(data) {
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
    
    const validTransactions = data.transactions.filter(t => t.isValid);
    const invalidTransactions = data.transactions.filter(t => !t.isValid);
    
    resultsDiv.innerHTML = `
        <div class="space-y-4">
            ${validTransactions.length > 0 ? `
                <div>
                    <h4 class="font-semibold text-mpesa-green mb-3">
                        <i class="fas fa-check-circle mr-2"></i>
                        Valid Transactions (${validTransactions.length})
                    </h4>
                    <div class="space-y-2">
                        ${validTransactions.map(t => `
                            <div class="bg-green-50 border border-green-200 rounded-lg p-3">
                                <div class="flex justify-between items-start">
                                    <div>
                                        <p class="font-medium">${t.customerName}</p>
                                        <p class="text-sm text-gray-600">${formatCurrency(t.amount)} - ${t.transactionReference}</p>
                                        <p class="text-xs text-gray-500">${t.time || 'Time not parsed'}</p>
                                    </div>
                                    <span class="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">Ready</span>
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
    
    showLoading(true);
    
    try {
        const response = await fetch('/api/sms/import', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ transactions: validTransactions })
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
            await loadDashboard();
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
        
        // Load current data if not already available
        if (!currentData.summary) {
            const response = await fetch('/api/dashboard');
            const result = await response.json();
            if (result.success) {
                currentData = result.data;
            }
        }
        
        // Update reports UI
        updateReportsUI();
        
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
    loadReportsData();
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
    const fields = ['business-name', 'till-number', 'owner-name', 'phone-number', 'daily-target', 'alert-threshold'];
    
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
        mpesa_till_number: document.getElementById('till-number').value,
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
            
            // Update business name in header
            const headerElement = document.querySelector('h1');
            if (headerElement && formData.business_name) {
                headerElement.innerHTML = `<i class="fas fa-cash-register mr-2"></i>${formData.business_name} - TillSync`;
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
    const dropdown = document.getElementById('product-service');
    if (!dropdown) return;
    
    // Keep existing options and add new products
    const existingOptions = Array.from(dropdown.options).slice(0, 4); // Keep first 4 default options
    
    dropdown.innerHTML = '';
    existingOptions.forEach(option => dropdown.appendChild(option));
    
    // Add separator if products exist
    if (userProducts.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.textContent = '--- Your Products ---';
        dropdown.appendChild(separator);
        
        // Add user products
        userProducts.forEach(product => {
            const option = document.createElement('option');
            option.value = product.name;
            option.textContent = product.name;
            dropdown.appendChild(option);
        });
    }
}

function logout() {
    if (confirm('Are you sure you want to logout? This will clear all your local data.')) {
        // Clear any stored session data
        localStorage.clear();
        sessionStorage.clear();
        
        // In a real app, you might redirect to login page
        // For now, just show a message and reload
        showSuccess('Logged out successfully! Refreshing page...');
        setTimeout(() => {
            window.location.reload();
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
        const searchableText = [
            transaction.customer_name || '',
            transaction.amount_received?.toString() || '',
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
                aVal = parseFloat(aVal) || 0;
                bVal = parseFloat(bVal) || 0;
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
                            transaction.transaction_type === 'M-Pesa' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-blue-100 text-blue-800'
                        }">
                            ${transaction.transaction_type}
                        </span>
                    </td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-900">${transaction.customer_name || 'N/A'}</td>
                    <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-green-600">
                        KSh ${parseFloat(transaction.amount_received || 0).toLocaleString('en-KE', {minimumFractionDigits: 2})}
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
                            KSh ${parseFloat(transaction.amount_received || 0).toLocaleString('en-KE', {minimumFractionDigits: 2})}
                        </span>
                        <span class="px-2 py-1 text-xs font-semibold rounded-full ${
                            transaction.transaction_type === 'M-Pesa' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-blue-100 text-blue-800'
                        }">
                            ${transaction.transaction_type}
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