<?php 
// Modern responsive header for inventory management system
$current_user = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
$current_user_id = $this->session->userdata('login_user_id');
?>

<header class="modern-header">
    <div class="container">
        <div class="header-content">
            <!-- Logo and System Name -->
            <div class="logo-section">
                <img src="<?php echo base_url('uploads/school_logo.png'); ?>" alt="<?php echo $system_name; ?>" class="logo">
                <div>
                    <div class="system-name"><?php echo $system_name; ?></div>
                    <div style="font-size: 0.75rem; opacity: 0.8;">Linventory Manager</div>
                </div>
            </div>

            <!-- Header Actions -->
            <div class="header-actions">
                <!-- Real-time Clock -->
                <div class="clock-display" id="modern-clock">00:00:00</div>
                
                <!-- Mobile Menu Toggle -->
                <button class="mobile-menu-toggle" id="mobile-menu-toggle" aria-label="Toggle menu">
                    <svg class="menu-icon" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <line x1="3" y1="12" x2="21" y2="12"></line>
                        <line x1="3" y1="18" x2="21" y2="18"></line>
                    </svg>
                </button>
            </div>
        </div>
    </div>
</header>

<!-- Modern Navigation -->
<nav class="modern-nav">
    <div class="container">
        <div class="nav-tabs" role="tablist">
            <a href="#" class="nav-tab <?php if ($page_name == 'dashboard') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('dashboard')" role="tab">
                <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="3" y="3" width="7" height="7"></rect>
                    <rect x="14" y="3" width="7" height="7"></rect>
                    <rect x="14" y="14" width="7" height="7"></rect>
                    <rect x="3" y="14" width="7" height="7"></rect>
                </svg>
                <span class="nav-text"><?php echo get_phrase('dashboard'); ?></span>
            </a>

            <a href="<?= site_url('admin/pos') ?>" target="_blank" class="nav-tab pos-tab">
                <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <span class="nav-text"><?php echo get_phrase('POS'); ?></span>
            </a>

            <a href="#" class="nav-tab <?php if ($page_name == 'sales') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('sales')" role="tab">
                <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <line x1="12" y1="1" x2="12" y2="23"></line>
                    <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <span class="nav-text"><?php echo get_phrase('sales'); ?></span>
            </a>

            <a href="#" class="nav-tab <?php if ($page_name == 'purchases') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('purchases')" role="tab">
                <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                    <line x1="3" y1="6" x2="21" y2="6"></line>
                    <path d="M16 10a4 4 0 0 1-8 0"></path>
                </svg>
                <span class="nav-text"><?php echo get_phrase('purchases'); ?></span>
            </a>

            <a href="#" class="nav-tab <?php if ($page_name == 'banking') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('banking')" role="tab">
                <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 21h18"></path>
                    <path d="M5 21V7l8-4v18"></path>
                    <path d="M19 21V11l-6-4"></path>
                </svg>
                <span class="nav-text"><?php echo get_phrase('banking'); ?></span>
            </a>

            <a href="#" class="nav-tab <?php if ($page_name == 'reports') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('reports')" role="tab">
                <svg class="nav-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 3v18h18"></path>
                    <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3"></path>
                </svg>
                <span class="nav-text"><?php echo get_phrase('reports'); ?></span>
            </a>
        </div>
    </div>
</nav>

<!-- Modern Sidebar -->
<aside class="modern-sidebar" id="modern-sidebar">
    <div class="sidebar-header">
        <div class="search-box">
            <?php echo form_open(site_url($account_type . '/search_results'), array('class' => 'search-form')); ?>
                <input type="text" 
                       class="search-input" 
                       name="search_identifier" 
                       id="search_identifier" 
                       placeholder="<?php echo get_phrase('search here...'); ?>" 
                       required>
                <button type="submit" class="search-icon" aria-label="Search">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                </button>
            </form>
        </div>
    </div>

    <div class="sidebar-menu">
        <!-- Navigation menu will be loaded here dynamically -->
        <div id="nav_menu_loading_holder">
            <div class="loading-spinner">
                <svg class="animate-spin" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 12a9 9 0 11-6.219-8.56"></path>
                </svg>
                <span>Loading menu...</span>
            </div>
        </div>
        <div id="nav_items_holder" style="display: none;"></div>
    </div>
</aside>

