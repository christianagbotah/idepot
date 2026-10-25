<!doctype html>
<html>
<head>
    <title><?=$page_title ?? 'Invoice Report'; ?></title>
    <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
    <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
    <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
    <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js');?>"></script>
</head>
<body>
    <div class="container">
        <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
            <a href="javascript:void(0);" onClick="print_page()">Print Invoices Report</a>
        </div>
        <div class="row">
            <div class="col-lg-12">
                <div id="print">
                    <?php
                    // BATCH LOAD SETTINGS
                    $settings_types = ['currency', 'system_name', 'address', 'phone', 'so_prefix'];
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
                    $so_prefix = $settings['so_prefix'] ?? '';
                    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

                    // Handle date range
                    $from = $from ?? 0;
                    $to = $to ?? 0;
                    $customer_id = $customer_id ?? 0;
                    $status = $status ?? 'All';
                    
                    if($from == 0 && $to == 0) {
                        $this->db->select('timestamp');
                        $this->db->from('invoice');
                        $this->db->order_by('timestamp', 'asc');
                        $this->db->limit(1);
                        $first = $this->db->get()->row();
                        $from = $first ? date('d-m-Y', $first->timestamp) : date('d-m-Y');
                        $to = date('d-m-Y');
                    }

                    $from_ts = strtotime($from);
                    $to_ts = strtotime($to);

                    // BATCH LOAD INVOICES
                    if($customer_id != 0) $this->db->where('customer_id', $customer_id);
                    if($status != 'All') $this->db->where('status', $status);
                    $this->db->where('timestamp >=', $from_ts);
                    $this->db->where('timestamp <=', $to_ts);
                    $invoices = $this->db->get('invoice')->result_array();

                    // BATCH LOAD CUSTOMERS
                    $customer_ids = !empty($invoices) ? array_unique(array_column($invoices, 'customer_id')) : [];
                    $customers_map = [];
                    if(!empty($customer_ids)) {
                        $this->db->where_in('customer_id', $customer_ids);
                        foreach($this->db->get('customers')->result_array() as $cust) {
                            $customers_map[$cust['customer_id']] = $cust['customer_name'];
                        }
                    }

                    // BATCH LOAD SALES PERSONS
                    $sales_person_ids = !empty($invoices) ? array_unique(array_column($invoices, 'sales_person_id')) : [];
                    $sales_persons_map = [];
                    if(!empty($sales_person_ids)) {
                        $this->db->where_in('admin_id', $sales_person_ids);
                        foreach($this->db->get('admin')->result_array() as $admin) {
                            $sales_persons_map[$admin['admin_id']] = $admin['name'];
                        }
                    }

                    // BATCH LOAD PAYMENT ADJUSTMENTS FOR OPENING INVOICES
                    $opening_so_codes = [];
                    if(!empty($invoices)) {
                        foreach($invoices as $inv) {
                            if(strpos($inv['so_code'], 'Opening-' . $so_prefix) === 0) {
                                $opening_so_codes[] = $inv['so_code'];
                            }
                        }
                    }

                    $payment_adjustments = [];
                    if(!empty($opening_so_codes)) {
                        $this->db->where('timestamp >=', $from_ts);
                        $this->db->where('timestamp <=', $to_ts);
                        $this->db->where_in('so_code', $opening_so_codes);
                        $this->db->select('so_code, SUM(amount) as total_paid, SUM(due) as total_due');
                        $this->db->group_by('so_code');
                        $payments = $this->db->get('payment')->result_array();
                        foreach($payments as $pay) {
                            $payment_adjustments[$pay['so_code']] = [
                                'paid' => $pay['total_paid'],
                                'due' => $pay['total_due']
                            ];
                        }
                    }

                    $grand_total = 0;
                    $total_paid = 0;
                    $total_balance = 0;
                    ?>

                    <style>
                        body { font-size: 14px; font-family: 'Noto Sans', Arial, sans-serif; }
                        .inv-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
                        .inv-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                        .inv-header h2 { margin: 5px 0; font-size: 22px; letter-spacing: 2px; }
                        .inv-header p { margin: 3px 0; color: #666; }
                        .inv-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .inv-table thead { background: #4242ad; color: white; }
                        .inv-table th { padding: 12px 8px; text-align: left; font-weight: bold; }
                        .inv-table td { padding: 8px; border-bottom: 1px solid #e0e0e0; }
                        .inv-total { font-weight: bold; background: #e8f4f8; border-top: 3px double #1b1b69 !important; }
                        .inv-amount { text-align: right; font-family: monospace; }
                        .inv-paid { color: #388e3c; }
                        .inv-unpaid { color: #d32f2f; }
                        .inv-partial { color: #f713c6; }
                        #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                        #print_div a:hover { background: #2c3e50; }
                        @media print {
                            #print_div { display: none; }
                            body { margin: 0; }
                            .inv-container { max-width: 100%; }
                        }
                    </style>

                    <div class="inv-container">
                        <div class="inv-header">
                            <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 80px;">
                            <h2><?php echo strtoupper($system_name); ?></h2>
                            <p><?php echo $address; ?> | <?php echo $phone; ?></p>
                            <h2 style="margin-top: 20px;">INVOICES REPORT</h2>
                            <p><strong>Period: <?php echo $from; ?> to <?php echo $to; ?></strong></p>
                            <p>Number of Invoices: <strong><?php echo number_format(count($invoices), 0); ?></strong></p>
                        </div>

                        <table class="inv-table">
                            <thead>
                                <tr>
                                    <th style="width: 10%;">Created</th>
                                    <th style="width: 10%;">Paid Date</th>
                                    <th style="width: 12%;">Invoice</th>
                                    <th style="width: 20%;">Customer</th>
                                    <th style="width: 15%;">Cashier</th>
                                    <th style="width: 10%;">Status</th>
                                    <th style="width: 8%;" class="inv-amount">Amount</th>
                                    <th style="width: 8%;" class="inv-amount">Paid</th>
                                    <th style="width: 7%;" class="inv-amount">Balance</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach($invoices as $invoice): 
                                    $amount_paid = $invoice['amount_paid'] ?? 0;
                                    $amount_due = $invoice['amount_due'] ?? 0;
                                    
                                    // Apply payment adjustments for opening invoices
                                    if(isset($payment_adjustments[$invoice['so_code']])) {
                                        $amount_paid = $payment_adjustments[$invoice['so_code']]['paid'];
                                        $amount_due = $payment_adjustments[$invoice['so_code']]['due'];
                                    }

                                    $status_class = ($invoice['status'] ?? '') == 'Paid' ? 'inv-paid' : (($invoice['status'] ?? '') == 'Unpaid' ? 'inv-unpaid' : 'inv-partial');
                                    $payment_date = !empty($invoice['payment_timestamp']) ? date('d-m-Y', $invoice['payment_timestamp']) : '-';
                                    
                                    $grand_total += $invoice['amount'] ?? 0;
                                    $total_paid += $amount_paid;
                                    $total_balance += $amount_due;
                                ?>
                                <tr>
                                    <td><?php echo date('d-m-Y', $invoice['creation_timestamp']); ?></td>
                                    <td><?php echo $payment_date; ?></td>
                                    <td><?php echo $invoice['invoice_code']; ?></td>
                                    <td><?php echo $customers_map[$invoice['customer_id']] ?? 'Unknown'; ?></td>
                                    <td><?php echo $sales_persons_map[$invoice['sales_person_id']] ?? 'Unknown'; ?></td>
                                    <td class="<?php echo $status_class; ?>"><?php echo $invoice['status']; ?></td>
                                    <td class="inv-amount"><?php echo number_format($invoice['amount'], 2); ?></td>
                                    <td class="inv-amount"><?php echo number_format($amount_paid, 2); ?></td>
                                    <td class="inv-amount"><?php echo number_format($amount_due, 2); ?></td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="inv-total">
                                    <td colspan="6">GRAND TOTAL</td>
                                    <td class="inv-amount"><?php echo numfmt_format_currency($fmt, $grand_total, $currency); ?></td>
                                    <td class="inv-amount"><?php echo numfmt_format_currency($fmt, $total_paid, $currency); ?></td>
                                    <td class="inv-amount"><?php echo numfmt_format_currency($fmt, $total_balance, $currency); ?></td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-left: 4px solid #1b1b69;">
                            <strong>Summary:</strong><br>
                            Total Invoices: <?php echo count($invoices); ?><br>
                            Total Amount: <?php echo numfmt_format_currency($fmt, $grand_total, $currency); ?><br>
                            Total Paid: <?php echo numfmt_format_currency($fmt, $total_paid, $currency); ?><br>
                            <strong>Outstanding Balance: <?php echo numfmt_format_currency($fmt, $total_balance, $currency); ?></strong>
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
