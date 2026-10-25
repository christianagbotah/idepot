<!doctype html>
<html>
<head>
    <title><?=$page_title; ?></title>
    <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
    <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
    <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
    <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js');?>"></script>
</head>
<body>
    <div class="container">
        <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
            <a href="javascript:void(0);" onClick="print_page()">Print Cash Flow</a>
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
                    $currency = $settings['currency'];
                    $system_name = $settings['system_name'];
                    $location = $settings['location'];
                    $address = $settings['address'];
                    $phone = $settings['phone'];

                    // Handle date range
                    if($from == 0 && $to == 0) {
                        $this->db->select('timestamp');
                        $this->db->from('general_journal');
                        $this->db->order_by('timestamp', 'asc');
                        $this->db->limit(1);
                        $first_entry = $this->db->get()->row();
                        $from = $first_entry ? date('d-m-Y', $first_entry->timestamp) : date('d-m-Y');
                        $to = date('d-m-Y');
                    }

                    $from_ts = strtotime($from);
                    $to_ts = strtotime($to);

                    // BATCH LOAD BANK ACCOUNTS (excluding Accounts Receivable)
                    $this->db->where('account_type', 1);
                    $this->db->where('name !=', 'Accounts Receivable');
                    $bank_accounts = $this->db->get('accounts')->result_array();
                    $bank_accounts_map = [];
                    foreach($bank_accounts as $acc) {
                        $bank_accounts_map[$acc['name']] = $acc;
                    }

                    // BATCH LOAD OPENING BALANCES (before period)
                    $opening_balances = [];
                    $opening_total = 0;
                    foreach($bank_accounts as $account) {
                        $this->db->where('timestamp <', $from_ts);
                        $this->db->where('account_name', $account['name']);
                        $this->db->select('date_timestamp, account_balance');
                        $this->db->order_by('date_timestamp', 'desc');
                        $this->db->limit(1);
                        $journal_entry = $this->db->get('general_journal')->row();
                        
                        $balance = $journal_entry ? $journal_entry->account_balance : $account['current_balance'];
                        $opening_balances[$account['name']] = $balance;
                        $opening_total += $balance;
                    }

                    // BATCH LOAD CLOSING BALANCES (within period)
                    $closing_balances = [];
                    $closing_total = 0;
                    foreach($bank_accounts as $account) {
                        $this->db->where('timestamp >=', $from_ts);
                        $this->db->where('timestamp <=', $to_ts);
                        $this->db->where('account_name', $account['name']);
                        $this->db->select('date_timestamp, account_balance');
                        $this->db->order_by('date_timestamp', 'desc');
                        $this->db->limit(1);
                        $journal_entry = $this->db->get('general_journal')->row();
                        
                        $balance = $journal_entry ? $journal_entry->account_balance : $account['current_balance'];
                        $closing_balances[$account['name']] = $balance;
                        $closing_total += $balance;
                    }

                    // AGGREGATE CASH INFLOWS
                    $this->db->where('timestamp >=', $from_ts);
                    $this->db->where('timestamp <=', $to_ts);
                    $this->db->where('amount >', 0);
                    $this->db->where('payment_type', 'Receivable');
                    $this->db->select_sum('amount');
                    $total_receipts = $this->db->get('payment')->row()->amount ?? 0;

                    // AGGREGATE PURCHASE ORDERS (Cash Outflow)
                    $this->db->where('date_timestamp >=', $from_ts);
                    $this->db->where('date_timestamp <=', $to_ts);
                    $this->db->where('html_id IS NOT NULL');
                    $this->db->select('item_id, SUM(quantity) as total_qty, MAX(price) as price');
                    $this->db->group_by('item_id');
                    $purchase_items = $this->db->get('purchase_order')->result_array();
                    
                    // Batch load item names
                    $item_ids = array_column($purchase_items, 'item_id');
                    $items_map = [];
                    if(!empty($item_ids)) {
                        $this->db->where_in('item_id', $item_ids);
                        $items_query = $this->db->get('items');
                        foreach($items_query->result_array() as $item) {
                            $items_map[$item['item_id']] = $item['item_name'];
                        }
                    }

                    $purchase_total = 0;
                    foreach($purchase_items as &$item) {
                        $item['item_name'] = $items_map[$item['item_id']] ?? 'Unknown';
                        $item['subtotal'] = $item['total_qty'] * $item['price'];
                        $purchase_total += $item['subtotal'];
                    }

                    // AGGREGATE PAYMENTS (Cash Outflow)
                    $this->db->where('timestamp >=', $from_ts);
                    $this->db->where('timestamp <=', $to_ts);
                    $this->db->where('payment_type', 'Payable');
                    $this->db->where('po_code IS NULL');
                    $payments = $this->db->get('payment')->result_array();

                    // Batch load debt names
                    $debt_ids = [];
                    $customer_ids = [];
                    foreach($payments as $payment) {
                        if($payment['debt_id']) $debt_ids[] = $payment['debt_id'];
                        if($payment['customer_id']) $customer_ids[] = $payment['customer_id'];
                    }

                    $debts_map = [];
                    if(!empty($debt_ids)) {
                        $this->db->where_in('debt_id', array_unique($debt_ids));
                        foreach($this->db->get('outstanding_debts')->result_array() as $debt) {
                            $debts_map[$debt['debt_id']] = $debt['name'];
                        }
                    }

                    $customers_map = [];
                    if(!empty($customer_ids)) {
                        $this->db->where_in('customer_id', array_unique($customer_ids));
                        foreach($this->db->get('customers')->result_array() as $customer) {
                            $customers_map[$customer['customer_id']] = $customer['customer_name'];
                        }
                    }

                    $payments_total = 0;
                    foreach($payments as &$payment) {
                        if($payment['debt_id']) {
                            $payment['name'] = $debts_map[$payment['debt_id']] ?? 'Unknown';
                        } elseif($payment['customer_id']) {
                            $payment['name'] = $customers_map[$payment['customer_id']] ?? 'Unknown';
                        } else {
                            $payment['name'] = 'Other Payment';
                        }
                        $payments_total += $payment['amount'];
                    }

                    // AGGREGATE EXPENSES (Cash Outflow)
                    $this->db->where('timestamp >=', $from_ts);
                    $this->db->where('timestamp <=', $to_ts);
                    $this->db->where('payment_type', 'Expense');
                    $expenses = $this->db->get('payment')->result_array();
                    
                    $expenses_total = 0;
                    foreach($expenses as $expense) {
                        $expenses_total += $expense['amount'];
                    }

                    // CALCULATE NET CASH FLOW
                    $net_cash_flow = $opening_total + $total_receipts - $purchase_total - $payments_total - $expenses_total;
                    ?>

                    <style>
                        body { font-size: 14px; font-family: 'Noto Sans', Arial, sans-serif; }
                        .cf-container { max-width: 1000px; margin: 0 auto; padding: 20px; }
                        .cf-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                        .cf-header h2 { margin: 5px 0; font-size: 24px; letter-spacing: 2px; }
                        .cf-header p { margin: 3px 0; color: #666; }
                        .cf-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .cf-table th { background: #1b1b69; color: white; padding: 12px; text-align: left; font-weight: bold; }
                        .cf-table td { padding: 8px 12px; border-bottom: 1px solid #e0e0e0; }
                        .cf-section-header { background: #f5f5f5; font-weight: bold; padding: 10px 12px !important; border-top: 2px solid #1b1b69; }
                        .cf-indent { padding-left: 30px !important; }
                        .cf-subtotal { font-weight: bold; background: #fafafa; border-top: 1px solid #999 !important; }
                        .cf-total { font-weight: bold; font-size: 16px; background: #e8f4f8; border-top: 3px double #1b1b69 !important; }
                        .cf-amount { text-align: right; white-space: nowrap; }
                        .cf-negative { color: #d32f2f; }
                        .cf-positive { color: #388e3c; }
                        #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                        #print_div a:hover { background: #2c3e50; }
                        @media print {
                            #print_div { display: none; }
                            body { margin: 0; }
                            .cf-container { max-width: 100%; }
                        }
                    </style>

                    <div class="cf-container">
                        <div class="cf-header">
                            <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 80px;">
                            <h2><?php echo strtoupper($system_name); ?></h2>
                            <p><?php echo $address; ?> | <?php echo $phone; ?></p>
                            <h2 style="margin-top: 20px;">CASH FLOW STATEMENT</h2>
                            <p><strong>Period: <?php echo $from; ?> to <?php echo $to; ?></strong></p>
                        </div>

                        <table class="cf-table">
                            <tbody>
                                <!-- OPENING CASH BALANCE -->
                                <tr>
                                    <td colspan="2" class="cf-section-header">OPENING CASH & BANK BALANCES</td>
                                </tr>
                                <?php foreach($bank_accounts as $account): ?>
                                <tr>
                                    <td class="cf-indent"><?php echo strtoupper($account['name']); ?></td>
                                    <td class="cf-amount"><?php echo number_format($opening_balances[$account['name']], 2); ?></td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="cf-subtotal">
                                    <td>Total Opening Balance</td>
                                    <td class="cf-amount"><?php echo number_format($opening_total, 2); ?></td>
                                </tr>

                                <!-- CASH INFLOWS -->
                                <tr>
                                    <td colspan="2" class="cf-section-header">CASH INFLOWS FROM OPERATIONS</td>
                                </tr>
                                <tr>
                                    <td class="cf-indent">Cash Receipts from Customers</td>
                                    <td class="cf-amount cf-positive"><?php echo number_format($total_receipts, 2); ?></td>
                                </tr>
                                <tr class="cf-subtotal">
                                    <td>Total Cash Inflows</td>
                                    <td class="cf-amount cf-positive"><?php echo number_format($total_receipts, 2); ?></td>
                                </tr>

                                <!-- CASH OUTFLOWS - PURCHASES -->
                                <tr>
                                    <td colspan="2" class="cf-section-header">CASH OUTFLOWS - PURCHASES</td>
                                </tr>
                                <?php foreach($purchase_items as $item): ?>
                                <tr>
                                    <td class="cf-indent"><?php echo strtoupper($item['item_name']); ?> (<?php echo number_format($item['total_qty'], 0); ?> @ <?php echo number_format($item['price'], 2); ?>)</td>
                                    <td class="cf-amount cf-negative">(<?php echo number_format($item['subtotal'], 2); ?>)</td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="cf-subtotal">
                                    <td>Total Purchases</td>
                                    <td class="cf-amount cf-negative">(<?php echo number_format($purchase_total, 2); ?>)</td>
                                </tr>

                                <!-- CASH OUTFLOWS - PAYMENTS -->
                                <tr>
                                    <td colspan="2" class="cf-section-header">CASH OUTFLOWS - PAYMENTS TO CREDITORS</td>
                                </tr>
                                <?php foreach($payments as $payment): ?>
                                <tr>
                                    <td class="cf-indent"><?php echo strtoupper($payment['name']); ?></td>
                                    <td class="cf-amount cf-negative">(<?php echo number_format($payment['amount'], 2); ?>)</td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="cf-subtotal">
                                    <td>Total Payments</td>
                                    <td class="cf-amount cf-negative">(<?php echo number_format($payments_total, 2); ?>)</td>
                                </tr>

                                <!-- CASH OUTFLOWS - EXPENSES -->
                                <tr>
                                    <td colspan="2" class="cf-section-header">CASH OUTFLOWS - OPERATING EXPENSES</td>
                                </tr>
                                <?php foreach($expenses as $expense): ?>
                                <tr>
                                    <td class="cf-indent"><?php echo strtoupper($expense['expenditure_item']); ?></td>
                                    <td class="cf-amount cf-negative">(<?php echo number_format($expense['amount'], 2); ?>)</td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="cf-subtotal">
                                    <td>Total Expenses</td>
                                    <td class="cf-amount cf-negative">(<?php echo number_format($expenses_total, 2); ?>)</td>
                                </tr>

                                <!-- NET CASH FLOW -->
                                <tr class="cf-total">
                                    <td>NET CASH FLOW FOR PERIOD</td>
                                    <td class="cf-amount <?php echo $net_cash_flow >= 0 ? 'cf-positive' : 'cf-negative'; ?>">
                                        <?php echo number_format($net_cash_flow, 2); ?>
                                    </td>
                                </tr>

                                <!-- CLOSING BALANCE -->
                                <tr>
                                    <td colspan="2" class="cf-section-header">CLOSING CASH & BANK BALANCES</td>
                                </tr>
                                <?php foreach($bank_accounts as $account): ?>
                                <tr>
                                    <td class="cf-indent"><?php echo strtoupper($account['name']); ?></td>
                                    <td class="cf-amount"><?php echo number_format($closing_balances[$account['name']], 2); ?></td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="cf-total">
                                    <td>TOTAL CLOSING BALANCE</td>
                                    <td class="cf-amount"><?php echo number_format($closing_total, 2); ?></td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-left: 4px solid #1b1b69;">
                            <strong>Cash Flow Summary:</strong><br>
                            Opening Balance: <?php echo $currency . ' ' . number_format($opening_total, 2); ?><br>
                            Add: Cash Inflows: <?php echo $currency . ' ' . number_format($total_receipts, 2); ?><br>
                            Less: Cash Outflows: <?php echo $currency . ' ' . number_format($purchase_total + $payments_total + $expenses_total, 2); ?><br>
                            <strong>Closing Balance: <?php echo $currency . ' ' . number_format($closing_total, 2); ?></strong>
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
