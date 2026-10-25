
<!doctype html>
<html>
    <head>
        <title><?=$page_title;?></title>
        <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
        <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css'); ?>"/>
        <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png'); ?>">
        <!--Chartjs-->
        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js'); ?>" type="text/javascript"></script>

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
//Account section
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$system_name = $this->db->get_where('settings', array('type' => 'system_name'))->row()->description;
$location = $this->db->get_where('settings', array('type' => 'location'))->row()->description;
$address = $this->db->get_where('settings', array('type' => 'address'))->row()->description;
$phone = $this->db->get_where('settings', array('type' => 'phone'))->row()->description;

//get all the accounts names
$this->db->select('name');
$this->db->distinct();
$this->db->order_by('name', 'asc');
$account_names_query = $this->db->get('accounts');
$account_names = $account_names_query->result_array();

if ($from == 0 && $to == 0) {
	$this->db->select('date_timestamp');
	$this->db->from('payment_with_goods');
	$this->db->order_by('date_timestamp', 'asc');
	$this->db->limit(1);
	$from = date('d-m-Y', $this->db->get()->row()->date_timestamp); //

	$to = date('d-m-Y');
}

?>



    <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css'); ?>"/>
    <!--Chartjs-->
    <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js'); ?>" type="text/javascript"></script>
    <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>

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
                width: 130% !important;
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

        <page size="A4" style="page-break-before: always">
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
                                           <img class="" src="<?php echo base_url(); ?>uploads/school_logo.png" style="max-height : 80px;">
                                        </td>
                                        <td>
                                            <h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;"><?php echo $system_name; ?></h3>
                                            <pre>
                                                <h4 style="font-family: Nunito" align='left'><?php echo trim($address); ?></h4>
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
                                            <td align="right" colspan="2"><h1 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;"><?=$page_title;?></h1></td>
                                        </tr>
                                        <tr>
                                            <td align="right">Period: </td>
                                            <td align="right"><strong>From: <?=$from;?> To: <?=$to;?></strong></td>
                                        </tr>
                                        <tr>

                                        
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

                               

        <!--SUPPLY SUMMARY-->

    <div class="table table-responsive">
    <table class="table table-bordered table-striped" id="order_summary" style="width:100%; border-collapse:collapse;  margin-top: 10px;">
    <caption><h2 style="text-align: left">SUPPLY SUMMARY</h2></caption>
    <thead style="background-color: #cecece; padding: 30px;">
        <tr style="height: 30px;">
            <th style="text-align: left; padding: 0px 5px">Date</th>
            <th style="text-align: left; padding: 0px 5px">Customer</th>
            <th style="text-align: left; padding: 0px 5px">Item</th>
            <th style="text-align: right; padding: 0px 5px">Quantity Supplied</th>
            <th style="text-align: right; padding: 0px 5px">Sub-Total</th>
            <th style="text-align: right; padding: 0px 5px">Total</th>
        </tr>
    </thead>
    <tbody>
        <?php

//add transferred items which seem not to be in the payment with goods table during this search but in items transferred table
$tr_items_ids = array();
$order_items_ids = array();
$not_found_item_ids = array();

if ($from != 0 && $to != 0) {
	$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
}
$this->db->select('item_id');
$this->db->distinct();
$this->db->from('items_transfers');
$tr_items_ids_array = $this->db->get()->result_array();

foreach ($tr_items_ids_array as $tr_item) {
	array_push($tr_items_ids, $tr_item['item_id']);
}

//for transfer

/////////////////////////////////////////////////////////////
if ($customer_id != 0) {
	$this->db->where('customer_id', $customer_id);
}

if ($item_id != 0) {
	$this->db->where('item_id', $item_id);
}

if ($status != 'All') {
	$this->db->where('status', $status);
}

if ($from != 0 && $to != 0) {
	$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
}

if ($type_of_sales != '0') {
	$this->db->where('type_of_sales', $type_of_sales);
}

$this->db->select('item_id');
$this->db->where('opening_entry', 0);
$this->db->order_by('date_timestamp', 'asc');
$this->db->distinct();
$this->db->from('payment_with_goods');

