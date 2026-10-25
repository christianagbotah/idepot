<!DOCTYPE html>
<html lang="en" dir="<?php if ($text_align == 'right-to-left') echo 'rtl'; ?>">
<head>
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="description" content="Modern Inventory Management System - Responsive & User-Friendly">
    <meta name="author" content="Lightworldtech">
    <meta name="theme-color" content="#2563eb">
    
    <title><?php echo $page_title; ?> | <?php echo $system_name; ?></title>
    
    <!-- Preload critical resources -->
    <link rel="preload" href="<?php echo base_url('assets/css/modern-ui.css'); ?>" as="style">
    <link rel="preload" href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" as="style">
    
    <!-- Critical CSS -->
    <style>
        /* Critical above-the-fold styles */
        body { 
            margin: 0; 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
            background-color: #f8fafc; 
        }
        .loading-screen {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 9999;
            transition: opacity 0.3s ease-in-out;
        }
        .loading-content {
            text-align: center;
            color: white;
        }
        .loading-spinner {
            width: 40px;
            height: 40px;
            border: 3px solid rgba(255, 255, 255, 0.3);
            border-top: 3px solid white;
            border-radius: 50%;
            animation: spin 1s linear infinite;
            margin: 0 auto 1rem;
        }
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
    </style>
    
    <!-- Favicon -->
    <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png'); ?>">
    
    <!-- Fonts -->
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    
    <!-- Modern UI Framework -->
    <link rel="stylesheet" href="<?php echo base_url('assets/css/modern-ui.css'); ?>">
    
    <!-- Chart.js for analytics -->
    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    
    <!-- jQuery (for compatibility with existing code) -->
    <script src="<?php echo base_url('assets/js/jquery-3.4.1.js'); ?>"></script>
    
    <?php if ($text_align == 'right-to-left'): ?>
    <style>
        body { direction: rtl; }
        .modern-sidebar { right: 0; left: auto; }
        .main-content.sidebar-open { margin-right: 280px; margin-left: 0; }
    </style>
    <?php endif; ?>
</head>

