<?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$order_code_array = array();

if ($customer_id != 0) {
	$this->db->where('customer_id', $customer_id);
}

if ($item_id != 0) {
	$this->db->where('item_id', $item_id);
}

if ($type_of_sales != '0') {
	$this->db->where('type_of_sales', $type_of_sales);
}

if ($status != 'All') {
	$this->db->where('status', $status);
}
if ($from != 0 && $to != 0) {
	$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
}

$this->db->where('opening_entry', 0);

$this->db->select('timestamp');
$this->db->from('payment_with_goods');
$this->db->distinct();
//$this->db->order_by('timestamp', 'desc');
$order_code_query = $this->db->get()->result_array();

//for calculating the grand totals below
if ($customer_id != 0) {
	$this->db->where('customer_id', $customer_id);
}

if ($item_id != 0) {
	$this->db->where('item_id', $item_id);
}

if ($type_of_sales != '0') {
	$this->db->where('type_of_sales', $type_of_sales);
}

if ($status != 'All') {
	$this->db->where('status', $status);
}
if ($from != 0 && $to != 0) {
	$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
}
$this->db->where('opening_entry', 0);
$this->db->select('so_code');
$this->db->distinct();
$this->db->from('payment_with_goods');
$this->db->distinct();
$summation_array = $this->db->get()->result_array();

?>
    <div class="row">
        <table class="table" width="100%" id="order_list">
            <thead class="bg-info">
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Waybill</th>
                <th>Status</th>
                <th>Sales Type</th>
                <th style="text-align: right">Qty Sold</th>
                <th style="text-align: right">Total Amt</th>
                <th style="text-align: right">Qty Picked</th>
                <th style="text-align: right">Total Picked</th>
                <th style="text-align: right">Qty Left</th>
                <th style="text-align: right">Due Amt</th>
                <th style="text-align: right">Paid</th>
                <th style="text-align: right">Balance</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
              <?php
$total_quantity = 0;
$quantity_due_amount = 0;
$total_amount = 0;
$grand_quantity = 0;
$grand_amount = 0;
$order_counter = 0;
$grand_order_counter = 0;

