
<!doctype html>
<html>
    <head>
        <title><?=$page_title ?? 'Accounts Receivable Report'; ?></title>
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
                <a href="javascript:void(0);" onClick="print_page()">Print Accounts Receivable</a>
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
                                                        <td align="right" colspan="2"><h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">ACCOUNTS RECEIVABLE REPORT</h3></td>
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
                                    <table class="table table-bordered table-striped" id="invoice_table" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                                        <thead style="background-color: #4242ad; padding: 30px;">
                                            <tr style="height: 30px;">
                                                <th style="text-align: left">Debtors</th>
                                                <th style="text-align: right">Amount (<?=$currency; ?>)</th>
                                                <th style="text-align: left"></th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php

                                                $total_receivable = 0;

                                              /*  //customers side
                                                    $this->db->select('customer_id');
                                                    $this->db->distinct();
                                                    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                                    $this->db->where('amount_due >', 0);
                                                    $receivable_array = $this->db->get('invoice')->result_array();*/

                                                
                                                //suppliers side
                                                    $this->db->select('supplier_id');
                                                    $this->db->distinct();
                                                    $this->db->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"');
                                                    $this->db->where('amount_due <', 0);
                                                    $receivable_array_s = $this->db->get('accounts_payable')->result_array();


                                            //for customers
                                            //get owings from the sales table
                                            //customers who still have not paid all their debts
                                            $this->db->select('customer_id');
                                            $this->db->distinct();
                                            $from_ts = is_numeric($from) ? $from : strtotime($from);
                                            $to_ts = is_numeric($to) ? $to : strtotime($to);
                                            $this->db->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"');
                                            $this->db->where('amount_due >', 0);
                                            $debtor_customer_id_query = $this->db->get('invoice');

                                            $debtor_customer_ids = [];
                                            if ($debtor_customer_id_query->num_rows() > 0) {
                                              $debtor_customer_id_array = $debtor_customer_id_query->result_array();
                                              $debtor_customer_ids = !empty($debtor_customer_id_array) ? array_column($debtor_customer_id_array, 'customer_id') : [];
                                            }

                                            // Batch load all invoice data for debtor customers
                                            $balance_data = [];
                                            $balance_map = [];
                                            $all_customers = [];
                                            $customers_map = [];
                                            
                                            if(!empty($debtor_customer_ids)) {
                                                $this->db->select('customer_id, SUM(amount_due) as total_due');
                                                $this->db->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"');
                                                $this->db->where_in('customer_id', $debtor_customer_ids);
                                                $this->db->where('amount_due >', 0);
                                                $this->db->group_by('customer_id');
                                                $balance_data = $this->db->get('invoice')->result_array();
                                                $balance_map = !empty($balance_data) ? array_column($balance_data, 'total_due', 'customer_id') : [];
                                                
                                                // Batch load all customer names
                                                $all_customers = $this->db->where_in('customer_id', $debtor_customer_ids)->get('customers')->result_array();
                                                $customers_map = !empty($all_customers) ? array_column($all_customers, 'customer_name', 'customer_id') : [];
                                            }
                                            
                                            //for those customers who have not finished payment
                                            for ($di = 0; $di < count($debtor_customer_ids); $di++) {
                                                $balance_owe = $balance_map[$debtor_customer_ids[$di]] ?? 0;

                                                /*foreach ($balance_owe_array as $bal) {

                                                    //let's check for the very latest date in the prices table
                                                    //latest from date
                                                    $dt = 1;

                                                    $week_starts_from = date('d-m-Y', strtotime('this week '. $opening_day));
                                                    $week_ends_on = date('d-m-Y');

                                                    
                                                    for($dr = 0; $dr < 8; $dr++) {

                                                      $ditem_num = 'item'.$dt.'_price';

                                                      $this->db->where('customer_id', $debtor_customer_ids[$di]);
                                                      $this->db->where($ditem_num.' IS NOT NULL');
                                                      $this->db->where('from <=', strtotime($from));
                                                      $this->db->where('to >=', strtotime($to));
                                                      $this->db->where('customer_status', 1);
                                                      $ditem_price = $this->db->get('prices')->row()->$ditem_num;

                                                      if($ditem_price == null || $ditem_price == '') {

                                                        $debtor_latest_from = $this->db
                                                                              ->select_max('from')
                                                                              ->where($ditem_num.' IS NOT NULL')
                                                                              ->where('customer_id', $debtor_customer_ids[$di])
                                                                              ->get('prices')->row()->from;

                                                        if($debtor_latest_from == null) {
                                                          $debtor_latest_from = strtotime($week_starts_from);
                                                        }


                                                        //latest to date
                                                        $debtor_latest_to = $this->db
                                                                                ->select_max('to')
                                                                                ->where($ditem_num.' IS NOT NULL')
                                                                                ->where('customer_id', $debtor_customer_ids[$di])
                                                                                ->get('prices')->row()->to;

                                                        if($debtor_latest_to == null) {
                                                          $debtor_latest_to = strtotime($week_ends_on);
                                                        }

                                                        $this->db->where('customer_id', $debtor_customer_ids[$di]);
                                                        $this->db->where($ditem_num.' IS NOT NULL');
                                                        $this->db->where('from <=', $debtor_latest_from);
                                                        $this->db->where('to >=', $debtor_latest_to);
                                                        $this->db->where('customer_status', 1);
                                                        $ditem_price = $this->db->get('prices')->row()->$ditem_num;
                                                      }

                                                      //compare the current item id with the one in the prices table
                                                     // echo substr($item_price, 0, strlen($owe['item_id']));
                                                      if($bal['item_id'] == substr($ditem_price, 0, strlen($bal['item_id']))) {
                                                        $dprice = substr($ditem_price, strlen($bal['item_id']) + 1); //price

                                                        break; //break the for loop here
                                                      } else {

                                                        $dt++; //increment $dt by 1 and continue the loop
                                                      }
                                                    }
                                                    //incase price is not set for a particular item for this customer
                                                    if($ditem_price == null) {
                                                      $dprice = 0;
                                                    }



                                                
                                            
                                            } //end of customers who are still owing us
                                            */

                                            $receivable_sub_total = ($receivable_sub_total ?? 0) + $balance_owe;
                                                $customer_name = $customers_map[$debtor_customer_ids[$di] ?? 0] ?? 'Unknown';

                                                ?>
                                            <tr style="border-bottom: 1px solid #000">
                                                <td><?=strtoupper($customer_name); ?></td>
                                                <td align="right"><?=number_format($receivable_sub_total, 2, '.', ','); ?></td>
                                                <td></td>
                                            </tr>

                                            <?php
                                            $total_receivable += $receivable_sub_total;
                                            


                                            $receivable_sub_total = 0;

                                        } //end of customers

                                          //for other outanding debts like loan, TNT etc
                                            $this->db->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"');
                                            $debt_query = $this->db->get_where('outstanding_debts', array('amount_due <' => 0));
                                            if($debt_query->num_rows() > 0) {
                                                $debt_array = $debt_query->result_array();

                                                foreach($debt_array as $debt):
                                                    $debt_name = $debt['name'] ?? 'Unknown';
                                                    $debt_amount = $debt['amount_due'] ?? 0;
                                                  ?>
                                                    <tr style="border-bottom: 1px solid #000">
                                                        <td><?=strtoupper($debt_name); ?></td>
                                                        <td align="right"><?=number_format($debt_amount, 2, '.', ','); ?></td>
                                                        <td></td>
                                                    </tr>
                                                <?php
                                                    $total_receivable += $debt_amount;

                                                endforeach;
                                            }


                                         //for suppliers who we have overpaid
                                            // Batch load supplier amounts
                                            $supplier_ids = !empty($receivable_array_s) ? array_column($receivable_array_s, 'supplier_id') : [];
                                            $supplier_amounts_map = [];
                                            $suppliers_map = [];
                                            
                                            if(!empty($supplier_ids)) {
                                                $this->db->select('supplier_id, SUM(amount_due) as total_due');
                                                $this->db->where('amount_due <', 0);
                                                $this->db->where('timestamp BETWEEN "'. $from_ts .'" AND "'. $to_ts . '"');
                                                $this->db->where_in('supplier_id', $supplier_ids);
                                                $this->db->group_by('supplier_id');
                                                $supplier_amounts = $this->db->get('accounts_payable')->result_array();
                                                $supplier_amounts_map = !empty($supplier_amounts) ? array_column($supplier_amounts, 'total_due', 'supplier_id') : [];
                                                
                                                // Batch load supplier names
                                                $all_suppliers = $this->db->where_in('supplier_id', $supplier_ids)->get('suppliers')->result_array();
                                                $suppliers_map = !empty($all_suppliers) ? array_column($all_suppliers, 'supplier_name', 'supplier_id') : [];
                                            }
                                            
                                            foreach($receivable_array_s as $supplier):
                                                $receivable_sub_total_s = abs($supplier_amounts_map[$supplier['supplier_id'] ?? 0] ?? 0);
                                                $supplier_name = $suppliers_map[$supplier['supplier_id'] ?? 0] ?? 'Unknown';
                                            ?>
                                            <tr style="border-bottom: 1px solid #000">
                                                <td><?=strtoupper($supplier_name); ?></td>
                                                <td align="right"><?=number_format($receivable_sub_total_s, 2, '.', ','); ?></td>
                                                <td></td>
                                            </tr>

                                            <?php
                                            $total_receivable += $receivable_sub_total_s;

                                         endforeach; ?>
                                         <tr>
                                             <td align="left" colspan="2"><strong>Total</strong></td>
                                             <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong><?=numfmt_format_currency($fmt, $total_receivable, $currency); ?></strong></td>
                                         </tr>
                                            
                                        </tbody>
                                    </table>
                                </div>
                                <footer class="footer" style="position: fixed; bottom: -35px">
                                    <div>
                                        <div>
                                         <!--   <table class="table table-bordered table-striped" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                                                <thead>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Grand Total: </th>
                                                        <th style="text-align: right;"><?=numfmt_format_currency($fmt, $grand_total, $currency); ?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Amount Paid: </th>
                                                        <th style="text-align: right;"><?=numfmt_format_currency($fmt, $this->db->get_where('payment_with_goods', array('so_code' => $so_code))->row()->amount_paid, $currency); ?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Balance Due: </th>
                                                        <th style="text-align: right;" width="160"><?=numfmt_format_currency($fmt, $this->db->get_where('payment_with_goods', array('so_code' => $so_code))->row()->amount_due, $currency); ?></th>
                                                    </tr>
                                                    <tr>
                                                        <th colspan="7" style="text-align: left; height: 20px;">
                                                            <h4>Please contact us for more information about our payment options.</h4>
                                                        </th>
                                                    </tr>
                                                    <tr>
                                                        <th colspan="7" style="text-align: left; height: 20px;">
                                                            <h4>Thank you for doing business with us.</h4>
                                                        </th>
                                                    </tr>
                                                </thead>
                                            </table> -->
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
        mywindow.document.write('<!doctype html><html><head><title>ACCOUNTS RECEIVABLE REPORT</title>');
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

