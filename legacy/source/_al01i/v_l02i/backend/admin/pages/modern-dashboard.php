<?php
// Modern responsive dashboard for inventory management system
$current_user_id = $this->session->userdata('login_user_id');
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;

// Get dashboard statistics
$total_sales_today = $this->db->select_sum('credit_amount')
    ->where('account_name', 'General Sales')
    ->where('timestamp >=', strtotime('today'))
    ->get('general_journal')->row()->credit_amount ?? 0;

$total_purchases_today = $this->db->select_sum('debit_amount')
    ->where('account_name', 'General Purchases')
    ->where('timestamp >=', strtotime('today'))
    ->get('general_journal')->row()->debit_amount ?? 0;

$total_customers = $this->db->count_all('customers');
$total_items = $this->db->count_all('item');

// Monthly sales data for chart
$monthly_sales = [];
for ($i = 1; $i <= 12; $i++) {
    $month_start = strtotime(date('Y-' . str_pad($i, 2, '0', STR_PAD_LEFT) . '-01'));
    $month_end = strtotime(date('Y-' . str_pad($i, 2, '0', STR_PAD_LEFT) . '-t'));
    
    $sales = $this->db->select_sum('credit_amount')
        ->where('account_name', 'General Sales')
        ->where('timestamp >=', $month_start)
        ->where('timestamp <=', $month_end)
        ->get('general_journal')->row()->credit_amount ?? 0;
    
    $monthly_sales[] = $sales;
}
?>

<div class="main-content" id="main-content">
    <div class="container">
        <!-- Page Header -->
        <div class="page-header">
            <div class="flex items-center justify-between mb-6">
                <div>
                    <h1 class="text-2xl font-bold text-gray-900">
                        <svg class="inline-block w-6 h-6 mr-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="7" height="7"></rect>
                            <rect x="14" y="3" width="7" height="7"></rect>
                            <rect x="14" y="14" width="7" height="7"></rect>
                            <rect x="3" y="14" width="7" height="7"></rect>
                        </svg>
                        <?php echo $page_title; ?>
                    </h1>
                    <p class="text-gray-600">Welcome back! Here's what's happening with your inventory today.</p>
                </div>
                <button class="btn btn-primary" onclick="showCalendar()">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect>
                        <line x1="16" y1="2" x2="16" y2="6"></line>
                        <line x1="8" y1="2" x2="8" y2="6"></line>
                        <line x1="3" y1="10" x2="21" y2="10"></line>
                    </svg>
                    Calendar
                </button>
            </div>
        </div>

        <!-- Dashboard Statistics -->
        <div class="dashboard-grid">
            <!-- Sales Card -->
            <div class="stat-card success">
                <div class="stat-header">
                    <div class="stat-title">Today's Sales</div>
                    <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="12" y1="1" x2="12" y2="23"></line>
                        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                    </svg>
                </div>
                <div class="stat-value"><?php echo $currency . ' ' . number_format($total_sales_today, 2); ?></div>
                <div class="stat-change positive">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                        <polyline points="17 6 23 6 23 12"></polyline>
                    </svg>
                    <span>+12% from yesterday</span>
                </div>
            </div>

            <!-- Purchases Card -->
            <div class="stat-card danger">
                <div class="stat-header">
                    <div class="stat-title">Today's Purchases</div>
                    <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <path d="M16 10a4 4 0 0 1-8 0"></path>
                    </svg>
                </div>
                <div class="stat-value"><?php echo $currency . ' ' . number_format($total_purchases_today, 2); ?></div>
                <div class="stat-change negative">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6"></polyline>
                        <polyline points="17 18 23 18 23 12"></polyline>
                    </svg>
                    <span>-5% from yesterday</span>
                </div>
            </div>

            <!-- Customers Card -->
            <div class="stat-card info">
                <div class="stat-header">
                    <div class="stat-title">Total Customers</div>
                    <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
                        <circle cx="9" cy="7" r="4"></circle>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
                    </svg>
                </div>
                <div class="stat-value"><?php echo number_format($total_customers); ?></div>
                <div class="stat-change positive">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                        <polyline points="17 6 23 6 23 12"></polyline>
                    </svg>
                    <span>+3 new this week</span>
                </div>
            </div>

            <!-- Inventory Card -->
            <div class="stat-card warning">
                <div class="stat-header">
                    <div class="stat-title">Total Items</div>
                    <svg class="stat-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>
                        <polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline>
                        <line x1="12" y1="22.08" x2="12" y2="12"></line>
                    </svg>
                </div>
                <div class="stat-value"><?php echo number_format($total_items); ?></div>
                <div class="stat-change neutral">
                    <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                    <span>5 low stock alerts</span>
                </div>
            </div>
        </div>

        <!-- Quick Actions -->
        <div class="card mb-8">
            <div class="card-header">
                <h2 class="card-title">Quick Actions</h2>
            </div>
            <div class="card-body">
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <a href="<?php echo site_url('admin/sales'); ?>" class="quick-action-card" onclick="showPageLoading()">
                        <div class="quick-action-icon success">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <line x1="12" y1="1" x2="12" y2="23"></line>
                                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                            </svg>
                        </div>
                        <div class="quick-action-content">
                            <div class="quick-action-title">Sales Portal</div>
                            <div class="quick-action-desc">Manage all sales</div>
                        </div>
                    </a>

                    <a href="<?php echo site_url('admin/purchases'); ?>" class="quick-action-card" onclick="showPageLoading()">
                        <div class="quick-action-icon danger">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <path d="M16 10a4 4 0 0 1-8 0"></path>
                            </svg>
                        </div>
                        <div class="quick-action-content">
                            <div class="quick-action-title">Purchases</div>
                            <div class="quick-action-desc">Track purchases</div>
                        </div>
                    </a>

                    <a href="<?php echo site_url('admin/banking'); ?>" class="quick-action-card" onclick="showPageLoading()">
                        <div class="quick-action-icon info">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 21h18"></path>
                                <path d="M5 21V7l8-4v18"></path>
                                <path d="M19 21V11l-6-4"></path>
                            </svg>
                        </div>
                        <div class="quick-action-content">
                            <div class="quick-action-title">Banking</div>
                            <div class="quick-action-desc">Financial info</div>
                        </div>
                    </a>

                    <a href="<?php echo site_url('admin/reports'); ?>" class="quick-action-card" onclick="showPageLoading()">
                        <div class="quick-action-icon warning">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M3 3v18h18"></path>
                                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                            </svg>
                        </div>
                        <div class="quick-action-content">
                            <div class="quick-action-title">Reports</div>
                            <div class="quick-action-desc">View analytics</div>
                        </div>
                    </a>
                </div>
            </div>
        </div>

        <!-- Sales Chart -->
        <div class="card">
            <div class="card-header">
                <div class="flex items-center justify-between">
                    <h2 class="card-title">Sales Overview</h2>
                    <div class="chart-controls">
                        <select class="form-select" id="chart-period">
                            <option value="monthly">Monthly</option>
                            <option value="weekly">Weekly</option>
                            <option value="daily">Daily</option>
                        </select>
                    </div>
                </div>
            </div>
            <div class="card-body">
                <div class="chart-container">
                    <canvas id="salesChart" width="400" height="200"></canvas>
                </div>
            </div>
        </div>
    </div>