<!-- Overlay for mobile sidebar -->
<div class="sidebar-overlay" id="sidebar-overlay"></div>

<style>
/* Additional styles for the modern header */
.mobile-menu-toggle {
    display: none;
    background: none;
    border: none;
    color: white;
    cursor: pointer;
    padding: var(--space-2);
    border-radius: var(--radius-md);
    transition: background-color var(--transition-fast);
}

.mobile-menu-toggle:hover {
    background-color: rgba(255, 255, 255, 0.1);
}

.nav-icon {
    width: 16px;
    height: 16px;
    margin-right: var(--space-2);
}

.loading-spinner {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    color: var(--gray-500);
    font-size: 0.875rem;
}

.animate-spin {
    animation: spin 1s linear infinite;
}

@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}

.sidebar-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.5);
    z-index: 997;
    opacity: 0;
    visibility: hidden;
    transition: all var(--transition-normal);
}

.sidebar-overlay.active {
    opacity: 1;
    visibility: visible;
}

@media (max-width: 768px) {
    .mobile-menu-toggle {
        display: block;
    }
    
    .nav-text {
        display: none;
    }
    
    .nav-tab {
        flex-direction: column;
        gap: var(--space-1);
        padding: var(--space-3);
        min-width: 60px;
    }
    
    .nav-icon {
        margin-right: 0;
    }
    
    .modern-sidebar {
        transform: translateX(-100%);
    }
    
    .modern-sidebar.open {
        transform: translateX(0);
    }
}

@media (max-width: 480px) {
    .header-content {
        gap: var(--space-2);
    }
    
    .logo-section img {
        height: 32px;
    }
    
    .system-name {
        font-size: 1rem;
    }
    
    .clock-display {
        font-size: 0.75rem;
        padding: var(--space-1) var(--space-2);
    }
}
</style>

<script>
// Modern header functionality
document.addEventListener('DOMContentLoaded', function() {
    // Mobile menu toggle
    const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
    const sidebar = document.getElementById('modern-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    if (mobileMenuToggle) {
        mobileMenuToggle.addEventListener('click', function() {
            sidebar.classList.toggle('open');
            overlay.classList.toggle('active');
        });
    }
    
    if (overlay) {
        overlay.addEventListener('click', function() {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        });
    }
    
    // Update clock
    function updateClock() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        
        const clockElement = document.getElementById('modern-clock');
        if (clockElement) {
            clockElement.textContent = `${hours}:${minutes}:${seconds}`;
        }
    }
    
    // Update clock every second
    setInterval(updateClock, 1000);
    updateClock(); // Initial call
    
    // Handle responsive navigation
    function handleResize() {
        if (window.innerWidth > 768) {
            sidebar.classList.remove('open');
            overlay.classList.remove('active');
        }
    }
    
    window.addEventListener('resize', handleResize);
});

// Enhanced navigation function with loading states
function changeNavMenuAndPageContent(type) {
    // Show loading state
    showPageLoading();
    
    // Close mobile menu if open
    const sidebar = document.getElementById('modern-sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    if (sidebar && overlay) {
        sidebar.classList.remove('open');
        overlay.classList.remove('active');
    }
    
    // Update active tab
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    event.target.closest('.nav-tab').classList.add('active');
    
    // Show loading in sidebar
    const loadingHolder = document.getElementById('nav_menu_loading_holder');
    const itemsHolder = document.getElementById('nav_items_holder');
    
    if (loadingHolder && itemsHolder) {
        loadingHolder.style.display = 'block';
        itemsHolder.style.display = 'none';
    }
    
    // Make AJAX request
    $.ajax({
        url: '<?php echo site_url('admin/loadContents/') ?>' + type,
        type: 'post',
        dataType: 'json',
        cache: false
    })
    .done(function(response) {
        // Load navigation menu
        if (itemsHolder && loadingHolder) {
            itemsHolder.innerHTML = response.navMenu;
            loadingHolder.style.display = 'none';
            itemsHolder.style.display = 'block';
        }
        
        // Load main page content
        const ajaxUpdate = document.getElementById('ajax_update');
        if (ajaxUpdate) {
            ajaxUpdate.innerHTML = response.mainPage;
        }
        
        hidePageLoading();
    })
    .fail(function(err) {
        console.error('Failed to load content:', err);
        hidePageLoading();
    });
}
</script>