//$this->db->distinct();
$order_items_query_n = $this->db->get(); //
$order_items_array_n = $order_items_query_n->result_array(); //for order

foreach ($order_items_array_n as $item_n) {
	array_push($order_items_ids, $item_n['item_id']); //collect the ids here
}

////////////////////////////////Main entry /////////////////////////////////////////////////////////////
$this->db->select('category_id');
$this->db->from('items');
if ($item_id != 0) {
	$this->db->where('item_id', $item_id);
}
$this->db->distinct();
$all_item_category_query = $this->db->get(); //
$all_item_category_array = $all_item_category_query->result_array();

$grand_total_available = 0;

foreach ($all_item_category_array as $cat):
	$category_name = $this->db->get_where('item_category', array('category_id' => $cat['category_id']))->row()->category_name;

	echo '<tr id="this_' . $cat['category_id'] . '">
        <td colspan="6"><strong style="font-size: 16px;">' . $category_name . '</strong></td>
    </tr>';

	if ($customer_id != 0) {
		$this->db->where('customer_id', $customer_id);
	}

	if ($item_id != 0) {
		$this->db->where('payment_with_goods.item_id', $item_id);
	}

	if ($status != 'All') {
		$this->db->where('status', $status);
	}

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}

	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}

	$this->db->select('payment_with_goods.item_id');
	$this->db->where('opening_entry', 0);
	$this->db->distinct();
	$this->db->join('items', 'items.item_id = payment_with_goods.item_id');
	$this->db->where('category_id', $cat['category_id']);
	$this->db->order_by('payment_with_goods.date_timestamp', 'asc');
	$this->db->from('payment_with_goods');

	//$this->db->distinct();
	$order_items_query = $this->db->get(); //
	$order_items_array = $order_items_query->result_array();

	//counters
	$item_total_quantity = 0;
	$item_quantity = 0;
	$total_quantity = 0;
	$quantity_in_stock = 0;
	foreach ($order_items_array as $item):

		//select customers
		$this->db->select('customer_id, so_id');

		if ($from != 0 && $to != 0) {
			$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
		}
		if ($type_of_sales != '0') {
			$this->db->where('type_of_sales', $type_of_sales);
		}
		$this->db->where('item_id', $item['item_id']);
		$this->db->where('opening_entry', 0);
		//$this->db->not_like('so_code', 'Opening-');
		$this->db->from('payment_with_goods');
		$customers_arr = $this->db->get()->result_array();

		foreach ($customers_arr as $c):


			$item_name = $this->db->get_where('items', array('item_id' => $item['item_id']))->row()->item_name;

            

			//find other data
			if ($from != 0 && $to != 0) {
				$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
			}
			if ($type_of_sales != '0') {
				$this->db->where('type_of_sales', $type_of_sales);
			}
			$this->db->where('opening_entry', 0);
			$query_row  = $this->db->get_where('payment_with_goods', array('item_id' => $item['item_id'], 'customer_id' => $c['customer_id'], 'so_id' => $c['so_id']))->row();

            $date = $query_row->date;

			$customer_id_it = $c['customer_id'];
			$customer_name = $this->db->get_where('customers', array('customer_id' => $customer_id_it))->row()->customer_name;

            //unit sales order
            $order_item_has_unit_sales = $query_row->order_item_has_unit_sales;
            $unit_id = $query_row->unit_id;

            $unitName = '';

            if($order_item_has_unit_sales > 0) {
                //it has been sold in unit
                $unitName = $this->crud_model->getUnitNameById($unit_id);

            }

			//another query
			if ($customer_id != 0) {
				$this->db->where('customer_id', $customer_id);
			} else {
				$this->db->where('customer_id', $customer_id_it);
			}

			if ($item_id != 0) {
				$this->db->where('item_id', $item_id);
			}

			if ($status != 'All') {
				$this->db->where('status', $status);
			}

			if ($from != 0 && $to != 0) {
				$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
			}
			if ($type_of_sales != '0') {
				$this->db->where('type_of_sales', $type_of_sales);
			}
			$this->db->where('opening_entry', 0);
			$items = $this->db->get_where('payment_with_goods', array('item_id' => $item['item_id'], 'customer_id' => $c['customer_id'], 'so_id' => $c['so_id']));
			$items_array = $items->result_array();

			//find total quantity
			foreach ($items_array as $it) {
				$item_quantity += $it['quantity_picked'];
			}

			//ignore those with zero balances
			if ($item_quantity == 0) {
				continue;
			}

			
