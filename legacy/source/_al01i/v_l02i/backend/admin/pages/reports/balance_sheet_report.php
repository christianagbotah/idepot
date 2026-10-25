
<!doctype html>
<html>
<head>
    <title>Balance Sheet</title>
    <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
    <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
    <style>
        body { font-family: 'Noto Sans', Arial, sans-serif; font-size: 13px; margin: 20px; }
        .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 15px; }
        .company-name { font-size: 24px; font-weight: bold; margin: 0; }
        .report-title { font-size: 18px; margin: 10px 0; }
        .report-date { font-size: 14px; color: #666; }
        .balance-sheet { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .balance-sheet th { background: #f5f5f5; padding: 10px; text-align: left; font-weight: bold; border-bottom: 2px solid #333; }
        .balance-sheet td { padding: 8px 10px; border-bottom: 1px solid #ddd; }
        .section-header { background: #e8e8e8 !important; font-weight: bold; font-size: 14px; }
        .sub-section { padding-left: 20px !important; font-weight: 600; }
        .item { padding-left: 40px !important; }
        .amount { text-align: right; font-family: monospace; }
        .total { font-weight: bold; border-top: 2px solid #333; background: #f9f9f9; }
        .grand-total { font-weight: bold; border-top: 3px double #000; background: #e8e8e8; font-size: 15px; }
        #print_div { position: fixed; top: 15px; right: 5px; z-index: 9999; }
        #print_div a { background: #000; color: #fff; padding: 8px 15px; border-radius: 5px; text-decoration: none; }
        #print_div a:hover { background: #28a745; }
        @media print {
            #print_div { display: none; }
            body { margin: 0; }
        }
    </style>
</head>
<body>
    <div id="print_div">
        <a href="javascript:void(0);" onClick="print()">Print Balance Sheet</a>
    </div>

    <?php
    // Batch load all settings
    $settings = $this->db->where_in('type', ['currency', 'system_name', 'address'])->get('settings')->result_array();
    $settings_map = array_column($settings, 'description', 'type');
    $currency = $settings_map['currency'] ?? 'GHS';
    $system_name = $settings_map['system_name'] ?? 'Company Name';
    $address = $settings_map['address'] ?? '';
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

    // ============ ASSETS CALCULATION ============
    
    // 1. BANK & CASH - Batch load all accounts
    $this->db->where('account_type', 1);
    $this->db->where('name !=', 'Accounts Receivable');
    $all_accounts = $this->db->get('accounts')->result_array();
    
    // Batch load latest journal entries for all accounts
    $account_names = array_column($all_accounts, 'name');
    $this->db->select('account_name, journal_id, account_balance');
    $this->db->where('timestamp <=', strtotime($to));
    $this->db->where_in('account_name', $account_names);
    $this->db->order_by('journal_id', 'desc');
    $all_journals = $this->db->get('general_journal')->result_array();
    
    $journal_by_account = [];
    foreach($all_journals as $j) {
        if(!isset($journal_by_account[$j['account_name']])) {
            $journal_by_account[$j['account_name']] = $j['account_balance'];
        }
    }
    
    $accounts_map = array_column($all_accounts, 'current_balance', 'name');
    $bank_cash_total = 0;
    $bank_accounts = [];
    foreach($all_accounts as $acc) {
        $balance = $journal_by_account[$acc['name']] ?? $accounts_map[$acc['name']];
        $bank_accounts[] = ['name' => $acc['name'], 'balance' => $balance];
        $bank_cash_total += $balance;
    }

    // 2. INVENTORY - Batch load all items with latest stock
    $all_items = $this->db->get('items')->result_array();
    $item_ids = array_column($all_items, 'item_id');
    $items_map = [];
    foreach($all_items as $itm) {
        $items_map[$itm['item_id']] = ['name' => $itm['item_name'], 'price' => $itm['purchase_price']];
    }
    
    // Get latest stock from sales_order
    $this->db->select('item_id, MAX(timestamp) as max_ts');
    $this->db->where('date_timestamp <=', strtotime($to));
    $this->db->where_in('item_id', $item_ids);
    $this->db->group_by('item_id');
    $latest_so = $this->db->get('sales_order')->result_array();
    $so_timestamps = [];
    foreach($latest_so as $ls) {
        $so_timestamps[$ls['item_id']] = $ls['max_ts'];
    }
    
    // Get latest stock from purchase_order
    $this->db->select('item_id, MAX(timestamp) as max_ts');
    $this->db->where('date_timestamp <=', strtotime($to));
    $this->db->where_in('item_id', $item_ids);
    $this->db->group_by('item_id');
    $latest_po = $this->db->get('purchase_order')->result_array();
    $po_timestamps = [];
    foreach($latest_po as $lp) {
        $po_timestamps[$lp['item_id']] = $lp['max_ts'];
    }
    
    // Get actual stock balances
    $inventory_items = [];
    $inventory_total = 0;
    foreach($item_ids as $iid) {
        $so_ts = $so_timestamps[$iid] ?? 0;
        $po_ts = $po_timestamps[$iid] ?? 0;
        
        if($so_ts > $po_ts && $so_ts > 0) {
            $stock = $this->db->get_where('sales_order', ['timestamp' => $so_ts, 'item_id' => $iid])->row()->item_balance ?? 0;
        } elseif($po_ts > 0) {
            $stock = $this->db->get_where('purchase_order', ['timestamp' => $po_ts, 'item_id' => $iid])->row()->item_balance ?? 0;
        } else {
            continue;
        }
        
        if($stock > 0) {
            $value = $stock * $items_map[$iid]['price'];
            $inventory_items[] = ['name' => $items_map[$iid]['name'], 'qty' => $stock, 'price' => $items_map[$iid]['price'], 'value' => $value];
            $inventory_total += $value;
        }
    }

    // 3. DEBTORS (Accounts Receivable)
    $this->db->where('timestamp <=', strtotime($to));
    $this->db->order_by('timestamp', 'desc');
    $this->db->limit(1);
    $debtor_ts_row = $this->db->get('debtors')->row();
    
    $debtors = [];
    $debtors_total = 0;
    if($debtor_ts_row) {
        $all_debtors = $this->db->get_where('debtors', ['timestamp' => $debtor_ts_row->timestamp])->result_array();
        
        // Batch load customers, suppliers, debts
        $cust_ids = $supp_ids = $debt_ids = [];
        foreach($all_debtors as $d) {
            if($d['debtor_type'] == 'customers') $cust_ids[] = $d['debtor_type_id'];
            elseif($d['debtor_type'] == 'suppliers') $supp_ids[] = $d['debtor_type_id'];
            elseif($d['debtor_type'] == 'outstanding_debts') $debt_ids[] = $d['debtor_type_id'];
        }
        
        $customers_map = [];
        if(!empty($cust_ids)) {
            $custs = $this->db->where_in('customer_id', $cust_ids)->get('customers')->result_array();
            $customers_map = array_column($custs, 'customer_name', 'customer_id');
        }
        
        $suppliers_map = [];
        if(!empty($supp_ids)) {
            $supps = $this->db->where_in('supplier_id', $supp_ids)->get('suppliers')->result_array();
            $suppliers_map = array_column($supps, 'supplier_name', 'supplier_id');
        }
        
        $debts_map = [];
        if(!empty($debt_ids)) {
            $debts = $this->db->where_in('debt_id', $debt_ids)->get('outstanding_debts')->result_array();
            $debts_map = array_column($debts, 'name', 'debt_id');
        }
        
        foreach($all_debtors as $d) {
            $name = '';
            if($d['debtor_type'] == 'customers') $name = $customers_map[$d['debtor_type_id']] ?? 'Unknown';
            elseif($d['debtor_type'] == 'suppliers') $name = $suppliers_map[$d['debtor_type_id']] ?? 'Unknown';
            elseif($d['debtor_type'] == 'outstanding_debts') $name = $debts_map[$d['debtor_type_id']] ?? 'Unknown';
            
            $debtors[] = ['name' => $name, 'amount' => $d['amount']];
            $debtors_total += $d['amount'];
        }
    }

    $total_assets = $bank_cash_total + $inventory_total + $debtors_total;

    // ============ LIABILITIES CALCULATION ============
    
    // 1. CASH CREDITORS
    $this->db->where('timestamp <=', strtotime($to));
    $this->db->order_by('timestamp', 'desc');
    $this->db->limit(1);
    $creditor_ts_row = $this->db->get('creditors')->row();
    
    $cash_creditors = [];
    $cash_creditors_total = 0;
    if($creditor_ts_row) {
        $all_creditors = $this->db->get_where('creditors', ['timestamp' => $creditor_ts_row->timestamp])->result_array();
        
        // Batch load names (reuse maps from debtors if possible)
        $cust_ids = $supp_ids = $debt_ids = [];
        foreach($all_creditors as $c) {
            if($c['creditor_type'] == 'customers') $cust_ids[] = $c['creditor_type_id'];
            elseif($c['creditor_type'] == 'suppliers') $supp_ids[] = $c['creditor_type_id'];
            elseif($c['creditor_type'] == 'outstanding_debts') $debt_ids[] = $c['creditor_type_id'];
        }
        
        if(!empty($cust_ids) && empty($customers_map)) {
            $custs = $this->db->where_in('customer_id', $cust_ids)->get('customers')->result_array();
            $customers_map = array_column($custs, 'customer_name', 'customer_id');
        }
        if(!empty($supp_ids) && empty($suppliers_map)) {
            $supps = $this->db->where_in('supplier_id', $supp_ids)->get('suppliers')->result_array();
            $suppliers_map = array_column($supps, 'supplier_name', 'supplier_id');
        }
        if(!empty($debt_ids) && empty($debts_map)) {
            $debts = $this->db->where_in('debt_id', $debt_ids)->get('outstanding_debts')->result_array();
            $debts_map = array_column($debts, 'name', 'debt_id');
        }
        
        foreach($all_creditors as $c) {
            $name = '';
            if($c['creditor_type'] == 'customers') $name = $customers_map[$c['creditor_type_id']] ?? 'Unknown';
            elseif($c['creditor_type'] == 'suppliers') $name = $suppliers_map[$c['creditor_type_id']] ?? 'Unknown';
            elseif($c['creditor_type'] == 'outstanding_debts') $name = $debts_map[$c['creditor_type_id']] ?? 'Unknown';
            
            $cash_creditors[] = ['name' => $name, 'amount' => $c['amount']];
            $cash_creditors_total += $c['amount'];
        }
    }

    // 2. GOODS CREDITORS
    $this->db->select('customer_id, so_code, item_id');
    $this->db->where('date_timestamp <=', strtotime($to));
    $this->db->where('quantity_due >', 0);
    $this->db->distinct();
    $goods_cred_data = $this->db->get('payment_with_goods')->result_array();
    
    $goods_creditors = [];
    $goods_creditors_total = 0;
    $cust_ids_gc = array_unique(array_column($goods_cred_data, 'customer_id'));
    
    if(!empty($cust_ids_gc)) {
        $custs_gc = $this->db->where_in('customer_id', $cust_ids_gc)->get('customers')->result_array();
        $customers_gc_map = array_column($custs_gc, 'customer_name', 'customer_id');
        
        $grouped = [];
        foreach($goods_cred_data as $gcd) {
            $key = $gcd['customer_id'];
            if(!isset($grouped[$key])) $grouped[$key] = [];
            $grouped[$key][] = $gcd;
        }
        
        foreach($grouped as $cust_id => $items) {
            $cust_total = 0;
            foreach($items as $itm) {
                $this->db->where('date_timestamp <=', strtotime($to));
                $this->db->where('customer_id', $cust_id);
                $this->db->where('item_id', $itm['item_id']);
                $this->db->where('so_code', $itm['so_code']);
                $this->db->where('quantity_due >', 0);
                $this->db->order_by('so_id', 'desc');
                $this->db->limit(1);
                $pwg = $this->db->get('payment_with_goods')->row();
                
                if($pwg) {
                    $cust_total += $pwg->price * $pwg->quantity_due;
                }
            }
            
            if($cust_total > 0) {
                $goods_creditors[] = ['name' => $customers_gc_map[$cust_id] ?? 'Unknown', 'amount' => $cust_total];
                $goods_creditors_total += $cust_total;
            }
        }
    }

    $total_liabilities = $cash_creditors_total + $goods_creditors_total;
    $shareholders_equity = $total_assets - $total_liabilities;
    ?>

    <div class="header">
        <h1 class="company-name"><?= $system_name ?></h1>
        <p class="report-title">BALANCE SHEET</p>
        <p class="report-date">As at <?= $to ?></p>
    </div>

    <table class="balance-sheet">
        <thead>
            <tr>
                <th style="width: 60%">PARTICULARS</th>
                <th style="width: 20%" class="amount">AMOUNT (<?= $currency ?>)</th>
                <th style="width: 20%" class="amount">TOTAL (<?= $currency ?>)</th>
            </tr>
        </thead>
        <tbody>
            <!-- ASSETS -->
            <tr class="section-header">
                <td colspan="3">ASSETS</td>
            </tr>
            
            <tr class="sub-section">
                <td>Current Assets</td>
                <td></td>
                <td></td>
            </tr>
            
            <tr class="item">
                <td>Bank & Cash</td>
                <td></td>
                <td></td>
            </tr>
            <?php foreach($bank_accounts as $ba): ?>
            <tr class="item" style="padding-left: 60px !important;">
                <td style="padding-left: 60px !important;"><?= strtoupper($ba['name']) ?></td>
                <td class="amount"><?= number_format($ba['balance'], 2) ?></td>
                <td></td>
            </tr>
            <?php endforeach; ?>
            <tr class="item">
                <td></td>
                <td></td>
                <td class="amount"><strong><?= number_format($bank_cash_total, 2) ?></strong></td>
            </tr>
            
            <tr class="item">
                <td>Inventory</td>
                <td class="amount"><?= number_format($inventory_total, 2) ?></td>
                <td></td>
            </tr>
            
            <tr class="item">
                <td>Accounts Receivable (Debtors)</td>
                <td class="amount"><?= number_format($debtors_total, 2) ?></td>
                <td></td>
            </tr>
            
            <tr class="total">
                <td><strong>TOTAL ASSETS</strong></td>
                <td></td>
                <td class="amount"><strong><?= number_format($total_assets, 2) ?></strong></td>
            </tr>
            
            <!-- LIABILITIES -->
            <tr><td colspan="3" style="border: none; height: 20px;"></td></tr>
            <tr class="section-header">
                <td colspan="3">LIABILITIES & EQUITY</td>
            </tr>
            
            <tr class="sub-section">
                <td>Current Liabilities</td>
                <td></td>
                <td></td>
            </tr>
            
            <tr class="item">
                <td>Accounts Payable (Cash Creditors)</td>
                <td class="amount"><?= number_format($cash_creditors_total, 2) ?></td>
                <td></td>
            </tr>
            
            <tr class="item">
                <td>Goods Payable (Goods Creditors)</td>
                <td class="amount"><?= number_format($goods_creditors_total, 2) ?></td>
                <td></td>
            </tr>
            
            <tr class="total">
                <td><strong>TOTAL LIABILITIES</strong></td>
                <td></td>
                <td class="amount"><strong><?= number_format($total_liabilities, 2) ?></strong></td>
            </tr>
            
            <!-- EQUITY -->
            <tr><td colspan="3" style="border: none; height: 10px;"></td></tr>
            <tr class="grand-total">
                <td><strong>SHAREHOLDERS' EQUITY</strong></td>
                <td></td>
                <td class="amount"><strong><?= number_format($shareholders_equity, 2) ?></strong></td>
            </tr>
            
            <tr class="grand-total">
                <td><strong>TOTAL LIABILITIES & EQUITY</strong></td>
                <td></td>
                <td class="amount"><strong><?= number_format($total_liabilities + $shareholders_equity, 2) ?></strong></td>
            </tr>
        </tbody>
    </table>

    <script>
        setTimeout(() => print(), 1000);
    </script>
</body>
</html>