foreach ($order_code_query as $qt):

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	if ($customer_id != 0) {
		$this->db->where('customer_id', $customer_id);
	}
	if ($item_id != 0) {
		$this->db->where('item_id', $item_id);
	}
	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}
	if ($status != 'All') {
		$this->db->where('status', $status);
	}
	$this->db->where('opening_entry', 0);
	$q['so_code'] = $this->db->get_where('payment_with_goods', array('timestamp' => $qt['timestamp']))->row()->so_code;

	//$so_id = $this->db->get_where('payment_with_goods', array('timestamp' => $qt['timestamp']))->row()->so_id;
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	if ($customer_id != 0) {
		$this->db->where('customer_id', $customer_id);
	}
	if ($item_id != 0) {
		$this->db->where('item_id', $item_id);
	}
	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}
	if ($status != 'All') {
		$this->db->where('status', $status);
	}
	$this->db->where('opening_entry', 0);
	$track_code = $this->db->get_where('payment_with_goods', array('timestamp' => $qt['timestamp']))->row()->track_code;

	array_push($order_code_array, $qt['timestamp']);

	//$this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}

	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}
	$this->db->where('opening_entry', 0);
	$orders = $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code'], 'timestamp' => $qt['timestamp']));
	$orders_array = $orders->result_array();

	$amount_due = $orders->row()->amount_due;

	//find total amount and quantity
	foreach ($orders_array as $order) {
		$total_quantity = $order['total_quantity'];
		$total_amount = $order['grand_total'];
		$quantity_due_amount += $order['price'] * $order['quantity_due'];
		$total_amount_paid = $order['amount_paid'];
	}

	//sum of quantity due
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}
	$this->db->select_sum('quantity_due');
	$this->db->where('so_code', $q['so_code']);
	$this->db->where('timestamp', $qt['timestamp']);
	$this->db->where('opening_entry', 0);
	$quantity_due = $this->db->get('payment_with_goods')->row()->quantity_due;

	//find other data
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$this->db->where('opening_entry', 0);
	$date = date('d-m-Y H:i:s', $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code'], 'timestamp' => $qt['timestamp']))->row()->timestamp);

	//find other data
	/*if($from != 0 && $to != 0) {
		          $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
		      }
		    $this->db->where('opening_entry', 0);
	*/

	$this->db->where('timestamp <=', $qt['timestamp']);
	$this->db->select_sum('quantity_picked');
	$grand_quantity_picked = $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code']))->row()->quantity_picked;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}
	$this->db->where('opening_entry', 0);
	$data_query_row = $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code']))->row();

	$customer_id = $data_query_row->customer_id;
	$order_type = $data_query_row->negative_or_goods;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}
	$this->db->where('opening_entry', 0);
	$other_query_row = $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code'], 'timestamp' => $qt['timestamp']))->row();

	$status = $other_query_row->status;
	$sales_person_id = $other_query_row->sales_person_id;
	$waybill_code = $other_query_row->waybill_code;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}
	$this->db->where('opening_entry', 0);
	$sales_person_id = $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code'], 'timestamp' => $qt['timestamp']))->row()->sales_person_id;

	//q_picked
	$this->db->select_sum('quantity_picked');
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	if ($type_of_sales != '0') {
		$this->db->where('type_of_sales', $type_of_sales);
	}
	$this->db->where('opening_entry', 0);
	$this->db->where(array('so_code' => $q['so_code'], 'timestamp' => $qt['timestamp']));
	$q_picked = $this->db->get('payment_with_goods')->row()->quantity_picked;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$this->db->where('opening_entry', 0);
	$type_of_sales_2 = $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code'], 'timestamp' => $qt['timestamp']))->row()->type_of_sales;

	$sales_person = $this->db->get_where('admin', array('admin_id' => $sales_person_id))->row()->name;

	//for removing the edit button of rows that have been edited earlier than the current row
	if ($customer_id != 0) {
		$this->db->where('customer_id', $customer_id);
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
	$this->db->select_max('timestamp');
	$this->db->from('payment_with_goods');
	$this->db->where('so_code', $q['so_code']);
	$max_timestamp = $this->db->get()->row()->timestamp;

	?>
		      <tr ondblclick="deselect_all()" onclick="populate_links('<?=$q['so_code']?>', '<?=$order_type;?>', '<?=$qt['timestamp'];?>', '<?=$track_code;?>', '<?=$max_timestamp;?>')" id="order_code_<?=$qt['timestamp'];?>">
		        <td><?=$date;?></td>
		        <td><?=$q['so_code'];?></td>
		        <td><?=$this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name;?></td>
		        <td><?=$waybill_code;?></td>
		        <td><?=$status;?></td>
		        <td><?=$type_of_sales_2;?></td>

		        <td align="right"><strong><?=number_format($total_quantity, 0, '.', ',');?></strong></td>

											                <?php
	//if it is payables, check if it has any new payment made in the payment table
	if ($type_of_sales_2 == 'Payables') {

		if ($from != 0 && $to != 0) {
			$this->db->where('timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
		}
		$paid_query = $this->db->get_where('payment', array('so_code' => $q['so_code'], 'track_code' => $track_code));

		if ($paid_query->num_rows() > 0) {

			if ($from != 0 && $to != 0) {
				$this->db->where('timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
			}
			$this->db->select_sum('amount');
			$total_amount_paid = $this->db->get_where('payment', array('so_code' => $q['so_code']))->row()->amount;
			//$total_amount = 0;
		} else {
			//$total_amount = 0;
			$total_amount_paid = 0;
		}

	}
	?>

    <td align="right"><strong><?php echo number_format($total_amount, 2, '.', ',') ?></td>

    <td align="right"><strong><?=number_format(($q_picked), 0, '.', ',');?></strong></td>
    <td align="right"><strong><?=number_format(($grand_quantity_picked), 0, '.', ',');?></strong></td>
    <td align="right"><strong><?=number_format($quantity_due, 0, '.', ',');?></strong></td>
    <td align="right"><strong><?=number_format($quantity_due_amount, 2, '.', ',');?></strong></td>
    <td align="right"><strong><?php if ($type_of_sales_2 == 'Payables' && $paid_query->num_rows() < 1) {echo '-';} else {echo number_format($total_amount_paid, 2, '.', ',');}?></strong></td>
    <td align="right"><strong><?=number_format($amount_due, 2, '.', ',');?></strong></td>
    <td><strong><?=$sales_person;?></strong></td>
  </tr>

  <?php

	//find grand total and amount
	/* $grand_quantity += $total_quantity;
		    $grand_amount += $total_amount;
	*/

	//reset total quantity and amount to 0
	$total_quantity = 0;
	$total_amount = 0;
	$quantity_due_amount = 0;
	$order_counter = 0;

	$grand_quantity += $q_picked;

endforeach;

//find total amount and quantity

foreach ($summation_array as $sm) {

	//$grand_quantity += $cal['quantity'];
	$this->db->not_like('so_code', 'Opening-', 'after');
	$grand_amount += $this->db->get_where('payment_with_goods', array('so_code' => $sm['so_code']))->row()->grand_total;
	//count order
	$order_counter++;
}

?>
            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-2 col-sm-2 text-lg-left"><strong><?php echo number_format($order_counter, 0, '.', ',') . ' ';
echo ' ' . $order_counter > 1 ? 'Orders' : 'Order'; ?></strong></div>

            <div class="col-md-6 col-sm-6 text-lg-left"><strong>Total Quantity Picked: <?=number_format($grand_quantity, 0, '.', ',');?></strong></div>

            <!--<div class="col-md-6 col-sm-6 text-lg-left"><strong>Total Amount: <?=numfmt_format_currency($fmt, $grand_amount, $currency);?></strong></div>-->

    </div>


    <script type="text/javascript">
    $(function() {
        $('#order_list').DataTable();
        $('#edit_div').slideDown('fast');

    });

    function populate_links(id, order_type, timestamp, track_code, max_timestamp) {
        //call the buttons enabled function immediately
        if(max_timestamp == timestamp) {
            buttons_enabled();

        } else {
            buttons_enabled();
            $('#soedit').attr('disabled', 'disabled');
            //$('#sopreview').attr('disabled', 'disabled');

        }
        //get all order codes
        let order_code_array = <?php echo json_encode($order_code_array); ?>;

        for(i = 0; i < order_code_array.length; i++) {

            //check which table row is clicked
            if(timestamp == order_code_array[i]) {

                //change the background of the row
                $('#order_code_' + timestamp).removeAttr('class');
                $('#order_code_' + timestamp).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button

                if(max_timestamp == timestamp) {//only if the current row is selected

                    $('#soedit').attr("onclick", "can_edit_order('"+ id +"', '"+ order_type +"', '"+ timestamp +"', '"+ track_code +"', '"+ max_timestamp +"')");

                } else {

                    showAjaxModal_confirm('Sorry you cannot edit this delivery. There seems to be a newest delivery with the same order code. Look for it and edit it or delete the whole order.', 'Error');

                    //auto close the modal after 5 seconds
                    setTimeout(() => {
                      $('#modal_confirm').click();
                    }, 7000);
                }

                //refund button
                $('#sorefund').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/refund_sales_order/'); ?>" + id + "', 'Refund Sales Order')");


                //preview button
                $('#sopreview').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/preview_order/'); ?>" + id + "', 'Preview Sales Order')");

                //delete button

                $('#sodelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/sales_order/delete/'); ?>" + id + "', 'Are you sure you want to delete this Sales Order? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < order_code_array.length; j++) {
                    if(order_code_array[j] != timestamp) {
                        $('#order_code_' + order_code_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        let order_code_array = <?php echo json_encode($order_code_array); ?>;

        for(i = 0; i < order_code_array.length; i++) {
            $('#order_code_' + order_code_array[i]).removeAttr('style');
        }
    }

    //restrict editing of orders which have more than one payment transaction related
    function can_edit_order(so_code, order_type, timestamp, track_code) {
        //send ajax query to check how many payments are related with this order

        $.ajax({
            url: '<?php echo site_url('admin/can_edit_order/') ?>' + so_code + '/sales',
            type: 'POST',
            dataType: 'json',
            cache: false,
        })
        .done(function(response) {
            if(response.response == 'yes') {
                $('.close').click();

                //check if it is payment with goods order or payment for negative balance order or just a normal sales order
                if(order_type == 'negative') {
                    //launch the negative balance order editor
                    showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order_negative_bal/'); ?>' + so_code, 'Edit Payment With Goods (Cash Creditor)');

                } else if(order_type == 'goods') {
                    //check if this is the only copy of so code in the payment with goods table. if so, then the user is only trying to do normal editing, else he is editng payment with gooods order
                    if(response.goods_payment == 'goods_payment') {

                      //launch the payment with goods order editor
                      showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/payment_with_goods/'); ?>' + so_code + '/goods/' + timestamp + '/' + track_code, 'Edit Payment With Goods (Goods Creditor)');

                    } else {
                      //launch the normal order editor
                      showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>' + so_code, 'Edit Sales Order');
                    }


                } else {
                    //launch the normal order editor
                    showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>' + so_code, 'Edit Sales Order');
                }


            } else {
                showAjaxModal_confirm('You are not allowed to edit this Sales Order [' + so_code + '] because it is associated with more than one payment transaction. Delete any related payment and try again.', 'error');
            }
        });

    }



    </script>