?>

    <tr style="border-bottom: 1px solid #000;">
        <td align="left"><?=$date;?></td>
        <td align="left"><?=$customer_name;?></td>
        <td align="left"><?=$item_name;?> <mark><?=$unitName;?></mark></td>
        <td align="right"><?=number_format($item_quantity, 0, '.', ',');?></td>
    </tr>




    <?php

        $total_quantity += $item_quantity;
        //$quantity_in_stock += $in_stock;
        $item_total_quantity += $item_quantity;
        $item_quantity = 0; //reset value

        endforeach;

        //TOTAL TRANSFERS
        if ($from != 0 && $to != 0) {
        $this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
        }

        if ($item_id != 0) {
        $this->db->where('item_id', $item_id);
        }

        $this->db->where('item_id', $item['item_id']);
        $this->db->select_sum('quantity');
        $this->db->from('items_transfers');
        $total_q_transfer = $this->db->get()->row()->quantity;

        //
        if ($from != 0 && $to != 0) {
        $this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
        }

        if ($item_id != 0) {
        $this->db->where('item_id', $item_id);
        }

        $this->db->where('item_id', $item['item_id']);
        $this->db->select('*');
        $this->db->from('items_transfers');
        $transfer_query = $this->db->get();

        $transfer_date = $transfer_query->row()->date;
        $transfer_receiver = $transfer_query->row()->receiver;

        if ($total_q_transfer != 0 || $total_q_transfer != '') {

        $total_quantity += $total_q_transfer;
        ?>

                                <tr style="border-bottom: 1px solid #000;">
                                    <td align="left"><?=$transfer_date;?></td>
                                    <td align="left">TRANSFER TO <?=$transfer_receiver;?></td>
                                    <td align="left"><?=$item_name;?></td>
                                    <td align="right"><?=number_format($total_q_transfer, 0, '.', ',');?></td>
                                </tr>

                                <?php //end of transfer
        }

        //ignore those with zero balances
        if ($item_total_quantity == 0) {
        continue;
        }

        //preventing displaying those items with 0 quantities
        $display = '';
        if (($item_total_quantity + $total_q_transfer) == 0) {
        $display = 'style="display:none"';

        }

        ?>
            <tr <?=$display;?>>
                <td></td>
                <td></td>
                <td></td>
                <td><strong>TOTAL OF <?=$item_name;?> =</strong></td>
                <td align="right" style="border-top: 1px solid #000;"><strong><?=number_format(($item_total_quantity + $total_q_transfer), 0, '.', ',');?></strong></td>
            </tr>
                                                                                                                <?php

        //reset item total quantity to 0 before moving to the next item
        $item_total_quantity = 0;

        endforeach; //end of ids found in the order table

        //if some of the transfer items are not found in the order table, then
        array_unique($order_items_ids, SORT_NUMERIC);

        $not_found_item_ids = array_diff($tr_items_ids, $order_items_ids);
        array_unshift($not_found_item_ids);

        //print_r($not_found_item_ids);
        for ($tr = 0; $tr < count($not_found_item_ids); $tr++) {

        //which category does it belong?
        $cat_id = $this->db->get_where('items', array('item_id' => $not_found_item_ids[$tr]))->row()->category_id;

        if ($cat_id == $cat['category_id']): //show this entry under the correct category

        //TOTAL TRANSFERS
        if ($from != 0 && $to != 0) {
        $this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
        }

        if ($item_id != 0) {
        $this->db->where('item_id', $item_id);
        }

        $this->db->where('item_id', $not_found_item_ids[$tr]);
        $this->db->select_sum('quantity');
        $this->db->from('items_transfers');
        $total_q_transfer_n = $this->db->get()->row()->quantity;

        //
        if ($from != 0 && $to != 0) {
        $this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
        }

        if ($item_id != 0) {
        $this->db->where('item_id', $item_id);
        }

        $this->db->where('item_id', $not_found_item_ids[$tr]);
        $this->db->select('*');
        $this->db->from('items_transfers');
        $transfer_query_n = $this->db->get();

        $transfer_date_n = $transfer_query_n->row()->date;
        $transfer_receiver_n = $transfer_query_n->row()->receiver;

        $item_name_n = $this->db->get_where('items', array('item_id' => $not_found_item_ids[$tr]))->row()->item_name;


        if ($total_q_transfer_n != 0 || $total_q_transfer_n != '') {

        $total_quantity += $total_q_transfer_n;

        //preventing displaying those items with 0 quantities
        $display = '';
        if ($total_q_transfer_n == 0) {
        $display = 'display: none';
        }
        ?>    <tr style="border-bottom: 1px solid #000; <?=$display;?>">
            <td align="left"><?=$transfer_date_n;?></td>
            <td align="left">TRANSFER TO <?=$transfer_receiver_n;?></td>
            <td align="left"><?=$item_name_n;?></td>
            <td align="right"><?=number_format($total_q_transfer_n, 0, '.', ',');?></td>
        </tr>

        <?php
        }
        //preventing displaying those items with 0 quantities
        $display = '';
        if ($total_q_transfer_n == 0) {
        $display = 'display: none';
        }
        ?>
        <tr style="<?=$display;?>">
            <td></td>
            <td></td>
            <td></td>
            <td><strong>TOTAL OF <?=$item_name_n.' ('.$not_found_item_ids[$tr].')';?> =</strong></td>
            <td align="right" style="border-top: 1px solid #000;"><strong><?=number_format(($total_q_transfer_n), 0, '.', ',');?></strong></td>
        </tr>
        <?php
        endif; //finish

        }

        //preventing displaying those items with 0 quantities
        $display = '';
        if ($total_quantity == 0) {
        	$display = 'display: none';

        	?>
                                        <script type="text/javascript">
                                            //hide the category name if there is no quantity
                                            $("#this_<?=$cat['category_id'];?>").css('display', 'none');
                                        </script>


                                                <?php
        }
        ?>
                                    <tr style="<?=$display;?>">
                                        <td align="left" colspan="5"><strong>Grand Total</strong></td>

                                        <td align="right" style="border-top: 1px solid #000; border-style: double none;"><strong><?=number_format($total_quantity, 0, '.', ',');?> <?=$total_quantity > 1 ? ' Items' : ' Item';?></strong></td>
                                    </tr>

                                    <tr style="border-bottom: 1px solid #000; <?=$display;?>"><td colspan="6"></td></tr>

                                    <?php

        endforeach;
        ?>
                                        </tbody>
                                    </table>
                                </div>
                                </div>
                                <br>

                                <?php
