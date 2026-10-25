<!doctype html>
<html>
	<head>
		<title>Payment Receipt</title>
        <style type="text/css">
                #main_receipt{
                    border-bottom: 1px solid #000;
                }


             @media Print{

                page {
                background: #ffffff;
                display: block;
                margin: 0 auto;
                margin-bottom: 0.5cm;
                box-shadow: 0;

                }

                page[size="A5"] {
                    width: 80mm;
                }

               /* #invoice_table, #hr_line, #top_row, .footer {
                    width: 130% !important;
                }
                */

               

              #top_row {
                width: 50% !important;
              }

                body, page {
                    margin: 0;
                    box-shadow: 0;
                }

                table {
                    width: 100%; 
                    border-collapse: collapse; 
                    padding: 5px 0px;"
                }

            }

        </style>
	</head>
	<body>
		<?php
			//currency
        	$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
        	$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		    $system_name = $this->db->get_where('settings', array('type' => 'system_name'))->row()->description;
            $system_phone = $this->db->get_where('settings', array('type' => 'phone'))->row()->description;
            $system_mail = $this->db->get_where('settings', array('type' => 'system_email'))->row()->description;
            $system_slogan = $this->db->get_where('settings', array('type' => 'system_title'))->row()->description;
            $address            =   $this->db->get_where('settings' , array('type'=>'address'))->row()->description;

            ///$cashier = $this->db->get_where($this->session->userdata('login_type'), array($this->session->userdata('login_type').'_id' => $this->session->userdata('login_user_id')))->row()->name;


            $customer_name = $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name;

            


            //get total for this invoice code
           /* $this->db->where('invoice_code', $invoice_code);
            $this->db->where('customer_id', $customer_id);
            $this->db->where('payment_id', $payment_id);
            $this->db->where('receipt_code', $receipt_code);*/

            

            $this->db->select_sum('amount');
            $this->db->where('customer_id', $customer_id);
            //$this->db->where('payment_id', $payment_id);
            $this->db->where('receipt_code', $receipt_code);
            $total_amount_paid = $this->db->get('payment')->row()->amount;

            //$this->db->where('invoice_code', $invoice_code);
            $this->db->where('customer_id', $customer_id);
            //$this->db->where('payment_id', $payment_id);
            $this->db->where('receipt_code', $receipt_code);
            $amounts_transactions_q = $this->db->get('payment');


            $amount_tendered = $amounts_transactions_q->row()->amount_tendered;
            $change = $amounts_transactions_q->row()->change_due;

           $this->db->select_sum('amount_due');
            $this->db->where('customer_id', $customer_id);
           // $this->db->where('payment_id', $payment_id);
            //$this->db->where('amount_due >', 0);

            $due_balance = $this->db->get('invoice')->row()->amount_due;

            if($due_balance == 0) {
                $balance_msg = 'full payment';
            }elseif($due_balance > 0) {
                $balance_msg = 'part payment';
            }elseif($due_balance < 0) {
                $balance_msg = 'over payment';
            }


            $payment_so_codes = array();
            $payment_invoice_codes = array();


                foreach($amounts_transactions_q->result_array() as $ps) {
                    array_push($payment_so_codes, $ps['so_code']);
                    array_push($payment_invoice_codes, $ps['invoice_code']);
                }





            //who issued the receipt
                $payment_row_query = $this->db->get_where('payment', array('receipt_code' => $receipt_code, 'customer_id' => $customer_id));
            $issuer_id = $payment_row_query->row()->issuer_id;
            $accounts_used_array = $this->db->get_where('accounts_used', ['receipt_code' => $receipt_code])->result_array();

            $issuer_name = $this->db->get_where('admin', array('admin_id' => $issuer_id))->row()->name;
           // echo $receipt_code. '|'.$invoice_code.'|'.$customer_id.'|'.$payment_id.'|'.$date_time;


        ?>
        
        <center>
        <page size="A5" id="r_print">
        <div id="main_receipt">
            <center> 
                <div class="container">
                    <table id="top_row" style="width:98%; border-collapse:collapse;">
                        <thead>
                        </thead>
                        <tbody>
                            <tr style="border-top: 4px solid #1b1b69; margin-top: -60px;"><td colspan="2"></td></tr>
                            <tr>
                                <td align="right" width="50%">
                                   <img class="" id="logo_row" src="<?php echo base_url(); ?>uploads/school_logo.png" style="max-height : 60px; margin-top: -75px; padding: 0px 30px"> 
                                </td>
                                <td align="left">
                                    <pre>
                                        <h4 style="font-family: Nunito; color: #000; margin-top: -10px;" id="address_row" align='left'><?php echo trim($address);?></h4>
                                    </pre>
                                </td> 
                            </tr>
                        </tbody>
                    </table>

                    <!--receipt details-->
                    <table style="width:98%; border-collapse:collapse; margin-top: -20px;">
                        <thead></thead>
                        <tbody>
                            <tr>
                                <td align="center" colspan="2"><h3 id="official" style="font-weight: bold; font-size: 20px; letter-spacing: 2px; background-color: #000; width: 260px; padding: 6px; border-radius: 9px; color: #fff; font-size: 23px; margin-top: -20px">OFFICIAL RECEIPT</h3>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </center>

            <center>
                <!--receipt details-->
                <table style="width:98%; border-collapse:collapse; margin-top: -20px;">
                    <thead></thead>
                    <tbody>
                        <tr style="border-bottom: 1px solid #000">
                            <th style="text-align: left"><strong style="font-size: 17px; margin-top: -40px; color: #000;">Received From:</strong></th>
                            <th style="text-align: right"><strong style="font-size: 17px; margin-top: -40px; color: #000;"><?= ucwords(strtolower($customer_name)); ?></strong></th>
                        </tr>
                        <tr>
                            <th style="text-align: left">Paid On:</th>
                            <th style="text-align: right"><?= date('d/m/Y H:i:s', $date_time); ?></th>
                        </tr>
                        <tr>
                            <th style="text-align: left">Receipt No.:</th>
                            <th style="text-align: right"><?= $receipt_code; ?></th>
                        </tr>
                        <tr>
                            <th style="text-align: left">Order No.:</th>
                            <th style="text-align: right"><?=implode(', ', $payment_so_codes); ?></th>
                        </tr> 
                        <tr>
                            <th style="text-align: left">Invoice No.:</th>
                            <th style="text-align: right"><?=implode(', ', $payment_invoice_codes); ?></th>
                        </tr> 
                        <tr>
                            <th style="text-align: left">Currency:</th>
                            <th style="text-align: right"><?= $currency; ?></th>
                        </tr>
                        <tr>
                          <th style="text-align: left">Issued On:</th>
                          <th style="text-align: right"><?= date('d/m/Y H:i:s') ?></th>
                        </tr>
                    </tbody>
                </table> <!--//end of receipt details-->
            </center>


            <center>
            <table style="width:98%; border-collapse:collapse; margin-top: 10px;">
                <thead>
                   <tr style="border-bottom: 1px solid #000">
                       <th style="text-align:left">S/N</th>
                       <th style="text-align:left">Item</th>
                       <th style="text-align:left">SO-Code</th>
                       <th style="text-align:right">Qty</th>
                       <th style="text-align:right">Picked</th>
                       <th style="text-align:right">Amount</th>
                   </tr>
                </thead>

                <tbody>
                    <?php 
                        $i = 1;
                        $order_g_total = 0;
                        for($s = 0; $s < count($payment_so_codes); $s++) {
                            $this->db->where('so_code', $payment_so_codes[$s]);
                            $this->db->where('customer_id', $customer_id);
                            $sales_order_array = $this->db->get('sales_order')->result_array();

                        
                            foreach($sales_order_array as $order):

                                $item_name = $this->db->get_where('items', array('item_id' => $order['item_id']))->row()->item_name;
                                $current_payment = $this->db->get_where('payment', array('so_code' => $order['so_code'], 'receipt_code' => $receipt_code))->row()->amount;
                                $actual_owing = $order['amount_due'] + $current_payment;

                                $total_amount = $order['quantity'] * $order['price'];
                                ?>
                                <tr>
                                    <td><?=$i; ?></td>
                                    <td><?=$item_name; ?></td>
                                    <td><?=$order['so_code']; ?></td>
                                    <td align="right"><strong><?=number_format($order['quantity'], 0, '.', ','); ?></strong></td>
                                    <td align="right"><strong><?=number_format($order['quantity_picked'], 0, '.', ','); ?></strong></td>
                                    <td align="right"><strong><?=number_format($total_amount, 2, '.', ','); ?></strong></td>
                                </tr>
                                <?php

                                $i++;

                                $order_g_total += $total_amount;
                                
                            endforeach;

                            //$order_g_total += $actual_owing;
                        }

                        //totalling here
                    ?>
                    <tr style="border-top: 1px solid #000;">
                        <td align="right" colspan="5">Total</td>
                        <td align="right"><strong><?=number_format($order_g_total, 2, '.', ','); ?></strong></td>
                    </tr>
                    <div style="position: absolute; margin-top: 80px; margin-left: 60px;" class="p-3 ring-2 ring-grey-500">
                    <h4>Payment Methods:</h4>

                    <?php
                        foreach ($accounts_used_array as $acc) {

                            $accountName = $this->crud_model->getAccountNameById($acc['account_id']);
                            $accountAmount = $acc['account_amount'];

                            ?>
                            <div class="grid grid-cols-2 gap-2 print:grid print:grid-cols-2 print:gap-2 print:text-right text-right text-muted">
                                <div><?=$accountName;?></div>
                                <div><?=number_format($accountAmount, 2, '.', ',');?></div>
                            </div>
                            <?php
                            
                        }
                    ?>
                    </div>
                    <tr>
                        <td align="right" colspan="5">Amount Tendered</td>
                        <td align="right"><strong><?=number_format($amount_tendered, 2, '.', ','); ?></strong></td>
                    </tr>


                    <tr>
                        <td align="right" colspan="5">Amount Paid</td>
                        <td align="right"><strong><?=number_format($total_amount_paid, 2, '.', ','); ?></strong></td>
                    </tr>

                    <tr>
                        <td align="right" colspan="5">Change</td>
                        <td align="right"><strong><?=number_format($change, 2, '.', ','); ?></strong></td>
                    </tr>

                    <tr style="border-bottom: 1px solid #000;">
                        <td colspan="4" align="left">
                            <strong>Cashier: </strong><?=ucwords(strtolower($issuer_name)) ?>

                        </td>
                        <td align="right">Balance Owe</td>
                        <td align="right"><strong><?=number_format($due_balance, 2, '.', ','); ?></strong></td>
                    </tr>

                </tbody>
            </table>

        
            <p id="choose"><strong>Thank You For Choosing Us</strong></p>
        </center>
        <hr>
        <table style="width: 100%" id="developer">
            <tbody>
                <tr style="border-bottom: 1px solid #000;">
                    <td colspan="6" align="center">
                        <p style="text-align: center; font-size: 11.5px; color: #000; font-weight: bold;"><em>Software Developed By: Lightworld Technologies Ltd - 0243618186 | 0247612799</em></p>
                    </td>
                </tr>
            </tbody>
        </table>
        
        
    </div>
     </page><br>
        <button onclick="PrintElem('#r_print')" style="border: 1 solid #0cc; padding: 10px; cursor: pointer; background-color: green; color: #fff;">Print</button>
        <button onclick="load_back()" style="position:relative; border: 1 solid #0cc; cursor: pointer; padding: 10px; background-color: red; color: #fff;">Cancel</button>
        </center>
    

    
    <script type="text/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>
    <script type="text/javascript" src="<?php echo base_url('assets/js/bootstrap.js'); ?>"></script>
	</body>
