
<!doctype html>
<html>
    <head>
        <title><?=$page_title ?? 'Sales Order Report'; ?></title>
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
                <a href="javascript:void(0);" onClick="print_page()">Print Sales Order List</a>
            </div>
            <div class="row">
                <div class="col-lg-12">
                    <div id="print">
                        <?php
                        //Account section - Batch load settings
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
                        $customer_id = $customer_id ?? 0;
                        $status = $status ?? 'All';
                        $GLOBALS['customer_id'] = $customer_id;
                        $GLOBALS['status'] = $status;

                        //get all the accounts names
                        $this->db->select('name');
                        $this->db->distinct();
                        $this->db->order_by('name', 'asc');
                        $account_names_query = $this->db->get('accounts');
                        $account_names = $account_names_query->result_array();

                        if($from == 0 && $to == 0) {
                            $this->db->select('date_timestamp');
                            $this->db->from('sales_order');
                            $this->db->order_by('date_timestamp', 'asc');
                            $this->db->limit(1);
                            $first_row = $this->db->get()->row();
                            $from = $first_row ? date('d-m-Y', $first_row->date_timestamp) : date('d-m-Y');
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
                                    width: 100% !important;
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
                                                        <td align="right" colspan="2"><h1 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">SALES ORDER REPORT (SUPPLIES)</h1></td>
                                                    </tr>
                                                    <tr>
                                                        <td align="right">Period: </td>
                                                        <td align="right"><strong>From: <?=$from; ?> To: <?=$to; ?></strong></td> 
                                                    </tr>
                                                    <tr>

                                                    <tr>
                                                        <td align="right">Order Count: </td>
                                                        <td align="right"><strong id="order_count"></strong></td> 
                                                    </tr>
                                                    <tr>

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
                                
                                <?php
                                    $order_code_array = array();

                                    if($customer_id != 0) {
                                        $this->db->where('customer_id', $customer_id);
                                    }
                                    if($status != 'All') {
                                        $this->db->where('status', $status);
                                    }
                                    $this->db->select('so_code');
                                    $this->db->from('sales_order');
                                    $this->db->distinct();
                                    $order_code_q = $this->db->get();
                                    $order_code_query = $order_code_q->result_array();
                                    
                                    // Batch load ALL sales_order data
                                    if($customer_id != 0) {
                                        $this->db->where('customer_id', $customer_id);
                                    }
                                    if($status != 'All') {
                                        $this->db->where('status', $status);
                                    }
                                    $all_orders = $this->db->get('sales_order')->result_array();
                                    $orders_by_so = [];
                                    foreach($all_orders as $ord) {
                                        $orders_by_so[$ord['so_code'] ?? ''][] = $ord;
                                    }
                                    
                                    // Batch load all customers
                                    $customer_ids = !empty($all_orders) ? array_unique(array_column($all_orders, 'customer_id')) : [];
                                    $all_customers = !empty($customer_ids) ? $this->db->where_in('customer_id', $customer_ids)->get('customers')->result_array() : [];
                                    $customers_map = !empty($all_customers) ? array_column($all_customers, 'customer_name', 'customer_id') : [];
                                    
                                    // Batch load all items
                                    $item_ids = !empty($all_orders) ? array_unique(array_column($all_orders, 'item_id')) : [];
                                    $all_items = !empty($item_ids) ? $this->db->where_in('item_id', $item_ids)->get('items')->result_array() : [];
                                    $items_map = !empty($all_items) ? array_column($all_items, 'item_name', 'item_id') : [];  
                                 ?>
                                <div class="row">
                                    <div class="table table-responsive">
                                    <table class="table table-bordered table-striped" id="invoice_table" style="width:100%; border-collapse:collapse;  margin-top: 10px;">
                                        <thead style="background-color: #4242ad; padding: 30px;">
                                            <tr style="height: 30px; border-right: 1px solid #000;">
                                                <th style="text-align: left">Date</th>
                                                <th style="text-align: left">Order</th>
                                                <th style="text-align: left">Customer</th>
                                                <th style="text-align: left">Status</th>
                                                <th style="text-align: right">Quantity Bought</th>
                                                <th style="text-align: right">Quantity Picked</th>
                                                <th style="text-align: right">Amount (<?=$currency; ?>)</th>
                                                <!--<th style="text-align: right">Amount Due (<?=$currency; ?>)</th>-->
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php 
                                                $total_quantity = 0;
                                                $total_quantity_bought = 0;
                                                $total_amount = 0;
                                                $total_due = 0;

                                                $grand_quantity = 0;
                                                $grand_quantity_bought = 0;
                                                $grand_amount = 0;
                                                $grand_due = 0;
                                                $order_counter = 0;

                                                foreach($order_code_query as $q):
                                                    array_push($order_code_array, $q['so_code']);
                                                    
                                                    // Use pre-loaded data
                                                    $orders_array = $orders_by_so[$q['so_code'] ?? ''] ?? [];
                                                    if(empty($orders_array)) continue;
                                                    
                                                    $amount_due = $orders_array[0]['amount_due'] ?? 0;
                                                    $date = $orders_array[0]['date'] ?? '';
                                                    $customer_id_in = $orders_array[0]['customer_id'] ?? 0;
                                                    $status_in = $orders_array[0]['status'] ?? '';

                                                    //find total amount and quantity
                                                    foreach($orders_array as $order) {
                                                        $total_quantity += $order['quantity_picked'] ?? 0;
                                                        $total_quantity_bought += $order['quantity'] ?? 0;
                                                        $total_amount += $order['amount'] ?? 0;
                                                    }
                                                    $total_due += $orders_array[0]['amount_due'] ?? 0;
                                            ?>
                                          <tr ondblclick="deselect_all()" onclick="populate_links('<?= $q['so_code']?>')" id="order_code_<?= $q['so_code']; ?>">
                                            <td><?= $date; ?></td>
                                            <td><?= $q['so_code']; ?></td>
                                            <td><?= $customers_map[$customer_id_in] ?? 'Unknown'; ?></td>
                                            <td><?= $status_in; ?></td>
                                            <td align="right"><strong><?= number_format($total_quantity_bought, 0, '.', ','); ?></strong></td>
                                            <td align="right"><strong><?= number_format($total_quantity, 0, '.', ','); ?></strong></td>
                                            <td align="right"><strong><?= number_format($total_amount, 2, '.', ','); ?></strong></td>
                                            <!--<td align="right"><strong><?= number_format($amount_due, 2, '.', ','); ?></strong></td>-->
                                          </tr>

                                          <?php 
                                            //find grand total and amount
                                            $grand_quantity += $total_quantity;
                                            $grand_quantity_bought += $total_quantity_bought;
                                            $grand_amount += $total_amount;
                                            $grand_due += $total_due;

                                            //reset total quantity and amount to 0
                                            $total_quantity = 0;
                                            $total_quantity_bought = 0;
                                            $total_amount = 0;
                                            $total_due = 0;


                                            //count order
                                            $order_counter++;

                                           // }
                                            endforeach;
                                          ?>

                                          <tr>
                                              <td align="left" colspan="4"><strong>Total</strong></td>
                                              <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong><?= number_format($grand_quantity_bought, 0, '.', ','); ?></strong></td>
                                              <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong><?= number_format($grand_quantity, 0, '.', ','); ?></strong></td>
                                              <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong><?= numfmt_format_currency($fmt, $grand_amount, $currency); ?></strong></td>
                                              <!--<td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong><?= numfmt_format_currency($fmt, $grand_due, $currency); ?></strong></td>-->
                                          </tr>
                                        </tbody>
                                    </table>
                                </div>
                                <br>
                                <br>
                                <hr>

                                 <!--SUPPLY SUMMARY-->
                                <div class="table table-responsive">
                                    <table class="table table-bordered table-striped" id="order_summary" style="width:50%; border-collapse:collapse;  margin-top: 10px;">
                                        <caption><h2 style="text-align: left">SUPPLY SUMMARY</h2></caption>
                                        <thead style="background-color: #cecece; padding: 30px;">
                                            <tr style="height: 30px;">
                                                <th style="text-align: left">Date</th>
                                                <th style="text-align: left">Customer</th>
                                                <th style="text-align: left">Item</th>
                                                <th style="text-align: right">Quantity Supplied</th>
                                                <th style="text-align: right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            <?php 
                                            // Use pre-loaded items
                                            $order_items_array = [];
                                            foreach($item_ids as $iid) {
                                                $order_items_array[] = ['item_id' => $iid];
                                            }  

                                                //counters
                                                $item_total_quantity = 0;
                                                $item_quantity = 0;
                                                $total_quantity = 0;
                                                $quantity_in_stock = 0;
                                                 foreach($order_items_array as $item):
                                                    // Filter pre-loaded orders by item
                                                    $item_orders = array_filter($all_orders, function($o) use ($item) { 
                                                        return ($o['item_id'] ?? 0) == ($item['item_id'] ?? 0); 
                                                    });
                                                    
                                                    $customers_arr = [];
                                                    $seen = [];
                                                    foreach($item_orders as $io) {
                                                        $key = ($io['customer_id'] ?? 0).'_'.($io['so_id'] ?? 0);
                                                        if(!isset($seen[$key])) {
                                                            $customers_arr[] = ['customer_id' => $io['customer_id'] ?? 0, 'so_id' => $io['so_id'] ?? 0];
                                                            $seen[$key] = true;
                                                        }
                                                    }
                                                    
                                                    $item_name = $items_map[$item['item_id']] ?? 'Unknown';
                                                    
                                                    foreach($customers_arr as $c):
                                                        $customer_id_it = $c['customer_id'];
                                                        $customer_name = $customers_map[$customer_id_it] ?? 'Unknown';
                                                        
                                                        // Filter items for this customer and so_id
                                                        $items_array = array_filter($all_orders, function($o) use ($item, $c) {
                                                            $match = ($o['item_id'] ?? 0) == ($item['item_id'] ?? 0) && ($o['customer_id'] ?? 0) == ($c['customer_id'] ?? 0) && ($o['so_id'] ?? 0) == ($c['so_id'] ?? 0);
                                                            if($GLOBALS['customer_id'] != 0) {
                                                                $match = $match && $o['customer_id'] == $GLOBALS['customer_id'];
                                                            }
                                                            if($GLOBALS['status'] != 'All') {
                                                                $match = $match && $o['status'] == $GLOBALS['status'];
                                                            }
                                                            return $match;
                                                        });
                                                        
                                                        if(empty($items_array)) continue;
                                                        $first_item = reset($items_array);
                                                        $date = $first_item['date'] ?? '';
                                                        
                                                        //find total quantity
                                                        foreach($items_array as $it) {
                                                            $item_quantity += $it['quantity_picked'] ?? 0;
                                                        }

                                                        //ignore those with zero balances
                                                        if($item_quantity == 0) {
                                                            continue;
                                                        }

                                                        //get latest instock value for this item for the selected period
                                                       /* if($customer_id != 0) {
                                                            $this->db->where('customer_id', $customer_id);
                                                        }

                                                        if($status != 'All') {
                                                            $this->db->where('status', $status);
                                                        }

                                                        if($from != 0 && $to != 0) {
                                                            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                                        }
                                                        $this->db->where('item_id', $item['item_id']);
                                                        $this->db->select('so_id');
                                                        $this->db->from('sales_order');
                                                        $this->db->distinct();
                                                        $this->db->order_by('so_id', 'desc');
                                                        $this->db->limit(1);
                                                        $so_id = $this->db->get()->row()->so_id;;//

                                                        $in_stock = $this->db->get_where('sales_order', array('so_id' => $so_id))->row()->item_balance;*/

                                                        ?>

                                                        <tr>
                                                            <td align="left"><?=$date; ?></td>
                                                            <td align="left"><?=$customer_name; ?></td>
                                                            <td align="left"><?=$item_name; ?></td>
                                                            <td align="right"><?=number_format($item_quantity, 0, '.', ','); ?></td>
                                                        </tr>

                                                        
                                                        <?php

                                                        $total_quantity += $item_quantity;
                                                        //$quantity_in_stock += $in_stock;
                                                        $item_total_quantity += $item_quantity;
                                                        $item_quantity = 0; //reset value
                                                    
                                                    endforeach;

                                                    //ignore those with zero balances
                                                        if($item_total_quantity == 0) {
                                                            continue;
                                                        }
                                                    ?>
                                                        <tr>
                                                            <td></td>
                                                            <td></td>
                                                            <td></td>
                                                            <td><strong>Total of <?=$item_name; ?> =</strong></td>
                                                            <td align="right" style="border-top: 1px solid #000;"><strong><?=number_format($item_total_quantity, 0, '.', ','); ?></strong></td>
                                                        </tr>
                                                    <?php
                                                
                                                //reset item total quantity to 0 before moving to the next item
                                                $item_total_quantity = 0;
                                                endforeach;
                                            ?>
                                            <tr>
                                                <td align="left" colspan="4"><strong>Grand Total</strong></td>

                                                <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong><?=number_format($total_quantity, 0, '.', ',') ?> Items</strong></td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                                </div>
                                <br>

                                <?php 
                               /* foreach($customers_arr as $cc) {
                                    echo $cc['customer_id'].'<br>';
                                }*/
                                $number_of_orders = number_format($order_counter, 0, '.', ',').' '; 
                                $order_num = ' '.  $order_counter > 1?'Orders': 'Order'; 
                                ?>

                                <footer class="footer">
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
                                                        <th style="text-align: right;"><?=numfmt_format_currency($fmt, $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->amount_paid, $currency); ?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Balance Due: </th>
                                                        <th style="text-align: right;" width="160"><?=numfmt_format_currency($fmt, $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->amount_due, $currency); ?></th>
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
        $('#order_count').html('<?php echo $number_of_orders . $order_num; ?>');
    });
    

   
 function PrintElem(elem)
    {
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', '', '');
        mywindow.document.write('<!doctype html><html><head><title>INVOICES REPORT</title>');
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