</div>

<style>
/* Additional styles for modern dashboard */
.page-header {
    margin-bottom: var(--space-8);
}

.stat-change {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    font-size: 0.75rem;
    font-weight: 500;
    margin-top: var(--space-2);
}

.stat-change.positive {
    color: var(--success-color);
}

.stat-change.negative {
    color: var(--danger-color);
}

.stat-change.neutral {
    color: var(--gray-500);
}

.quick-action-card {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    background: white;
    border: 1px solid var(--gray-200);
    border-radius: var(--radius-lg);
    text-decoration: none;
    transition: all var(--transition-fast);
}

.quick-action-card:hover {
    box-shadow: var(--shadow-md);
    transform: translateY(-1px);
    border-color: var(--primary-color);
}

.quick-action-icon {
    width: 40px;
    height: 40px;
    border-radius: var(--radius-lg);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.quick-action-icon svg {
    width: 20px;
    height: 20px;
    color: white;
}

.quick-action-icon.success {
    background-color: var(--success-color);
}

.quick-action-icon.danger {
    background-color: var(--danger-color);
}

.quick-action-icon.info {
    background-color: var(--info-color);
}

.quick-action-icon.warning {
    background-color: var(--warning-color);
}

.quick-action-content {
    flex: 1;
}

.quick-action-title {
    font-weight: 600;
    color: var(--gray-900);
    margin-bottom: var(--space-1);
}

.quick-action-desc {
    font-size: 0.75rem;
    color: var(--gray-500);
}

.chart-container {
    position: relative;
    height: 300px;
    width: 100%;
}

.chart-controls {
    display: flex;
    gap: var(--space-2);
}

@media (max-width: 768px) {
    .dashboard-grid {
        grid-template-columns: 1fr;
    }
    
    .quick-action-card {
        flex-direction: column;
        text-align: center;
        gap: var(--space-2);
    }
    
    .chart-container {
        height: 250px;
    }
}
</style>

<script>
// Initialize dashboard
document.addEventListener('DOMContentLoaded', function() {
    loadNavMenu();
    initializeSalesChart();
});

function loadNavMenu() {
    const loadingHolder = document.getElementById('nav_menu_loading_holder');
    const itemsHolder = document.getElementById('nav_items_holder');
    
    if (loadingHolder) {
        loadingHolder.innerHTML = '<div class="loading-spinner"><svg class="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"></path></svg><span>Loading Sidebar Menu</span></div>';
    }

    $.ajax({
        url: '<?php echo site_url('admin/loadContents/dashboard/freshLoad') ?>',
        type: 'post',
        dataType: 'json',
        cache: false
    })
    .done(function(response) {
        if (itemsHolder && loadingHolder) {
            itemsHolder.innerHTML = response.navMenu;
            loadingHolder.style.display = 'none';
            itemsHolder.style.display = 'block';
        }
    })
    .fail(function(err) {
        console.error('Failed to load navigation menu:', err);
    });
}

function initializeSalesChart() {
    const ctx = document.getElementById('salesChart');
    if (!ctx) return;

    const monthlyData = <?php echo json_encode($monthly_sales); ?>;
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    new Chart(ctx, {
        type: 'line',
        data: {
            labels: months,
            datasets: [{
                label: 'Sales (<?php echo $currency; ?>)',
                data: monthlyData,
                borderColor: 'rgb(37, 99, 235)',
                backgroundColor: 'rgba(37, 99, 235, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(0, 0, 0, 0.1)'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

function showCalendar() {
    showAjaxModal_calendar('<?php echo site_url('modal/popup_calendar/calendar/'); ?>');
}
</script>