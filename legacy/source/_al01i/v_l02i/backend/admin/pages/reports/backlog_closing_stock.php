
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
                <a href="javascript:void(0);" onClick="print_page()">Print Backlog</a>
            </div>
            <div class="row">
                <div class="col-lg-12">
                    <div id="print">
                        <?php
                        //Account section - Batch load settings
                        $settings = $this->db->where_in('type', ['currency', 'system_name', 'location', 'address', 'phone'])->get('settings')->result_array();
                        $settings_map = array_column($settings, 'description', 'type');
                        
                        $currency = $settings_map['currency'];
                        $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
                        $system_name = $settings_map['system_name'];
                        $location = $settings_map['location'];
                        $address = $settings_map['address'];
                        $phone = $settings_map['phone'];

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

                                #order_summary {
                                    width: 80% !important;
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
                                                        <td align="right" colspan="2"><h1 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">BACKLOG ACCOUNT</h1></td>
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Period: </td>
                                                        <td align="right"><strong>From: <?=$from; ?> To: <?=$to; ?></strong></td> 
                                                    </tr>
                                                    <tr>
                                                    <tr style="border-top: 2px solid #1b1b69;">
                                                        <td colspan="2"></td>
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Cashier: </td>
                                                        <td align="right"><strong><?=$cashier ?></strong></td> 
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
                                
                                <!--ORDER SUMMARY-->
                                <div class="table table-responsive">
                                    <table class="table table-bordered table-striped" id="invoice_table" style="width:100%; border-collapse:collapse;  margin-top: 10px;">
                                        <thead style="background-color: #4242ad; padding: 30px;">
                                            
                                            <tr style="height: 30px;">
                                                <th style="text-align: left">Date</th>
                                                <th style="text-align: left">Item</th>
                                                <th style="text-align: left">Supplier</th>
                                                <th style="text-align: left"></th>
                                                <th style="text-align: right">Opening Stock</th>
                                                <th style="text-align: right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <tr style="border-bottom: 1px solid #000;">
                                                <td align="left" colspan="6">
                                                    <h3 style="text-align: left">TOTAL ORDER AVAILABLE</h3>
                                                </td>
                                            </tr>
                                            <?php 
                                            // Batch load all items
                                            $all_items = $this->db->get('items')->result_array();
                                            $items_map = array_column($all_items, 'item_name', 'item_id');
                                            $supplier_map = array_column($all_items, 'supplier_id', 'item_id');
                                            $order_items_array_po = array_map(function($i) { return ['item_id' => $i['item_id']]; }, $all_items);
                                            
                                            // Batch load all suppliers
                                            $supplier_ids = array_unique(array_column($all_items, 'supplier_id'));
                                            $all_suppliers = $this->db->where_in('supplier_id', $supplier_ids)->get('suppliers')->result_array();
                                            $suppliers_map = array_column($all_suppliers, 'supplier_name', 'supplier_id');
                                            
                                            // Batch load all stock_manager data
                                            if($from != 0 && $to != 0) {
                                                $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                            }
                                            $all_stock = $this->db->get('stock_manager')->result_array();
                                            $stock_by_item = [];
                                            foreach($all_stock as $stk) {
                                                $stock_by_item[$stk['item_id']][] = $stk;
                                            }  

                                                //counters
                                                $item_quantity_po = 0;
                                                $total_quantity_po = 0;
                                                $quantity_in_stock_po = 0;
                                                 foreach($order_items_array_po as $item_po):
                                                    $item_name_po = $items_map[$item_po['item_id']] ?? 'Unknown';
                                                    $sup_id = $supplier_map[$item_po['item_id']] ?? 0;
                                                    $supplier_name_po = $suppliers_map[$sup_id] ?? 'Unknown';
                                                    
                                                    // Use pre-loaded stock data
                                                    $items_array_po = $stock_by_item[$item_po['item_id']] ?? [];
                                                    $date_po = !empty($items_array_po) ? date('d-m-Y', $items_array_po[0]['date_timestamp']) : '';
                                                    
                                                    //find total quantity
                                                    foreach($items_array_po as $it_po) {
                                                        $item_quantity_po += $it_po['opening_stock'];
                                                    }

                                                    //get latest instock value for this item for the selected period

                                                 /*   if($from != 0 && $to != 0) {
                                                        $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                                    }


                                                    $this->db->where('item_id', $item_po['item_id']);
                                                    $this->db->select('po_id');
                                                    $this->db->from('purchase_order');
                                                    $this->db->distinct();
                                                    $this->db->order_by('po_id', 'desc');
                                                    $this->db->limit(1);
                                                    $po_id_po = $this->db->get()->row()->po_id;//

                                                    $in_stock_po = $this->db->get_where('purchase_order', array('po_id' => $po_id_po))->row()->item_balance;*/

                                                    ?>

                                                    <tr>
                                                        <td align="left"><?=$date_po; ?></td>
                                                        <td align="left"><?=$item_name_po; ?></td>
                                                        <td align="left"><?=$supplier_name_po; ?></td>
                                                        <td align="left"></td>
                                                        <td align="right"><?=number_format($item_quantity_po, 0, '.', ','); ?></td>
                                                    </tr>
                                                    <?php
                                                    $total_quantity_po += $item_quantity_po;
                                                   // $quantity_in_stock_po += $in_stock_po;
                                                    $item_quantity_po = 0; //reset value
                                                 endforeach;
                                            ?>
                                            <tr>
                                                <td colspan="5"></td>
                                                <td align="right" style="border-top: 1px solid #000; border-style: solid none;"><strong><?=number_format($total_quantity_po, 0, '.', ',') ?> Bags</strong></td>
                                            </tr>

                                            <!--TOTAL SUPPLY -->
                                            <tr><td></td></tr>
                                            <tr><td></td></tr>
                                            <tr style="border-bottom: 1px solid #000;">
                                                <td align="left" colspan="3">
                                                    <h3 style="text-align: left">TOTAL SUPPLIES</h3>
                                                </td>
                                                <td align="left">
                                                    <h3 style="text-align: left">Type of Sales</h3>
                                                </td>
                                                <td align="right">
                                                    <h3 style="text-align: right">Quantity Supplied</h3>
                                                </td>
                                                <td>
                                                </td>
                                            </tr>
                                             <?php 
                                             // Batch load all payment_with_goods data
                                             if($from != 0 && $to != 0) {
                                                $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                            }
                                            $this->db->where('opening_entry', 0);
                                            $all_pwg = $this->db->get('payment_with_goods')->result_array();
                                            
                                            // Group by type_of_sales
                                            $pwg_by_type = [];
                                            foreach($all_pwg as $pwg) {
                                                $pwg_by_type[$pwg['type_of_sales']][] = $pwg;
                                            }
                                            $ts_array = [];
                                            foreach(array_keys($pwg_by_type) as $type) {
                                                $ts_array[] = ['type_of_sales' => $type];
                                            }
                                            sort($ts_array);
                                            
                                            // Batch load all customers
                                            $customer_ids = array_unique(array_column($all_pwg, 'customer_id'));
                                            $all_customers = $this->db->where_in('customer_id', $customer_ids)->get('customers')->result_array();
                                            $customers_map = array_column($all_customers, 'customer_name', 'customer_id'); 

                                            $total_supplied = 0;
                                            $total_quantity = 0;

                                            foreach($ts_array as $ts)://start of the type of sales
                                            // Use pre-loaded data filtered by type
                                            $type_pwg = $pwg_by_type[$ts['type_of_sales']] ?? [];
                                            $item_ids_in_type = array_unique(array_column($type_pwg, 'item_id'));
                                            $order_items_array = array_map(function($id) { return ['item_id' => $id]; }, $item_ids_in_type);  

                                                //counters
                                                $item_quantity = 0;
                                                $quantity_in_stock = 0;
                                                 foreach($order_items_array as $item):
                                                    // Filter pre-loaded data for this item and type
                                                    $items_array = array_filter($type_pwg, function($p) use ($item) {
                                                        return $p['item_id'] == $item['item_id'];
                                                    });
                                                    
                                                    if(empty($items_array)) continue;
                                                    $first_item = reset($items_array);
                                                    
                                                    $item_name = $items_map[$item['item_id']] ?? 'Unknown';
                                                    $date = $first_item['date'];
                                                    $customer_id_it = $first_item['customer_id'];
                                                    $type_of_sales = $first_item['type_of_sales'];
                                                    $supplier_id_s = $supplier_map[$item['item_id']] ?? 0;
                                                    $supplier_name_s = $suppliers_map[$supplier_id_s] ?? 'Unknown';
                                                    $customer_name = $customers_map[$customer_id_it] ?? 'Unknown';
                                                    
                                                    //find total quantity
                                                    foreach($items_array as $it) {
                                                        $item_quantity += $it['quantity_picked'];
                                                    }

                                                        //get latest instock value for this item for the selected period

                                                       /* if($from != 0 && $to != 0) {
                                                            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                                        }
                                                        $this->db->where('item_id', $item['item_id']);
                                                        $this->db->select('so_id');
                                                        $this->db->from('sales_order');
                                                        $this->db->distinct();
                                                        $this->db->order_by('so_id', 'desc');
                                                        $this->db->limit(1);
                                                        $so_id = $this->db->get()->row()->so_id;;//

                                                        $in_stock = $this->db->get_where('sales_order', array('so_id' => $so_id))->row()->item_balance; */

                                                        if($item_quantity != '' || $item_quantity != 0):
                                                        ?>

                                                        <tr>
                                                            <td align="left"><?=$date; ?></td>
                                                            <td align="left"><?=$item_name; ?></td>
                                                            <td align="left"><?=$supplier_name_s; ?></td>
                                                            <td align="left"><?=$type_of_sales; ?></td>
                                                            <td align="right"><?=number_format($item_quantity, 0, '.', ','); ?></td>
                                                            
                                                        </tr>
                                                        <?php
                                                    endif;

                                                        $total_supplied += $item_quantity;
                                                       // $quantity_in_stock += $in_stock;
                                                        $item_quantity = 0; //reset value

                                                       // } 
                                                     endforeach;
                                                     ?>
                                                        <tr>
                                                            <td colspan="4"></td>
                                                            <td align="right" style="border-top: 1px solid #000;"><?=number_format($total_supplied, 0, '.', ','); ?></td>
                                                        </tr>


                                                     <?php
                                                        $total_quantity += $total_supplied;
                                                        $total_supplied = 0;
                                                 endforeach;
                                                ?>

                                                <tr>
                                                    <td colspan="5"></td>
                                                    <td align="right" style="border-top: 1px solid #000; border-style: solid none;"><strong>(<?=number_format($total_quantity, 0, '.', ',') ?> Bags)</strong></td>
                                                </tr>

                                                <tr>
                                                    <td align="left" colspan="5"><strong>Balance</strong></td>

                                                    <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong><?=number_format(($total_quantity_po - $total_quantity), 0, '.', ',') ?> Bags</strong></td>
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
        mywindow.document.write('<!doctype html><html><head><title>BACKLOG ACCOUNT</title>');
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

