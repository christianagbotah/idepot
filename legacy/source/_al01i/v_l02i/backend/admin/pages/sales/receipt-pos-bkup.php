<!doctype html>
<html>
    <head>
        <title>Payment Receipt</title>
        <style type="text/css">
                #main_receipt{
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

               /* #invoice_table, #hr_line, #top_row, .footer {
                    width: 130% !important;
                }
                */

               

                #header2 {
                    position: absolute !important;
                    width: 130%;
                }
                #top_row{
                    margin-top: -15px;
                }

                page[size="A6"] {
                    width: 80mm;
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

            $this->db->where('so_code', $so_code);
            $this->db->where('customer_id', $customer_id);
            $sales_order_array = $this->db->get('sales_order')->result_array();


            //get total for this invoice code
            $this->db->where('invoice_code', $invoice_code);
            $this->db->where('customer_id', $customer_id);
            $this->db->where('payment_id', $payment_id);
            $this->db->where('receipt_code', $receipt_code);

            $s_order_code = $this->db->get('payment')->row()->so_code;

            $this->db->where('invoice_code', $invoice_code);
            $this->db->where('customer_id', $customer_id);
            $this->db->where('payment_id', $payment_id);
            $this->db->where('receipt_code', $receipt_code);
            $amounts_transactions_q = $this->db->get('payment');

            $total_amount_paid = $amounts_transactions_q->row()->amount;
            $amount_tendered = $amounts_transactions_q->row()->amount_tendered;
            $change = $amounts_transactions_q->row()->change_due;

            $this->db->where('invoice_code', $invoice_code);
            $this->db->where('customer_id', $customer_id);
            $this->db->where('payment_id', $payment_id);
            $this->db->where('receipt_code', $receipt_code);

            $due_balance = $this->db->get('payment')->row()->due;

            if($due_balance == 0) {
                $balance_msg = 'full payment';
            }elseif($due_balance > 0) {
                $balance_msg = 'part payment';
            }elseif($due_balance < 0) {
                $balance_msg = 'over payment';
            }



            //who issued the receipt
            $issuer_id = $this->db->get_where('payment', array('receipt_code' => $receipt_code, 'customer_id' => $customer_id))->row()->issuer_id;

            $issuer_name = $this->db->get_where('admin', array('admin_id' => $issuer_id))->row()->name;
           // echo $receipt_code. '|'.$invoice_code.'|'.$customer_id.'|'.$payment_id.'|'.$date_time;

            


        ?>
        
        <center>
        <page size="A6" id="r_print">
        <div id="main_receipt">

                <table id="top_row" style="width:100%; border-collapse:collapse; margin-top: -10px;">
                    <tbody>
                        <tr style="border-top: 2px solid #1b1b69;">

                            <td> <!--left heading-->
                                <table style="width: 50%; border-collapse:collapse;" id="header1">
                                    <tbody>
                                        <tr>
                                            <td align="left">
                                               <img class="" src="<?php echo base_url(); ?>uploads/school_logo.png" style="max-height : 60px; margin-top: -40px; padding-right: 30px"> 
                                            </td>
                                            <td align="left">
                                                <pre>
                                                    <h4 style="font-family: Nunito; color: #000;" align='left'><?php echo trim($address);?></h4>
                                                </pre>
                                            </td> 
                                        </tr>

                                        <tr>
                                            <td align="left" colspan="2"><h3 id="official" style="font-weight: bold; font-size: 20px; letter-spacing: 2px; background-color: #000; width: 260px; padding: 6px; border-radius: 9px; color: #fff; font-size: 23px; margin-top: -30px">OFFICIAL RECEIPT</h3>
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </td>

                            <td> <!--right heading-->
                                <table style="width: 100%; border-collapse:collapse;" id="header2">
                                    <tbody>
                                        <tr style="border-bottom: 1px solid #000">
                                            <th style="text-align: left"><h4 style="font-size: 17px; color: #000;">Received From:</h4></th>
                                            <th style="text-align: right"><h4 style="font-size: 17px; color: #000;"><?= ucwords(strtolower($customer_name)); ?></h4></th>
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
                                            <th style="text-align: right"><?= $s_order_code; ?></th>
                                        </tr> 
                                        <tr>
                                            <th style="text-align: left">Invoice No.:</th>
                                            <th style="text-align: right"><?= $invoice_code; ?></th>
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
                                </table>
                                
                            </td>
                            <!--<td align="left" width="50%"> Holds the left hand side heading
                                <tr style="border-top: 2px solid #1b1b69; margin-top: -60px">
                                    
                                </tr>

                                
                            </td> -->

                            <!--<td width="50%">Holds the right hand side heading--
                                
                            </td>-->
                        </tr>                        
                    </tbody>
                </table>

            <br>
            <table style="width:100%; border-collapse:collapse; margin-top: 10px;">
                <thead>
                   <tr style="border-bottom: 1px solid #000">
                       <th style="text-align:left">S/N</th>
                       <th style="text-align:left">Item</th>
                       <th style="text-align:right">Qty</th>
                       <th style="text-align:right">Qty Picked</th>
                       <th style="text-align:right">Amount</th>
                   </tr>
                </thead>

                <tbody>
                    <?php 
                        $i = 1;
                        foreach($sales_order_array as $order):

                            $item_name = $this->db->get_where('items', array('item_id' => $order['item_id']))->row()->item_name;
                            ?>
                            <tr>
                                <td><?=$i; ?></td>
                                <td><?=$item_name; ?></td>
                                <td align="right"><strong><?=number_format($order['quantity'], 0, '.', ','); ?></strong></td>
                                <td align="right"><strong><?=number_format($order['quantity_picked'], 0, '.', ','); ?></strong></td>
                                <td align="right"><strong><?=number_format($order['amount'], 2, '.', ','); ?></strong></td>
                            </tr>
                            <?php

                            $i++;
                        endforeach;

                        //totalling here
                    ?>
                    <tr style="border-top: 1px solid #000;">
                        <td align="right" colspan="4">Total</td>
                        <td align="right"><strong><?=number_format($order['grand_total'], 2, '.', ','); ?></strong></td>
                    </tr>

                    <tr>
                        <td align="right" colspan="4">Amount Tendered</td>
                        <td align="right"><strong><?=number_format($amount_tendered, 2, '.', ','); ?></strong></td>
                    </tr>


                    <tr>
                        <td align="right" colspan="4">Amount Paid</td>
                        <td align="right"><strong><?=number_format($total_amount_paid, 2, '.', ','); ?></strong></td>
                    </tr>

                    <tr>
                        <td align="right" colspan="4">Change</td>
                        <td align="right"><strong><?=number_format($change, 2, '.', ','); ?></strong></td>
                    </tr>

                    <tr>
                        <td align="right" colspan="4">Balance Owe</td>
                        <td align="right"><strong><?=number_format($due_balance, 2, '.', ','); ?></strong></td>
                    </tr>

                </tbody>
            </table>

            <hr>
            <table style="right: 20px; bottom: 100px; width: 100%" id="bottom_table">
            <tbody>
                <tr style="margin-top: 100px">
                        <td colspan="4" align="right">
                            <strong>Cashier: </strong><?=ucwords(strtolower($issuer_name)) ?>
                            <hr>
                        </td>
                    </tr>
            </tbody>
        </table> 
        <center>
            <p><strong>Thank You For Choosing Us</strong></p>
        </center> <hr>

        <table style="width: 100%">
            <tbody>
                <tr>
                    <td colspan="4" align="right">
                        <small><p style="text-align: right; font-size: 9px;"><em>Software Developed By: Lightworld Technologies Ltd - 0243618186|0247612799</em></p></small>
                    </td>
                </tr>
            </tbody>
        </table>
        
        
    </div>
     </page><br>
        <button onclick="PrintElem('#r_print')" style="border: 1 solid #0cc; padding: 10px; cursor: pointer; background-color: green; color: #fff;">Print</button>
        <button onclick="load_back()" style="position:relative; border: 1 solid #0cc; cursor: pointer; padding: 10px; background-color: red; color: #fff;">Cancel</button>
        </center>
    

<script type="text/javascript">
    function load_back() {
        $('.modal .close').click();
        window.location.reload();
    }
</script>
    
    <script type="text/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>
    <script type="text/javascript" src="<?php echo base_url('assets/js/bootstrap.js'); ?>"></script>
    </body>
</html>

<script type="text/javascript">

    $(document).on('hidden.bs.modal', function() {
        window.location.reload();
    });

    function PrintElem(elem)
    {   
        $('.modal .close').click();
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', 'Thermal Receipt', 'height=600,width=1200');
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

            window.location.reload();
        }
        
    }
</script>