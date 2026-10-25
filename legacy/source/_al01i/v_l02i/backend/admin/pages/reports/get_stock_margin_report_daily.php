<?php
// AGGRESSIVE OPTIMIZATION: Batch load ALL data upfront
$selected_date = strtotime($to);
if($to == 0) $to = date('d-m-Y');

// BATCH LOAD SETTINGS
$settings_types = ['currency', 'system_name', 'address', 'phone'];
$this->db->where_in('type', $settings_types);
$settings_query = $this->db->get('settings');
$settings = [];
foreach($settings_query->result_array() as $row) {
    $settings[$row['type']] = $row['description'];
}
$currency = $settings['currency'];
$system_name = $settings['system_name'];
$address = $settings['address'];
$phone = $settings['phone'];
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

// BATCH LOAD CATEGORIES
if($category_id[0] == '0' || empty($category_id)) {
    $main_categories = $this->db->get('item_main_category')->result_array();
} else {
    $this->db->where_in('category_id', $category_id);
    $main_categories = $this->db->get('item_main_category')->result_array();
}

$main_cat_ids = array_column($main_categories, 'category_id');
$this->db->where_in('main_id', $main_cat_ids);
$sub_categories = $this->db->get('item_category')->result_array();

$sub_cats_by_main = [];
foreach($sub_categories as $sub) {
    $sub_cats_by_main[$sub['main_id']][] = $sub;
}

// BATCH LOAD ALL SALES DATA FOR THE DATE
$this->db->where('date_timestamp', $selected_date);
$this->db->where('type_of_sales <>', 'Receivables');
$sales_data = $this->db->get('payment_with_goods')->result_array();

// Group sales by item_id
$sales_by_item = [];
foreach($sales_data as $sale) {
    $sales_by_item[$sale['item_id']][] = $sale;
}

// BATCH LOAD ALL ITEMS
$sub_cat_ids = array_column($sub_categories, 'category_id');
if(!empty($sub_cat_ids)) {
    $this->db->where_in('category_id', $sub_cat_ids);
    $all_items = $this->db->get('items')->result_array();
} else {
    $all_items = [];
}

$items_by_category = [];
$items_map = [];
foreach($all_items as $item) {
    $items_by_category[$item['category_id']][] = $item;
    $items_map[$item['item_id']] = $item;
}

// BATCH LOAD PAYMENT DATA FOR RECEIVABLES CHECK
$so_codes = array_unique(array_column($sales_data, 'so_code'));
$payments_by_so = [];
if(!empty($so_codes)) {
    $this->db->where('date_timestamp', $selected_date);
    $this->db->where_in('so_code', $so_codes);
    $this->db->select('so_code, SUM(amount) as total_paid');
    $this->db->group_by('so_code');
    $payments = $this->db->get('payment')->result_array();
    foreach($payments as $pay) {
        $payments_by_so[$pay['so_code']] = $pay['total_paid'];
    }
}

// BATCH LOAD UNIT DATA
$this->db->select('unit_id, item_id, unit_total');
$units_data = $this->db->get('units_items')->result_array();
$units_map = [];
foreach($units_data as $unit) {
    $units_map[$unit['item_id']][$unit['unit_id']] = $unit['unit_total'];
}

