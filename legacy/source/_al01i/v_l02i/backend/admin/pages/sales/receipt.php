<!doctype html>
<html>
	<head>
		<title>Payment Receipt</title>
        <style type="text/css">
                #main_receipt{
                    height: 14.85cm;
                    border-bottom: 1px solid #000;
                }

                #bottom_table{
           
                }

             @media Print
             {
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

                #top_row{
                    margin-top: -15px;
                }

                page[size="A4"] {
                    width: 21cm;
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

                #main_receipt{
                    height: 14.85cm;
                    border-bottom: 1px solid #000;
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
            //$this->db->where('invoice_code', $invoice_code);
         /*   $this->db->where('customer_id', $customer_id);
            $this->db->where('payment_id', $payment_id);
            $this->db->where('receipt_code', $receipt_code);
*/


            $this->db->select_sum('amount');
            $this->db->where('customer_id', $customer_id);
            //$this->db->where('payment_id', $payment_id);
            $this->db->where('receipt_code', $receipt_code);

            $total_amount_paid = $this->db->get('payment')->row()->amount;

            $this->db->select_sum('amount_due');
            $this->db->where('amount_due >', 0);
            $this->db->where('customer_id', $customer_id);
           // $this->db->where('payment_id', $payment_id);
           // $this->db->where('receipt_code', $receipt_code);

            $due_balance = $this->db->get('invoice')->row()->due;

            if($due_balance == 0) {
                $balance_msg = 'full payment';
            }elseif($due_balance > 0) {
                $balance_msg = 'part payment';
            }elseif($due_balance < 0) {
                $balance_msg = 'over payment';
            }



            //who issued the receipt
            $payment_row_query = $this->db->get_where('payment', array('receipt_code' => $receipt_code, 'customer_id' => $customer_id));

            $issuer_id = $payment_row_query->row()->issuer_id;
            $s_order_code = $payment_row_query->row()->so_code;
            $invoice_code = $payment_row_query->row()->invoice_code;

            $issuer_name = $this->db->get_where('admin', array('admin_id' => $issuer_id))->row()->name;
           // echo $receipt_code. '|'.$invoice_code.'|'.$customer_id.'|'.$payment_id.'|'.$date_time;

            


        ?>
        
        <center>
        <page size="A4" id="r_print">
        <div id="main_receipt">
            <div style="min-height: 14.85cm; border-bottom: 1px dashed #000">
            <center> 

                <table id="top_row" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                    <thead>
                    </thead>
                    <tbody>
                        <tr>
                            <td width="50%">
                               <table style="margin-top: -10px; border-collapse:collapse;">
                                    <thead>
                                        <tr>
                                        <td>
                                           <img class="" src="<?php echo base_url(); ?>uploads/school_logo.png" style="max-height : 70px; padding-right: 30px"> 
                                        </td>
                                        <td>
                                            <h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px; color: #000;"><?php echo $system_name;?></h3>
                                            <pre>
                                                <h4 style="font-family: Nunito; color: #000;" align='left'><?php echo trim($address);?></h4>
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
                                <table  style="width: 100%; margin-top: -40px; border-collapse:collapse;">
                                    <thead>
                                        <tr>
                                            <td align="right" colspan="3"><h3 id="official" style="font-weight: bold; font-size: 20px; letter-spacing: 2px; background-color: #000; width: 260px; padding: 6px; border-radius: 9px; color: #fff; font-size: 23px">OFFICIAL RECEIPT</h3></td>
                                        </tr>
                                        <tr style="border-bottom: 1px solid #000">
                                            <th style="text-align: right"><h4 style="font-size: 17px; color: #000;">Received From:</h4></th>
                                            <th style="text-align: right" colspan="2"><h4 style="font-size: 17px; color: #000;"><?= ucwords(strtolower($customer_name)); ?></h4></th>
                                        </tr>
                                        <tr>
                                            <th style="text-align: right">Paid On:</th>
                                            <th style="text-align: right" colspan="2"><?= date('d/m/Y H:i:s', $date_time); ?></th>
                                        </tr>
                                        <tr>
                                            <th style="text-align: right">Receipt No.:</th>
                                            <th style="text-align: right" colspan="2"><?= $receipt_code; ?></th>
                                        </tr>
                                        <tr>
                                            <th style="text-align: right">Order No.:</th>
                                            <th style="text-align: right" colspan="2"><?= str_replace('_', ', ', $s_order_code); ?></th>
                                        </tr> 
                                        <tr>
                                            <th style="text-align: right">Invoice No.:</th>
                                            <th style="text-align: right" colspan="2"><?= $invoice_code; ?></th>
                                        </tr> 
                                        <tr>
                                            <th style="text-align: right">Currency:</th>
                                            <th style="text-align: right" colspan="2"><?= $currency; ?></th>
                                        </tr>
                                        <tr>
                                          <th style="text-align: right">Issued On:</th>
                                          <th style="text-align: right" colspan="2"><?= date('d/m/Y H:i:s') ?></th>
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

            <br>
            <table style="margin-bottom: 40px;">
                <thead>
                   <tr>
                        <td>
                            <strong style="line-height: 30px">
                                <em>
                                    Being payment of <?=numfmt_format_currency($fmt, $total_amount_paid, $currency) ?> as <?=$balance_msg ?> for your Order Code [<?=str_replace('_', ', ', $s_order_code) ?>] and Invoice Code [<?=str_replace('_', ', ', $invoice_code) ?>]. Total balance due is <?=numfmt_format_currency($fmt, $due_balance, $currency) ?>.
                                </em>
                            </strong>
                        </td>
                    </tr>

                    <tr><td><br></td></tr>
                    <tr>
                        <td align="left">
                            <div>
                               <span style="font-size: 18px; font-weight: bold;">Paid: </span><span style="background: #000; color: #fff; font-size: 18px; font-weight: bold; border: 1px solid #000; padding: 3px"><?=$currency; ?></span> <span style="font-size: 18px; font-weight: bold; border: 1px solid #000; padding: 3px"><?=number_format($total_amount_paid, 2, '.', ',') ?></span>
                            </div>

                            <div style="margin-left: 400px; margin-top: -27px">
                                <span style="font-size: 18px; font-weight: bold;">Balance: </span><span style="background: #000; color: #fff; font-size: 18px; font-weight: bold; border: 1px solid #000; padding: 3px"><?=$currency; ?></span> <span style="font-size: 18px; font-weight: bold; border: 1px solid #000; padding: 3px"><?=number_format($due_balance, 2, '.', ',') ?></span>
                            </div>
                        </td>
                    </tr>
                </thead>
            </table>

            <table style="right: 20px; bottom: 100px; width: 100%" id="bottom_table">
            <tbody>
                <tr style="margin-top: 100px">
                        <td colspan="4" align="right">
                            <strong>Cashier: </strong><?=ucwords(strtolower($issuer_name)) ?>
                            <hr>

                            <strong><?=ucwords(strtolower($system_slogan)) ?></strong>
                            <hr>
                            <p><strong>Thank You For Choosing Us</strong></p>
                        </td>
                    </tr>
            </tbody>
        </table>

        <small><p style="text-align: right"><em>Software Developed By: Lightworld Technologies Ltd - 0243618186|0247612799</em></p></small>
        </div>
        
    </div>
     </page><br>
        <button onclick="PrintElem('#r_print')" style="border: 1 solid #0cc; padding: 10px; cursor: pointer; background-color: green; color: #fff;">Print</button>
        <button onclick="load_back()" style="position:relative; border: 1 solid #0cc; cursor: pointer; padding: 10px; background-color: red; color: #fff;">Cancel</button>
        </center>
    

<script type="text/javascript">
	function load_back() {
		$('.modal .close').click();
        //window.location.reload();
	}
</script>
    
    <script type="text/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>
    <script type="text/javascript" src="<?php echo base_url('assets/js/bootstrap.js'); ?>"></script>
	</body>
</html>

<script type="text/javascript">


    function PrintElem(elem)
    {   
        $('.modal .close').click();
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', 'Receipt', 'height=600,width=1200');
        mywindow.document.write('<!doctype html><html><head><title>RECEIPT</title>');
        mywindow.document.write('<link rel="stylesheet" href="assets/css/neon-theme.css" type="text/css" />');
        mywindow.document.write('<link rel="stylesheet" href="assets/js/datatables/responsive/css/datatables.responsive.css" type="text/css" />');
        mywindow.document.write('<link rel="stylesheet" href="assets/js/jquery-ui/css/no-theme/jquery-ui-1.10.3.custom.min.css">');
        mywindow.document.write('</head><body style="font-sie: 14px">');
        mywindow.document.write(data);
        mywindow.document.write('</body></html>');
        mywindow.document.close();

        mywindow.onload=function(){
            mywindow.focus();
            mywindow.print();
            mywindow.close();

            //window.location.reload();
        }
        
    }
</script>