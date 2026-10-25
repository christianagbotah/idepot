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
            <a href="javascript:void(0);" onClick="print_page()">Print Income Statement</a>
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
                    $address = $settings['address'];
                    $phone = $settings['phone'];

                    // Handle date range
                    if($from == 0 && $to == 0) {
                        $this->db->select('timestamp');
                        $this->db->from('payment');
                        $this->db->order_by('timestamp', 'asc');
                        $this->db->limit(1);
                        $first_entry = $this->db->get()->row();
                        $from = $first_entry ? date('d-m-Y', $first_entry->timestamp) : date('d-m-Y');
                        $to = date('d-m-Y');
                    }

                    $from_ts = strtotime($from);
                    $to_ts = strtotime($to);

                    // AGGREGATE REVENUE (Cash basis)
                    $this->db->where('timestamp >=', $from_ts);
                    $this->db->where('timestamp <=', $to_ts);
                    $this->db->where('payment_type', 'Receivable');
                    $this->db->select_sum('amount');
                    $sales_revenue = $this->db->get('payment')->row()->amount ?? 0;

                    // AGGREGATE OTHER INCOME
                    $this->db->where('date >=', $from);
                    $this->db->where('date <=', $to);
                    $this->db->where('payment_type', 'Income');
                    $this->db->select_sum('amount');
                    $other_income = $this->db->get('payment')->row()->amount ?? 0;

                    $total_revenue = $sales_revenue + $other_income;

                    // AGGREGATE COST OF GOODS SOLD
                    $this->db->where('date >=', $from);
                    $this->db->where('date <=', $to);
                    $this->db->where('payment_type', 'Payable');
                    $this->db->select_sum('amount');
                    $cogs = $this->db->get('payment')->row()->amount ?? 0;

                    $gross_profit = $total_revenue - $cogs;

                    // AGGREGATE OPERATING EXPENSES
                    $this->db->where('date >=', $from);
                    $this->db->where('date <=', $to);
                    $this->db->where('payment_type', 'Expense');
                    $this->db->select_sum('amount');
                    $operating_expenses = $this->db->get('payment')->row()->amount ?? 0;

                    $net_profit = $gross_profit - $operating_expenses;
                    ?>

                    <style>
                        body { font-size: 14px; font-family: 'Noto Sans', Arial, sans-serif; }
                        .is-container { max-width: 900px; margin: 0 auto; padding: 20px; }
                        .is-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                        .is-header h2 { margin: 5px 0; font-size: 24px; letter-spacing: 2px; }
                        .is-header p { margin: 3px 0; color: #666; }
                        .is-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .is-table td { padding: 10px 15px; border-bottom: 1px solid #e0e0e0; }
                        .is-section { background: #f5f5f5; font-weight: bold; font-size: 16px; padding: 12px 15px !important; border-top: 2px solid #1b1b69; }
                        .is-item { padding-left: 30px !important; }
                        .is-subtotal { font-weight: bold; background: #fafafa; border-top: 1px solid #999 !important; }
                        .is-total { font-weight: bold; font-size: 16px; background: #e8f4f8; border-top: 3px double #1b1b69 !important; }
                        .is-amount { text-align: right; white-space: nowrap; font-family: monospace; }
                        .is-negative { color: #d32f2f; }
                        .is-positive { color: #388e3c; }
                        #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                        #print_div a:hover { background: #2c3e50; }
                        @media print {
                            #print_div { display: none; }
                            body { margin: 0; }
                            .is-container { max-width: 100%; }
                        }
                    </style>

                    <div class="is-container">
                        <div class="is-header">
                            <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 80px;">
                            <h2><?php echo strtoupper($system_name); ?></h2>
                            <p><?php echo $address; ?> | <?php echo $phone; ?></p>
                            <h2 style="margin-top: 20px;">INCOME STATEMENT</h2>
                            <p><strong>For the Period: <?php echo $from; ?> to <?php echo $to; ?></strong></p>
                        </div>

                        <table class="is-table">
                            <tbody>
                                <!-- REVENUE SECTION -->
                                <tr>
                                    <td class="is-section">REVENUE</td>
                                    <td class="is-section is-amount"><?php echo $currency; ?></td>
                                </tr>
                                <tr>
                                    <td class="is-item">Sales Revenue</td>
                                    <td class="is-amount"><?php echo number_format($sales_revenue, 2); ?></td>
                                </tr>
                                <tr>
                                    <td class="is-item">Other Income</td>
                                    <td class="is-amount"><?php echo number_format($other_income, 2); ?></td>
                                </tr>
                                <tr class="is-subtotal">
                                    <td>Total Revenue</td>
                                    <td class="is-amount"><?php echo number_format($total_revenue, 2); ?></td>
                                </tr>

                                <!-- COST OF GOODS SOLD -->
                                <tr>
                                    <td class="is-section">COST OF GOODS SOLD</td>
                                    <td class="is-section is-amount"></td>
                                </tr>
                                <tr>
                                    <td class="is-item">Purchases</td>
                                    <td class="is-amount is-negative">(<?php echo number_format($cogs, 2); ?>)</td>
                                </tr>
                                <tr class="is-subtotal">
                                    <td>Total Cost of Goods Sold</td>
                                    <td class="is-amount is-negative">(<?php echo number_format($cogs, 2); ?>)</td>
                                </tr>

                                <!-- GROSS PROFIT -->
                                <tr class="is-total">
                                    <td><?php echo $gross_profit >= 0 ? 'GROSS PROFIT' : 'GROSS LOSS'; ?></td>
                                    <td class="is-amount <?php echo $gross_profit >= 0 ? 'is-positive' : 'is-negative'; ?>">
                                        <?php echo number_format($gross_profit, 2); ?>
                                    </td>
                                </tr>

                                <!-- OPERATING EXPENSES -->
                                <tr>
                                    <td class="is-section">OPERATING EXPENSES</td>
                                    <td class="is-section is-amount"></td>
                                </tr>
                                <tr>
                                    <td class="is-item">General & Administrative Expenses</td>
                                    <td class="is-amount is-negative">(<?php echo number_format($operating_expenses, 2); ?>)</td>
                                </tr>
                                <tr class="is-subtotal">
                                    <td>Total Operating Expenses</td>
                                    <td class="is-amount is-negative">(<?php echo number_format($operating_expenses, 2); ?>)</td>
                                </tr>

                                <!-- NET PROFIT -->
                                <tr class="is-total">
                                    <td><?php echo $net_profit >= 0 ? 'NET PROFIT' : 'NET LOSS'; ?></td>
                                    <td class="is-amount <?php echo $net_profit >= 0 ? 'is-positive' : 'is-negative'; ?>">
                                        <?php echo number_format($net_profit, 2); ?>
                                    </td>
                                </tr>
                            </tbody>
                        </table>

                        <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-left: 4px solid <?php echo $net_profit >= 0 ? '#388e3c' : '#d32f2f'; ?>;">
                            <strong>Financial Summary:</strong><br>
                            Total Revenue: <?php echo $currency . ' ' . number_format($total_revenue, 2); ?><br>
                            Less: Cost of Goods Sold: <?php echo $currency . ' ' . number_format($cogs, 2); ?><br>
                            Gross Profit: <?php echo $currency . ' ' . number_format($gross_profit, 2); ?><br>
                            Less: Operating Expenses: <?php echo $currency . ' ' . number_format($operating_expenses, 2); ?><br>
                            <strong><?php echo $net_profit >= 0 ? 'Net Profit' : 'Net Loss'; ?>: <?php echo $currency . ' ' . number_format(abs($net_profit), 2); ?></strong>
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
