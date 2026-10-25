<!doctype html>
<html>
<head>
    <title><?=$page_title ?? 'Creditors Report'; ?></title>
    <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
    <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
    <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
    <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js');?>"></script>
</head>
<body>
    <div class="container">
        <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
            <a href="javascript:void(0);" onClick="print_page()">Print Creditors Report</a>
        </div>
        <div class="row">
            <div class="col-lg-12">
                <div id="print">
                    <?php
                    // BATCH LOAD SETTINGS (3 queries → 1 query)
                    $settings_types = ['currency', 'system_name', 'address'];
                    $this->db->where_in('type', $settings_types);
                    $settings_query = $this->db->get('settings');
                    $settings = [];
                    foreach($settings_query->result_array() as $row) {
                        $settings[$row['type']] = $row['description'];
                    }
                    $currency = $settings['currency'] ?? 'USD';
                    $system_name = $settings['system_name'] ?? 'System';
                    $address = $settings['address'] ?? '';
                    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
                    
                    $to = $to ?? date('d-m-Y');
                    $creditor_type = $creditor_type ?? '';
                    $creditor_type_id = $creditor_type_id ?? 0;

                    $to_ts = strtotime($to);

                    // BATCH LOAD CREDITORS
                    $this->db->where('timestamp', $to_ts);
                    if(!empty($creditor_type)) {
                        $this->db->where('creditor_type', $creditor_type);
                    }
                    if(!empty($creditor_type_id)) {
                        $this->db->where('creditor_type_id', $creditor_type_id);
                    }
                    $creditors = $this->db->get('creditors')->result_array();

                    // Group creditors by type
                    $customer_ids = [];
                    $supplier_ids = [];
                    $debt_ids = [];
                    foreach($creditors as $creditor) {
                        if(($creditor['creditor_type'] ?? '') == 'customers') {
                            $customer_ids[] = $creditor['creditor_type_id'] ?? 0;
                        } elseif(($creditor['creditor_type'] ?? '') == 'suppliers') {
                            $supplier_ids[] = $creditor['creditor_type_id'] ?? 0;
                        } elseif(($creditor['creditor_type'] ?? '') == 'outstanding_debts') {
                            $debt_ids[] = $creditor['creditor_type_id'] ?? 0;
                        }
                    }

                    // BATCH LOAD CUSTOMERS
                    $customers_map = [];
                    if(!empty($customer_ids)) {
                        $this->db->where_in('customer_id', $customer_ids);
                        foreach($this->db->get('customers')->result_array() as $customer) {
                            $customers_map[$customer['customer_id']] = $customer['customer_name'];
                        }
                    }

                    // BATCH LOAD SUPPLIERS
                    $suppliers_map = [];
                    if(!empty($supplier_ids)) {
                        $this->db->where_in('supplier_id', $supplier_ids);
                        foreach($this->db->get('suppliers')->result_array() as $supplier) {
                            $suppliers_map[$supplier['supplier_id']] = $supplier['supplier_name'];
                        }
                    }

                    // BATCH LOAD DEBTS
                    $debts_map = [];
                    if(!empty($debt_ids)) {
                        $this->db->where_in('debt_id', $debt_ids);
                        foreach($this->db->get('outstanding_debts')->result_array() as $debt) {
                            $debts_map[$debt['debt_id']] = $debt['name'];
                        }
                    }

                    // Enrich creditors with names
                    $total_creditors = 0;
                    foreach($creditors as &$creditor) {
                        if(($creditor['creditor_type'] ?? '') == 'customers') {
                            $creditor['name'] = $customers_map[$creditor['creditor_type_id'] ?? 0] ?? 'Unknown';
                            $creditor['type_label'] = 'Customer';
                        } elseif(($creditor['creditor_type'] ?? '') == 'suppliers') {
                            $creditor['name'] = $suppliers_map[$creditor['creditor_type_id'] ?? 0] ?? 'Unknown';
                            $creditor['type_label'] = 'Supplier';
                        } elseif(($creditor['creditor_type'] ?? '') == 'outstanding_debts') {
                            $creditor['name'] = $debts_map[$creditor['creditor_type_id'] ?? 0] ?? 'Unknown';
                            $creditor['type_label'] = 'Outstanding Debt';
                        }
                        $total_creditors += $creditor['amount'] ?? 0;
                    }
                    ?>

                    <style>
                        body { font-size: 14px; font-family: 'Noto Sans', Arial, sans-serif; }
                        .cred-container { max-width: 900px; margin: 0 auto; padding: 20px; }
                        .cred-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                        .cred-header h2 { margin: 5px 0; font-size: 24px; letter-spacing: 2px; }
                        .cred-header p { margin: 3px 0; color: #666; }
                        .cred-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .cred-table thead { background: #1b1b69; color: white; }
                        .cred-table th { padding: 12px; text-align: left; font-weight: bold; }
                        .cred-table td { padding: 10px 12px; border-bottom: 1px solid #e0e0e0; }
                        .cred-total { font-weight: bold; background: #e8f4f8; border-top: 3px double #1b1b69 !important; font-size: 16px; }
                        .cred-amount { text-align: right; font-family: monospace; }
                        #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                        #print_div a:hover { background: #2c3e50; }
                        @media print {
                            #print_div { display: none; }
                            body { margin: 0; }
                            .cred-container { max-width: 100%; }
                        }
                    </style>

                    <div class="cred-container">
                        <div class="cred-header">
                            <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 80px;">
                            <h2><?php echo strtoupper($system_name); ?></h2>
                            <p><?php echo $address; ?></p>
                            <h2 style="margin-top: 20px;">CREDITORS REPORT</h2>
                            <p><strong>As at: <?php echo date('d-m-Y', $to_ts); ?></strong></p>
                        </div>

                        <table class="cred-table">
                            <thead>
                                <tr>
                                    <th style="width: 50%;">Creditor Name</th>
                                    <th style="width: 25%;">Type</th>
                                    <th style="width: 25%;" class="cred-amount">Amount (<?php echo $currency; ?>)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php if(!empty($creditors)): ?>
                                    <?php foreach($creditors as $creditor): ?>
                                    <tr>
                                        <td><?php echo strtoupper($creditor['name'] ?? ''); ?></td>
                                        <td><?php echo $creditor['type_label'] ?? ''; ?></td>
                                        <td class="cred-amount"><?php echo number_format($creditor['amount'] ?? 0, 2); ?></td>
                                    </tr>
                                    <?php endforeach; ?>
                                <?php else: ?>
                                    <tr>
                                        <td colspan="3" style="text-align: center; color: #999; font-style: italic;">No creditors found for this period</td>
                                    </tr>
                                <?php endif; ?>
                                <tr class="cred-total">
                                    <td colspan="2">TOTAL</td>
                                    <td class="cred-amount"><?php echo numfmt_format_currency($fmt, $total_creditors, $currency); ?></td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-left: 4px solid #d32f2f;">
                            <strong>Creditors Summary:</strong><br>
                            Total Creditors: <?php echo count($creditors); ?><br>
                            Total Amount Owed: <?php echo numfmt_format_currency($fmt, $total_creditors, $currency); ?><br>
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
