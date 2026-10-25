<?php
/**
 * Item History Report
 * Displays sales and transfer history for a specific item within a date range
 * 
 * @var int $item_id Item identifier
 * @var string $first_date Start date for history
 * @var string $second_date End date for history
 * @var string $type History type: 's' (sales), 't' (transfers), or 'both'
 */

// Get item details
$itemRow = $this->db->get_where('items', ['item_id' => $item_id])->row();
$itemSoldInUnits = $itemRow->item_sold_in_units ?? 0;
$itemName = $this->crud_model->getItemName($item_id);

// Get purchase dates for the item within date range
$this->db->select('date_timestamp');
$this->db->from('purchase_order');
$this->db->distinct();
$this->db->order_by('date_timestamp', 'asc');
$this->db->where('item_id', $item_id);
$this->db->where('date_timestamp BETWEEN "' . strtotime($first_date) . '" AND "' . strtotime($second_date) . '"');
$purchase_dates_array = $this->db->get()->result_array();
$p_dates_array = array_column($purchase_dates_array, 'date_timestamp');

/**
 * Get sales history for a date range
 */
function getSalesHistory($db, $item_id, $start_date, $end_date = null) {
    $db->select('so_id, timestamp, customer_id, quantity_picked, item_balance, order_item_has_unit_sales, unit_id');
    $db->where('payment_with_goods.date_timestamp >=', $start_date);
    if ($end_date !== null) {
        $db->where('payment_with_goods.date_timestamp <', $end_date);
    }
    $db->where('payment_with_goods.item_id', $item_id);
    $db->where('quantity_picked >', '0');
    $db->order_by('timestamp', 'asc');
    $db->order_by('so_id', 'asc');
    return $db->get('payment_with_goods')->result_array();
}

/**
 * Get transfer history for a date range
 */
function getTransferHistory($db, $item_id, $start_date, $end_date = null) {
    $db->select('timestamp, receiver, quantity, item_balance');
    $db->where('date_timestamp >=', $start_date);
    if ($end_date !== null) {
        $db->where('date_timestamp <', $end_date);
    }
    $db->where('item_id', $item_id);
    $db->where('quantity >', '0');
    $db->order_by('t_id', 'asc');
    return $db->get('items_transfers')->result_array();
}

/**
 * Render sales history rows
 */
function renderSalesRows($salesArray, $itemSoldInUnits, $item_id, $crud_model) {
    if (empty($salesArray)) return 0;
    
    $outTotal = 0;
    echo '<tr><td colspan="4" class="px-3 py-2" style="background-color: #f0fdf4; border-top: 2px solid #16a34a;"><strong class="text-sm" style="color: #15803d;">📊 SALES HISTORY</strong></td></tr>';
    
    foreach ($salesArray as $sale) {
        $customerName = $crud_model->getCustomerDetails($sale['customer_id'], 'customer_name');
        $stableUnitName = '';
        
        // Handle unit sales
        if ($itemSoldInUnits == 1 && $sale['order_item_has_unit_sales'] > 0) {
            $unit_id = $sale['unit_id'] ?: $crud_model->getUnitIdByItemId($item_id);
            $unitName = $crud_model->getUnitNameById($unit_id);
            $stableUnitName = '<span class="px-1.5 py-0.5 rounded text-xs font-medium" style="background-color: #fef08a; color: #854d0e;">' . $unitName . ':</span> ';
        }
        
        $outTotal += $sale['quantity_picked'];
        ?>
        <tr class="transition-colors" style="border-bottom: 1px solid #e5e7eb;" onmouseover="this.style.backgroundColor='#f0fdf4'" onmouseout="this.style.backgroundColor=''">
            <td class="text-sm px-3 py-2.5" style="color: #374151;"><?= date('d-m-Y H:i:s', $sale['timestamp']); ?></td>
            <td class="text-sm px-3 py-2.5" style="color: #374151;"><?= ucwords(strtolower($customerName)); ?></td>
            <td class="text-sm font-medium px-3 py-2.5 text-right" style="color: #111827;"><?= $stableUnitName . number_format($sale['quantity_picked'], 0, '.', ','); ?></td>
            <td class="text-sm font-semibold px-3 py-2.5 text-right" style="color: #111827;"><?= number_format($sale['item_balance'], 0, '.', ','); ?></td>
        </tr>
        <?php
    }
    return $outTotal;
}

/**
 * Render transfer history rows
 */