$grand_total_q = 0;
$grand_total_sp = 0;
$grand_total_cp = 0;
$grand_total_m = 0;
$item_count = 0;
?>
<div class="container">
    <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
        <a href="javascript:void(0);" onClick="print_page()">PRINT STOCK MARGIN REPORT</a>
    </div>
    <div class="row">
        <div class="col-lg-12">
            <div id="print">
                <style>
                    body { font-size: 13px; font-family: 'Noto Sans', Arial, sans-serif; }
                    .sm-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                    .sm-header { text-align: center; margin-bottom: 20px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                    .sm-header h2 { margin: 5px 0; font-size: 20px; letter-spacing: 2px; }
                    .sm-table { width: 100%; border-collapse: collapse; margin-top: 15px; }
                    .sm-table thead { background: #4242ad; color: white; }
                    .sm-table th { padding: 10px 5px; text-align: left; font-weight: bold; font-size: 12px; }
                    .sm-table td { padding: 6px 5px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
                    .sm-main-cat { background: #f5f5f5; font-weight: bold; font-size: 13px; }
                    .sm-sub-cat { background: #fafafa; font-weight: bold; color: #666; font-size: 12px; }
                    .sm-subtotal { background: #e8e8e8; font-weight: bold; }
                    .sm-total { background: #6e6b6b; color: white; font-weight: bold; }
                    .sm-amount { text-align: right; font-family: monospace; }
                    #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                    @media print { #print_div { display: none; } body { margin: 0; font-size: 11px; } }
                </style>

                <div class="sm-container">
                    <div class="sm-header">
                        <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 70px;">
                        <h2><?php echo strtoupper($system_name); ?></h2>
                        <p><?php echo $address; ?> | <?php echo $phone; ?></p>
                        <h2 style="margin-top: 15px;">STOCK MARGIN REPORT - DAILY</h2>
                        <p><strong>Date: <?php echo strtoupper(date('l F, j Y', $selected_date)); ?></strong></p>
                    </div>

                    <table class="sm-table">
                        <thead>
                            <tr>
                                <th style="width: 5%;">S/N</th>
                                <th style="width: 35%;">ITEM</th>
                                <th style="width: 12%;" class="sm-amount">QTY (Q)</th>
                                <th style="width: 12%;" class="sm-amount">SALES (S)</th>
                                <th style="width: 12%;" class="sm-amount">COST (C)</th>
                                <th style="width: 12%;" class="sm-amount">MARGIN (M)</th>
                                <th style="width: 12%;" class="sm-amount">M% on S</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php
                            foreach($main_categories as $main_cat):
                                $main_total_q = 0;
                                $main_total_sp = 0;
                                $main_total_cp = 0;
                                $main_total_m = 0;
                                $main_has_data = false;
                            ?>
                            <tr class="sm-main-cat">
                                <td colspan="7"><?php echo strtoupper($main_cat['category_name']); ?></td>
                            </tr>
                            <?php
                                $sub_cats = $sub_cats_by_main[$main_cat['category_id']] ?? [];
                                foreach($sub_cats as $sub_cat):
                                    $cat_total_q = 0;
                                    $cat_total_sp = 0;
                                    $cat_total_cp = 0;
                                    $cat_total_m = 0;
                                    $cat_has_data = false;
                            ?>
                            <tr class="sm-sub-cat">
                                <td colspan="7"><?php echo $sub_cat['category_name']; ?></td>
                            </tr>
                            <?php
                                    $items = $items_by_category[$sub_cat['category_id']] ?? [];
                                    $sn = 1;
                                    foreach($items as $item):
                                        if(!isset($sales_by_item[$item['item_id']])) continue;
                                        
                                        $item_total_q = 0;
                                        $item_total_sp = 0;
                                        $item_total_cp = 0;
                                        
                                        foreach($sales_by_item[$item['item_id']] as $sale) {
                                            // Skip unpaid receivables
                                            if($sale['type_of_sales'] == 'Receivables' && $sale['grand_total'] == $sale['amount_due']) {
                                                $paid = $payments_by_so[$sale['so_code']] ?? 0;
                                                if($paid < $sale['grand_total']) continue;
                                            }
                                            
                                            $qty = $sale['quantity'];
                                            if($sale['order_item_has_unit_sales'] == 1) {
                                                $unit_total = $units_map[$item['item_id']][$sale['unit_id']] ?? 1;
                                                $qty = $sale['quantity'] / $unit_total;
                                            }
                                            
                                            $item_total_q += $qty;
                                            $item_total_sp += $sale['quantity'] * $sale['price'];
                                            $item_total_cp += $qty * $sale['cost_price'];
                                        }
                                        
                                        if($item_total_q == 0) continue;
                                        
                                        $item_total_m = $item_total_sp - $item_total_cp;
                                        $margin_pct = $item_total_sp > 0 ? ($item_total_m / $item_total_sp) * 100 : 0;
                                        
                                        $cat_total_q += $item_total_q;
                                        $cat_total_sp += $item_total_sp;
                                        $cat_total_cp += $item_total_cp;
                                        $cat_total_m += $item_total_m;
                                        $cat_has_data = true;
                                        $item_count++;
                            ?>
                            <tr>
                                <td><?php echo $sn; ?></td>
                                <td><?php echo $item['item_name']; ?></td>
                                <td class="sm-amount"><?php echo number_format($item_total_q, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($item_total_sp, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($item_total_cp, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($item_total_m, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($margin_pct, 2); ?>%</td>
                            </tr>
                            <?php
                                        $sn++;
                                    endforeach;
                                    
                                    if($cat_has_data):
                                        $cat_margin_pct = $cat_total_sp > 0 ? ($cat_total_m / $cat_total_sp) * 100 : 0;
                                        $main_total_q += $cat_total_q;
                                        $main_total_sp += $cat_total_sp;
                                        $main_total_cp += $cat_total_cp;
                                        $main_total_m += $cat_total_m;
                                        $main_has_data = true;
                            ?>
                            <tr class="sm-subtotal">
                                <td colspan="2">CATEGORY TOTAL</td>
                                <td class="sm-amount"><?php echo number_format($cat_total_q, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($cat_total_sp, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($cat_total_cp, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($cat_total_m, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($cat_margin_pct, 2); ?>%</td>
                            </tr>
                            <?php
                                    endif;
                                endforeach;
                                
                                if($main_has_data):
                                    $grand_total_q += $main_total_q;
                                    $grand_total_sp += $main_total_sp;
                                    $grand_total_cp += $main_total_cp;
                                    $grand_total_m += $main_total_m;
                            ?>
                            <?php endif; ?>
                            <?php endforeach; ?>
                            
                            <?php
                            $grand_margin_pct = $grand_total_sp > 0 ? ($grand_total_m / $grand_total_sp) * 100 : 0;
                            ?>
                            <tr class="sm-total">
                                <td colspan="2">GRAND TOTAL</td>
                                <td class="sm-amount"><?php echo number_format($grand_total_q, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($grand_total_sp, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($grand_total_cp, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($grand_total_m, 2); ?></td>
                                <td class="sm-amount"><?php echo number_format($grand_margin_pct, 2); ?>%</td>
                            </tr>
                        </tbody>
                    </table>

                    <div style="margin-top: 20px; padding: 15px; background: #f9f9f9; border-left: 4px solid #1b1b69;">
                        <strong>Summary:</strong><br>
                        Items Sold: <?php echo $item_count; ?><br>
                        Total Sales: <?php echo numfmt_format_currency($fmt, $grand_total_sp, $currency); ?><br>
                        Total Cost: <?php echo numfmt_format_currency($fmt, $grand_total_cp, $currency); ?><br>
                        <strong>Total Margin: <?php echo numfmt_format_currency($fmt, $grand_total_m, $currency); ?> (<?php echo number_format($grand_margin_pct, 2); ?>%)</strong>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>
<script>
function print_page() { window.print(); }
$(function() { setTimeout(() => { print_page(); }, 1000); });
</script>
