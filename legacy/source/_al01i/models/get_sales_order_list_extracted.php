<?php

if (!defined('BASEPATH')) {
	exit('No direct script access allowed');
}

//get sales orders - OPTIMIZED
function get_sales_order_list($from = '', $to = '', $customer_id = '', $status = '', $type_of_sales = '', $item_id = '') {
	if ($this->session->userdata('admin_login') != 1) {
		redirect(site_url('login'), 'refresh');
	}

	$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
	$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

	$order_code_array = array();

	$columns = array(
		0 => 'date',
		1 => 'sales_order_code',
		2 => 'customer_name',
		3 => 'waybill_code',
		4 => 'status',
		5 => 'sales_type',
		6 => 'q_sold',
		7 => 'total_amount',
		8 => 'q_picked',
		9 => 'total_picked',
		10 => 'q_left',
		11 => 'due_amount',
		12 => 'amount_paid',
		13 => 'balance',
		14 => 'cashier',
		15 => 'item_id',
	);

	$limit = $this->input->post('length');
	$start = $this->input->post('start');
	$order = $columns[$this->input->post('order')[0]['column']];
	$dir = $this->input->post('order')[0]['dir'];

	$totalData = $this->ajaxload->all_sales_order_count($from, $to, $customer_id, $status, $type_of_sales, $item_id);
	$totalFiltered = $totalData;

	if (empty($this->input->post('search')['value'])) {
		$order_code_query = $this->ajaxload->all_sales_order($from, $to, $customer_id, $status, $type_of_sales, $item_id, $limit, $start, $order, $dir);
	} else {
		$search = $this->input->post('search')['value'];
		$order_code_query = $this->ajaxload->sales_order_search($from, $to, $customer_id, $status, $type_of_sales, $item_id, $limit, $start, $search, $order, $dir);
		$totalFiltered = $this->ajaxload->sales_order_search_count($from, $to, $customer_id, $status, $type_of_sales, $item_id, $search);
	}

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
	$summation_array = $this->db->get('payment_with_goods')->result_array();

	$data = array();
	$grand_quantity = 0;
	$grand_amount = 0;
	$order_counter = 0;

	// Pre-fetch lookups
	$customers = array();
	$items_cache = array();
	$admin_cache = array();
	
	foreach ($this->db->get('customers')->result() as $c) {
		$customers[$c->customer_id] = $c->customer_name;
	}
	foreach ($this->db->get('items')->result() as $i) {
		$items_cache[$i->item_id] = $i->item_name;
	}
	foreach ($this->db->get('admin')->result() as $a) {
		$admin_cache[$a->admin_id] = $a->name;
	}

	if (!empty($order_code_query)) {
		foreach ($order_code_query as $qt) {
			array_push($order_code_array, $qt['timestamp']);

			// Get all payment_with_goods data in one query
			$this->db->select('*');
			if ($from != 0 && $to != 0) {
				$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
			}
			$this->db->where('opening_entry', 0);
			$this->db->where('timestamp', $qt['timestamp']);
			if ($type_of_sales != '0') {
				$this->db->where('type_of_sales', $type_of_sales);
			}
			$orders = $this->db->get('payment_with_goods');
			$orders_array = $orders->result_array();
			
			if (empty($orders_array)) continue;
			
			$first_order = $orders_array[0];
			$q['so_code'] = $first_order['so_code'];
			$track_code = $first_order['track_code'];
			$cust_id = $first_order['customer_id'];
			$order_type = $first_order['negative_or_goods'];
			$status = $first_order['status'];
			$sales_person_id = $first_order['sales_person_id'];
			$waybill_code = $first_order['waybill_code'];
			$type_of_sales_2 = $first_order['type_of_sales'];
			$amount_due = $first_order['amount_due'];

			// Calculate from fetched data
			$total_quantity = 0;
			$total_amount = 0;
			$quantity_due_amount = 0;
			$total_amount_paid = 0;
			$quantity_due = 0;
			$q_picked = 0;
			
			foreach ($orders_array as $order) {
				$total_quantity = $order['total_quantity'];
				$total_amount = $order['grand_total'];
				$quantity_due_amount += $order['price'] * $order['quantity_due'];
				$total_amount_paid = $order['amount_paid'];
				$quantity_due += $order['quantity_due'];
				$q_picked += $order['quantity_picked'];
			}

			$date = '<strong>'.date('d-m-Y H:i:s', $first_order['timestamp']).'</strong>';

			$this->db->select_sum('quantity_picked');
			$this->db->where('timestamp <=', $qt['timestamp']);
			$this->db->where('so_code', $q['so_code']);
			$grand_quantity_picked = $this->db->get('payment_with_goods')->row()->quantity_picked;

			$sales_person = isset($admin_cache[$sales_person_id]) ? $admin_cache[$sales_person_id] : '';
			$sPosition = strpos($sales_person, ' ');
			if ($sPosition !== false) {
				$sales_person = substr($sales_person, 0, $sPosition);
			}

			$this->db->select_max('timestamp');
			$this->db->where('so_code', $q['so_code']);
			$this->db->where('opening_entry', 0);
			if ($from != 0 && $to != 0) {
				$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
			}
			$max_timestamp = $this->db->get('payment_with_goods')->row()->timestamp;

			if ($item_id != 0) {
				$this->db->where('item_id', $item_id);
			}
			$items_q = $this->db->get_where('sales_order', array('so_code' => $q['so_code']))->result_array();
			$item_names = '';
			$item_counter = count($items_q);

			foreach ($items_q as $item) {
				$unitName = '';
				if($item['unit_id'] != NULL && $item['unit_id'] != '') {
					$unitName = '<mark>'.$this->crud_model->getUnitNameById($item['unit_id']).'</mark>';
				}

				$item_name = isset($items_cache[$item['item_id']]) ? $items_cache[$item['item_id']] : '';
				$item_names .= $item_name.'-'.$item['quantity'].' '.$unitName;

				if (count($items_q) > 1 && $item_counter > 1) {
					$item_names .= '<br/>';
				}
				$item_counter--;
			}

			$invoiceCode = $this->crud_model->getInvoiceCodeBySoCode($q['so_code']);
			$customer_name = isset($customers[$cust_id]) ? $customers[$cust_id] : '';

			$nestedData['date'] = $date;
			$nestedData['sales_order_code'] = '<small><strong>'.$q['so_code'] . '</strong><br/>' . $item_names . '</small>';
			$nestedData['customer_name'] = '<strong>'.$customer_name.'</strong><br/>'.$date.'<br/>'.$nestedData['sales_order_code'];
			$nestedData['waybill_code'] = $waybill_code == '' ? 'INV: '.$invoiceCode : 'WB: '.$waybill_code.' / INV: '.$invoiceCode;
			$nestedData['status'] = $status;
			$nestedData['sales_type'] = $type_of_sales_2;
			$nestedData['q_sold'] = '<strong>' . number_format($total_quantity, 0, '.', ',') . '</strong>';

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
				} else {
					$total_amount_paid = 0;
				}
			}

			$nestedData['total_amount'] = '<strong>' . number_format($total_amount, 2, '.', ',') . '</strong>';
			$nestedData['q_picked'] = '<strong>' . number_format(($q_picked), 0, '.', ',') . '</strong>';
			$nestedData['total_picked'] = '<strong>' . number_format(($grand_quantity_picked), 0, '.', ',') . '</strong>';
			$nestedData['q_left'] = '<strong>' . number_format($quantity_due, 0, '.', ',') . '</strong>';
			$nestedData['due_amount'] = '<strong>' . number_format($quantity_due_amount, 2, '.', ',') . '</strong>';

			if ($type_of_sales_2 == 'Payables' && isset($paid_query) && $paid_query->num_rows() < 1) {
				$amount_paid = '-';
			} else {
				$amount_paid = number_format($total_amount_paid, 2, '.', ',');
			}

			$nestedData['amount_paid'] = '<strong>' . $amount_paid . '</strong>';
			$nestedData['balance'] = '<strong>' . number_format($amount_due, 2, '.', ',') . '</strong>';
			$nestedData['cashier'] = $sales_person;
			$nestedData['DT_RowId'] = 'order_code_' . $qt['timestamp'];
			$nestedData['onclick'] = "populate_links('" . $q['so_code'] . "', '" . $order_type . "', '" . $qt['timestamp'] . "', '" . $track_code . "', '" . $max_timestamp . "')";
			$nestedData['ondblclick'] = "deselect_all()";

			$data[] = $nestedData;
			$grand_quantity += $q_picked;
		}

		foreach ($summation_array as $sm) {
			$this->db->not_like('so_code', 'Opening-', 'after');
			$grand_amount += $this->db->get_where('payment_with_goods', array('so_code' => $sm['so_code']))->row()->grand_total;
			$order_counter++;
		}

		$order = $order_counter > 1 ? 'Orders' : 'Order';
		$bt_row['bottom_row'] = '
			            <div class="col-md-2 col-sm-2 text-lg-left"><strong>' . number_format($order_counter, 0, '.', ',') . ' ' . $order . '</strong></div>
			            <div class="col-md-6 col-sm-6 text-lg-left"><strong>Total Quantity Picked: ' . number_format($grand_quantity, 0, '.', ',') . '</strong></div>';

	}

	$json_data = array(
		"draw" => intval($this->input->post('draw')),
		"recordsTotal" => intval($totalData),
		"recordsFiltered" => intval($totalFiltered),
		"data" => $data,
		"so_codes" => $order_code_array,
		"bt_row" => $bt_row,
	);

	echo json_encode($json_data);
}
