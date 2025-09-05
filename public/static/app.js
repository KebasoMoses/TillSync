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
    
    // Update transactions table
    updateTransactionsTable(transactions);
}

function updateTransactionsTable(transactions) {
    const tbody = document.getElementById('transactions-table');
    if (!tbody) return;
    
    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" class="px-6 py-8 text-center text-gray-500">
                    <i class="fas fa-inbox text-2xl mb-2 block"></i>
                    No transactions recorded today yet.
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = transactions.map(transaction => {
        const typeIcon = transaction.transaction_type === 'mpesa' ? 
            '<i class="fas fa-mobile-alt text-mpesa-green"></i>' : 
            '<i class="fas fa-coins text-yellow-500"></i>';
        
        const amount = transaction.transaction_type === 'mpesa' ? 
            transaction.amount_received : transaction.cash_sale_amount;
        
        const statusBadge = transaction.verified ? 
            '<span class="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">Verified</span>' :
            '<span class="px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>';
        
        return `
            <tr class="hover:bg-gray-50">
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${convertTo12Hour(transaction.time)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm">
                    ${typeIcon} ${transaction.transaction_type.toUpperCase()}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${transaction.customer_name || 'Walk-in Customer'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    ${formatCurrency(amount || 0)}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                    ${transaction.transaction_reference || '-'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    ${transaction.product_service || 'Not specified'}
                </td>
                <td class="px-6 py-4 whitespace-nowrap">
                    ${statusBadge}
                </td>
            </tr>
        `;
    }).join('');
}

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
async function loadReportsData() {
    // Load fee structure if not already loaded
    if (!document.getElementById('fee-structure-table').innerHTML.trim()) {
        await loadFeeStructure();
    }
    
    // Create revenue breakdown chart
    createRevenueChart();
    
    // Create trend chart (placeholder for now)
    createTrendChart();
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
    
    const { summary } = currentData;
    
    new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['M-Pesa Sales', 'Cash Sales', 'M-Pesa Fees'],
            datasets: [{
                data: [
                    summary.total_mpesa_sales || 0,
                    summary.total_cash_sales || 0,
                    summary.total_mpesa_fees || 0
                ],
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
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.label + ': ' + formatCurrency(context.parsed);
                        }
                    }
                }
            }
        }
    });
}

function createTrendChart() {
    const ctx = document.getElementById('trend-chart');
    if (!ctx) return;
    
    // Placeholder trend data (would come from API in real implementation)
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const mpesaData = [1200, 1500, 1800, 2000, 2200, 1900, 1600];
    const cashData = [300, 250, 400, 350, 450, 500, 380];
    
    new Chart(ctx, {
        type: 'line',
        data: {
            labels: days,
            datasets: [
                {
                    label: 'M-Pesa Sales',
                    data: mpesaData,
                    borderColor: '#00d13b',
                    backgroundColor: 'rgba(0, 209, 59, 0.1)',
                    tension: 0.4,
                    fill: true
                },
                {
                    label: 'Cash Sales',
                    data: cashData,
                    borderColor: '#0066cc',
                    backgroundColor: 'rgba(0, 102, 204, 0.1)',
                    tension: 0.4,
                    fill: true
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom'
                },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return context.dataset.label + ': ' + formatCurrency(context.parsed.y);
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        callback: function(value) {
                            return formatCurrency(value);
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

// Export functions for use in HTML
window.refreshDashboard = refreshDashboard;
window.parseSMS = parseSMS;
window.importTransactions = importTransactions;
window.loadSampleSMS = loadSampleSMS;
window.resetTransactionForm = resetTransactionForm;