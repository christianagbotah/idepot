<?php 
$current_user = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
$current_user_id = $this->session->userdata('login_user_id');
?>

<!-- Modern UI CSS -->
<link rel="stylesheet" href="<?php echo base_url('assets/css/modern-ui.css'); ?>">

<style>
/* Quick integration styles */
.quick-modern-header {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: white;
    padding: 1rem 0;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    position: sticky;
    top: 0;
    z-index: 1000;
}

.quick-header-content {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 1rem;
}

.quick-logo-section {
    display: flex;
    align-items: center;
    gap: 0.75rem;
}

.quick-logo-section img {
    height: 40px;
    width: auto;
}

.quick-system-name {
    font-size: 1.5rem;
    font-weight: 700;
    letter-spacing: -0.025em;
}

.quick-clock {
    font-family: 'Courier New', monospace;
    font-size: 1.125rem;
    font-weight: 600;
    background: rgba(255, 255, 255, 0.1);
    padding: 0.5rem 0.75rem;
    border-radius: 0.5rem;
    backdrop-filter: blur(10px);
}

.quick-nav-tabs {
    background: white;
    border-bottom: 1px solid #e2e8f0;
    position: sticky;
    top: 80px;
    z-index: 999;
}

.quick-nav-container {
    max-width: 1280px;
    margin: 0 auto;
    padding: 0 1rem;
}

.quick-nav-list {
    display: flex;
    overflow-x: auto;
    scrollbar-width: none;
    -ms-overflow-style: none;
}

.quick-nav-list::-webkit-scrollbar {
    display: none;
}

.quick-nav-tab {
    flex-shrink: 0;
    padding: 1rem 1.5rem;
    text-decoration: none;
    color: #64748b;
    font-weight: 500;
    border-bottom: 2px solid transparent;
    transition: all 0.15s ease-in-out;
    position: relative;
    display: flex;
    align-items: center;
    gap: 0.5rem;
}

.quick-nav-tab:hover {
    color: #2563eb;
    background-color: #f8fafc;
}

.quick-nav-tab.active {
    color: #2563eb;
    border-bottom-color: #2563eb;
    background-color: #f8fafc;
}

.quick-pos-tab {
    background: linear-gradient(135deg, #dc2626, #b91c1c);
    color: white !important;
    border-radius: 0.5rem 0.5rem 0 0;
    margin: 0 0.25rem;
}

.quick-pos-tab:hover {
    background: linear-gradient(135deg, #b91c1c, #991b1b);
    color: white !important;
}

@media (max-width: 768px) {
    .quick-header-content {
        flex-direction: column;
        text-align: center;
    }
    
    .quick-system-name {
        font-size: 1.25rem;
    }
    
    .quick-nav-tab {
        padding: 0.75rem 1rem;
        font-size: 0.875rem;
    }
}
</style>

<div class="quick-modern-header">
    <div class="quick-header-content">
        <div class="quick-logo-section">
            <img src="<?php echo base_url('uploads/school_logo.png'); ?>" alt="<?php echo $system_name; ?>">
            <div>
                <div class="quick-system-name"><?php echo $system_name; ?></div>
                <div style="font-size: 0.75rem; opacity: 0.8;">Linventory Manager</div>
            </div>
        </div>
        <div class="quick-clock" id="quick-clock">00:00:00</div>
    </div>
</div>

<nav class="quick-nav-tabs">
    <div class="quick-nav-container">
        <div class="quick-nav-list">
            <a href="#" class="quick-nav-tab <?php if ($page_name == 'dashboard') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('dashboard')">
                Dashboard
            </a>

            <a href="<?= site_url('admin/pos') ?>" target="_blank" class="quick-nav-tab quick-pos-tab">
                POS
            </a>

            <a href="#" class="quick-nav-tab <?php if ($page_name == 'sales') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('sales')">
                Sales
            </a>

            <a href="#" class="quick-nav-tab <?php if ($page_name == 'purchases') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('purchases')">
                Purchases
            </a>

            <a href="#" class="quick-nav-tab <?php if ($page_name == 'banking') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('banking')">
                Banking
            </a>

            <a href="#" class="quick-nav-tab <?php if ($page_name == 'reports') echo 'active'; ?>" 
               onclick="changeNavMenuAndPageContent('reports')">
                Reports
            </a>
        </div>
    </div>
</nav>

<script>
// Update clock
function updateQuickClock() {
    const now = new Date();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    
    const clockElement = document.getElementById('quick-clock');
    if (clockElement) {
        clockElement.textContent = `${hours}:${minutes}:${seconds}`;
    }
}

setInterval(updateQuickClock, 1000);
updateQuickClock();
</script>