/* foreach($customers_arr as $cc) {
echo $cc['customer_id'].'<br>';
}*/
$number_of_orders = number_format($order_counter, 0, '.', ',') . ' ';
$order_num = ' ' . $order_counter > 1 ? 'Orders' : 'Order';
?>

                                <footer class="footer" style="position: fixed; bottom: -35px">
                                    <div>
                                        <div>
                                         <!--   <table class="table table-bordered table-striped" style="width:100%; border-collapse:collapse; margin-top: 10px;">
                                                <thead>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Grand Total: </th>
                                                        <th style="text-align: right;"><?//=numfmt_format_currency($fmt, $grand_total, $currency);?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Amount Paid: </th>
                                                        <th style="text-align: right;"><?//=numfmt_format_currency($fmt, $this->db->get_where('payment_with_goods', array('so_code' => $so_code))->row()->amount_paid, $currency);?></th>
                                                    </tr>
                                                    <tr style="height: 30px;">
                                                        <th colspan="6" style="text-align: right;">Balance Due: </th>
                                                        <th style="text-align: right;" width="160"><?//=numfmt_format_currency($fmt, $this->db->get_where('payment_with_goods', array('so_code' => $so_code))->row()->amount_due, $currency);?></th>
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
        mywindow.document.write('<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.css'); ?>" />');
        mywindow.document.write('<script src="<?php echo base_url('assets/css/chartjs/dist/Chart.js'); ?>" type="text\/javascript"><\/script>');
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

