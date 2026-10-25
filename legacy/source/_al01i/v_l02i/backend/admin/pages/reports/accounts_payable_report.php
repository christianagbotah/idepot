
<!doctype html>
<html>
<head>
<title><?=$page_title ?? 'Accounts Payable Report'; ?></title>
<link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
<link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css');?>"/>
<link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
<!--Chartjs-->
<script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js');?>" type="text/javascript"></script>

</head>
<body>  

<div class="container">
<div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
<a href="javascript:void(0);" onClick="print_page()">Print Accounts Payable</a>
</div>
<div class="row">
<div class="col-lg-12">
    <div id="print">
        <?php
        //Account section - Fetch all settings in one query
        $settings = $this->db->where_in('type', ['currency', 'system_name', 'location', 'address', 'phone'])->get('settings')->result_array();
        $settings_map = array_column($settings, 'description', 'type');
        
        $currency = $settings_map['currency'] ?? 'USD';
        $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
        $system_name = $settings_map['system_name'] ?? 'System';
        $location = $settings_map['location'] ?? '';
        $address = $settings_map['address'] ?? '';
        $phone = $settings_map['phone'] ?? '';
        
        $from = $from ?? 0;
        $to = $to ?? 0;
        $customer_id = $customer_id ?? 0;
        $category = $category ?? '';

        /*if($from == 0 && $to == 0) {
            $this->db->select('timestamp');
            $this->db->from('accounts_payable');
            $this->db->order_by('timestamp', 'asc');
            $this->db->limit(1);
            $from = date('d-m-Y', $this->db->get()->row()->timestamp);//

            if($from == '') {
                $this->db->select('timestamp');
                $this->db->from('invoice');
                $this->db->order_by('timestamp', 'asc');
                $this->db->limit(1);
                $from = date('d-m-Y', $this->db->get()->row()->timestamp);//
            }

            $to = date('d-m-Y');
        }*/

        ?>

       

        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css');?>"/>
        <!--Chartjs-->
        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js');?>" type="text/javascript"></script>
        <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js');?>"></script>

        <style type="text/css">
            
             #mark_print th, #grade_table th, #conducts th {
                /*background-color: grey;*/
                padding: 5px;
                color: #000000;
                border-bottom: 2px solid #e2dddd;
             }

             #invoice_table thead tr th {
                color: #fff !important;
             }

              #invoice_table thead {
                padding: 10px 0px !important;
              }

             pre {
                    display: block;
                    font-family: monospace;
                    white-space: pre-wrap;
                    margin: -40px 0px;
                    line-height: 20px;
                }

             body {
                font-size: 14px !important;
             }

             .account_tb th {
                background-color: grey;
                border: 1px solid #e2dddd;
                padding: 5px;
                color: white;
                border-bottom: 1px solid red;
                text-align: left;
             }

            td {
                padding: 5px;
            }

            #grade_table tbody tr td{
                line-height: 25px;
            }

            #term{
                background-color: black; 
                padding: 5px 15px 5px 15px; 
                border-radius: 9px;
                font-size: 24px;
                letter-spacing: 5px;
                color: #ffffff;

            }

            div .logo{
                position: absolute;
                margin-top: 20px;
                left: 10px;
            }

            div .photo_passport {
                position: absolute;
                margin-top: -100px;
                right: 10px;
                border-radius: 16% 6%;
            }

            page[size="A4"] {
                    width: 21cm;
                    height: 29.7cm;
                    page-break-after: always;
                }

                #print_div a {
                background-color: black;
                color: #fff;
                padding: 5px;
                border-radius: 14px;
                font-size: 15px;
                font-weight: bold;
            }

            #print_div a:hover {
                background-color: green;
                color: #fff;
            }

            .footer {
                    position: fixed;
                    bottom: 0px;
                }
            
            #promote{
                position: absolute;
                    margin-top: -32px;
                }

            .footer {
                    position: relative;
                    bottom: 0px;
                }
            #status {
                position: relative;
                margin-top: -120px;
                transform: rotate(-45deg);
            }

            @media Print{

                .footer {
                    position: fixed;
                    bottom: 0px;
                }
                page {
                background: #ffffff;
                display: block;
                margin: 0 auto;
                margin-bottom: 0.5cm;
                box-shadow: 0;

                }

                 #invoice_table, #hr_line, #top_row, .footer {
                    width: 130% !important;
                }

                pre {
                    display: block;
                    font-family: monospace;
                    white-space: pre-wrap;
                    margin: -40px 0px;
                    line-height: 20px;
                }

                page[size="A4"] {
                    width: 21cm;
                    height: 29.7cm;
                    page-break-after: always;
                }

                body, page {
                    margin: 0;
                    box-shadow: 0;
                }
                
                #print_div {
                    display: none;
                }


                div .logo{
                    position: absolute;
                    margin-top: 20px;
                    left: 10px;
                }

                div .photo_passport{
                    position: absolute;
                    margin-top: -75px !important;
                    right: 10px;

                }

                #top_row{
                    margin-top: -15px;
                }

                #student_details p{
                    line-height: 30px;
                }

                #promote{
                    margin-top: -32px;
                }

                #box{
                    margin-top: -10px;
                }

                #gh{
                    margin-top: -15px;
                }

                .sign {
                    position: fixed;
                    bottom: 5px;
                }
            }
        </style>
    <page size="A4">
        <center> 

            <table class="table table-bordered table-striped" id="top_row" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                <thead>
                </thead>
                <tbody>
                    <tr>
                        <td width="50%">
                           <table class="table table-bordered table-striped" style="margin-top: -10px; border-collapse:collapse;">
                                <thead>
                                    <tr>
                                    <td>
                                       <img class="" src="<?php echo base_url(); ?>uploads/school_logo.png" style="max-height : 100px;"> 
                                    </td>
                                    <td>
                                        <h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;"><?php echo $system_name;?></h3>
                                        <pre>
                                            <h4 style="font-family: Nunito" align='left'><?php echo trim($address);?></h4>
                                        </pre>
                                    </td> 
                                    </tr>
                                    <tr style="border-top: 2px solid #1b1b69;">
                                        <td colspan="2"></td>
                                    </tr>
                                </thead>
                            </table>
                        </td>

    
                        <td width="50%">
                            <table class="table table-bordered table-striped" style="width: 100%; margin-top: -65px; border-collapse:collapse;">
                                <thead>
                                    <tr>
                                        <td align="right" colspan="2"><h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">ACCOUNTS PAYABLE REPORT</h3></td>
                                    </tr>
                                    <tr>
                                        <td align="right">Period: </td>
                                        <?php
                                        if($from != 0 && $to != 0) {
                                            ?>
                                            <td align="right"><strong>FROM: <?=$from; ?> TO: <?=$to; ?></strong></td> 

                                            <?php
                                        } else {
                                            ?>
                                            <td align="right"><strong>AS AT <?=date('d-m-Y'); ?></strong></td> 
                                            <?php
                                            
                                        }
                                        ?>
                                    </tr>
                                    <tr style="border-top: 2px solid #1b1b69;">
                                        <td colspan="2"></td>
                                    </tr>
                                </thead>
                            </table>
                        </td>
                    </tr>
                </tbody>
            </table>
        </center>



        <div class="row">
            <div class="col-lg-12 col-md-12">
                <div class="table table-responsive">
                    <table class="table table-bordered table-striped" id="invoice_table" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                        <thead style="background-color: #4242ad; padding: 30px;">
                            <tr style="height: 30px;">
                                
                                <th style="text-align: left">Creditors</th>
                                <th style="text-align: right">Goods Payable</th>
                                <th style="text-align: right">Cash Payable (<?=$currency; ?>)</th>
                                <th style="text-align: left"></th>
                            </tr>
                        </thead>

                        <tbody>
                             <?php


                                $total_payable = 0;
                                if($category != 'de'):
                                    if($from != 0 && $to != 0) {
                                        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                    }
                                    if($customer_id != 0) {
                                        $this->db->where('customer_id', $customer_id);
                                    }
                                    $this->db->where('amount_due <', 0);
                                    $payable_array = $this->db->get('invoice')->result_array();

                                    // Fetch all customer names in one query
                                    $customer_ids_invoice = !empty($payable_array) ? array_unique(array_column($payable_array, 'customer_id')) : [];
                                    $customers_map = [];
                                    if(!empty($customer_ids_invoice)) {
                                        $customers_data = $this->db->where_in('customer_id', $customer_ids_invoice)->get('customers')->result_array();
                                        $customers_map = !empty($customers_data) ? array_column($customers_data, 'customer_name', 'customer_id') : [];
                                    }

                                    foreach($payable_array as $customer):
                                        $payable_sub_total = abs($customer['amount_due'] ?? 0);
                                        $customer_name = $customers_map[$customer['customer_id'] ?? 0] ?? 'Unknown';
                                ?>
                                <tr style="border-bottom: 1px solid #000;">
                                    <td><?=strtoupper($customer_name); ?></td>
                                    <td align="right">-</td>
                                    <td align="right"><strong><?=number_format($payable_sub_total, 2, '.', ','); ?></strong></td>
                                </tr>
                                <?php
                                $total_payable += $payable_sub_total;
                             endforeach; 
                         endif;



                        //for other outanding debts like loan, TNT etc
                        if($category != 'cg' && $category != 'cn'):
                             if($from != 0 && $to != 0) {
                                $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                            }

                            $debt_query = $this->db->get_where('outstanding_debts', array('amount_due >' => 0));
                            if($debt_query->num_rows() > 0) {
                                $debt_array = $debt_query->result_array();

                                foreach($debt_array as $debt):
                                    $debt_name = $debt['name'] ?? 'Unknown';
                                    $debt_amount = $debt['amount_due'] ?? 0;
                                  ?>
                                    <tr style="border-bottom: 1px solid #000;">
                                        
                                        <td><?=strtoupper($debt_name); ?></td>
                                        <td></td>
                                        <td align="right"><strong><?=number_format($debt_amount, 2, '.', ','); ?></strong></td>
                                        
                                    </tr>
                                <?php
                                    $total_payable += $debt_amount;

                                endforeach;
                            }

                        endif;

                            ///////////////////////////
                        if($category != 'de'):    
                            //customers who still have some goods with us, yet have paid for all
                            $this->db->select('sales_order.customer_id');
                            $this->db->distinct();
                            $this->db->where('sales_order.amount_paid >', '0');

                            if($from != 0 && $to != 0) {
                                $this->db->where('sales_order.date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                $this->db->where('payment_with_goods.date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                            }

                            if($customer_id != 0) {
                                $this->db->where('sales_order.customer_id', $customer_id);
                            }
                            $this->db->where_in('sales_order.type_of_sales', ['Payables', 'Receivables']);
                            $this->db->join('payment_with_goods', 'payment_with_goods.customer_id = sales_order.customer_id');
                            $this->db->where('payment_with_goods.quantity_due >', '0');
                            //$this->db->or_where('type_of_sales', 'Receivables');
                            
                            $customer_id_query = $this->db->get('sales_order');
                            

                            if ($customer_id_query->num_rows() > 0) {
                                $customer_id_array = $customer_id_query->result_array();

                                $customer_ids = array();
                                $amount_payable = 0;
                                $amount_receivable = 0;

                                $customer_ids = !empty($customer_id_array) ? array_column($customer_id_array, 'customer_id') : [];

                            } else {

                                return false;
                            }


        //for those customers who have not taken all their products and have made some payment
        $grand_total_due = 0;
        $pSoIds = array();
        
        // Fetch all customer names at once
        $all_customers_data = !empty($customer_ids) ? $this->db->where_in('customer_id', $customer_ids)->get('customers')->result_array() : [];
        $all_customers_map = !empty($all_customers_data) ? array_column($all_customers_data, 'customer_name', 'customer_id') : [];
        
        // Fetch all items at once
        $all_items_data = $this->db->get('items')->result_array();
        $all_items_map = !empty($all_items_data) ? array_column($all_items_data, 'item_name', 'item_id') : [];
        
        // Batch load all sales_order data for these customers
        $all_sales_orders = [];
        if(!empty($customer_ids)) {
            $this->db->where_in('customer_id', $customer_ids);
            $this->db->where('amount_paid >', '0');
            $this->db->where_in('type_of_sales', ['Payables', 'Receivables']);
            if($from != 0 && $to != 0) {
                $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
            }
            $all_sales_orders = $this->db->get('sales_order')->result_array();
        }
        $sales_by_customer = [];
        foreach($all_sales_orders as $so) {
            $sales_by_customer[$so['customer_id']][] = $so;
        }
        
        // Batch load all payment_with_goods for these customers
        $all_pwg = [];
        if(!empty($customer_ids)) {
            $this->db->where_in('customer_id', $customer_ids);
            if($from != 0 && $to != 0) {
                $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
            }
            $all_pwg = $this->db->get('payment_with_goods')->result_array();
        }
        $pwg_by_customer_so = [];
        foreach($all_pwg as $pwg) {
            $pwg_by_customer_so[$pwg['customer_id']][$pwg['so_code']][] = $pwg;
        }
        
        // Batch load all payments for these customers
        $all_payments = [];
        if(!empty($customer_ids)) {
            $this->db->where_in('customer_id', $customer_ids);
            if($from != 0 && $to != 0) {
                $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
            }
            $all_payments = $this->db->get('payment')->result_array();
        }
        $payments_by_so = [];
        foreach($all_payments as $pmt) {
            $payments_by_so[$pmt['so_code']][] = $pmt;
        }
        
        // Pre-load discounts for all sales orders
        $discounts_by_so = [];
        foreach($all_sales_orders as $so) {
            if(isset($so['discount']) && $so['discount'] > 0) {
                $discounts_by_so[$so['so_code']] = $so['discount'];
            }
        }
        
        for ($i = 0; $i < count($customer_ids); $i++) { /*For each customer that we have found*/
            $payable_sub_total = 0;
            $customer_name = $all_customers_map[$customer_ids[$i]] ?? 'Unknown';
         ?>
            <tr style="border-bottom: 1px solid #000;" id="customer_id_<?=$customer_ids[$i];?>">
                <td><?=strtoupper($customer_name); ?></td>

                <td align="right">
                <?php
                //show in terms of goods
                    $timestamps = array();
                    $total_q_due = 0;
                    
                    // Use pre-loaded sales orders
                    $so_codes = [];
                    if(isset($sales_by_customer[$customer_ids[$i]]) && !empty($sales_by_customer[$customer_ids[$i]])) {
                        $so_codes = array_unique(array_column($sales_by_customer[$customer_ids[$i]], 'so_code'));
                    }
                    $so_code_array = [];
                    foreach($so_codes as $code) {
                        $so_code_array[] = ['so_code' => $code];
                    }

                            $q_due = 0;
                            $so_counter = 0;

                            $customer_owing = 0;
                            
                            
                            $dCounter = 0;

                            

                            foreach($so_code_array as $so) {//each so code

                                /*each so_code data*/
                                $payable_to_so_code = 0;
                                $actual_payable_to_so_code = 0;
                                $amount_due_to_so_code = 0;
                                $discount_to_so_code = 0;

                                //$grand_amount_paid_for_this_so_code = 0;
                                //$grand_amount_due_for_this_so_code = 0;

                                $goodsValueWeOwe = 0;

                                //find the amount paid at that time
                                //assign amount paid for so_code in the selected period
                                /*$this->db->select_sum('amount'); //amount paid
                                if($from != 0 && $to != 0) {
                                    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                }
                                $this->db->where('so_code', $so['so_code']);
                                $this->db->where('customer_id', $customer_ids[$i]);
                                $grand_amount_paid_for_this_so_code = $this->db->get('payment')->row()->amount*/;

                                

                                // Use pre-loaded payments
                                $amount_due_to_so_code = 0;
                                if(isset($payments_by_so[$so['so_code']])) {
                                    $so_payments = $payments_by_so[$so['so_code']];
                                    usort($so_payments, function($a, $b) { return $b['payment_id'] - $a['payment_id']; });
                                    $amount_due_to_so_code = $so_payments[0]['due'] ?? 0;
                                }

                                //send


                                // Use pre-loaded payment_with_goods
                                $pwg_data = [];
                                if(isset($pwg_by_customer_so[$customer_ids[$i]][$so['so_code']])) {
                                    $pwg_data = $pwg_by_customer_so[$customer_ids[$i]][$so['so_code']];
                                    usort($pwg_data, function($a, $b) { return $a['so_id'] - $b['so_id']; });
                                }
                                $date_query = (object)['last_row' => !empty($pwg_data) ? end($pwg_data) : null];
                            
                                //each item
                                $items_query = !empty($pwg_data) ? array_values(array_unique(array_column($pwg_data, 'item_id'), SORT_NUMERIC)) : [];
                                

                                //get last entry of this item in the payment with goods table
                                $soIdArray = [];
                                foreach($items_query as $item_id) {
                                    $item_pwg = array_filter($pwg_data, function($p) use ($item_id) { return ($p['item_id'] ?? 0) == $item_id; });
                                    if(!empty($item_pwg)) {
                                        usort($item_pwg, function($a, $b) { return $b['so_id'] - $a['so_id']; });
                                        $soIdArray[] = $item_pwg[0]['so_id'] ?? 0;
                                    }
                                }
                                        

                                //test//////////////////////////
                                $hasGoodsQueryTotal = 0;
                                $hasGoodsData = [];
                                foreach($pwg_data as $p) {
                                    if(in_array($p['so_id'] ?? 0, $soIdArray)) {
                                        $hasGoodsQueryTotal += $p['quantity_due'] ?? 0;
                                        $hasGoodsData[] = $p;
                                    }
                                }
                                $hasGoodsQuery = (object)['result_array' => function() use ($hasGoodsData) { return $hasGoodsData; }];

                                $sCounter = 0;

                                //if this customer doesn't have any goods with us with this so_code, let's ignore and move on
                                if($hasGoodsQueryTotal > 0) {
                                    $sCounter++;

                                } else {

                                    continue; //move on to the next so_code
                                }


                                //check the current goods value we owe this customer
                                foreach($hasGoodsData as $good) {
                                    $goodsValueWeOwe += (($good['price'] ?? 0) * ($good['quantity_due'] ?? 0)); //total goods value we owe this customer for this so_code
                                }

                                //so if what we owe him/her is less than what he/she owes us, then we ignore this order
                                if($goodsValueWeOwe < $amount_due_to_so_code) {
                                    continue; //ignore this so_code transaction and move on to the next one
                                }

                                ///end of test

                                if($sCounter > 0 && isset($date_query->last_row) && $date_query->last_row) {
                                    echo '<p style="margin-bottom: -3px">'.($date_query->last_row['date'] ?? ''). ' - ORDER#:'.$so['so_code'].':'.($date_query->last_row['total_quantity'] ?? '').'</p>';
                                }
                                /////////////////////////////////////////////////////////////////////////////////
                                
                                $amount_paid = 0;

                                for($j=0; $j < count($items_query); $j++) { /*each item found*/
                                    // Use pre-loaded data
                                    $item_pwg = array_filter($pwg_data, function($p) use ($items_query, $j) { return ($p['item_id'] ?? 0) == $items_query[$j]; });
                                    if(empty($item_pwg)) continue;
                                    
                                    usort($item_pwg, function($a, $b) { return $b['so_id'] - $a['so_id']; });
                                    $due_row = $item_pwg[0];

                                    // Check if item exists in sales_order
                                    $item_exists = false;
                                    foreach($sales_by_customer[$customer_ids[$i]] ?? [] as $so_check) {
                                        if(($so_check['item_id'] ?? 0) == $items_query[$j] && ($so_check['so_code'] ?? '') == ($so['so_code'] ?? '')) {
                                            $item_exists = true;
                                            break;
                                        }
                                    }
                                    if(!$item_exists) continue;

                                    $q_due = $due_row['quantity_due'] ?? 0;
                                    if($q_due < 1) continue;
                                    
                                    $item_quantity = $due_row['quantity'] ?? 0;
                                    $due_price1 = $due_row['price'] ?? 0;
                                    
                                    
                                    //amount payable
                                    $amt = $due_price1 * $q_due;
                                    
                                    $payable_to_so_code += $amt;
                                    //$amount_payable += ($amount_paid - $customer_owing);//amount actually paid for the goods minus the value of goods the customer has taken so far
                                    

                                    $item_name = $all_items_map[$items_query[$j]] ?? 'Unknown';
                               
                                    echo '<strong style="text-align: right;">'.$item_name.'('.number_format($due_price1, 2, '.', ',').'): <span style="background: #ebe5e5; padding: 1px">'.number_format($q_due, 0, '.', ',').'/'.number_format($item_quantity, 0, '.', ',').'</span></strong><div style="margin-top: 10px"></div>'; //shows individual item's quantity due

                                    $total_q_due += $q_due; //total due for all the items for the entire range of date selected    
                                }; /*end of each item data*/


                                
                                
                                /*back to each so_code*/
                                /*check if we truly owe this customer with this so_code*/
                                if($payable_to_so_code > $amount_due_to_so_code) {

                                    /*We truly owe him/her*/
                                    if($amount_due_to_so_code < 0) {
                                        $payable_sub_total += $payable_to_so_code;

                                        $actual_payable_to_so_code = $payable_to_so_code;

                                    } else {

                                        $payable_sub_total += ($payable_to_so_code - $amount_due_to_so_code);

                                        $actual_payable_to_so_code = $payable_to_so_code - $amount_due_to_so_code;
                                    }

                                    $discount_to_so_code = $discounts_by_so[$so['so_code']] ?? 0;

                                    if($actual_payable_to_so_code < $discount_to_so_code) {

                                        continue; /*move on to the next so code*/

                                    }

                                    /*less discount if any*/
                                    $actual_payable_to_so_code -= $discount_to_so_code; 
                                    $payable_sub_total -= $discount_to_so_code;

                                    //$so_counter++; /*truly counted that we had data*/

                                }

                                /*each so_code total payable*/

                                /*in case of any discount*/
                                echo $discount_to_so_code ? '<div class="pull-right" style="padding: 5px; width: fit-content; max-width: fit-content; border-radius: 8px; background-color: #f2b7b7;">DISCOUNT: 
                                    <strong>('.numfmt_format_currency($fmt, $discount_to_so_code, $currency).')</strong>
                                </div>' : '';
                                ?>
                                <div class="pull-right" style="padding: 5px; width: fit-content; max-width: fit-content; border-radius: 8px; background-color: #c1f3c7;">
                                    <strong><?=numfmt_format_currency($fmt, $actual_payable_to_so_code, $currency); ?></strong>
                                </div>
                                <?php

                            } //end of each so_code


                    //show now
                    echo '<strong style="text-align: right"><hr><u>'.number_format($total_q_due, 0, '.', ',').'</u></strong><br>'; //shows individual item's quantity due

                    

                    if($payable_sub_total > 0) {

                       
                        
                        $grand_total_due += $total_q_due;
                        $total_payable += $payable_sub_total;

                    }
                
                ?>
                </td>

                <td align="right">
                    <strong><?=number_format($payable_sub_total, 2, '.', ','); ?></strong>
                </td>
            </tr>
        <?php

           

            if($payable_sub_total < 1) {

                //delete this row
                echo '
                    <script>
                       
                        removeRow();
                        

                        function removeRow() {
                            $("#customer_id_'.$customer_ids[$i].'").remove();
                        }
                    </script>
                ';
            }

            //$amount_payable = 0;
            
        //}
    } //end for loop

endif;

//echo implode(', ', $pSoIds);
 ?>
                         <tr style="border-bottom: 1px solid #000;">
                             <td align="left" style="font-size: 17px"><strong>Total</strong></td>
                             <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong style="font-size: 17px"><?=number_format($grand_total_due, 0, '.', ',');?> <?=$grand_total_due > 1 ? 'Items' : 'Item'; ?></strong></td>
                             <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong style="font-size: 17px"><?=numfmt_format_currency($fmt, $total_payable, $currency); ?></strong></td>
                         </tr>
                            
                        </tbody>
                    </table>
                </div>
                <footer class="footer" style="position: fixed; bottom: -35px">
                    <div>
                        <div>
                         
                        </div>
                    </div>
                    <div style="width: 100%; height: 30px; margin-bottom: 20px; padding: 5px; text-align: left"><smal style="color:#1d1c1c; text-shadow: 1px 1px 0px #504949; position: relative; top: 5px;"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></smal></smal></div>
                </footer>
            </div> 
        </div>
    </page>
    </div>
 </div>
</div>
</div>


<script type="text/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>
<script type="text/javascript" src="<?php echo base_url('assets/js/bootstrap.js'); ?>"></script>
</body>
</html>    

<script type="text/javascript">
jQuery(document).ready(function($)
{

//  var elem = $('#print');
//PrintElem(elem);
//Popup(data);
});



function PrintElem(elem)
{
Popup($(elem).html());
}

function Popup(data)
{
var mywindow = window.open('', '', '');
mywindow.document.write('<!doctype html><html><head><title>ACCOUNTS PAYABLE REPORT</title>');
//mywindow.document.write('<link rel="stylesheet" href="assets/css/chartjs/dist/Chart.min.css" type="text\/css" \/>');
mywindow.document.write('<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.css');?>" />');
mywindow.document.write('<script src="<?php echo base_url('assets/css/chartjs/dist/Chart.js');?>" type="text\/javascript"><\/script>');
mywindow.document.write('<script type="text\/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"><\/script>');

mywindow.document.write('<\/head><body style="font-size: 13px">');
mywindow.document.write(data);

mywindow.document.write('<\/body><\/html>');
mywindow.document.close();

mywindow.onload=function(){
mywindow.focus();
mywindow.print();
mywindow.close();
}

}


function print_page() {
//window.location.reload();
print();
}

function page_reload() {
window.location.reload();
}


$(function() {
setTimeout(() => {
print_page();
}, 1000);

});
</script>