<body>
    <!-- Loading Screen -->
    <div class="loading-screen" id="loading-screen">
        <div class="loading-content">
            <div class="loading-spinner"></div>
            <h3>Loading <?php echo $system_name; ?></h3>
            <p>Please wait while we prepare your dashboard...</p>
        </div>
    </div>

    <!-- Main Application -->
    <div class="app-container" id="app-container" style="opacity: 0;">
        <!-- Modern Header -->
        <?php include 'modern-header.php'; ?>
        
        <!-- Main Content Area -->
        <main class="main-content" id="main-content">
            <div id="ajax_update">
                <?php
                // Load the appropriate page content
                if (isset($page_name)) {
                    switch ($page_name) {
                        case 'dashboard':
                            include 'admin/pages/modern-dashboard.php';
                            break;
                        default:
                            // Load existing page structure for other pages
                            if (file_exists(APPPATH . 'v_l02i/backend/admin/pages/' . $page_name . '.php')) {
                                include 'admin/pages/' . $page_name . '.php';
                            } else {
                                echo '<div class="container"><div class="card"><div class="card-body"><h2>Page Not Found</h2><p>The requested page could not be found.</p></div></div></div>';
                            }
                            break;
                    }
                } else {
                    include 'admin/pages/modern-dashboard.php';
                }
                ?>
            </div>
        </main>
        
        <!-- Toast Notifications Container -->
        <div class="toast-container" id="toast-container"></div>
        
        <!-- Modal Container -->
        <div id="modal-container"></div>
    </div>

    <!-- Service Worker Registration -->
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
                navigator.serviceWorker.register('<?php echo base_url('sw.js'); ?>')
                    .then(function(registration) {
                        console.log('SW registered: ', registration);
                    })
                    .catch(function(registrationError) {
                        console.log('SW registration failed: ', registrationError);
                    });
            });
        }
    </script>

    <!-- Modern JavaScript Framework -->
    <script>
        // Modern App Initialization
        class InventoryApp {
            constructor() {
                this.init();
            }

            init() {
                this.setupEventListeners();
                this.initializeComponents();
                this.hideLoadingScreen();
            }

            setupEventListeners() {
                // Handle responsive sidebar
                this.setupSidebarToggle();
                
                // Handle form submissions
                this.setupFormHandlers();
                
                // Handle navigation
                this.setupNavigation();
                
                // Handle keyboard shortcuts
                this.setupKeyboardShortcuts();
            }

            setupSidebarToggle() {
                const toggleBtn = document.getElementById('mobile-menu-toggle');
                const sidebar = document.getElementById('modern-sidebar');
                const overlay = document.getElementById('sidebar-overlay');
                const mainContent = document.getElementById('main-content');

                if (toggleBtn && sidebar && overlay) {
                    toggleBtn.addEventListener('click', () => {
                        sidebar.classList.toggle('open');
                        overlay.classList.toggle('active');
                        mainContent.classList.toggle('sidebar-open');
                    });

                    overlay.addEventListener('click', () => {
                        sidebar.classList.remove('open');
                        overlay.classList.remove('active');
                        mainContent.classList.remove('sidebar-open');
                    });
                }

                // Handle window resize
                window.addEventListener('resize', () => {
                    if (window.innerWidth > 768) {
                        sidebar?.classList.remove('open');
                        overlay?.classList.remove('active');
                        mainContent?.classList.add('sidebar-open');
                    } else {
                        mainContent?.classList.remove('sidebar-open');
                    }
                });
            }

            setupFormHandlers() {
                // Add modern form validation and submission handling
                document.addEventListener('submit', (e) => {
                    const form = e.target;
                    if (form.classList.contains('modern-form')) {
                        e.preventDefault();
                        this.handleFormSubmission(form);
                    }
                });
            }

            setupNavigation() {
                // Handle navigation with loading states
                document.addEventListener('click', (e) => {
                    const link = e.target.closest('[data-navigate]');
                    if (link) {
                        e.preventDefault();
                        this.navigateTo(link.getAttribute('data-navigate'));
                    }
                });
            }

            setupKeyboardShortcuts() {
                document.addEventListener('keydown', (e) => {
                    // Ctrl/Cmd + K for search
                    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                        e.preventDefault();
                        this.focusSearch();
                    }
                    
                    // Escape to close modals/sidebar
                    if (e.key === 'Escape') {
                        this.closeModalsAndSidebar();
                    }
                });
            }

            initializeComponents() {
                // Initialize tooltips
                this.initializeTooltips();
                
                // Initialize dropdowns
                this.initializeDropdowns();
                
                // Initialize data tables
                this.initializeDataTables();
                
                // Setup CSRF token for AJAX requests
                this.setupCSRF();
            }

            initializeTooltips() {
                const tooltipElements = document.querySelectorAll('[data-tooltip]');
                tooltipElements.forEach(element => {
                    // Simple tooltip implementation
                    element.addEventListener('mouseenter', (e) => {
                        this.showTooltip(e.target, e.target.getAttribute('data-tooltip'));
                    });
                    
                    element.addEventListener('mouseleave', () => {
                        this.hideTooltip();
                    });
                });
            }

            initializeDropdowns() {
                document.addEventListener('click', (e) => {
                    const dropdown = e.target.closest('.dropdown');
                    if (dropdown) {
                        const menu = dropdown.querySelector('.dropdown-menu');
                        if (menu) {
                            menu.classList.toggle('show');
                        }
                    } else {
                        // Close all dropdowns when clicking outside
                        document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                            menu.classList.remove('show');
                        });
                    }
                });
            }

            initializeDataTables() {
                // Initialize modern data tables with responsive features
                const tables = document.querySelectorAll('.data-table');
                tables.forEach(table => {
                    // Add responsive wrapper
                    if (!table.closest('.table-container')) {
                        const wrapper = document.createElement('div');
                        wrapper.className = 'table-container';
                        table.parentNode.insertBefore(wrapper, table);
                        wrapper.appendChild(table);
                    }
                });
            }

            setupCSRF() {
                // Setup CSRF token for all AJAX requests
                $.ajaxSetup({
                    cache: false,
                    data: {
                        '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
                    }
                });
            }

            hideLoadingScreen() {
                const loadingScreen = document.getElementById('loading-screen');
                const appContainer = document.getElementById('app-container');
                
                setTimeout(() => {
                    loadingScreen.style.opacity = '0';
                    appContainer.style.opacity = '1';
                    
                    setTimeout(() => {
                        loadingScreen.style.display = 'none';
                    }, 300);
                }, 1000);
            }

            // Utility methods
            showToast(message, type = 'info') {
                const container = document.getElementById('toast-container');
                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                toast.innerHTML = `
                    <div class="toast-content">
                        <span class="toast-message">${message}</span>
                        <button class="toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
                    </div>
                `;
                
                container.appendChild(toast);
                
                // Auto remove after 5 seconds
                setTimeout(() => {
                    if (toast.parentElement) {
                        toast.remove();
                    }
                }, 5000);
            }

            showModal(content, title = '') {
                const modal = document.createElement('div');
                modal.className = 'modal-overlay';
                modal.innerHTML = `
                    <div class="modal-content">
                        <div class="modal-header">
                            <h3 class="modal-title">${title}</h3>
                            <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">×</button>
                        </div>
                        <div class="modal-body">
                            ${content}
                        </div>
                    </div>
                `;
                
                document.getElementById('modal-container').appendChild(modal);
            }

            focusSearch() {
                const searchInput = document.getElementById('search_identifier');
                if (searchInput) {
                    searchInput.focus();
                }
            }

            closeModalsAndSidebar() {
                // Close sidebar
                const sidebar = document.getElementById('modern-sidebar');
                const overlay = document.getElementById('sidebar-overlay');
                if (sidebar && overlay) {
                    sidebar.classList.remove('open');
                    overlay.classList.remove('active');
                }
                
                // Close modals
                document.querySelectorAll('.modal-overlay').forEach(modal => {
                    modal.remove();
                });
            }

            navigateTo(url) {
                this.showToast('Loading...', 'info');
                window.location.href = url;
            }

            handleFormSubmission(form) {
                const formData = new FormData(form);
                const submitBtn = form.querySelector('[type="submit"]');
                
                if (submitBtn) {
                    submitBtn.disabled = true;
                    submitBtn.innerHTML = 'Processing...';
                }
                
                fetch(form.action, {
                    method: 'POST',
                    body: formData
                })
                .then(response => response.json())
                .then(data => {
                    if (data.success) {
                        this.showToast(data.message || 'Success!', 'success');
                    } else {
                        this.showToast(data.message || 'An error occurred', 'error');
                    }
                })
                .catch(error => {
                    this.showToast('Network error occurred', 'error');
                })
                .finally(() => {
                    if (submitBtn) {
                        submitBtn.disabled = false;
                        submitBtn.innerHTML = 'Submit';
                    }
                });
            }
        }

        // Initialize the app when DOM is loaded
        document.addEventListener('DOMContentLoaded', () => {
            window.inventoryApp = new InventoryApp();
        });

        // Legacy function compatibility
        function showPageLoading() {
            window.inventoryApp?.showToast('Loading...', 'info');
        }

        function hidePageLoading() {
            // Toast will auto-hide
        }

        function showAjaxModal_confirm(message, title) {
            window.inventoryApp?.showModal(message, title);
        }

        function showAjaxModal_calendar(url) {
            fetch(url)
                .then(response => response.text())
                .then(html => {
                    window.inventoryApp?.showModal(html, 'Calendar');
                });
        }
    </script>

    <!-- Toast Notification Styles -->
    <style>
        .toast-container {
            position: fixed;
            top: 20px;
            right: 20px;
            z-index: 10000;
            display: flex;
            flex-direction: column;
            gap: 10px;
        }

        .toast {
            background: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
            border-left: 4px solid #2563eb;
            min-width: 300px;
            animation: slideInRight 0.3s ease-out;
        }

        .toast-success { border-left-color: #10b981; }
        .toast-error { border-left-color: #ef4444; }
        .toast-warning { border-left-color: #f59e0b; }

        .toast-content {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 16px;
        }

        .toast-message {
            font-size: 14px;
            color: #374151;
        }

        .toast-close {
            background: none;
            border: none;
            font-size: 18px;
            cursor: pointer;
            color: #9ca3af;
            padding: 0;
            margin-left: 12px;
        }

        .modal-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10001;
            animation: fadeIn 0.2s ease-out;
        }

        .modal-content {
            background: white;
            border-radius: 12px;
            max-width: 500px;
            width: 90%;
            max-height: 80vh;
            overflow-y: auto;
            animation: scaleIn 0.2s ease-out;
        }

        .modal-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 20px;
            border-bottom: 1px solid #e5e7eb;
        }

        .modal-title {
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #111827;
        }

        .modal-close {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #9ca3af;
            padding: 0;
        }

        .modal-body {
            padding: 20px;
        }

        @keyframes slideInRight {
            from { transform: translateX(100%); opacity: 0; }
            to { transform: translateX(0); opacity: 1; }
        }

        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }

        @keyframes scaleIn {
            from { transform: scale(0.9); opacity: 0; }
            to { transform: scale(1); opacity: 1; }
        }

        @media (max-width: 768px) {
            .toast-container {
                right: 10px;
                left: 10px;
            }
            
            .toast {
                min-width: auto;
            }
            
            .modal-content {
                margin: 20px;
                width: calc(100% - 40px);
            }
        }
    </style>

    <!-- Include legacy scripts for compatibility -->
    <?php include 'includes_bottom.php'; ?>
</body>
</html>