function renderTransferRows($transferArray) {
    if (empty($transferArray)) return 0;
    
    $outTotal = 0;
    echo '<tr><td colspan="4" class="px-3 py-2" style="background-color: #eff6ff; border-top: 2px solid #2563eb;"><strong class="text-sm" style="color: #1e40af;">🚚 TRANSFERS HISTORY</strong></td></tr>';
    
    foreach ($transferArray as $transfer) {
        $outTotal += $transfer['quantity'];
        ?>
        <tr class="transition-colors" style="border-bottom: 1px solid #e5e7eb;" onmouseover="this.style.backgroundColor='#eff6ff'" onmouseout="this.style.backgroundColor=''">
            <td class="text-sm px-3 py-2.5" style="color: #374151;"><?= date('d-m-Y H:i:s', $transfer['timestamp']); ?></td>
            <td class="text-sm px-3 py-2.5" style="color: #374151;"><?= ucwords(strtolower($transfer['receiver'])); ?></td>
            <td class="text-sm font-medium px-3 py-2.5 text-right" style="color: #111827;"><?= number_format($transfer['quantity'], 0, '.', ','); ?></td>
            <td class="text-sm font-semibold px-3 py-2.5 text-right" style="color: #111827;"><?= number_format($transfer['item_balance'], 0, '.', ','); ?></td>
        </tr>
        <?php
    }
    return $outTotal;
}
?>

<!-- Modern Table Design with Ghana ERP Colors -->
<div class="bg-white rounded-lg shadow-lg overflow-hidden" style="border: 2px solid #d1d5db;">
    <table class="w-full border-collapse">
        <thead>
            <tr style="background: linear-gradient(to right, #16a34a, #15803d);">
                <th colspan="4" class="px-4 py-4 text-center" style="border-bottom: 4px solid #166534;">
                    <div class="flex items-center justify-center gap-2">
                        <i class="fas fa-history text-white text-lg"></i>
                        <strong class="text-white text-lg font-bold">
                            HISTORY FOR ITEM: <?= strtoupper($itemName) . ' FROM ' . $first_date . ' TO ' . $second_date; ?>
                        </strong>
                    </div>
                </th>
            </tr>
            <tr style="background-color: #16a34a; border-bottom: 2px solid #15803d;">
                <th class="px-4 py-3 text-left text-sm font-bold text-white uppercase tracking-wider" style="border-right: 1px solid #22c55e;">
                    <i class="far fa-calendar-alt mr-1"></i> Date
                </th>
                <th class="px-4 py-3 text-left text-sm font-bold text-white uppercase tracking-wider" style="border-right: 1px solid #22c55e;">
                    <i class="far fa-user mr-1"></i> Customer/Receiver
                </th>
                <th class="px-4 py-3 text-right text-sm font-bold text-white uppercase tracking-wider" style="border-right: 1px solid #22c55e;">
                    <i class="fas fa-boxes mr-1"></i> Quantity
                </th>
                <th class="px-4 py-3 text-right text-sm font-bold text-white uppercase tracking-wider">
                    <i class="fas fa-balance-scale mr-1"></i> Balance
                </th>
            </tr>
        </thead>
        <tbody>
