<!doctype html>
<html>
<head>
    <title><?=$page_title ?? 'Expenses Report'; ?></title>
    <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
    <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
    <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
    <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js');?>"></script>
</head>
<body>
    <div class="container">
        <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
            <a href="javascript:void(0);" onClick="print_page()">Print Report</a>
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
                    
                    $from = $from ?? 0;
                    $to = $to ?? 0;

                    // Handle date range
                    if($from == 0 && $to == 0) {
                        $this->db->select('timestamp');
                        $this->db->from('invoice');
                        $this->db->order_by('timestamp', 'asc');
                        $this->db->limit(1);
                        $first = $this->db->get()->row();
                        if(!$first) {
                            $this->db->select('timestamp');
                            $this->db->from('accounts_payable');
                            $this->db->order_by('timestamp', 'asc');
                            $this->db->limit(1);
                            $first = $this->db->get()->row();
                        }
                        $from = $first ? date('d-m-Y', $first->timestamp) : date('d-m-Y');
                        $to = date('d-m-Y');
                    }

                    $from_ts = strtotime($from);
                    $to_ts = strtotime($to);

                    // BATCH LOAD PURCHASES
                    $this->db->where('timestamp >=', $from_ts);
                    $this->db->where('timestamp <=', $to_ts);
                    $this->db->where('payment_type', 'Payable');
                    $purchases = $this->db->get('payment')->result_array();

                    // BATCH LOAD SUPPLIERS
                    $supplier_ids = array_unique(array_column($purchases, 'supplier_id'));
                    $suppliers_map = [];
                    if(!empty($supplier_ids)) {
                        $this->db->where_in('supplier_id', $supplier_ids);
                        foreach($this->db->get('suppliers')->result_array() as $sup) {
                            $suppliers_map[$sup['supplier_id']] = $sup['supplier_name'];
                        }
                    }

                    // BATCH LOAD ISSUERS (ADMIN)
                    $issuer_ids = array_unique(array_merge(
                        array_column($purchases, 'issuer_id'),
                        []
                    ));
                    
                    // BATCH LOAD EXPENSES
                    $this->db->where('timestamp >=', $from_ts);
                    $this->db->where('timestamp <=', $to_ts);
                    $this->db->where('payment_type', 'Expense');
                    $expenses = $this->db->get('payment')->result_array();

                    $issuer_ids = array_unique(array_merge(
                        $issuer_ids,
                        array_column($expenses, 'issuer_id')
                    ));

                    // BATCH LOAD ALL ISSUERS
                    $issuers_map = [];
                    if(!empty($issuer_ids)) {
                        $this->db->where_in('admin_id', $issuer_ids);
                        foreach($this->db->get('admin')->result_array() as $admin) {
                            $issuers_map[$admin['admin_id']] = $admin['name'];
                        }
                    }

                    $total_purchase = array_sum(array_column($purchases, 'amount'));
                    $total_expense = array_sum(array_column($expenses, 'amount'));
                    ?>

                    <style>
                        body { font-size: 14px; font-family: 'Noto Sans', Arial, sans-serif; }
                        .exp-container { max-width: 1100px; margin: 0 auto; padding: 20px; }
                        .exp-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                        .exp-header h2 { margin: 5px 0; font-size: 22px; letter-spacing: 2px; }
                        .exp-header p { margin: 3px 0; color: #666; }
                        .exp-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .exp-table thead { background: #b32e06; color: white; position: sticky; top: 0; z-index: 100; }
                        .exp-table th { padding: 12px 10px; text-align: left; font-weight: bold; }
                        .exp-table td { padding: 8px 10px; border-bottom: 1px solid #e0e0e0; }
                        .exp-section { background: #f5f5f5; font-weight: bold; font-size: 15px; padding: 10px !important; }
                        .exp-subtotal { background: #fafafa; font-weight: bold; border-top: 2px solid #999 !important; }
                        .exp-total { background: #e8f4f8; font-weight: bold; font-size: 16px; border-top: 3px double #1b1b69 !important; }
                        .exp-amount { text-align: right; font-family: monospace; }
                        .exp-no-data { color: #d32f2f; text-align: center; font-style: italic; }
                        #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                        #print_div a:hover { background: #2c3e50; }
                        @media print {
                            #print_div { display: none; }
                            body { margin: 0; }
                            .exp-container { max-width: 100%; }
                            .exp-table thead { position: relative; }
                        }
                    </style>

                    <div class="exp-container">
                        <div class="exp-header">
                            <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 80px;">
                            <h2><?php echo strtoupper($system_name); ?></h2>
                            <p><?php echo $address; ?> | <?php echo $phone; ?></p>
                            <h2 style="margin-top: 20px;">EXPENDITURE & PURCHASES REPORT</h2>
                            <p><strong>Period: <?php echo $from; ?> to <?php echo $to; ?></strong></p>
                        </div>

                        <table class="exp-table">
                            <thead>
                                <tr>
                                    <th style="width: 15%;">DATE</th>
                                    <th style="width: 40%;">EXPENSE/PURCHASE</th>
                                    <th style="width: 20%;">ISSUER</th>
                                    <th style="width: 25%;" class="exp-amount">AMOUNT (<?php echo $currency; ?>)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <!-- PURCHASES SECTION -->
                                <tr class="exp-section">
                                    <td colspan="4">TOTAL PURCHASES</td>
                                </tr>
                                <?php if(!empty($purchases)): ?>
                                    <?php foreach($purchases as $purchase): ?>
                                    <tr>
                                        <td><?php echo date('d-m-Y H:i:s', $purchase['day_timestamp'] ?? $purchase['timestamp'] ?? time()); ?></td>
                                        <td><?php echo ($purchase['po_code'] ?? '') . ' FROM ' . strtoupper($suppliers_map[$purchase['supplier_id'] ?? 0] ?? 'Unknown'); ?></td>
                                        <td><?php echo $issuers_map[$purchase['issuer_id'] ?? 0] ?? 'Unknown'; ?></td>
                                        <td class="exp-amount"><?php echo number_format($purchase['amount'] ?? 0, 2); ?></td>
                                    </tr>
                                    <?php endforeach; ?>
                                    <tr class="exp-subtotal">
                                        <td colspan="3">Subtotal - Purchases</td>
                                        <td class="exp-amount"><?php echo number_format($total_purchase, 2); ?></td>
                                    </tr>
                                <?php else: ?>
                                    <tr>
                                        <td colspan="4" class="exp-no-data">No Purchase Records Found</td>
                                    </tr>
                                <?php endif; ?>

                                <!-- EXPENSES SECTION -->
                                <tr class="exp-section">
                                    <td colspan="4">TOTAL EXPENSES</td>
                                </tr>
                                <?php if(!empty($expenses)): ?>
                                    <?php foreach($expenses as $expense): ?>
                                    <tr>
                                        <td><?php echo date('d-m-Y', $expense['timestamp'] ?? time()); ?></td>
                                        <td><?php echo strtoupper($expense['expenditure_item'] ?? ''); ?></td>
                                        <td><?php echo $issuers_map[$expense['issuer_id'] ?? 0] ?? 'Unknown'; ?></td>
                                        <td class="exp-amount"><?php echo number_format($expense['amount'] ?? 0, 2); ?></td>
                                    </tr>
                                    <?php endforeach; ?>
                                    <tr class="exp-subtotal">
                                        <td colspan="3">Subtotal - Expenses</td>
                                        <td class="exp-amount"><?php echo number_format($total_expense, 2); ?></td>
                                    </tr>
                                <?php else: ?>
                                    <tr>
                                        <td colspan="4" class="exp-no-data">No Expense Records Found</td>
                                    </tr>
                                <?php endif; ?>

                                <!-- GRAND TOTAL -->
                                <tr class="exp-total">
                                    <td colspan="3">GRAND TOTAL</td>
                                    <td class="exp-amount"><?php echo number_format($total_purchase + $total_expense, 2); ?></td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-left: 4px solid #b32e06;">
                            <strong>Summary:</strong><br>
                            Total Purchases: <?php echo $currency . ' ' . number_format($total_purchase, 2); ?><br>
                            Total Expenses: <?php echo $currency . ' ' . number_format($total_expense, 2); ?><br>
                            <strong>Grand Total: <?php echo $currency . ' ' . number_format($total_purchase + $total_expense, 2); ?></strong>
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
