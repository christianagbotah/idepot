<!doctype html>
<html>
<head>
    <title><?=$page_title ?? 'Inventory Report'; ?></title>
    <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
    <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
    <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
    <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js');?>"></script>
</head>
<body>
    <div class="container">
        <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
            <a href="javascript:void(0);" onClick="print_page()">PRINT INVENTORY REPORT</a>
        </div>
        <div class="row">
            <div class="col-lg-12">
                <div id="print">
                    <?php
                    // BATCH LOAD SETTINGS (5 queries → 1 query)
                    $settings_types = ['currency', 'system_name', 'location', 'address', 'phone'];
                    $this->db->where_in('type', $settings_types);
                    $settings_query = $this->db->get('settings');
                    $settings = [];
                    foreach($settings_query->result_array() as $row) {
                        $settings[$row['type']] = $row['description'];
                    }
                    $currency = $settings['currency'] ?? 'USD';
                    $system_name = $settings['system_name'] ?? 'System';
                    $address = $settings['address'] ?? '';
                    $phone = $settings['phone'] ?? '';
                    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
                    
                    $to = $to ?? 0;
                    $category_id = $category_id ?? [];

                    if($to == 0) {
                        $to = date('d-m-Y');
                    }
                    $to_ts = strtotime($to);
                    $is_today = $to_ts == strtotime(date('d-m-Y'));

                    // BATCH LOAD CATEGORIES
                    if(empty($category_id) || (count($category_id) == 1 && $category_id[0] == '')) {
                        $main_categories = $this->db->get('item_main_category')->result_array();
                    } else {
                        $this->db->where_in('category_id', $category_id);
                        $main_categories = $this->db->get('item_main_category')->result_array();
                    }

                    // BATCH LOAD ALL SUB-CATEGORIES
                    $main_cat_ids = !empty($main_categories) ? array_column($main_categories, 'category_id') : [];
                    if(!empty($main_cat_ids)) {
                        $this->db->where_in('main_id', $main_cat_ids);
                        $sub_categories = $this->db->get('item_category')->result_array();
                    } else {
                        $sub_categories = [];
                    }
                    
                    // Index by main_id
                    $sub_cats_by_main = [];
                    foreach($sub_categories as $sub) {
                        $sub_cats_by_main[$sub['main_id'] ?? 0][] = $sub;
                    }

                    // BATCH LOAD ALL ITEMS
                    $sub_cat_ids = array_column($sub_categories, 'category_id');
                    if(!empty($sub_cat_ids)) {
                        $this->db->where_in('category_id', $sub_cat_ids);
                        $all_items = $this->db->get('items')->result_array();
                    } else {
                        $all_items = [];
                    }

                    // Index items by category_id
                    $items_by_category = [];
                    $items_map = [];
                    foreach($all_items as $item) {
                        $items_by_category[$item['category_id'] ?? 0][] = $item;
                        $items_map[$item['item_id'] ?? 0] = $item;
                    }

                    // BATCH LOAD STOCK DATA
                    $item_ids = array_column($all_items, 'item_id');
                    $stock_quantities = [];
                    $stock_prices = [];

                    if(!empty($item_ids)) {
                        if($is_today) {
                            // Use current quantities from items table
                            foreach($all_items as $item) {
                                $stock_quantities[$item['item_id'] ?? 0] = $item['quantity'] ?? 0;
                                $stock_prices[$item['item_id'] ?? 0] = $item['purchase_price'] ?? 0;
                            }
                        } else {
                            // Get historical stock data
                            $this->db->where('date_timestamp <=', $to_ts);
                            $this->db->where_in('item_id', $item_ids);
                            $this->db->select('item_id, date_timestamp, opening_stock, cost_price');
                            $this->db->order_by('date_timestamp', 'desc');
                            $stock_data = $this->db->get('stock_manager')->result_array();

                            // Get latest entry per item
                            $latest_stock = [];
                            foreach($stock_data as $row) {
                                if(!isset($latest_stock[$row['item_id'] ?? 0])) {
                                    $latest_stock[$row['item_id'] ?? 0] = $row;
                                }
                            }

                            // Batch load next entries for all items
                            $this->db->where('date_timestamp >', $to_ts);
                            $this->db->where_in('item_id', $item_ids);
                            $this->db->select('item_id, date_timestamp, opening_stock, cost_price');
                            $this->db->order_by('item_id, date_timestamp', 'asc');
                            $next_entries_data = $this->db->get('stock_manager')->result_array();
                            
                            $next_entries = [];
                            foreach($next_entries_data as $ne) {
                                if(!isset($next_entries[$ne['item_id'] ?? 0])) {
                                    $next_entries[$ne['item_id'] ?? 0] = $ne;
                                }
                            }
                            
                            foreach($item_ids as $item_id) {
                                if(isset($latest_stock[$item_id])) {
                                    if(isset($next_entries[$item_id])) {
                                        $stock_quantities[$item_id] = $next_entries[$item_id]['opening_stock'] ?? 0;
                                        $stock_prices[$item_id] = ($next_entries[$item_id]['cost_price'] ?? 0) ?: ($latest_stock[$item_id]['cost_price'] ?? 0);
                                    } else {
                                        $stock_quantities[$item_id] = $items_map[$item_id]['quantity'] ?? 0;
                                        $stock_prices[$item_id] = $items_map[$item_id]['purchase_price'] ?? 0;
                                    }
                                } else {
                                    $stock_quantities[$item_id] = 0;
                                    $stock_prices[$item_id] = $items_map[$item_id]['purchase_price'] ?? 0;
                                }
                            }
                        }
                    }

                    // Calculate totals
                    $grand_total = 0;
                    $item_count = 0;
                    ?>

                    <style>
                        body { font-size: 13px; font-family: 'Noto Sans', Arial, sans-serif; }
                        .inv-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                        .inv-header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                        .inv-header h2 { margin: 5px 0; font-size: 20px; letter-spacing: 2px; }
                        .inv-header p { margin: 3px 0; color: #666; font-size: 12px; }
                        .inv-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                        .inv-table thead { background: #1b1b69; color: white; }
                        .inv-table th { padding: 10px 5px; text-align: left; font-weight: bold; font-size: 12px; }
                        .inv-table td { padding: 6px 5px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
                        .inv-main-cat { background: #f5f5f5; font-weight: bold; font-size: 13px; }
                        .inv-sub-cat { background: #fafafa; font-weight: bold; color: #666; font-size: 12px; padding-left: 15px !important; }
                        .inv-item { padding-left: 10px !important; }
                        .inv-subtotal { background: #e8e8e8; font-weight: bold; }
                        .inv-total { background: #6e6b6b; color: white; font-weight: bold; }
                        .inv-amount { text-align: right; font-family: monospace; }
                        #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                        #print_div a:hover { background: #2c3e50; }
                        @media print {
                            #print_div { display: none; }
                            body { margin: 0; font-size: 11px; }
                            .inv-container { max-width: 100%; }
                        }
                    </style>

                    <div class="inv-container">
                        <div class="inv-header" style="display: flex; justify-content: space-between;">
                            <div style="text-align: left;">
                                <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 70px;">
                                <h2><?php echo strtoupper($system_name); ?></h2>
                                <p><pre><?php echo $address; ?></pre></p>
                                <p><?php echo $phone; ?></p>
                            </div>
                            <div style="margin-top: 65px;">
                                <h2 style="margin-top: 15px;">INVENTORY REPORT</h2>
                                <p><strong>AS AT: <?php echo strtoupper(date('l F, j Y', $to_ts)); ?></strong></p>
                                
                            </div>
                        </div>

                        <table class="inv-table">
                            <thead>
                                <tr>
                                    <th style="width: 5%;">S/N</th>
                                    <th style="width: 45%;">ITEM</th>
                                    <th style="width: 15%;" class="inv-amount">QUANTITY</th>
                                    <th style="width: 15%;" class="inv-amount">COST PRICE</th>
                                    <th style="width: 20%;" class="inv-amount">VALUE</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php
                                foreach($main_categories as $main_cat):
                                    $main_total = 0;
                                    $main_qty = 0;
                                ?>
                                <tr class="inv-main-cat">
                                    <td colspan="5"><?php echo strtoupper($main_cat['category_name'] ?? ''); ?></td>
                                </tr>
                                <?php
                                    $sub_cats = $sub_cats_by_main[$main_cat['category_id'] ?? 0] ?? [];
                                    foreach($sub_cats as $sub_cat):
                                        $sub_total = 0;
                                        $sub_qty = 0;
                                ?>
                                <tr class="inv-sub-cat">
                                    <td colspan="5"><?php echo $sub_cat['category_name'] ?? ''; ?></td>
                                </tr>
                                <?php
                                        $items = $items_by_category[$sub_cat['category_id'] ?? 0] ?? [];
                                        $sn = 1;
                                        foreach($items as $item):
                                            $qty = $stock_quantities[$item['item_id'] ?? 0] ?? 0;
                                            $price = $stock_prices[$item['item_id'] ?? 0] ?? 0;
                                            $value = $qty * $price;
                                            
                                            $sub_total += $value;
                                            $sub_qty += $qty;
                                            $item_count++;
                                ?>
                                <tr>
                                    <td class="inv-item"><?php echo $sn; ?></td>
                                    <td class="inv-item"><?php echo $item['item_name'] ?? ''; ?></td>
                                    <td class="inv-amount"><?php echo $qty >= 1000 ? number_format($qty, 0) : $qty; ?></td>
                                    <td class="inv-amount"><?php echo number_format($price, 2); ?></td>
                                    <td class="inv-amount"><?php echo number_format($value, 2); ?></td>
                                </tr>
                                <?php
                                            $sn++;
                                        endforeach;
                                ?>
                                <tr class="inv-subtotal">
                                    <td colspan="2">SUB-CATEGORY TOTAL</td>
                                    <td class="inv-amount"><?php echo number_format($sub_qty, 0); ?></td>
                                    <td></td>
                                    <td class="inv-amount"><?php echo number_format($sub_total, 2); ?></td>
                                </tr>
                                <?php
                                        $main_total += $sub_total;
                                        $main_qty += $sub_qty;
                                    endforeach;
                                ?>
                                <tr class="inv-subtotal" style="background: #989898;">
                                    <td colspan="2">MAIN-CATEGORY TOTAL</td>
                                    <td class="inv-amount"><?php echo number_format($main_qty, 0); ?></td>
                                    <td></td>
                                    <td class="inv-amount"><?php echo number_format($main_total, 2); ?></td>
                                </tr>
                                <?php
                                    $grand_total += $main_total;
                                endforeach;
                                ?>
                                <tr class="inv-total">
                                    <td colspan="4">GRAND TOTAL</td>
                                    <td class="inv-amount"><?php echo number_format($grand_total, 2); ?></td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-left: 4px solid #1b1b69;">
                            <strong>Inventory Summary:</strong><br>
                            Total Items: <?php echo number_format($item_count, 0); ?><br>
                            Total Value: <?php echo numfmt_format_currency($fmt, $grand_total, $currency); ?><br>
                            Report Date: <?php echo date('l, F j, Y', $to_ts); ?>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <script>
        function print_page() {
            window.print();
        }

        $(function() {
            setTimeout(() => {
                print_page();
            }, 1000);
        });
    </script>
</body>
</html>
