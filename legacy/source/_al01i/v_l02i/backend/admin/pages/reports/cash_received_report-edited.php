
<!doctype html>
<html>
    <head>
        <title><?=$page_title; ?></title>
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
                <a href="javascript:void(0);" onClick="print_page()">Print Cash Received</a>
            </div>
            <div class="row">
                <div class="col-lg-12">
                    <div id="print">
                        <?php
                        //Account section
                        $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
                        $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

                        $system_name        =   $this->db->get_where('settings' , array('type'=>'system_name'))->row()->description;
                        $location           =   $this->db->get_where('settings' , array('type'=>'location'))->row()->description;
                        $address            =   $this->db->get_where('settings' , array('type'=>'address'))->row()->description;
                        $phone            =   $this->db->get_where('settings' , array('type'=>'phone'))->row()->description;

                        if($from == 0 && $to == 0) {
                            $this->db->select('timestamp');
                            $this->db->from('invoice');
                            $this->db->order_by('timestamp', 'asc');
                            $this->db->limit(1);
                            $from = date('d-m-Y', $this->db->get()->row()->timestamp);//

                            if($from == '') {
                                $this->db->select('timestamp');
                                $this->db->from('accounts_payable');
                                $this->db->order_by('timestamp', 'asc');
                                $this->db->limit(1);
                                $from = date('d-m-Y', $this->db->get()->row()->timestamp);//
                            }

                            $to = date('d-m-Y');
                        }


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

                             #payment_table thead tr th {
                                color: #fff !important;
                             }

                              #payment_table thead {
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

                            #payment_table th {
                                position: sticky; 
                                top: 0; 
                                z-index: 9999;
                                background-color: #36b9cc;
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

                                 #payment_table, #hr_line, #top_row, .footer {
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
                                                        <td align="right" colspan="2"><h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">CASH RECEIVED REPORT</h3></td>
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Period: </td>
                                                        <td align="right"><strong>From: <?=$from; ?> To: <?=$to; ?></strong></td> 
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
                                    <table class="table table-striped" id="payment_table" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                                        <thead style="background-color: #36b9cc; color: #fff;">
                                            <tr>
                                                <th style="text-align: left; padding: 10px">DATE</th>
                                                <th style="text-align: left">CUSTOMER</th>
                                                <th style="text-align: left">SO CODE</th>
                                                <th style="text-align: left">INVOICE CODE</th>
                                                <th style="text-align: left">CASHIER</th>
                                                <th style="text-align: right">AMOUNT (<?=$currency; ?>)</th>
                                                <th style="text-align: right">SUB-TOTAL (<?=$currency; ?>)</th>
                                                <th style="text-align: right">GRAND-TOTAL (<?=$currency; ?>)</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            
                                            <?php

                                                //let's select all the categories in the payment table e.g CASH SALES, RECEIVABLES AND PAYABLES
                                                $this->db->select('category');
                                                $this->db->distinct();
                                                $this->db->order_by('category', 'desc');
                                                $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                                $cat_query = $this->db->get('payment');

                                                if($cat_query->num_rows() > 0):

                                                    $cat_array = $cat_query->result_array();
                                                    $grand_total = 0;
                                                    $cs_counter = 0;
                                                    $cs_counter2 = 0;
                                                    $ms_counter = 0;
                                                    
                                                    $counter = 1;
                                                    $index_counter = 0;
                                                    $payment_id_counter = 0;

                                                    $so_code_data = array();
                                                    $amount_data = array();
                                                    $account_data = array();
                                                    $payment_ids = array();
                                                    $payment_ids2 = array();

                                                    $not_found_account_ids = array();
                                                    $found_account_ids = array();

                                                    $not_found = 'No';

                                                    foreach($cat_array as $category):
                                                    ?>
                                                    <tr style="border-top: 2px solid #000;"><td colspan="8"></td></tr>
                                                    <tr style="border-bottom: 2px solid #000; background-color: #828282; color: #fff;">
                                                        <td style="text-align: left; padding: 0 5px" colspan="2"><h3><?=strtoupper($category['category']); ?></h3></td>
                                                    </tr>
                                                    
                                                    
                                                    <?php 

                                                    $this->db->where('account_is_transferrable', 1);
                                                    $b_accounts_query = $this->db->get_where('accounts');

                                                    if($b_accounts_query->num_rows() > 0) {
                                                        $b_accounts_array = $b_accounts_query->result_array();
                                                    }

                                                    
                                                    foreach($b_accounts_array as $account):

                                                        switch($account['name']) {
                                                            case 'Cash':
                                                                $color = '#229954';
                                                                break;
                                                            case 'Momo':
                                                                $color = '#2E86C1';
                                                                break;
                                                            case 'Cheque':
                                                                $color = '#000000';
                                                                break;
                                                            default:
                                                                $color = '#515A5A';
                                                            
                                                        }
                                                        
                                                       
                                                        echo '<tr style="border-buttom: 1px solid #000; background-color: '.$color.'; color: #fff;" class="account_'.$account['account_id'].$counter.'">

                                                                <td style="text-align: left; padding: 2px"><br>'.strtoupper($account['name']).'</td>
                                                              </tr>'; //shows the account name e.g MOMO, which is the mode of payment


                                                        //now let's select all mode of payments under each category in the payment table
                                                        $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                                        $this->db->where('category', $category['category']);
                                                        $this->db->where('account_id', $account['account_id']);
                                                        $each_category_query = $this->db->get('payment');

                                                        if($each_category_query->num_rows() > 0) {
                                                            //our codes here
                                                            $each_category_array = $each_category_query->result_array();

                                                            
                                                            foreach($each_category_array as $ccat): 

                                                                $cs_customer_name = $this->db->get_where('customers', array('customer_id' => $ccat['customer_id']))->row()->customer_name;
                                                                $cs_cashier = $this->db->get_where('admin', array('admin_id' => $ccat['issuer_id']))->row()->name;


                                                                //check if it is payables so we can also check and extract the cash payment made for the picked goods
                                                                if($category['category'] == 'Payables') {
                                                                    $s_order_array = $this->db->get_where('sales_order', array('so_code' => $ccat['so_code'], 'customer_id' => $ccat['customer_id']))->result_array();

                                                                    

                                                                    //find total amount for the items picked
                                                                    $cash_amount = 0;
                                                                    
                                                                    foreach($s_order_array as $sq) {
                                                                        $cash_amount += $sq['price'] * $sq['quantity_picked'];
                                                                    }

                                                                    //Finding out if the amount paid is less or greater than the amount for the picked items
                                                                    if($sq['amount_paid'] > $cash_amount || $sq['amount_paid'] == $cash_amount) {
                                                                        //then we really have some cash sales in this transaction
                                                                        //we need to subtract the cash sales from the total cash received
                                                                        $ccat['amount'] = $ccat['amount'] - $cash_amount; //this is the actual payable

                                                                        //let's prepare the cash sales details and then let it reflect in the cash sales column
                                                                        $account_id_p = $this->db->get_where('payment', array('so_code' => $ccat['so_code']))->row()->account_id;
                                                                        $track_code = $this->db->get_where('sales_order', array('so_code' => $ccat['so_code']))->row()->track_code;
                                                                        $p_id = $this->db->get_where('payment', array('so_code' => $ccat['so_code'], 'track_code' => $track_code))->row()->payment_id;

                                                                        $so_code_data[$index_counter] = $ccat['so_code'];
                                                                        $amount_data[$index_counter] = $cash_amount;
                                                                        $account_data[$index_counter] = $account_id_p;
                                                                        $payment_ids[$index_counter] = $p_id;


                                                                        $index_counter++; //index increment
                                                                    }

                                                                } //end of adjustment for payable
                                                                
                                                                
                                                                $payment_ids2[$payment_id_counter] = $ccat['payment_id'];
                                                                $payment_id_counter++;

                                                                if($ccat['amount'] != 0):
                                                                ?>

                                                                <tr>
                                                                    <td><?=$ccat['date']; ?></td>
                                                                    <td><?=$cs_customer_name; ?></td>
                                                                    <td><?=$ccat['so_code']; ?></td>
                                                                    <td><?=$ccat['invoice_code']; ?></td>
                                                                    <td><?=$cs_cashier; ?></td>
                                                                    <td style="text-align: right"><?=number_format($ccat['amount'], 2, '.', ','); ?></td>
                                                                    <td></td>
                                                                    <td></td>

                                                                </tr>
                                                            <?php 
                                                        else:
                                                            ?>
                                                            <script type="text/javascript">
                                                                $(function() {
                                                                    $('.account_<?=$account['account_id'].$counter; ?>').remove();
                                                                })
                                                            </script>
                                                            <?php
                                                        endif;

                                                            $cs_counter += $ccat['amount']; //increment  

                                                            //end of each mode of payment

                                                            endforeach;

                                                        } else {
                                                            //no record found
                                                            /*echo '<tr>
                                                                    <th style="text-align: center;" class="text-danger" colspan="8">No Record Found!</th>
                                                                  </tr>';*/
                                                            ?>
                                                            <script type="text/javascript">
                                                                $(function() {
                                                                    $('.account_<?=$account['account_id'].$counter; ?>').remove();
                                                                })
                                                            </script>
                                                            <?php
                                                        } //end of the normal ones


                                                        //compare accounts
                                                        //if this is cash sales category, let's try and see if we can print the data we took from the payables category

                                                        if($category['category'] == 'Cash Sales') {//for the category



                                                            for($a = 0; $a < count($account_data); $a++) { //for the mode of payment (accounts)
                                                              // echo 'something '.$account_data[0].'=='.$account['account_id'];

                                                            $cash_sales_has_this_account = $this->db->get_where('payment', array('account_id' => $account_data[$a], 'payment_id' => $ccat['payment_id'], 'category' => 'Cash Sales'))->num_rows();

                                                            $customer_id_p = $this->db->get_where('payment', array('so_code' => $so_code_data[$a], 'account_id' => $account_data[$a], 'payment_id' => $payment_ids[$a]))->row()->customer_id;

                                                            
                                                            if($account_data[$a] == $account['account_id'] && $cash_sales_has_this_account > 0) {

                                                                    for($j = 0; $j < count($so_code_data); $j++) { //for the so codes

                                                                         $invoice_code_p = $this->db->get_where('payment', array('so_code' => $so_code_data[$j], 'account_id' => $account_data[$a], 'payment_id' => $payment_ids[$j]))->row()->invoice_code;

                                                                         $payment_mode = $this->db->get_where('payment', array('so_code' => $so_code_data[$j], 'account_id' => $account_data[$a], 'payment_id' => $payment_ids[$j]))->row()->account_id;

                                                                         $customer_id_p = $this->db->get_where('payment', array('so_code' => $so_code_data[$j], 'account_id' => $account_data[$a], 'payment_id' => $payment_ids[$j]))->row()->customer_id;
                                                                         $customer_name_p = $this->db->get_where('customers', array('customer_id' => $customer_id_p))->row()->customer_name;

                                                                        // if($customer_id_p != ''): //major filter here
                                                                        
                                                                        ?>

                                                                        <tr>
                                                                            <td><?=$ccat['date']; ?></td>
                                                                            <td><?=$customer_name_p; ?></td>
                                                                            <td><?=$so_code_data[$j] ?></td>
                                                                            <td><?=$invoice_code_p; ?></td>
                                                                            <td><?=$cs_cashier; ?></td>
                                                                            <td style="text-align: right"><?=number_format($amount_data[$j], 2, '.', ','); ?></td>
                                                                            <td></td>
                                                                            <td></td>

                                                                        </tr>
                                                    
                                                                        <?php

                                                                        array_push($found_account_ids, $account_data[$a]);//push all the found accounts ids here

                                                                        $cs_counter += $amount_data[$j];

                                                                        $diff = count($account_data) - count($found_account_ids);

                                                                   // endif;
                                                                    }

                                                                } else {                                                                       

                                                                        
                                                                    $not_found = 'Ok';


                                                                }

                                                            }
                                                            
                                                        } 

                                                   //end of this tiresome adjustment
                                                        
                                                        

                                                    ?>
                                                    <tr class="account_<?=$account['account_id'].$counter; ?>">
                                                        <td></td>
                                                        <td></td>
                                                        <td></td>
                                                        <td></td>
                                                        <td></td>
                                                        <td></td>
                                                        <td align="right" style="border-top: 1px solid #000;"><?=number_format($cs_counter, 2, '.', ','); ?></td>
                                                    </tr>
                                                    <?php

                                                    

                                                    $grand_total += ($cs_counter);
                                                    $cs_counter = 0;

                                                    
                                                    $counter++;
                                                    //end of EACH ACCOUNT OR MODE OF PAYMENT
                                                 endforeach; 

                                                 //transfer of the 'else' statement from the cash sales derived from the payables sales
                                                    if($not_found == 'Ok') {

                                                        for($al = 0; $al < count($account_data); $al++) {//all acounts ids

                                                                            
                                                            for($f = 0; $f < count($found_account_ids); $f++) {//found accounts ids

                                                                if($account_data[$al] != $found_account_ids[$f]) {
                                                                    $ms_counter++;
                                                                } else {
                                                                    $ms_counter--;
                                                                }
                                                            }

                                                            //
                                                             
                                                            if($ms_counter == count($found_account_ids)) {
                                                                array_push($not_found_account_ids, $account_data[$al]); //getting the ids of all the other mode of payment which are not already part of the Cash Sales
                                                            }

                                                            $ms_counter = 0;//reset
                                                        }//loop ends

                                                        

                                                        //new account or mode of payment details here
                                                        //this mode of payment was not found with cash sales
                                                        

                                                        for($a = 0; $a < $diff; $a++) { //for the mode of payment (accounts)
                                                            
                                                            $payables_has_this_account = $this->db->get_where('payment', array('account_id' => $not_found_account_ids[$a], 'payment_id' => $payment_ids[$a], 'category' => 'Payables'))->num_rows();

                                                            $customer_id_p = $this->db->get_where('payment', array('so_code' => $so_code_data[$a], 'account_id' => $not_found_account_ids[$a], 'payment_id' => $payment_ids[$a]))->row()->customer_id;

                                                            $account_name_p = $this->db->get_where('accounts', array('account_id' => $not_found_account_ids[$a]))->row()->name;

                                                            switch($account_name_p) {
                                                                case 'Cash':
                                                                    $color = '#229954';
                                                                    break;
                                                                case 'Momo':
                                                                    $color = '#2E86C1';
                                                                    break;
                                                                case 'Cheque':
                                                                    $color = '#000000';
                                                                    break;
                                                                default:
                                                                    $color = '#515A5A';
                                                                
                                                            }


                                                            if($payables_has_this_account > 0) {

                                                                echo '<tr style="border-buttom: 1px solid #000; background-color: '.$color.'; color: #fff;" class="account_'.$not_found_account_ids[$a].'">

                                                                        <td style="text-align: left; padding: 2px"><br>'.strtoupper($account_name_p).'</td>
                                                                      </tr>'; //shows the account name e.g MOMO, which is the mode of payment

                                                                    for($j = 0; $j < count($so_code_data); $j++) { //for the so codes

                                                                     $invoice_code_p = $this->db->get_where('payment', array('so_code' => $so_code_data[$j], 'account_id' => $not_found_account_ids[$a], 'payment_id' => $payment_ids[$j]))->row()->invoice_code;

                                                                     $payment_mode = $this->db->get_where('payment', array('so_code' => $so_code_data[$j], 'account_id' => $not_found_account_ids[$a], 'payment_id' => $payment_ids[$j]))->row()->account_id;

                                                                     $customer_id_p = $this->db->get_where('payment', array('so_code' => $so_code_data[$j], 'account_id' => $not_found_account_ids[$a], 'payment_id' => $payment_ids[$j]))->row()->customer_id;
                                                                     $customer_name_p = $this->db->get_where('customers', array('customer_id' => $customer_id_p))->row()->customer_name;

                                                                     if($customer_id_p != ''): //major filter here
                                                                    
                                                                    ?>

                                                                    <tr>
                                                                        <td><?=$ccat['date']; ?></td>
                                                                        <td><?=$customer_name_p; ?></td>
                                                                        <td><?=$so_code_data[$j] ?></td>
                                                                        <td><?=$invoice_code_p; ?></td>
                                                                        <td><?=$cs_cashier; ?></td>
                                                                        <td style="text-align: right"><?=number_format($amount_data[$j], 2, '.', ','); ?></td>
                                                                        <td></td>
                                                                        <td></td>

                                                                    </tr>
                                                
                                                                    <?php
                                                                    $cs_counter2 += $amount_data[$j];

                                                                endif;


                                                                }
                                                            
                                                                ?>
                                                                    <tr class="account_<?=$account_data[$a]; ?>">
                                                                        <td></td>
                                                                        <td></td>
                                                                        <td></td>
                                                                        <td></td>
                                                                        <td></td>
                                                                        <td></td>
                                                                        <td align="right" style="border-top: 1px solid #000;"><?=number_format($cs_counter2, 2, '.', ','); ?></td>
                                                                    </tr>
                                                                <?php 
                                                            }
                                                            
                                                        }

                                                    } //end of the transferred 'else' statement

                                                 //end of all the categories
                                             endforeach; ?>
                                                 <tr style="border-top: 1px solid #000; border-style: double none">
                                                    <td></td>
                                                    <td></td>
                                                    <td></td>
                                                    <td></td>
                                                    <td></td>
                                                    <td></td>
                                                    <td></td>
                                                    <td align="right"><strong><?=number_format($grand_total + $cs_counter2, 2, '.', ','); ?></strong></td>
                                                    <td></td>
                                                 </tr>

                                             <?php
                                                else:
                                                    //no record found
                                                    echo '<tr>
                                                            <th style="text-align: center;" class="text-danger" colspan="8">No Data Found!</th>
                                                          </tr>';
                                                endif;
                                             ?>
                                        </tbody>
                                    </table>

                                </div>
                                <footer class="footer">
                                    <div style="width: 100%; height: 30px; margin-bottom: 20px; padding: 5px; text-align: right"><smal style="color:#716f6f; text-shadow: 1px 1px 0px #bfbdbd; position: relative; top: 5px;"><i>Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></smal></smal></div>
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
        mywindow.document.write('<!doctype html><html><head><title>CASH RECEIVED REPORT</title>');
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

