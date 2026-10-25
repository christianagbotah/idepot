<?php
$system_name = $this->db->get_where('settings', array('type' => 'system_name'))->row()->description;
?>

<!DOCTYPE html>
<html lang="en" dir="<?php if ($text_align == 'right-to-left') echo 'rtl';?>">
<head>
    <title><?php echo $page_title;?> | <?php echo $system_name;?></title>
    
    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <meta name="description" content="Modern POS System - Touch-Friendly Interface">
    <meta name="author" content="Lightworldtech">
    <meta name="theme-color" content="#dc2626">
    
    <!-- Modern UI Framework -->
    <link rel="stylesheet" href="<?php echo base_url('assets/css/modern-ui.css'); ?>">
    
    <!-- POS-specific styles -->
    <style>
        :root {
            --pos-primary: #dc2626;
            --pos-primary-hover: #b91c1c;
            --pos-secondary: #f3f4f6;
            --pos-accent: #059669;
        }

        body {
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            font-family: 'Inter', sans-serif;
            overflow-x: hidden;
        }

        .pos-container {
            display: grid;
            grid-template-columns: 1fr 400px;
            height: 100vh;
            gap: 0;
        }

        .pos-main {
            display: flex;
            flex-direction: column;
            background: white;
            border-right: 1px solid var(--gray-200);
        }

        .pos-header {
            background: linear-gradient(135deg, var(--pos-primary) 0%, var(--pos-primary-hover) 100%);
            color: white;
            padding: var(--space-4);
            display: flex;
            align-items: center;
            justify-content: space-between;
            box-shadow: var(--shadow-lg);
        }

        .pos-title {
            font-size: 1.5rem;
            font-weight: 700;
            display: flex;
            align-items: center;
            gap: var(--space-3);
        }

        .pos-actions {
            display: flex;
            gap: var(--space-2);
        }

        .pos-btn {
            padding: var(--space-2) var(--space-4);
            border: none;
            border-radius: var(--radius-lg);
            font-weight: 500;
            cursor: pointer;
            transition: all var(--transition-fast);
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }

        .pos-btn-primary {
            background: rgba(255, 255, 255, 0.2);
            color: white;
            backdrop-filter: blur(10px);
        }

        .pos-btn-primary:hover {
            background: rgba(255, 255, 255, 0.3);
        }

        .search-section {
            padding: var(--space-4);
            border-bottom: 1px solid var(--gray-200);
        }

        .search-box {
            position: relative;
        }

        .search-input {
            width: 100%;
            padding: var(--space-4) var(--space-12) var(--space-4) var(--space-4);
            border: 2px solid var(--gray-200);
            border-radius: var(--radius-xl);
            font-size: 1rem;
            transition: all var(--transition-fast);
        }

        .search-input:focus {
            outline: none;
            border-color: var(--pos-primary);
            box-shadow: 0 0 0 3px rgba(220, 38, 38, 0.1);
        }

        .search-icon {
            position: absolute;
            right: var(--space-4);
            top: 50%;
            transform: translateY(-50%);
            color: var(--gray-400);
        }

        .products-grid {
            flex: 1;
            padding: var(--space-4);
            overflow-y: auto;
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
            gap: var(--space-4);
            align-content: start;
        }

        .product-card {
            background: white;
            border: 2px solid var(--gray-200);
            border-radius: var(--radius-xl);
            padding: var(--space-4);
            cursor: pointer;
            transition: all var(--transition-fast);
            text-align: center;
            position: relative;
            overflow: hidden;
        }

        .product-card:hover {
            border-color: var(--pos-primary);
            transform: translateY(-2px);
            box-shadow: var(--shadow-lg);
        }

        .product-card.selected {
            border-color: var(--pos-primary);
            background: rgba(220, 38, 38, 0.05);
        }

        .product-image {
            width: 80px;
            height: 80px;
            border-radius: var(--radius-lg);
            margin: 0 auto var(--space-3);
            background: var(--gray-100);
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
        }

        .product-image img {
            width: 100%;
            height: 100%;
            object-fit: cover;
        }

        .product-name {
            font-weight: 600;
            color: var(--gray-900);
            margin-bottom: var(--space-2);
            font-size: 0.875rem;
            line-height: 1.3;
        }

        .product-price {
            font-size: 1.125rem;
            font-weight: 700;
            color: var(--pos-primary);
        }

        .product-stock {
            position: absolute;
            top: var(--space-2);
            right: var(--space-2);
            background: var(--pos-accent);
            color: white;
            padding: var(--space-1) var(--space-2);
            border-radius: var(--radius-md);
            font-size: 0.75rem;
            font-weight: 600;
        }

        .product-stock.low {
            background: var(--warning-color);
        }

        .product-stock.out {
            background: var(--danger-color);
        }

        .pos-sidebar {
            background: white;
            display: flex;
            flex-direction: column;
            box-shadow: var(--shadow-xl);
        }

        .cart-header {
            background: var(--gray-50);
            padding: var(--space-4);
            border-bottom: 1px solid var(--gray-200);
        }

        .cart-title {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--gray-900);
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }

        .cart-items {
            flex: 1;
            overflow-y: auto;
            padding: var(--space-4);
        }

        .cart-item {
            display: flex;
            align-items: center;
            gap: var(--space-3);
            padding: var(--space-3);
            border: 1px solid var(--gray-200);
            border-radius: var(--radius-lg);
            margin-bottom: var(--space-3);
            background: white;
        }

        .cart-item-image {
            width: 50px;
            height: 50px;
            border-radius: var(--radius-md);
            background: var(--gray-100);
            flex-shrink: 0;
        }

        .cart-item-details {
            flex: 1;
        }

        .cart-item-name {
            font-weight: 600;
            color: var(--gray-900);
            font-size: 0.875rem;
            margin-bottom: var(--space-1);
        }

        .cart-item-price {
            color: var(--gray-600);
            font-size: 0.75rem;
        }

        .cart-item-controls {
            display: flex;
            align-items: center;
            gap: var(--space-2);
        }

        .quantity-btn {
            width: 32px;
            height: 32px;
            border: 1px solid var(--gray-300);
            background: white;
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            transition: all var(--transition-fast);
        }

        .quantity-btn:hover {
            background: var(--gray-50);
            border-color: var(--pos-primary);
        }

        .quantity-input {
            width: 50px;
            text-align: center;
            border: 1px solid var(--gray-300);
            border-radius: var(--radius-md);
            padding: var(--space-1);
        }

        .cart-summary {
            padding: var(--space-4);
            border-top: 1px solid var(--gray-200);
            background: var(--gray-50);
        }

        .summary-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--space-2);
        }

        .summary-row.total {
            font-size: 1.25rem;
            font-weight: 700;
            color: var(--gray-900);
            padding-top: var(--space-2);
            border-top: 1px solid var(--gray-300);
        }

        .checkout-btn {
            width: 100%;
            background: linear-gradient(135deg, var(--pos-primary) 0%, var(--pos-primary-hover) 100%);
            color: white;
            border: none;
            padding: var(--space-4);
            border-radius: var(--radius-lg);
            font-size: 1.125rem;
            font-weight: 700;
            cursor: pointer;
            transition: all var(--transition-fast);
            margin-top: var(--space-4);
        }

        .checkout-btn:hover {
            transform: translateY(-1px);
            box-shadow: var(--shadow-lg);
        }

        .checkout-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
            transform: none;
        }

        .empty-cart {
            text-align: center;
            padding: var(--space-8);
            color: var(--gray-500);
        }

        .empty-cart-icon {
            width: 64px;
            height: 64px;
            margin: 0 auto var(--space-4);
            opacity: 0.5;
        }

        /* Mobile Responsive */
        @media (max-width: 768px) {
            .pos-container {
                grid-template-columns: 1fr;
                grid-template-rows: 1fr auto;
            }

            .pos-sidebar {
                position: fixed;
                bottom: 0;
                left: 0;
                right: 0;
                height: 50vh;
                transform: translateY(100%);
                transition: transform var(--transition-normal);
                z-index: 1000;
            }

            .pos-sidebar.open {
                transform: translateY(0);
            }

            .products-grid {
                grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
                gap: var(--space-3);
            }

            .product-card {
                padding: var(--space-3);
            }

            .product-image {
                width: 60px;
                height: 60px;
            }

            .cart-toggle {
                position: fixed;
                bottom: var(--space-4);
                right: var(--space-4);
                width: 60px;
                height: 60px;
                background: var(--pos-primary);
                color: white;
                border: none;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                box-shadow: var(--shadow-xl);
                z-index: 999;
                cursor: pointer;
            }
        }

        @media (min-width: 769px) {
            .cart-toggle {
                display: none;
            }
        }

        /* Touch-friendly improvements */
        @media (hover: none) and (pointer: coarse) {
            .product-card {
                padding: var(--space-5);
            }

            .pos-btn,
            .quantity-btn,
            .checkout-btn {
                min-height: 44px;
            }

            .search-input {
                padding: var(--space-5) var(--space-12) var(--space-5) var(--space-4);
            }
        }
    </style>