<?php
if (!empty($p_dates_array)) {
    // Process each purchase date
    for ($i = 0; $i < count($p_dates_array); $i++) {
        $currentDate = $p_dates_array[$i];
        $nextDate = $p_dates_array[$i + 1] ?? null;
        $hasNextDate = ($i + 1) < count($p_dates_array);
        
        // Get purchase quantities - sum all quantities for this purchase date
        $this->db->select_sum('quantity');
        $this->db->where('item_id', $item_id);
        $this->db->where('date_timestamp', $currentDate);
        $total_quantity_bought = $this->db->get('purchase_order')->row()->quantity ?? 0;
        
        // Get available quantity - get the item_balance from the LAST purchase order entry for this date
        // This represents the stock level after all purchases on this date
        $this->db->select('item_balance');
        $this->db->where('item_id', $item_id);
        $this->db->where('date_timestamp', $currentDate);
        $this->db->order_by('po_id', 'desc');
        $this->db->limit(1);
        $lastPurchaseRow = $this->db->get('purchase_order')->row();
        $total_quantity_available = $lastPurchaseRow->item_balance ?? 0;
        ?>
        
        <!-- Purchase Date Header -->
        <tr style="background: linear-gradient(to right, #dbeafe, #eff6ff); border-top: 2px solid #60a5fa;">
            <th colspan="4" class="px-4 py-3" style="border-bottom: 1px solid #bfdbfe;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="font-bold text-sm" style="color: #1f2937; display: flex; align-items: center; gap: 0.5rem;">
                        <i class="fas fa-shopping-cart" style="color: #2563eb;"></i>
                        Purchased on <?= date('l, F d, Y', $currentDate); ?>
                    </span>
                    <div style="display: flex; gap: 0.75rem;">
                        <span class="text-white px-3 py-1.5 rounded-lg text-sm font-bold" style="background-color: #dc2626; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); display: flex; align-items: center; gap: 0.25rem;">
                            <i class="fas fa-arrow-down text-xs"></i>
                            Q Bought: <?= number_format($total_quantity_bought, 0, '.', ','); ?>
                        </span>
                        <span class="text-white px-3 py-1.5 rounded-lg text-sm font-bold" style="background-color: #2563eb; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); display: flex; align-items: center; gap: 0.25rem;">
                            <i class="fas fa-warehouse text-xs"></i>
                            Q Available: <?= number_format($total_quantity_available, 0, '.', ','); ?>
                        </span>
                    </div>
                </div>
            </th>
        </tr>
        
        <?php
        // Get history based on type
        $outTotal = 0;
        
        if ($type === 's' || $type !== 't') {
            $salesHistory = getSalesHistory($this->db, $item_id, $currentDate, $hasNextDate ? $nextDate : null);
            $outTotal += renderSalesRows($salesHistory, $itemSoldInUnits, $item_id, $this->crud_model);
        }
        
        if ($type === 't' || $type !== 's') {
            $transferHistory = getTransferHistory($this->db, $item_id, $currentDate, $hasNextDate ? $nextDate : null);
            $outTotal += renderTransferRows($transferHistory);
        }
        
        // Calculate stock balance
        $stockBal = $total_quantity_available - $outTotal;
        ?>
        
        <!-- Total Row -->
        <tr class="font-bold" style="background: linear-gradient(to right, #e5e7eb, #f3f4f6); border-top: 2px solid #9ca3af;">
            <td colspan="2" class="px-4 py-3 text-right text-sm uppercase tracking-wide" style="color: #1f2937;">
                <i class="fas fa-calculator mr-1" style="color: #4b5563;"></i>TOTAL OUT:
            </td>
            <td class="px-4 py-3 text-right text-sm font-bold" style="color: #b91c1c; border-left: 2px solid #d1d5db;">
                <?= number_format($outTotal, 0, '.', ','); ?>
            </td>
            <td class="px-4 py-3 text-right text-sm font-bold" style="color: #1e40af; border-left: 2px solid #d1d5db;">
                <span class="px-2 py-1 rounded" style="background-color: #dbeafe;">
                    <?= number_format($total_quantity_available, 0, '.', ',') . ' - ' . number_format($outTotal, 0, '.', ',') . ' = ' . number_format($stockBal, 0, '.', ','); ?>
                </span>
            </td>
        </tr>
        
        <?php
    }
} else {
    // No purchase data found - show all sales/transfers in date range
    $outTotal = 0;
    
    if ($type === 's' || $type !== 't') {
        $salesHistory = getSalesHistory($this->db, $item_id, strtotime($first_date));
        $outTotal += renderSalesRows($salesHistory, $itemSoldInUnits, $item_id, $this->crud_model);
    }
    
    if ($type === 't' || $type !== 's') {
        $transferHistory = getTransferHistory($this->db, $item_id, strtotime($first_date));
        $outTotal += renderTransferRows($transferHistory);
    }
    
    // Total row
    ?>
    <tr class="font-bold" style="background: linear-gradient(to right, #e5e7eb, #f3f4f6); border-top: 2px solid #9ca3af;">
        <td colspan="2" class="px-4 py-3 text-right text-sm uppercase tracking-wide" style="color: #1f2937;">
            <i class="fas fa-calculator mr-1" style="color: #4b5563;"></i>TOTAL OUT:
        </td>
        <td class="px-4 py-3 text-right text-sm font-bold" style="color: #b91c1c; border-left: 2px solid #d1d5db;">
            <?= number_format($outTotal, 0, '.', ','); ?>
        </td>
        <td class="px-4 py-3 text-right text-sm font-bold" style="color: #6b7280; border-left: 2px solid #d1d5db;">-</td>
    </tr>
    <?php
}
?>
        </tbody>
    </table>
</div>