</html>


<script type="text/javascript">
    $(function() {
        $.ajaxSetup({
                cache: false,
                data: {
                    '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
                } 
             });
    });
     
    let pos = '<?php echo $pos; ?>';

    function load_back() {
        $('.modal .close').click();
        if(pos == 'pos') {
            $('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

              getMainPage();
        } else {
            //window.location.reload();
        }
    }

    /*$(document).on('hidden.bs.modal', function() {
        if(pos == 'pos') {
            $('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

              getMainPage();
        } else {
            window.location.reload();
        }
        
    });*/

    function PrintElem(elem)
    {   
        $('.modal .close').click();
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', 'Receipt', 'height=600,width=1200');
        mywindow.document.write('<!doctype html><html><head><title>RECEIPT</title>');
        mywindow.document.write('<link rel="stylesheet" href="<?php echo base_url('assets/tailwindcss/output.css')?>" type="text/css" />');
       // mywindow.document.write('<link rel="stylesheet" href="<?php //echo base_url('assets/js/datatables/responsive/css/datatables.responsive.css')?>" type="text/css" />');
       // mywindow.document.write('<link rel="stylesheet" href="assets/js/jquery-ui/css/no-theme/jquery-ui-1.10.3.custom.min.css">');

        mywindow.document.write('<style type="text/css">  #choose{margin-top: -1px} #developer {margin-top: -23px} #logo_row, #address_row, #official {margin-top: -92px;} #top_row {width: 90% !important}</style>');

        

        let i = Number(<?php echo $i; ?>);
        if(i > 4) {
            mywindow.document.write('</head><body style="font-size: 12px">');
        } else {
            mywindow.document.write('</head><body style="font-size: 13px">');
        }
        
        mywindow.document.write(data);
        mywindow.document.write('</body></html>');
        mywindow.document.close();

        mywindow.onload=function(){
            mywindow.focus();
            mywindow.print();
            mywindow.close();

            $.ajaxSetup({
                cache: false,
                data: {
                    '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
                } 
             });
            
            $('.modal .close').click();

            if(pos == 'pos') {
            $('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

              getMainPage();
            } else {
                //window.location.reload();
            }
        }
        
    }
</script>