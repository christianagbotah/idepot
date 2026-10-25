<!doctype html>
<html>
<head>
    <title><?=$page_title ?? 'Cash Received Report'; ?></title>
    <link rel="stylesheet" href="<?=base_url('assets/css/font-icons/entypo/css/entypo.css.min.css')?>"/>
    <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
    <link rel="shortcut icon" href="<?=base_url('uploads/school_logo.png')?>">
    <script src="<?=base_url('assets/js/jquery-3.3.1.min.js')?>"></script>
    <style>
        body{font-size:14px!important}
        #payment_table{width:100%;border-collapse:collapse;margin-top:10px}
        #payment_table thead{background-color:#36b9cc;color:#fff;position:sticky;top:0;z-index:100}
        #payment_table th{padding:10px;text-align:left}
        #payment_table td{padding:5px;border-bottom:1px solid #e0e0e0}
        .category-header{background:#352f2f;color:#fff;font-size:18px;padding:5px;letter-spacing:2px}
        .account-header{padding:5px;font-size:16px;font-weight:bold}
        #print_div a{background:#000;color:#fff;padding:5px;border-radius:14px;font-weight:bold}
        #print_div a:hover{background:green}
        @media print{#print_div{display:none}#payment_table thead{position:relative}}
    </style>
</head>
<body>
<div class="container">
    <div class="row" style="margin-top:15px;position:fixed;right:5px;z-index:9999" id="print_div">
        <a href="javascript:void(0);" onClick="print()">Print Cash Received</a>
    </div>
    <div class="row"><div class="col-lg-12"><div id="print">
    <?php

    // INIT VARS
    $from = $from ?? 0;
    $to = $to ?? 0;
    $customer_id = $customer_id ?? 0;
    
    // BATCH LOAD SETTINGS
    $settings = $this->db->where_in('type',['currency','system_name','address','phone'])->get('settings')->result_array();
    $s = array_column($settings,'description','type');
    $currency = $s['currency'] ?? 'USD';
    $system_name = $s['system_name'] ?? 'System';
    $address = $s['address'] ?? '';
    $phone = $s['phone'] ?? '';
    
    // HANDLE DATE RANGE
    if($from == 0 && $to == 0) {
        $this->db->select('timestamp')->from('invoice')->order_by('timestamp','asc')->limit(1);
        $first = $this->db->get()->row();
        $from = $first ? date('d-m-Y',$first->timestamp) : date('d-m-Y');
        $to = date('d-m-Y');
    }
    
    $from_ts = strtotime($from);
    $to_ts = strtotime($to);
    
    // BATCH LOAD ALL PAYMENTS
    $this->db->where('timestamp BETWEEN "'.$from_ts.'" AND "'.$to_ts.'"');
    if($customer_id != 0) $this->db->where('customer_id',$customer_id);
    $this->db->where('category IS NOT NULL');
    $all_payments = $this->db->get('payment')->result_array();
    
    // BATCH LOAD CUSTOMERS
    $cust_ids = array_unique(array_column($all_payments,'customer_id'));
    $customers = !empty($cust_ids) ? $this->db->where_in('customer_id',$cust_ids)->get('customers')->result_array() : [];
    $customers_map = array_column($customers,'customer_name','customer_id');
    
    // BATCH LOAD ADMINS
    $admin_ids = array_unique(array_column($all_payments,'issuer_id'));
    $admins = !empty($admin_ids) ? $this->db->where_in('admin_id',$admin_ids)->get('admin')->result_array() : [];
    $admins_map = array_column($admins,'name','admin_id');
    
    // BATCH LOAD ACCOUNTS
    $accounts = $this->db->where('account_is_transferrable',1)->get('accounts')->result_array();
    $accounts_map = array_column($accounts,'name','account_id');
    
    // GROUP PAYMENTS BY CATEGORY AND ACCOUNT
    $payments_by_cat_acc = [];
    foreach($all_payments as $p) {
        $cat = $p['category'] ?? '';
        $acc = $p['account_id'] ?? 0;
        $payments_by_cat_acc[$cat][$acc][] = $p;
    }
    
    // GET UNIQUE CATEGORIES
    $categories = array_unique(array_column($all_payments,'category'));
    rsort($categories);
    
    $grand_total = 0;
    ?>
    
    <center>
    <table style="width:100%;border-collapse:collapse;margin-top:10px">
        <tr>
            <td width="50%">
                <img src="<?=base_url()?>uploads/school_logo.png" style="max-height:80px">
                <h3 style="font-weight:bold;font-size:20px"><?=$system_name?></h3>
                <p><pre><?=$address?></pre></p>
            </td>
            <td width="50%" align="right">
                <h3 style="font-weight:bold;font-size:20px">CASH RECEIVED REPORT</h3>
                <p><strong>From: <?=$from?> To: <?=$to?></strong></p>
            </td>
        </tr>
    </table>
    </center>
    
    <table id="payment_table">
        <thead>
            <tr>
                <th>DATE</th>
                <th>CUSTOMER</th>
                <th>SO CODE</th>
                <th>INVOICE CODE</th>
                <th>CASHIER</th>
                <th style="text-align:right">AMOUNT (<?=$currency?>)</th>
                <th style="text-align:right">TOTAL (<?=$currency?>)</th>
            </tr>
        </thead>
        <tbody>
        <?php foreach($categories as $category): ?>
            <tr style="border-top:2px solid #000"><td colspan="7"></td></tr>
            <tr><td colspan="7" class="category-header"><?=strtoupper($category)?></td></tr>
            
            <?php foreach($accounts as $account): 
                $acc_id = $account['account_id'];
                $acc_name = $account['name'];
                $payments = $payments_by_cat_acc[$category][$acc_id] ?? [];
                
                if(empty($payments)) continue;
                
                $acc_total = 0;
                $color = $acc_name == 'Cash' ? '#229954' : ($acc_name == 'Momo' ? '#2E86C1' : ($acc_name == 'Cheque' ? '#000' : '#515A5A'));
            ?>
            <tr>
                <td colspan="7" class="account-header" style="background:<?=$color?>;color:#fff;padding:5px">
                    <?=strtoupper($acc_name)?>
                </td>
            </tr>
            
            <?php foreach($payments as $pmt): 
                $amount = $pmt['amount'] ?? 0;
                
                // Handle cash sales in payables
                if($category == 'Payables' && isset($pmt['cash_sales_in_payables']) && $pmt['cash_sales_in_payables'] > 0) {
                    $amount = $amount - $pmt['cash_sales_in_payables'];
                    
                }
                
                if($amount <= 0) continue;
                
                $cust_name = $customers_map[$pmt['customer_id'] ?? 0] ?? 'Unknown';
                $cashier = $admins_map[$pmt['issuer_id'] ?? 0] ?? '';
                $cashier_short = substr($cashier, 0, strpos($cashier,' ') ?: strlen($cashier));
                
                $acc_total += $amount;
            ?>
            <tr style="border-bottom:1px solid #000">
                <td><?=$pmt['date'] ?? ''?></td>
                <td><?=$cust_name?></td>
                <td><?=$pmt['so_code'] ?? ''?></td>
                <td><?=$pmt['invoice_code'] ?? ''?></td>
                <td><?=$cashier_short?></td>
                <td align="right"><?=number_format($amount,2,'.',',')?></td>
                <td></td>
            </tr>
            <?php endforeach; ?>
            
            <tr>
                <td colspan="6"></td>
                <td align="right" style="border-top:1px solid #000"><strong><?=number_format($acc_total,2,'.',',')?></strong></td>
            </tr>
            
            <?php 
                $grand_total += $acc_total;
            endforeach; ?>
            
        <?php endforeach; ?>
        
        <?php
        // HANDLES CASH SALES IN PAYABLES (if not already in Cash Sales category)
        $has_cash_sales = false;
        foreach($categories as $c) {
            if($c == 'Cash Sales') {
                $has_cash_sales = true;
                break;
            }
        }
        
        
        if($has_cash_sales) {
            
            // Get cash sales from payables
            $cash_sales_payments = array_filter($all_payments, function($p) {
                return ($p['category'] ?? '') == 'Payables' && ($p['cash_sales_in_payables'] ?? 0) > 0;
            });
            
            if(!empty($cash_sales_payments)) {
                $cs_by_account = [];
                foreach($cash_sales_payments as $csp) {
                    $cs_by_account[$csp['account_id'] ?? 0][] = $csp;
                }
        ?>
        <tr style="border-top:2px solid #000"><td colspan="7"></td></tr>
        <tr><td colspan="7" class="category-header">CASH SALES</td></tr>
        
        <?php foreach($accounts as $account):
            $acc_id = $account['account_id'];
            $acc_name = $account['name'];
            $cs_payments = $cs_by_account[$acc_id] ?? [];
            
            if(empty($cs_payments)) continue;
            
            $cs_total = 0;
            $color = $acc_name == 'Cash' ? '#229954' : ($acc_name == 'Momo' ? '#2E86C1' : ($acc_name == 'Cheque' ? '#000' : '#515A5A'));
        ?>
        <tr>
            <td colspan="7" class="account-header" style="background:<?=$color?>;color:#fff;padding:5px">
                <?=strtoupper($acc_name)?>
            </td>
        </tr>
        
        <?php foreach($cs_payments as $csp):
            $cs_amount = $csp['cash_sales_in_payables'] ?? 0;
            if($cs_amount <= 0) continue;
            
            $cust_name = $customers_map[$csp['customer_id'] ?? 0] ?? 'Unknown';
            $cashier = $admins_map[$csp['issuer_id'] ?? 0] ?? '';
            $cashier_short = substr($cashier, 0, strpos($cashier,' ') ?: strlen($cashier));
            
            $cs_total += $cs_amount;
        ?>
        <tr style="border-bottom:1px solid #000">
            <td><?=$csp['date'] ?? ''?></td>
            <td><?=$cust_name?></td>
            <td><?=$csp['so_code'] ?? ''?></td>
            <td><?=$csp['invoice_code'] ?? ''?></td>
            <td><?=$cashier_short?></td>
            <td align="right"><?=number_format($cs_amount,2,'.',',')?></td>
            <td></td>
        </tr>
        <?php endforeach; ?>
        
        <tr>
            <td colspan="6"></td>
            <td align="right" style="border-top:1px solid #000"><strong><?=number_format($cs_total,2,'.',',')?></strong></td>
        </tr>
        
        <?php 
            $grand_total += $cs_total;
        endforeach; ?>
        <?php }} ?>
        
        <tr style="border-top:1px solid #000;border-style:double none">
            <td colspan="6"></td>
            <td align="right"><strong><?=number_format($grand_total,2,'.',',')?></strong></td>
        </tr>
        </tbody>
    </table>
    
    </div></div></div>
</div>

<script src="<?=base_url('assets/js/bootstrap.js')?>"></script>
<script>
$(function(){
    setTimeout(()=>{print();},1000);
});
</script>
</body>
</html>
