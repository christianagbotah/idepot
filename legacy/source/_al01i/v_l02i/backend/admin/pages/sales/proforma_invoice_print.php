
<!doctype html>
<html>
    <head>
        <title><?=$page_title; ?></title>
        <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
        <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css');?>"/>
        <!--Chartjs-->
        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js');?>" type="text/javascript"></script>

    </head>
    <body>  

        <div class="container">
            <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
                <a href="javascript:void(0);" onclick="page_reload()">Print Invoice</a>
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

                        $invoice_status = $this->db->get_where('proforma_invoice', array('invoice_code' => $invoice_code))->row()->status;
                        $invoice_date = $this->db->get_where('proforma_invoice', array('invoice_code' => $invoice_code))->row()->creation_timestamp;
                        $invoice_payment_date = $this->db->get_where('proforma_invoice', array('invoice_code' => $invoice_code))->row()->payment_timestamp;
                        if($invoice_payment_date == null || $invoice_payment_date == '') {
                            $invoice_payment_date = '';
                        }

                        if($invoice_status == 'Open') {
                            $invoice_status = 'Unpaid';
                            $status_color = 'red';
                        } else if($invoice_status == 'Paid') {
                            $status_color = 'green';
                        } else if($invoice_status == 'Partially Paid') {
                            $status_color = '#f713c6';
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
                                margin-top: -40px;
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
                                    bottom: 5px;
                                }
                            
                            #promote{
                                position: absolute;
                                    margin-top: -32px;
                                }

                            .footer {
                                    position: relative;
                                    bottom: 5px;
                                }
                            #status {
                                position: relative;
                                margin-top: -40px;
                                margin-left: 100px;
                                
                            }

                            @media Print{

                                .footer {
                                    position: fixed;
                                    bottom: 5px;
                                }
                                page {
                                background: #ffffff;
                                display: block;
                                margin: 0 auto;
                                margin-bottom: 0.5cm;
                                box-shadow: 0;

                                }

                               

                            #developer_footer {
                               text-align: center;
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
                                    margin-top: -45px;
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
                        <div style="background-color: #1b1b69; width: 100%; height: 30px; margin-bottom: 20px;"></div>

                        <center>  
                            <h3 style="font-weight: bold; font-size: 25px; letter-spacing: 2px; margin-top: 20px; padding-top: 10px;">PRO FORMA INVOICE</h3>

                            <table class="table table-bordered table-striped" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                                <thead>
                                    <tr>
                                        <td style="background-color: #1b1b69; width: 35%; height: 15px;"></td>
                                        <!--<td style="width: 35%; height: 15px;"></td>-->
                                        <td style="background-color: #1b1b69; width: 35%; height: 15px;"></td>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td width="60%">
                                           <table class="table table-bordered table-striped" style="margin-top: -10px; border-collapse:collapse;">
                                                <thead>
                                                    <tr>
                                                    <td>
                                                       <img class="" src="<?php echo base_url(); ?>uploads/school_logo.png" style="max-height : 60px;"> 
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

                                        
                                        <td width="40%">
                                            <table class="table table-bordered table-striped" style="width: 100%; border-collapse:collapse;">
                                                <thead>
                                                    <!--<tr>
                                                        <td colspan="2" align="right"><h1 id="status" style="color: <?=$status_color; ?>"><?= $invoice_status; ?></h1></td>
                                                    </tr>-->
                                                    <tr>
                                                        <td>Creation Date: </td>
                                                        <td><?=date('d/m/Y H:i:s', $invoice_date); ?></td> 
                                                    </tr>
                                                    <tr>
                                                        <td>Payment Date: </td>
                                                        <td><?=date('d/m/Y H:i:s', $invoice_payment_date); ?></td> 
                                                    </tr>
                                                    <tr>
                                                        <td>Invoice Code: </td>
                                                        <td><?=$invoice_code; ?></td> 
                                                    </tr>

                                                    <tr>
                                                        <td>Order Code: </td>
                                                        <td><?=$so_code; ?></td> 
                                                    </tr>
                                                    <tr style="border-top: 2px solid #1b1b69;">
                                                        <td colspan="2"></td>
                                                    </tr>
                                                    <tr style="height: 10px;"></tr>
                                                    <tr>
                                                        <td alighn="left" colspan="2" style="background-color: #1b1b69; color: #fff; width: 35%; height: 15px;">BILL TO:</td>
                                                    </tr>
                                                    <tr>
                                                        <td colspan="2">
                                                        <h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;"><?php echo $customer_name;?></h3>
                                                        <pre>
                                                            <h4 style="font-family: Nunito" align='left'><?php echo trim($customer_address);?></h4>
                                                        </pre>
                                                    </td>
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
                                <div class="table table-responsive" style="min-height: 450px">
                                    <table class="table table-bordered table-striped" id="invoice_table" style="width:100%; border-collapse:collapse; border-left: 1px solid #000; border-bottom: 1px solid #000; margin-top: 10px;">
                                        <thead style="background-color: #4242ad; padding: 30px;">
                                            <tr style="height: 30px; border-right: 1px solid #000;">
                                                <th style="text-align: right">Qty</th>
                                                <!--<th style="text-align: right">Qty Picked</th>-->
                                                <th style="text-align: center">Item</th>
                                                <th style="text-align: left">Description</th>
                                                <th style="text-align: right">Unit Price</th>
                                                <th style="text-align: right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php 
                                            $invoice_query = $this->db->get_where('proforma_invoice_order', array('so_code' => $so_code));
                                            if($invoice_query->num_rows() > 0) {
                                                $invoice_array = $invoice_query->result_array();

                                                $grand_total = 0;
                                            }

                                            foreach($invoice_array as $invoice):
                                                $date = $invoice['date'];
                                                $qty = $invoice['quantity'];
                                                $item = $invoice['item_name'];
                                                $description = $invoice['item_description'];
                                                $unit_price = $invoice['price'];
                                                $total = $invoice['amount'];

                                                if($qty == '' || $qty == null) {
                                                    $qty_edited = '';
                                                } else {
                                                   $qty_edited = number_format($qty, 0, '.', ',');
                                                }

                                                if($unit_price == '' || $unit_price == null) {
                                                    $unit_price_edited = '';
                                                } else {
                                                   $unit_price_edited = numfmt_format_currency($fmt, $unit_price, $currency);
                                                }
                                            ?>
                                            <tr>
                                                <td style="border-right: 1px solid #000;" align="right"><?=$qty_edited; ?></td>
                                                <!--<td style="border-right: 1px solid #000;" align="right"><?=number_format($qty_picked, 0, '.', ','); ?></td>-->
                                                <td style="border-right: 1px solid #000;" align="center"><?=$item; ?></td>
                                                <td style="border-right: 1px solid #000;"><?=$description; ?></td>
                                                <td style="border-right: 1px solid #000;" align="right"><?=$unit_price_edited; ?></td>
                                                <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $total, $currency); ?></td>
                                            </tr>
                                            <?php 
                                                $grand_total += $total;
                                                endforeach;
                                            ?>  
                                        </tbody>
                                    </table>
                                </div>
                                <footer class="footer">
                                    <div>
                                        <div>
                                            <table style="width:100%; border-collapse:collapse; margin-top: 10px;" id="botom_table">
                                                <thead>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Grand Total: </th>
                                                        <th style="text-align: right;"><?=numfmt_format_currency($fmt, $grand_total, $currency); ?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Amount Paid: </th>
                                                        <th style="text-align: right;"><?=numfmt_format_currency($fmt, $this->db->get_where('proforma_invoice_order', array('so_code' => $so_code))->row()->amount_paid, $currency); ?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Balance Due: </th>
                                                        <th style="text-align: right;" width="160"><?=numfmt_format_currency($fmt, $this->db->get_where('proforma_invoice_order', array('so_code' => $so_code))->row()->amount_due, $currency); ?></th>
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
                                            </table>
                                        </div>
                                    </div>
                                    <div style="background-color: #1b1b69; width: 100%; height: 30px; margin-bottom: 20px; padding: 5px 0px; text-align: center"><smal style="color:#adaaaa; position: relative; top: 5px;" id="developer_footer"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or Email Us on mail@lightworldtech.com</i></smal></smal></div>
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
        mywindow.document.write('<!doctype html><html><head><title>PRO FORMA INVOICE</title>');
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