</head>

<body>
    <div class="pos-container">
        <!-- Main POS Area -->
        <div class="pos-main">
            <!-- Header -->
            <div class="pos-header">
                <div class="pos-title">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                        <line x1="8" y1="21" x2="16" y2="21"></line>
                        <line x1="12" y1="17" x2="12" y2="21"></line>
                    </svg>
                    Point of Sale
                </div>
                <div class="pos-actions">
                    <button class="pos-btn pos-btn-primary" onclick="showSettings()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="3"></circle>
                            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1 1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
                        </svg>
                        Settings
                    </button>
                    <button class="pos-btn pos-btn-primary" onclick="clockOut()">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
                            <polyline points="16,17 21,12 16,7"></polyline>
                            <line x1="21" y1="12" x2="9" y2="12"></line>
                        </svg>
                        Clock Out
                    </button>
                </div>
            </div>

            <!-- Search Section -->
            <div class="search-section">
                <div class="search-box">
                    <input type="text" class="search-input" placeholder="Search products..." id="product-search">
                    <svg class="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <circle cx="11" cy="11" r="8"></circle>
                        <path d="m21 21-4.35-4.35"></path>
                    </svg>
                </div>
            </div>

            <!-- Products Grid -->
            <div class="products-grid" id="products-grid">
                <!-- Products will be loaded here -->
                <div class="loading-products">
                    <div style="text-align: center; padding: 2rem; color: #6b7280;">
                        <svg class="animate-spin" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin: 0 auto 1rem;">
                            <path d="M21 12a9 9 0 11-6.219-8.56"></path>
                        </svg>
                        <p>Loading products...</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- Cart Sidebar -->
        <div class="pos-sidebar" id="cart-sidebar">
            <div class="cart-header">
                <div class="cart-title">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <path d="M16 10a4 4 0 0 1-8 0"></path>
                    </svg>
                    Shopping Cart (<span id="cart-count">0</span>)
                </div>
            </div>

            <div class="cart-items" id="cart-items">
                <div class="empty-cart">
                    <svg class="empty-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                        <line x1="3" y1="6" x2="21" y2="6"></line>
                        <path d="M16 10a4 4 0 0 1-8 0"></path>
                    </svg>
                    <p>Your cart is empty</p>
                    <small>Add products to get started</small>
                </div>
            </div>

            <div class="cart-summary" id="cart-summary" style="display: none;">
                <div class="summary-row">
                    <span>Subtotal:</span>
                    <span id="subtotal">$0.00</span>
                </div>
                <div class="summary-row">
                    <span>Tax:</span>
                    <span id="tax">$0.00</span>
                </div>
                <div class="summary-row total">
                    <span>Total:</span>
                    <span id="total">$0.00</span>
                </div>
                <button class="checkout-btn" onclick="processCheckout()">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                        <rect x="1" y="3" width="15" height="13"></rect>
                        <path d="M16 8h4l-4-4v4z"></path>
                    </svg>
                    Process Payment
                </button>
            </div>
        </div>

        <!-- Mobile Cart Toggle -->
        <button class="cart-toggle" id="cart-toggle" onclick="toggleCart()">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                <line x1="3" y1="6" x2="21" y2="6"></line>
                <path d="M16 10a4 4 0 0 1-8 0"></path>
            </svg>
            <span id="mobile-cart-count" style="position: absolute; top: -8px; right: -8px; background: white; color: #dc2626; border-radius: 50%; width: 20px; height: 20px; font-size: 12px; display: flex; align-items: center; justify-content: center; font-weight: bold;">0</span>
        </button>
    </div>

    <script>
        // Modern POS System JavaScript
        class ModernPOS {
            constructor() {
                this.cart = [];
                this.products = [];
                this.init();
            }

            init() {
                this.loadProducts();
                this.setupEventListeners();
                this.setupSearch();
            }

            setupEventListeners() {
                // Touch and click events for products
                document.addEventListener('click', (e) => {
                    const productCard = e.target.closest('.product-card');
                    if (productCard) {
                        const productId = productCard.dataset.productId;
                        this.addToCart(productId);
                    }
                });

                // Quantity controls
                document.addEventListener('click', (e) => {
                    if (e.target.classList.contains('quantity-increase')) {
                        const itemId = e.target.dataset.itemId;
                        this.updateQuantity(itemId, 1);
                    } else if (e.target.classList.contains('quantity-decrease')) {
                        const itemId = e.target.dataset.itemId;
                        this.updateQuantity(itemId, -1);
                    } else if (e.target.classList.contains('remove-item')) {
                        const itemId = e.target.dataset.itemId;
                        this.removeFromCart(itemId);
                    }
                });
            }

            setupSearch() {
                const searchInput = document.getElementById('product-search');
                let searchTimeout;

                searchInput.addEventListener('input', (e) => {
                    clearTimeout(searchTimeout);
                    searchTimeout = setTimeout(() => {
                        this.filterProducts(e.target.value);
                    }, 300);
                });
            }

            async loadProducts() {
                try {
                    // Simulate API call - replace with actual endpoint
                    const response = await fetch('<?php echo site_url('admin/get_pos_products'); ?>');
                    const data = await response.json();
                    this.products = data.products || [];
                    this.renderProducts();
                } catch (error) {
                    console.error('Failed to load products:', error);
                    this.showError('Failed to load products');
                }
            }

            renderProducts(filteredProducts = null) {
                const grid = document.getElementById('products-grid');
                const productsToRender = filteredProducts || this.products;

                if (productsToRender.length === 0) {
                    grid.innerHTML = `
                        <div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: #6b7280;">
                            <p>No products found</p>
                        </div>
                    `;
                    return;
                }

                grid.innerHTML = productsToRender.map(product => `
                    <div class="product-card" data-product-id="${product.id}">
                        <div class="product-stock ${this.getStockClass(product.stock)}">${product.stock}</div>
                        <div class="product-image">
                            <img src="${product.image || '<?php echo base_url('uploads/item_image/placeholder.jpg'); ?>'}" 
                                 alt="${product.name}" 
                                 onerror="this.src='<?php echo base_url('uploads/item_image/placeholder.jpg'); ?>'">
                        </div>
                        <div class="product-name">${product.name}</div>
                        <div class="product-price">$${parseFloat(product.price).toFixed(2)}</div>
                    </div>
                `).join('');
            }

            getStockClass(stock) {
                if (stock <= 0) return 'out';
                if (stock <= 5) return 'low';
                return '';
            }

            filterProducts(query) {
                if (!query.trim()) {
                    this.renderProducts();
                    return;
                }

                const filtered = this.products.filter(product =>
                    product.name.toLowerCase().includes(query.toLowerCase()) ||
                    product.code.toLowerCase().includes(query.toLowerCase())
                );

                this.renderProducts(filtered);
            }

            addToCart(productId) {
                const product = this.products.find(p => p.id == productId);
                if (!product) return;

                if (product.stock <= 0) {
                    this.showError('Product is out of stock');
                    return;
                }

                const existingItem = this.cart.find(item => item.id == productId);
                
                if (existingItem) {
                    if (existingItem.quantity >= product.stock) {
                        this.showError('Not enough stock available');
                        return;
                    }
                    existingItem.quantity++;
                } else {
                    this.cart.push({
                        id: product.id,
                        name: product.name,
                        price: parseFloat(product.price),
                        quantity: 1,
                        image: product.image
                    });
                }

                this.updateCartDisplay();
                this.showSuccess('Product added to cart');
            }

            updateQuantity(itemId, change) {
                const item = this.cart.find(item => item.id == itemId);
                if (!item) return;

                const product = this.products.find(p => p.id == itemId);
                const newQuantity = item.quantity + change;

                if (newQuantity <= 0) {
                    this.removeFromCart(itemId);
                    return;
                }

                if (newQuantity > product.stock) {
                    this.showError('Not enough stock available');
                    return;
                }

                item.quantity = newQuantity;
                this.updateCartDisplay();
            }

            removeFromCart(itemId) {
                this.cart = this.cart.filter(item => item.id != itemId);
                this.updateCartDisplay();
            }

            updateCartDisplay() {
                const cartItems = document.getElementById('cart-items');
                const cartSummary = document.getElementById('cart-summary');
                const cartCount = document.getElementById('cart-count');
                const mobileCartCount = document.getElementById('mobile-cart-count');

                const totalItems = this.cart.reduce((sum, item) => sum + item.quantity, 0);
                cartCount.textContent = totalItems;
                mobileCartCount.textContent = totalItems;

                if (this.cart.length === 0) {
                    cartItems.innerHTML = `
                        <div class="empty-cart">
                            <svg class="empty-cart-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path>
                                <line x1="3" y1="6" x2="21" y2="6"></line>
                                <path d="M16 10a4 4 0 0 1-8 0"></path>
                            </svg>
                            <p>Your cart is empty</p>
                            <small>Add products to get started</small>
                        </div>
                    `;
                    cartSummary.style.display = 'none';
                    return;
                }

                cartItems.innerHTML = this.cart.map(item => `
                    <div class="cart-item">
                        <div class="cart-item-image">
                            <img src="${item.image || '<?php echo base_url('uploads/item_image/placeholder.jpg'); ?>'}" 
                                 alt="${item.name}"
                                 style="width: 100%; height: 100%; object-fit: cover; border-radius: 6px;">
                        </div>
                        <div class="cart-item-details">
                            <div class="cart-item-name">${item.name}</div>
                            <div class="cart-item-price">$${item.price.toFixed(2)} each</div>
                        </div>
                        <div class="cart-item-controls">
                            <button class="quantity-btn quantity-decrease" data-item-id="${item.id}">-</button>
                            <input type="number" class="quantity-input" value="${item.quantity}" readonly>
                            <button class="quantity-btn quantity-increase" data-item-id="${item.id}">+</button>
                            <button class="quantity-btn remove-item" data-item-id="${item.id}" style="color: #ef4444; margin-left: 8px;">×</button>
                        </div>
                    </div>
                `).join('');

                // Update summary
                const subtotal = this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                const tax = subtotal * 0.1; // 10% tax
                const total = subtotal + tax;

                document.getElementById('subtotal').textContent = `$${subtotal.toFixed(2)}`;
                document.getElementById('tax').textContent = `$${tax.toFixed(2)}`;
                document.getElementById('total').textContent = `$${total.toFixed(2)}`;

                cartSummary.style.display = 'block';
            }

            async processCheckout() {
                if (this.cart.length === 0) {
                    this.showError('Cart is empty');
                    return;
                }

                const checkoutBtn = document.querySelector('.checkout-btn');
                checkoutBtn.disabled = true;
                checkoutBtn.innerHTML = 'Processing...';

                try {
                    // Process the sale
                    const response = await fetch('<?php echo site_url('admin/process_pos_sale'); ?>', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            items: this.cart,
                            total: this.cart.reduce((sum, item) => sum + (item.price * item.quantity), 0)
                        })
                    });

                    const result = await response.json();

                    if (result.success) {
                        this.showSuccess('Sale completed successfully!');
                        this.cart = [];
                        this.updateCartDisplay();
                        this.loadProducts(); // Refresh stock levels
                    } else {
                        this.showError(result.message || 'Sale failed');
                    }
                } catch (error) {
                    console.error('Checkout failed:', error);
                    this.showError('Checkout failed. Please try again.');
                } finally {
                    checkoutBtn.disabled = false;
                    checkoutBtn.innerHTML = `
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 8px;">
                            <rect x="1" y="3" width="15" height="13"></rect>
                            <path d="M16 8h4l-4-4v4z"></path>
                        </svg>
                        Process Payment
                    `;
                }
            }

            showSuccess(message) {
                this.showToast(message, 'success');
            }

            showError(message) {
                this.showToast(message, 'error');
            }

            showToast(message, type) {
                // Simple toast implementation
                const toast = document.createElement('div');
                toast.className = `toast toast-${type}`;
                toast.style.cssText = `
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    background: ${type === 'success' ? '#10b981' : '#ef4444'};
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    z-index: 10000;
                    animation: slideInRight 0.3s ease-out;
                `;
                toast.textContent = message;

                document.body.appendChild(toast);

                setTimeout(() => {
                    toast.remove();
                }, 3000);
            }
        }

        // Mobile cart toggle
        function toggleCart() {
            const sidebar = document.getElementById('cart-sidebar');
            sidebar.classList.toggle('open');
        }

        // Initialize POS system
        document.addEventListener('DOMContentLoaded', () => {
            window.pos = new ModernPOS();
        });

        // Settings and clock out functions
        function showSettings() {
            alert('Settings panel would open here');
        }

        function clockOut() {
            if (confirm('Are you sure you want to clock out?')) {
                window.location.href = '<?php echo site_url('admin/clock_out'); ?>';
            }
        }
    </script>
</body>
</html>