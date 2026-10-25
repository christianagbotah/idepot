
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
                <a href="javascript:void(0);" onClick="page_reload()">Print Inventories Report</a>
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

                        $inventory_query = $this->db->get('items');
                        $number_of_inventories = $inventory_query->num_rows();


                        if($number_of_inventories > 0) {
                            $inventory_array = $inventory_query->result_array();
                        }


                        if($from == 0 && $to == 0) {
                            $this->db->select('date_timestamp');
                            $this->db->from('sales_order');
                            $this->db->order_by('date_timestamp', 'asc');
                            $this->db->limit(1);
                            $from = date('d-m-Y', $this->db->get()->row()->date_timestamp);//

                            if($from == '') {
                                $this->db->select('date_timestamp');
                                $this->db->from('purchase_order');
                                $this->db->order_by('date_timestamp', 'asc');
                                $this->db->limit(1);
                                $from = date('d-m-Y', $this->db->get()->row()->date_timestamp);//
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
                                                        <td align="right" colspan="2"><h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">INVENTORIES REPORT</h3></td>
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Period: </td>
                                                        <td align="right"><strong>From: <?=$from; ?> To: <?=$to; ?></strong></td> 
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Number of Inventories: </td>
                                                        <td align="right"><?=number_format($number_of_inventories, 0, '.', ','); ?></td> 
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Total Quantity: </td>
                                                        <td align="right" id="quantity"></td> 
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Total Amount: </td>
                                                        <td align="right" id="amount"></td> 
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
                                                <th style="text-align: left">Item</th>
                                                <th style="text-align: left">Description</th>
                                                <th style="text-align: left">Last Used</th>
                                                <th style="text-align: right">Quantity</th>
                                                <th style="text-align: right">Selling Price</th>
                                                <th style="text-align: right">Purchase Price</th>
                                                
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php 

                                                $total_quantity = 0;
                                                $total_amount = 0;
                                                $total_amount_sell = 0;
                                            
                                            /*******************************/
                                            //FROM SALES ORDER
                                            $this->db->where('date_timestamp <= "'. strtotime($to) . '"');
                                            $this->db->select('item_id');
                                            $this->db->from('sales_order');
                                            $this->db->distinct();
                                            $order_items_query = $this->db->get();//
                                            $order_items_array = $order_items_query->result_array();  

                                            //FROM PURCHASE ORDER
                                            $this->db->where('date_timestamp <= "'. strtotime($to) . '"');
                                            $this->db->select('item_id');
                                            $this->db->from('purchase_order');
                                            $this->db->distinct();
                                            $order_items_query_p = $this->db->get();//
                                            $order_items_array_p = $order_items_query_p->result_array();

                                                //counters
                                                $not_found_ids = array();
                                                $_found_counter = 0;
                                                $total_quantity_it = 0;
                                                $total_amount_it = 0;
                                                $inventory_total = 0;

                                                /***TEST AREA*******************/
                                                foreach($order_items_array_p as $item_p):

                                                    foreach($order_items_array as $item_inv):
                                                        if($item_p['item_id'] == $item_inv['item_id']) {
                                                            $_found_counter++;
                                                        }
                                                    endforeach;

                                                    if($_found_counter == 0) {
                                                        //no match found
                                                        array_push($not_found_ids, $item_p['item_id']);
                                                    }

                                                    //RESET COUNTER
                                                    $_found_counter = 0;

                                                endforeach; //trying to check if all the items exit in the sales table
                                                /*********TEST AREA ENDS**********/

                                            

                                         foreach($order_items_array as $item_inv):



                                            //select the last timestamp from sales order table
                                           /* $this->db->where('date_timestamp <= "'. strtotime($to) . '"');
                                            $this->db->where('item_id', $item_inv['item_id']);
                                            $this->db->select('date_timestamp');
                                            $this->db->from('sales_order');
                                            $this->db->order_by('date_timestamp', 'desc');
                                            $this->db->limit(1);
                                            $sales_timestamp = $this->db->get()->row()->date_timestamp;

                                            //select the last timestamp from purchase order table
                                            $this->db->where('date_timestamp <= "'. strtotime($to) . '"');
                                            $this->db->where('item_id', $item_inv['item_id']);
                                            $this->db->select('date_timestamp');
                                            $this->db->from('purchase_order');
                                            $this->db->order_by('date_timestamp', 'desc');
                                            $this->db->limit(1);
                                            $purchase_timestamp = $this->db->get()->row()->date_timestamp;*/


                                            //get latest instock value for this item for the selected period
                                            $this->db->where('date_timestamp <= "'. strtotime($to) . '"');
                                            $this->db->where('item_id', $item_inv['item_id']);
                                            $this->db->select('timestamp');
                                            $this->db->from('sales_order');
                                            $this->db->distinct();
                                            $this->db->order_by('timestamp', 'desc');
                                            $this->db->limit(1);
                                            $sales_timestamp = $this->db->get()->row()->timestamp;//

                                            $this->db->where('date_timestamp <= "'. strtotime($to) . '"');
                                            $this->db->where('item_id', $item_inv['item_id']);
                                            $this->db->select('timestamp');
                                            $this->db->from('purchase_order');
                                            $this->db->distinct();
                                            $this->db->order_by('timestamp', 'desc');
                                            $this->db->limit(1);
                                            $purchase_timestamp = $this->db->get()->row()->timestamp;//

                                            //compare
                                            if($sales_timestamp > $purchase_timestamp) {
                                                $in_stock = $this->db->get_where('sales_order', array('timestamp' => $sales_timestamp, 'item_id' => $item_inv['item_id']))->row()->item_balance;

                                            } else if($sales_timestamp < $purchase_timestamp) {
                                                $in_stock = $this->db->get_where('purchase_order', array('timestamp' => $purchase_timestamp, 'item_id' => $item_inv['item_id']))->row()->item_balance;

                                            } else if($sales_timestamp == $purchase_timestamp) {
                                                //they can never be the same since we are using timestamp in seconds count
                                            }


                                            $description_it = $this->db->get_where('items', array('item_id' => $item_inv['item_id']))->row()->description;

                                            $selling_price_it = $this->db->get_where('items', array('item_id' => $item_inv['item_id']))->row()->selling_price;

                                            $purchase_price_it = $this->db->get_where('items', array('item_id' => $item_inv['item_id']))->row()->purchase_price;
                                             $item_name_it = $this->db->get_where('items', array('item_id' => $item_inv['item_id']))->row()->item_name;

                                            $purchase_price_it = $this->db->get_where('items', array('item_id' => $item_inv['item_id']))->row()->purchase_price;
                                            $last_used_it = $this->db->get_where('items', array('item_id' => $item_inv['item_id']))->row()->last_used_timestamp;


                                            $amount_it = $in_stock * $purchase_price_it;
                                            $amount_sell_it = $in_stock * $selling_price_it;

                                        


                                            ?>
                                            <tr>
                                                <td style="border-right: 1px solid #000;" align="left"><?=$item_name_it; ?></td>
                                                <td style="border-right: 1px solid #000;" align="left"><?=$description_it; ?></td>
                                                <td style="border-right: 1px solid #000;" align="left"><?php if($last_used_it != null) echo date('d-m-Y H:i:s',$last_used_it); ?></td>
                                                <td style="border-right: 1px solid #000;" align="right"><?=number_format($in_stock, 0, '.', ','); ?></td>
                                                <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $selling_price_it, $currency); ?></td>
                                                <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $purchase_price_it, $currency); ?></td>
                                            </tr>
                                                
                                            <?php 
                                                $total_quantity_it += $in_stock;
                                                $total_amount_it += $amount_it;
                                                $total_amount_sell_it = $amount_sell_it;


                                         endforeach; 

                                         //FOR THOSE ITEMS NOT FOUND IN SALES ORDER TABLE
                                         for($i = 0; $i < count($not_found_ids); $i++) {
                                            //get latest instock value for this item for the selected period
                                            $this->db->where('date_timestamp <= "'. strtotime($to) . '"');
                                            $this->db->where('item_id', $not_found_ids[$i]);
                                            $this->db->select('timestamp');
                                            $this->db->from('purchase_order');
                                            $this->db->distinct();
                                            $this->db->order_by('timestamp', 'desc');
                                            $this->db->limit(1);
                                            $purchase_timestamp = $this->db->get()->row()->timestamp;//


                                            $in_stock_p = $this->db->get_where('purchase_order', array('timestamp' => $purchase_timestamp, 'item_id' => $not_found_ids[$i]))->row()->item_balance;


                                            $item_name_it_p = $this->db->get_where('items', array('item_id' => $not_found_ids[$i]))->row()->item_name;

                                            $purchase_price_it_p = $this->db->get_where('items', array('item_id' => $not_found_ids[$i]))->row()->purchase_price;

                                            $description_it_p = $this->db->get_where('items', array('item_id' => $not_found_ids[$i]))->row()->description;

                                            $selling_price_it_p = $this->db->get_where('items', array('item_id' => $not_found_ids[$i]))->row()->selling_price;

                                            $purchase_price_it_p = $this->db->get_where('items', array('item_id' => $not_found_ids[$i]))->row()->purchase_price;

                                            $last_used_it = $this->db->get_where('items', array('item_id' => $not_found_ids[$i]))->row()->last_used_timestamp;


                                            $amount_it_p = $in_stock_p * $purchase_price_it_p;
                                            $amount_sell_it_p = $in_stock_p * $selling_price_it_p;


                                            ?>
                                             <tr>
                                                <td style="border-right: 1px solid #000;" align="left"><?=$item_name_it_p; ?></td>
                                                <td style="border-right: 1px solid #000;" align="left"><?=$description_it_p; ?></td>
                                                <td style="border-right: 1px solid #000;" align="left"><?php if($last_used_it_p != null) date('d-m-Y H:i:s', $last_used_it_p); ?></td>
                                                <td style="border-right: 1px solid #000;" align="right"><?=number_format($in_stock_p, 0, '.', ','); ?></td>
                                                <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $selling_price_it_p, $currency); ?></td>
                                                <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $purchase_price_it_p, $currency); ?></td>
                                            </tr>
                                                
                                            <?php 
                                                $total_quantity_it += $in_stock_p;
                                                $total_amount_it += $amount_it_p;
                                                $total_amount_sell_it = $amount_sell_it_p;
                                         }

                                         ?>
                                            <tr style="border-top: 1px solid #000">
                                                <td colspan="3" style="border-right: 1px solid #000;"><strong>Total</strong></td>
                                                <td style="border-right: 1px solid #000; text-align: right;"><strong><?=number_format($total_quantity_it, 0, '.', ','); ?></strong></td>

                                                <td style="border-right: 1px solid #000; text-align: right;"><strong><?=numfmt_format_currency($fmt, $total_amount_sell_it, $currency); ?></strong></td>

                                                <td style="border-right: 1px solid #000; text-align: right;"><strong><?=numfmt_format_currency($fmt, $total_amount_it, $currency); ?></strong></td>
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
        //update total quantity and amount at the top
        $('table tr #quantity').html('<strong><?=number_format($total_quantity_it, 0, '.', ','); ?></strong>');
        $('table tr #amount').html('<strong><?=numfmt_format_currency($fmt, $total_amount_it, $currency); ?></strong>');
    });
    

   
 function PrintElem(elem)
    {
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', '', '');
        mywindow.document.write('<!doctype html><html><head><title>INVENTORIES REPORT</title>');
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

