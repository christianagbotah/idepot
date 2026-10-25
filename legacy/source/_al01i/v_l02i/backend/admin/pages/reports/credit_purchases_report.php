
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

                        if($from == 0 && $to == 0) {
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
                                                        <td align="right" colspan="2"><h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">CREDIT PURCHASES REPORT</h3></td>
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
                                                <th style="text-align: left" width="180">Date | Time</th>
                                                <th style="text-align: left">Creditors</th>
                                                <th style="text-align: right">Amount (<?=$currency; ?>)</th>
                                                
                                            </tr>
                                        </thead>

                                        <tbody>
                                             <?php
                                             if($from != 0 && $to != 0) {
                                                $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                            }

                                            if($supplier_id != 0) {
                                                $this->db->where('supplier_id', $supplier_id);
                                            }
                                            $this->db->select('*');
                                            //$this->db->distinct();
                                            $this->db->where('amount_due >', 0);
                                            $payable_array_s = $this->db->get('accounts_payable')->result_array();

                                                $total_payable = 0;




                                         //for suppliers


                                        foreach($payable_array_s as $sup):

                                            $payable_sub_total_s = $sup['amount_due'];

                                            $supplier_name = $this->db->get_where('suppliers', array('supplier_id' => $sup['supplier_id']))->row()->supplier_name;

                                        ?>
                                              <tr style="border-bottom: 1px solid #000;">
                                                <td><?=date('d-m-Y H:i:s', $sup['creation_timestamp']);?></td>
                                                <td><?=$supplier_name;?></td>
                                                <td align="right"><strong><?=numfmt_format_currency($fmt, $payable_sub_total_s, $currency);?></strong></td>
                                              </tr>
                                              <?php
                                        $total_payable += $payable_sub_total_s;
                                        endforeach;


                                         ?>
                                         <tr style="border-bottom: 1px solid #000;">
                                             <td align="left" colspan="2" style="font-size: 17px"><strong>Total</strong></td>
                                             <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong style="font-size: 17px"><?=numfmt_format_currency($fmt, $total_payable, $currency); ?></strong></td>
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

