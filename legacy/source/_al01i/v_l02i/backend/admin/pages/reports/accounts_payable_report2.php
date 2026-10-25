
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
<a href="javascript:void(0);" onClick="print_page()">Print Accounts Payable</a>
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
                                //customers side
                                if($from != 0 && $to != 0) {
                                    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                }

                                if($customer_id != 0) {
                                    $this->db->where('customer_id', $customer_id);
                                }
                                
                                $this->db->where('amount_due <', 0);
                                $payable_array = $this->db->get('invoice')->result_array();


                            //for customers with negative balance
                            foreach($payable_array as $customer):
                                $payable_sub_total = 0;

                                $payable_sub_total = abs($customer['amount_due']);//$customer['price'] * ($customer['amount_due'] / $customer['price']);
                                $customer_name = $this->db->get_where('customers', array('customer_id' => $customer['customer_id']))->row()->customer_name;
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
                                  

                                  ?>
                                    <tr style="border-bottom: 1px solid #000;">
                                        
                                        <td><?=strtoupper($debt['name']); ?></td>
                                        <td></td>
                                        <td align="right"><strong><?=number_format($debt['amount_due'], 2, '.', ','); ?></strong></td>
                                        
                                    </tr>
                                <?php
                                    $total_payable += $debt['amount_due'];

                                endforeach;
                            }
                        endif;

                            ///////////////////////////
                        if($category != 'de'):    
                            //customers who still have some goods with us, yet have paid for all
                            $this->db->select('customer_id');
                            $this->db->distinct();
                            $this->db->where('amount_paid >', '0');
                            $this->db->where('quantity_due >', '0');

                            if($from != 0 && $to != 0) {
                                $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                            }

                            if($customer_id != 0) {
                                $this->db->where('customer_id', $customer_id);
                            }
                            $this->db->where_in('type_of_sales', ['Payables', 'Receivables']);
                            //$this->db->or_where('type_of_sales', 'Receivables');
                            
                            $customer_id_query = $this->db->get('sales_order');

                            if ($customer_id_query->num_rows() > 0) {
                                $customer_id_array = $customer_id_query->result_array();

                                $customer_ids = array();

                                $customer_ids = array_column($customer_id_array, 'customer_id');

                                /*foreach ($customer_id_array as $id) {
                                    array_push($customer_ids, $id['customer_id']);
                                }*/
                            }

                        //for those customers who have not taken all their products
                        $grand_total_due = 0;

                        for ($i = 0; $i < count($customer_ids); $i++) {

                            $payable_sub_total = 0;
                            
                            //////////////////////////////////////////////////////////////////////
                            /////////Check if this customer has any good left///////////////////
                            ////////////////////////////////////////////////////////////

                                
                                $customer_name = $this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->customer_name;
                             ?>
                                <tr style="border-bottom: 1px solid #000;" id="customer_id_<?=$customer_ids[$i];?>">
                                    <td><?=strtoupper($customer_name); ?></td>

                                    <td align="right">
                                    <?php
                                    //show in terms of goods
                                    $this->db->select('so_code');
                                    $this->db->distinct();
                                    $this->db->where('amount_paid >', '0');
                                    $this->db->where('quantity_due >', '0');
                                    if($from != 0 && $to != 0) {
                                        $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                    }
                                    $this->db->where('customer_id', $customer_ids[$i]);
                                    
                                    $this->db->where_in('type_of_sales', ['Payables', 'Receivables']);
                                    //$this->db->or_where('type_of_sales', 'Receivables');
                                    
                                    $so_code_array = $this->db->get('sales_order')->result_array();


                                    $actual_payable_to_customer = 0;                                        
                                    
                                    foreach($so_code_array as $code) {

                                        
                                        $this->db->select('*');
                                        $this->db->where('amount_paid >', '0');
                                        $this->db->where('quantity_due >', '0');
                                        $this->db->where('so_code', $code['so_code']);
                                        if($from != 0 && $to != 0) {
                                            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                        }

                                        $this->db->where('customer_id', $customer_ids[$i]);

                                        $this->db->where_in('type_of_sales', ['Payables', 'Receivables']);
                                        //$this->db->or_where('type_of_sales', 'Receivables');
                                        
                                        $orders_array = $this->db->get('sales_order')->result_array();
                                        
                                        /*each so_code data*/
                                        $payable_to_so_code = 0;
                                        $actual_payable_to_so_code = 0;
                                        $amount_due_to_so_code = 0;
                                        $discount_to_so_code = 0;
                                        foreach($orders_array as $order) {

                                            $payable_to_so_code += ($order['price'] * $order['quantity_due']);
                                            $amount_due_to_so_code = $order['amount_due'];


                                            if($order['quantity_due '] > 0 ) {



                                            }
                                        }

                                        /*check if we truly owe this customer with this so_code*/
                                        if($payable_to_so_code > $amount_due_to_so_code) {

                                            /*We truly owe him/her*/
                                            if($amount_due_to_so_code < 0) {
                                                $actual_payable_to_customer += $payable_to_so_code;

                                                $actual_payable_to_so_code = $payable_to_so_code;

                                            } else {

                                                $actual_payable_to_customer += ($payable_to_so_code - $amount_due_to_so_code);

                                                $actual_payable_to_so_code = $payable_to_so_code - $amount_due_to_so_code;
                                            }

                                            $discount_to_so_code = $this->db->get_where('sales_order', ['discount >' => '0', 'so_code' => $code['so_code']])->row()->discount;

                                            if($actual_payable_to_so_code < $discount_to_so_code) {

                                                continue; /*move on to the next so code*/

                                            }
 

                                            $actual_payable_to_so_code = $actual_payable_to_so_code - $discount_to_so_code; /*less discount if any*/
                                            
                                            $actual_payable_to_customer = $actual_payable_to_customer - $discount_to_so_code; /*less discount if any*/

 
                                            echo '<div>'.$code['so_code'].' ['.number_format($actual_payable_to_so_code, 2, '.', ',').']</div><br>';
                                        }
                                    } /*end of each so_code*/
                                    
                                    $payable_sub_total = $actual_payable_to_customer;
                                    
                                    
                                    ?> 
                                    </td>

                                    <td align="right">
                                        <strong><?=number_format($payable_sub_total, 2, '.', ','); ?></strong>
                                    </td>
                                </tr>
                            <?php

                              $total_payable += $payable_sub_total;
                        } //end for loop

                    endif;
                ?>
                         <tr style="border-bottom: 1px solid #000;">
                             <td align="left" style="font-size: 17px"><strong>Total</strong></td>
                             <td align="right" style="border-top: 1px solid #000; border-style: double none;"></td>
                             <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong style="font-size: 17px"><?=numfmt_format_currency($fmt, $total_payable, $currency); ?></strong></td>
                         </tr>
                            
                        </tbody>
                    </table>
                </div>
                <footer class="footer" style="position: fixed; bottom: -35px">
                    <div>
                        <div></div>
                    </div>
                    <div style="width: 100%; height: 30px; margin-bottom: 20px; padding: 5px; text-align: left"><small style="color:#1d1c1c; text-shadow: 1px 1px 0px #504949; position: relative; top: 5px;"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></small></div>
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

