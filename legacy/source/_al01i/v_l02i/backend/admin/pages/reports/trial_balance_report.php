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
            <a href="javascript:void(0);" onClick="print_page()">Print Trial Balance</a>
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
                        $this->db->from('general_journal');
                        $this->db->order_by('timestamp', 'asc');
                        $this->db->limit(1);
                        $first_entry = $this->db->get()->row();
                        $from = $first_entry ? date('d-m-Y', $first_entry->timestamp) : date('d-m-Y');
                        $to = date('d-m-Y');
                    }

                    $from_ts = strtotime($from);
                    $to_ts = strtotime($to);

                    // BATCH LOAD ALL ACCOUNT NAMES
                    $this->db->select('name');
                    $this->db->distinct();
                    $this->db->order_by('name', 'asc');
                    $account_names = $this->db->get('accounts')->result_array();

                    // BATCH AGGREGATE DEBITS AND CREDITS FOR ALL ACCOUNTS
                    $this->db->where('timestamp >=', $from_ts);
                    $this->db->where('timestamp <=', $to_ts);
                    $this->db->select('account_name, SUM(debit_amount) as total_debit, SUM(credit_amount) as total_credit');
                    $this->db->group_by('account_name');
                    $journal_data = $this->db->get('general_journal')->result_array();

                    // Index by account name for O(1) lookup
                    $journal_map = [];
                    foreach($journal_data as $row) {
                        $journal_map[$row['account_name']] = [
                            'debit' => $row['total_debit'],
                            'credit' => $row['total_credit']
                        ];
                    }

                    // Calculate balances
                    $trial_balance = [];
                    $debit_total = 0;
                    $credit_total = 0;

                    foreach($account_names as $account) {
                        $name = $account['name'];
                        $debit = $journal_map[$name]['debit'] ?? 0;
                        $credit = $journal_map[$name]['credit'] ?? 0;
                        $balance = $debit - $credit;

                        if($balance != 0) {
                            $trial_balance[] = [
                                'name' => $name,
                                'balance' => $balance,
                                'is_debit' => $balance > 0
                            ];

                            if($balance > 0) {
                                $debit_total += $balance;
                            } else {
                                $credit_total += abs($balance);
                            }
                        }
                    }
                    ?>

                    <style>
                        body { font-size: 14px; font-family: 'Noto Sans', Arial, sans-serif; }
                        .tb-container { max-width: 900px; margin: 0 auto; padding: 20px; }
                        .tb-header { text-align: center; margin-bottom: 30px; border-bottom: 3px solid #1b1b69; padding-bottom: 15px; }
                        .tb-header h2 { margin: 5px 0; font-size: 24px; letter-spacing: 2px; }
                        .tb-header p { margin: 3px 0; color: #666; }
                        .tb-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
                        .tb-table thead { background: #1b1b69; color: white; }
                        .tb-table th { padding: 12px; text-align: left; font-weight: bold; }
                        .tb-table td { padding: 10px 12px; border-bottom: 1px solid #e0e0e0; }
                        .tb-total { font-weight: bold; background: #e8f4f8; border-top: 3px double #1b1b69 !important; font-size: 16px; }
                        .tb-amount { text-align: right; font-family: monospace; }
                        .tb-balanced { color: #388e3c; }
                        .tb-unbalanced { color: #d32f2f; }
                        #print_div a { background: #1b1b69; color: white; padding: 8px 16px; border-radius: 5px; text-decoration: none; font-weight: bold; }
                        #print_div a:hover { background: #2c3e50; }
                        @media print {
                            #print_div { display: none; }
                            body { margin: 0; }
                            .tb-container { max-width: 100%; }
                        }
                    </style>

                    <div class="tb-container">
                        <div class="tb-header">
                            <img src="<?php echo base_url('uploads/school_logo.png'); ?>" style="max-height: 80px;">
                            <h2><?php echo strtoupper($system_name); ?></h2>
                            <p><?php echo $address; ?> | <?php echo $phone; ?></p>
                            <h2 style="margin-top: 20px;">TRIAL BALANCE</h2>
                            <p><strong>Period: <?php echo $from; ?> to <?php echo $to; ?></strong></p>
                        </div>

                        <table class="tb-table">
                            <thead>
                                <tr>
                                    <th>Account</th>
                                    <th class="tb-amount">Debit (<?php echo $currency; ?>)</th>
                                    <th class="tb-amount">Credit (<?php echo $currency; ?>)</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach($trial_balance as $item): ?>
                                <tr>
                                    <td><?php echo $item['name']; ?></td>
                                    <td class="tb-amount">
                                        <?php echo $item['is_debit'] ? number_format($item['balance'], 2) : ''; ?>
                                    </td>
                                    <td class="tb-amount">
                                        <?php echo !$item['is_debit'] ? number_format(abs($item['balance']), 2) : ''; ?>
                                    </td>
                                </tr>
                                <?php endforeach; ?>
                                <tr class="tb-total">
                                    <td>TOTAL</td>
                                    <td class="tb-amount"><?php echo number_format($debit_total, 2); ?></td>
                                    <td class="tb-amount"><?php echo number_format($credit_total, 2); ?></td>
                                </tr>
                            </tbody>
                        </table>

                        <?php
                        $difference = abs($debit_total - $credit_total);
                        $is_balanced = $difference < 0.01;
                        ?>
                        <div style="margin-top: 30px; padding: 15px; background: #f9f9f9; border-left: 4px solid <?php echo $is_balanced ? '#388e3c' : '#d32f2f'; ?>;">
                            <strong>Trial Balance Status:</strong><br>
                            Total Debits: <?php echo $currency . ' ' . number_format($debit_total, 2); ?><br>
                            Total Credits: <?php echo $currency . ' ' . number_format($credit_total, 2); ?><br>
                            Difference: <?php echo $currency . ' ' . number_format($difference, 2); ?><br>
                            <strong class="<?php echo $is_balanced ? 'tb-balanced' : 'tb-unbalanced'; ?>">
                                <?php echo $is_balanced ? '✓ BALANCED' : '✗ NOT BALANCED'; ?>
                            </strong>
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
