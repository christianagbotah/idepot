<?php

if (!defined('BASEPATH')) {
	exit('No direct script access allowed');
}

class Crud_model extends CI_Model {

	function __construct() {
		parent::__construct();

	}

	function clear_cache() {
		$this->output->set_header('Cache-Control: no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
		$this->output->set_header('Pragma: no-cache');
	}

	//DELETE SUPPLIER
	function delete_supplier($supplier_id) {

		//LET SEE IF THIS SUPPLIER HAS ANY TRANSACTION RECORDED. WE DENY DELETE IF IT IS TRUE
		$tables_veri = array('general_journal', 'payment', 'purchase_order');
		$rows_counter = 0;
		for ($i = 0; $i < count($tables_veri); $i++) {
			$rows_found = $this->db->get_where($tables_veri[$i], array('supplier_id' => $supplier_id))->num_rows();

			$rows_counter += $rows_found;
		}

		if ($rows_counter < 1) {
			//we can delete

			//do some updates first
			//use this to update accounts payable account
			$total_payable_array = $this->db
				->select_sum('amount_due')
				->from('accounts_payable')
				->where('supplier_id', $supplier_id)
				->where('amount_due >', 0)
				->get()->result_array();

			$total_payable = 0;
			foreach ($total_payable_array as $row) {
				$total_payable += $row['amount_due'];
			}

			$accounts_payable_account_payment['current_balance'] = $total_payable;
			$this->db->where('name', 'Accounts Payable');
			$this->db->set('current_balance', 'current_balance -' . $accounts_payable_account_payment['current_balance'], FALSE);
			$this->db->update('accounts');

			//use this to update accounts receivable account
			$total_receivable_array = $this->db
				->select_sum('amount_due')
				->from('accounts_payable')
				->where('supplier_id', $supplier_id)
				->where('amount_due <', 0)
				->get()->result_array();

			$total_receivable = 0;
			foreach ($total_receivable_array as $row2) {
				$total_receivable += $row2['amount_due'];
			}

			$accounts_receivable_account_payment['current_balance'] = abs($total_receivable);
			$this->db->where('name', 'Accounts Receivable');
			$this->db->set('current_balance', 'current_balance -' . $accounts_receivable_account_payment['current_balance'], FALSE);
			$this->db->update('accounts');

			// deleting data of supplier from all associated tables
			$tables = array('suppliers', 'accounts_payable');

			for ($i = 0; $i < count($tables); $i++) {
				$this->db->delete($tables[$i], array('supplier_id' => $supplier_id));
			}

			//creditor owes us
			$this->db
				->where('supplier_id', $supplier_id)
				->where('amount_due <', 0)
				->delete('purchase_order');

			//we owe supplier
			$this->db
				->where('supplier_id', $supplier_id)
				->where('amount_due >', 0)
				->delete('purchase_order');

			//done, show confirmation flag
			$ajax_data['success'] = true;
			$ajax_data['user'] = 'Supplier';
			echo json_encode($ajax_data);

		} else {
			//restrict delete
			//done, show confirmation flag
			$ajax_data['success'] = false;
			$ajax_data['message'] = 'You cannot delete the supplier [' . $this->db->get_where('suppliers', array('supplier_id' => $supplier_id))->row()->supplier_name . '], because it has transactions associated with it. Delete the related transactions and try again. <mark>NB: <em>This can cause discrepancies in your account balances...</em><mark>';
			echo json_encode($ajax_data);
		}
	}

	//DELETE CUSTOMER
	function delete_customer($customer_id) {

		//LET SEE IF THIS CUSTOMER HAS ANY TRANSACTION RECORDED. WE DENY DELETE IF IT IS TRUE
		$tables_veri = array('general_journal', 'payment', 'sales_order');
		$rows_counter = 0;
		for ($i = 0; $i < count($tables_veri); $i++) {
			$rows_found = $this->db->get_where($tables_veri[$i], array('customer_id' => $customer_id))->num_rows();

			$rows_counter += $rows_found;
		}

		if ($rows_counter < 1) {
			//we can delete
			//do some updates first
			//use this to update accounts payable account for cash customer creditors
			$total_payable_array = $this->db
				->select_sum('amount_due')
				->from('invoice')
				->where('customer_id', $customer_id)
				->where('amount_due <', 0)
				->get()->result_array();

			$total_payable = 0;
			foreach ($total_payable_array as $row) {
				$total_payable += $row['amount_due'];
			}

			$accounts_payable_account_payment['current_balance'] = abs($total_payable);
			$this->db->where('name', 'Accounts Payable');
			$this->db->set('current_balance', 'current_balance -' . $accounts_payable_account_payment['current_balance'], FALSE);
			$this->db->update('accounts');

			//for customers who could not pick all their products from us
			//let's get the item ids that we have not yet delivered
			$this->db->select('item_id');
			$this->db->where('customer_id', $customer_id);
			$this->db->where('quantity_due >', 0);
			$item_ids_array = $this->db->get('sales_order')->result_array();

			//multiply the price and the quantity due for each
			$total_payable_to_customer = 0;
			foreach ($item_ids_array as $item) {

				//for price
				$this->db->where('customer_id', $customer_id);
				$this->db->where('quantity_due >', 0);
				$this->db->where('item_id', $item['item_id']);
				$price = $this->db->get('sales_order')->row()->price;

				//for quantity due
				$this->db->where('customer_id', $customer_id);
				$this->db->where('quantity_due >', 0);
				$this->db->where('item_id', $item['item_id']);
				$quantity_due = $this->db->get('sales_order')->row()->quantity_due;

				$total_payable_to_customer += $price * $quantity_due;
			} //done

			//update payable with the due amount
			$payable['current_balance'] = $total_payable_to_customer;
			$this->db->where('name', 'Accounts Payable');
			$this->db->set('current_balance', 'current_balance -' . $payable['current_balance'], FALSE);
			$this->db->update('accounts'); //end

			//use this to update accounts receivable account
			$total_receivable_array = $this->db
				->select_sum('amount_due')
				->from('invoice')
				->where('customer_id', $customer_id)
				->where('amount_due >', 0)
				->get()->result_array();

			$total_receivable = 0;
			foreach ($total_receivable_array as $row2) {
				$total_receivable += $row2['amount_due'];
			}

			$accounts_receivable_account_payment['current_balance'] = $total_receivable;
			$this->db->where('name', 'Accounts Receivable');
			$this->db->set('current_balance', 'current_balance -' . $accounts_receivable_account_payment['current_balance'], FALSE);
			$this->db->update('accounts');

			// deleting data of customer from all associated tables
			$tables = array('customers', 'invoice', 'prices');

			for ($i = 0; $i < count($tables); $i++) {
				$this->db->delete($tables[$i], array('customer_id' => $customer_id));
			}

			//delete from sales order table only if we owe this customer or this customer owes us
			$this->db->where('customer_id', $customer_id);
			$this->db->where('quantity_due >', 0);
			$this->db->delete('sales_order');

			//for cash customer creditor
			$this->db
				->where('customer_id', $customer_id)
				->where('amount_due <', 0)
				->delete('sales_order');

			//customer owes us
			//for cash customer creditor
			$this->db
				->where('customer_id', $customer_id)
				->where('amount_due >', 0)
				->delete('sales_order');

			//done, show confirmation flag
			$ajax_data['success'] = true;
			$ajax_data['user'] = 'Customer';
			echo json_encode($ajax_data);

		} else {
			//restrict delete
			//done, show confirmation flag
			$ajax_data['success'] = false;
			$ajax_data['message'] = 'You cannot delete the customer [' . $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name . '], because it has transactions associated with it. Delete the related transactions and try again. <mark>NB: <em>This can cause discrepancies in your account balances...</em><mark>';

			echo json_encode($ajax_data);
		}
	}

	//DELETE ITEM
	function delete_item($item_id, $po_id) {

		// deleting item from all associated tables
		//$tables = array('items', 'purchase_order', 'sales_order');
		$tables = array('items');

		for ($i = 0; $i < count($tables); $i++) {
			$this->db->delete($tables[$i], array('item_id' => $item_id));
		}

		//from purchase order table. the opening quantity entered only
		$this->db->where('item_id', $item_id);
		$this->db->where('po_id', $po_id);
		$this->db->delete('purchase_order');

		//delete image
		$this_item_image = 'uploads/item_image/' . $item_id . '.jpg';
		if (file_exists($this_item_image)) {
			unlink($this_item_image);
		}

	}

	//DELETE ITEM CATEGORY
	function delete_item_category($category_id) {

		// deleting item from all associated tables
		//$tables = array('items', 'purchase_order', 'sales_order');
		$tables = array('item_category');

		for ($i = 0; $i < count($tables); $i++) {
			$this->db->delete($tables[$i], array('category_id' => $category_id));
		}

	}

	function delete_item_main_category($category_id) {

		// deleting item from all associated tables
		//$tables = array('items', 'purchase_order', 'sales_order');
		$tables = array('item_main_category');

		for ($i = 0; $i < count($tables); $i++) {
			$this->db->delete($tables[$i], array('category_id' => $category_id));
		}

	}

	function isOpeningPo($po_code) {
		$canEdit = 1;
		$isOpening = 0;

		if (substr($po_code, 0, 10) == 'Opening-or') {
			$isOpening = 1;
			$row_count = $this->db->get('purchase_order')->num_rows();
			if ($row_count > 1) {
				$canEdit = 0;
			}
		}

		$data['isOpening'] = $isOpening;
		$data['canEdit'] = $canEdit;

		return json_encode($data);
	}

	//DELETE PURCHASE ORDER
	function delete_purchase_order($po_code) {

		//IF IT IS AN OPENING purchase ORDER CODE, don't delete
		if (substr($po_code, 0, 10) == 'Opening-or') {
			//search payment with goods table
			$row_count = $this->db->get('purchase_order')->num_rows();
			if ($row_count == 1) {
				//delete if this is the only item in the tabble
				$this->db->where('po_code', $po_code);
				$this->db->delete('purchase_order');

				//done, show confirmation flag
				$ajax_data['success'] = true;
				$ajax_data['message'] = 'Deleted Successfully!';

			} else {
				//done, show confirmation flag
				$ajax_data['success'] = false;
				$ajax_data['message'] = 'There is no need deleting this. It won\'t harm your transactions. Trust us! But if you insist, make sure you delete all other Purchase Orders first.';

			}

			echo json_encode($ajax_data);

		} else {
			//LET'S SEE IF THIS PURCHASE ORDER HAS ANY PAYMENT TRANSACTION RECORDED. WE RESTRICT THIS COMMAND IF IT IS TRUE
			$supplier_id = $this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->supplier_id;

			$tables_veri = array('payment');
			$rows_counter = 0;
			for ($i = 0; $i < count($tables_veri); $i++) {
				$rows_found = $this->db->get_where($tables_veri[$i], array('po_code' => $po_code))->num_rows();

				$rows_counter += $rows_found;
			}

			if ($rows_counter < 1) {
				//NO PAYMENT TRANSACTION FOUND SO LET'S GO AHEAD AND DELETE IT
				$products_purchased['current_balance'] = $this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->grand_total;

				//update the item quantities
				$po_array = $this->db->get_where('purchase_order', array('po_code' => $po_code))->result_array();
				$item_ids = array();
				foreach ($po_array as $row) {
					array_push($item_ids, $row['item_id']);
				}
				for ($i = 0; $i < count($item_ids); $i++) {
					$item['quantity'] = $this->db->get_where('purchase_order', array('po_code' => $po_code, 'item_id' => $item_ids[$i]))->row()->quantity;

					$creation_date = $this->db->get_where('purchase_order', array('po_code' => $po_code, 'item_id' => $item_ids[$i]))->row()->date;

					$item['last_used_timestamp'] = strtotime(date('d-m-Y H:i:s'));
					//update item table now
					$this->db->where('item_id', $item_ids[$i]);
					$this->db->set('quantity', 'quantity - ' . $item['quantity'], FALSE);
					$this->db->set('last_used_timestamp', $item['last_used_timestamp']);
					$this->db->update('items');

					//update this item in the table by deducting the quantity back
					$this->db->where('item_id', $item_ids[$i]);
					$this->db->where('date_timestamp', strtotime($creation_date));
					//$this->db->where('closing_stock IS NULL');
					$this->db->set('stock_in_today', 'stock_in_today -' . $item['quantity'], FALSE);
					$this->db->update('stock_manager');

				} //end of items update

				//update payable accont balance
				$payable_balance = $this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->amount_due;

				$accounts_payable_account_payment['current_balance'] = $payable_balance;
				$this->db->where('name', 'Accounts Payable');
				$this->db->set('current_balance', 'current_balance -' . $accounts_payable_account_payment['current_balance'], FALSE);
				$this->db->update('accounts'); //end of payable update

				//update account used to pay
				/*$account_ids = $this->db->get_where('payment', array('po_code' => $po_code))->result_array();
					$account_ids_array = array();

					foreach ($account_ids as $id) {
						array_push($account_ids_array, $id['account_id']);
					}

					$total_amount = 0;
					for ($ac = 0; $ac < count($account_ids_array); $ac++) {
						$account_array = $this->db->get_where('payment', array('po_code' => $po_code, 'account_id' => $account_ids_array[$ac]))->result_array();
						foreach ($account_array as $account) {
							$total_amount += $account['amount'];
						}

						//update the account here
						$account_data['current_balance'] = $total_amount;
						$this->db->where('account_id', $account_ids_array[$ac]);
						$this->db->set('current_balance', 'current_balance + ' . $account_data['current_balance'], FALSE);
						$this->db->update('accounts');

						//reset total to 0
						$total_amount = 0;
				*/

				//update the general products purchased account here
				$this->db->where('name', 'General Products Purchased');
				$this->db->set('current_balance', 'current_balance - ' . $products_purchased['current_balance'], FALSE);
				$this->db->update('accounts');

				// deleting data of purchase order from all associated tables
				$tables = array('purchase_order', 'accounts_payable', 'general_journal', 'payment');

				for ($i = 0; $i < count($tables); $i++) {
					$this->db->delete($tables[$i], array('po_code' => $po_code));
				}

				//done, show confirmation flag
				$ajax_data['success'] = true;
				$ajax_data['user'] = 'Purchase Order';
				echo json_encode($ajax_data);
			} else {
				//let's prevent this command purchase order table since this order is already associated with transactions
				//$this->db->delete('purchase_order', array('po_code' => $po_code));

				//done, show error flag
				$ajax_data['success'] = false;
				$ajax_data['message'] = 'Purchase Order [' . $po_code . '] cannot be deleted because it is associated with a number of completed payment transactions. You must delete all the related payments transactions before deleting this Order.';
				echo json_encode($ajax_data);

			}
		}

	}

	//DELETE PURCHASE PAYMENT
	function delete_purchase_payment($payment_id, $track_code) {

		//Track errors and success
		$errors = array();
		$ajax_data = array();

		//get the amount linked to this payment
		$amount = $this->db->get_where('payment', array('payment_id' => $payment_id, 'track_code' => $track_code))->row()->amount;
		$po_code = $this->db->get_where('payment', array('payment_id' => $payment_id, 'track_code' => $track_code))->row()->po_code;
		$supplier_id = $this->db->get_where('payment', array('payment_id' => $payment_id, 'track_code' => $track_code))->row()->supplier_id;
		$account_id = $this->db->get_where('payment', array('payment_id' => $payment_id, 'track_code' => $track_code))->row()->account_id;
		$paid_from = $this->db->get_where('accounts', array('account_id' => $account_id))->row()->name;

		//$prev_paid['prev_paid'] = $this->db->get_where('accounts_payable', array('track_code' => $track_code))->row()->prev_paid;
		if ($po_code != 0 || $po_code != null) {
			//add the amount back to accounts payable table
			$this->db->where('track_code', $track_code);
			$this->db->where('po_code', $po_code);
			$this->db->where('supplier_id', $supplier_id);
			$this->db->set('amount_paid', 'amount_paid -' . $amount, FALSE);
			$this->db->set('amount_due', 'amount_due +' . $amount, FALSE);
			//$this->db->set('p_prev_paid', $prev_paid['prev_paid']);
			//$this->db->set('prev_paid', 'prev_paid -' . $amount, FALSE); //keeping record of actual individual payment
			$this->db->update('accounts_payable');

			//update status
			$bal_due = $this->db->get_where('accounts_payable', array('track_code' => $track_code, 'supplier_id' => $supplier_id, 'po_code' => $po_code))->row()->amount_due;

			$total_amount = $this->db->get_where('accounts_payable', array('track_code' => $track_code, 'supplier_id' => $supplier_id, 'po_code' => $po_code))->row()->amount;
			//status update
			//status update
			if ($bal_due < $total_amount) {
				if ($bal_due == 0) {
					$po_status['status'] = 'Paid';
				} else if ($bal_due < 0) {
					$po_status['status'] = 'Over Paid';
				} else {
					$po_status['status'] = 'Partially Paid';
				}

			} else if ($bal_due == $total_amount) {
				$po_status['status'] = 'Open';
			}

			$this->db->where('track_code', $track_code);
			$this->db->where('supplier_id', $supplier_id);
			$this->db->where('po_code', $po_code);
			$this->db->set('status', $po_status['status']);
			$this->db->update('accounts_payable');

			//TIME FOR UPDATES ON THE PURCHASE ORDER TABLE
			$this->db->where('supplier_id', $supplier_id);
			$this->db->where('po_code', $po_code);
			$this->db->where('track_code', $track_code);
			$this->db->set('status', $po_status['status']);
			$this->db->set('amount_paid', 'amount_paid -' . $amount, FALSE);
			$this->db->set('amount_due', 'amount_due +' . $amount, FALSE);
			$this->db->update('purchase_order');

			//update accounts Payable - increase it
			$accounts_payable_data['current_balance'] = $amount;
			$this->db->where('name', 'Accounts Payable');
			$this->db->set('current_balance', 'current_balance +' . $amount, FALSE);
			$this->db->update('accounts');

			//update account paid from - increase it
			$account_paid_from_data['current_balance'] = $amount;
			$this->db->where('account_id', $account_id);
			$this->db->set('current_balance', 'current_balance + ' . $account_paid_from_data['current_balance'], FALSE);
			$this->db->update('accounts');

			//UPDATE GENERAL JOURNAL NOW
			$journal_amount = $this->db->get_where('general_journal', array('payment_id' => $payment_id, 'supplier_id' => $supplier_id, 'po_code' => $po_code, 'account_name' => $paid_from))->row()->credit_amount;
			if ($journal_amount - $amount == 0) {
				//let's delete from payment table now
				$this->db->delete('general_journal', array('payment_id' => $payment_id));
			} else {
				$this->db->where('po_code', $po_code);
				$this->db->where('payment_id', $payment_id);
				$this->db->where('journal', 'Payments');
				$this->db->where('account_name', 'Accounts Payable');
				$this->db->where('supplier_id', $supplier_id);
				$this->db->set('debit_amount', 'debit_amount -' . $amount);
				//$this->db->where('track_code', $pay_payable_data['track_code']);
				$this->db->update('general_journal');

				$this->db->where('po_code', $po_code);
				$this->db->where('payment_id', $payment_id);
				$this->db->where('journal', 'Payments');
				$this->db->where('account_name', $paid_from);
				$this->db->where('supplier_id', $supplier_id);
				$this->db->set('credit_amount', 'credit_amount -' . $amount);
				//$this->db->where('track_code', $pay_payable_data['track_code']);
				$this->db->update('general_journal');
			}

			//let's delete from payment table now
			$this->db->delete('payment', array('payment_id' => $payment_id));
			$ajax_data['message'] = 'Payment for [' . $po_code . '] was deleted successfully.';

		} else {

			//update account paid from - increase it
			$account_paid_from_data['current_balance'] = $amount;
			$this->db->where('account_id', $account_id);
			$this->db->set('current_balance', 'current_balance + ' . $account_paid_from_data['current_balance'], FALSE);
			$this->db->update('accounts');

			//let's delete from payment table now
			$this->db->delete('general_journal', array('payment_id' => $payment_id));

			//let's delete from payment table now
			$this->db->delete('payment', array('payment_id' => $payment_id));
			$ajax_data['message'] = 'Payment for expenses was deleted successfully.';
		}

		//done, show confirmation flag
		$ajax_data['success'] = 'order';

		echo json_encode($ajax_data);

	}

	//DELETE PAYMENT RECEIVED
	function delete_payment_received($receipt_code = '') {

		//Track errors and success
		$errors = array();
		$ajax_data = array();

		//get the amount linked to this payment
		//$this->db->select_sum('amount');
		//$amount = $this->db->get_where('payment', array('receipt_code' => $receipt_code))->row()->amount;

		$payment_query = $this->db->get_where('payment', array('receipt_code' => $receipt_code));

		if ($payment_query->num_rows() > 0) {
			//$track_code = $payment_query->row()->track_code;

			$payment_array = $payment_query->result_array();

			//loop here
			foreach ($payment_array as $row) {

				$total_paid = $this->db->get_where('invoice', array('invoice_code' => $row['invoice_code']))->row()->amount_paid;
				$prev_paid = $total_paid - $row['amount'];

				$paid_to = $this->db->get_where('accounts', array('account_id' => $row['account_id']))->row()->name;

				//add the amount from the invoice table
				$this->db->where('invoice_code', $row['invoice_code']);
				$this->db->where('customer_id', $row['customer_id']);
				$this->db->set('amount_paid', 'amount_paid -' . $row['amount'], FALSE);
				$this->db->set('amount_due', 'amount_due +' . $row['amount'], FALSE);
				$this->db->set('prev_paid', 'prev_paid -' . $prev_paid, FALSE);

				$this->db->update('invoice');

				//update status
				$bal_due = $this->db->get_where('invoice', array('customer_id' => $row['customer_id'], 'invoice_code' => $row['invoice_code']))->row()->amount_due;

				$total_amount = $this->db->get_where('invoice', array('customer_id' => $row['customer_id'], 'invoice_code' => $row['invoice_code']))->row()->amount;
				//status update
				//status update
				if ($bal_due < $total_amount) {
					if ($bal_due == 0) {
						$so_status['status'] = 'Paid';
					} else if ($bal_due < 0) {
						$so_status['status'] = 'Over Paid';
					} else {
						$so_status['status'] = 'Partially Paid';
					}

				} else if ($bal_due == $total_amount) {
					$so_status['status'] = 'Unpaid';
				}

				//$this->db->where('track_code', $track_code);
				$this->db->where('customer_id', $row['customer_id']);
				$this->db->where('invoice_code', $row['invoice_code']);
				$this->db->set('status', $so_status['status']);
				$this->db->update('invoice');

				//TIME FOR UPDATES ON THE SALES ORDER TABLE
				$this->db->where('customer_id', $row['customer_id']);
				$this->db->where('so_code', $row['so_code']);
				//$this->db->where('track_code', $track_code);
				$this->db->set('status', $so_status['status']);
				$this->db->set('amount_paid', 'amount_paid -' . $row['amount'], FALSE);
				$this->db->set('amount_due', 'amount_due +' . $row['amount'], FALSE);
				$this->db->update('sales_order');

				//TIME FOR UPDATES ON THE PAYMENT WITH GOODS ORDER TABLE
				$this->db->where('customer_id', $row['customer_id']);
				$this->db->where('so_code', $row['so_code']);
				$rows = $this->db->get('sales_order')->num_rows();

				$this->db->select('so_id');
				$this->db->where('customer_id', $row['customer_id']);
				$this->db->where('so_code', $row['so_code']);
				$this->db->order_by('so_id', 'desc');
				$this->db->limit($rows);
				$so_ids_array = $this->db->get('payment_with_goods')->result_array();

				foreach ($so_ids_array as $so) {

					$this->db->where('so_id', $so['so_id']);
					$this->db->set('status', $so_status['status']);
					$this->db->set('amount_paid', 'amount_paid -' . $row['amount'], FALSE);
					$this->db->set('amount_due', 'amount_due +' . $row['amount'], FALSE);
					$this->db->update('payment_with_goods');
				}

				//update accounts Receivable - increase it
				$accounts_receivable_data['current_balance'] = $row['amount'];
				$this->db->where('name', 'Accounts Receivable');
				$this->db->set('current_balance', 'current_balance +' . $accounts_receivable_data['current_balance'], FALSE);
				$this->db->update('accounts');

				//update account paid to - reduce it
				$accounts_receivable_data['current_balance'] = $row['amount'];
				$this->db->where('account_id', $row['account_id']);
				$this->db->set('current_balance', 'current_balance - ' . $accounts_receivable_data['current_balance'], FALSE);
				$this->db->update('accounts');

				//delete from the general journal table
				$this->db->delete('general_journal', array('payment_id' => $row['payment_id']));

				//UPDATE GENERAL JOURNAL NOW
				/*$journal_amount = $this->db->get_where('general_journal', array('payment_id' => $row['payment_id'], 'customer_id' => $row['customer_id'], 'so_code' => $row['so_code'], 'invoice_code' => $row['invoice_code'], 'account_name' => $paid_to))->row()->debit_amount;
					if ($journal_amount - $amount == 0) {
						//let's delete from payment table now
						$this->db->delete('general_journal', array('payment_id' => $payment_id));
					} else {
						$this->db->where('so_code', $so_code);
						$this->db->where('invoice_code', $invoice_code);
						$this->db->where('payment_id', $payment_id);
						$this->db->where('journal', 'Receipts');
						$this->db->where('account_name', 'Accounts Receivable');
						$this->db->where('customer_id', $customer_id);
						$this->db->set('credit_amount', 'credit_amount -' . $amount);
						//$this->db->where('track_code', $pay_payable_data['track_code']);
						$this->db->update('general_journal');

						$this->db->where('so_code', $so_code);
						$this->db->where('invoice_code', $invoice_code);
						$this->db->where('payment_id', $payment_id);
						$this->db->where('journal', 'Receipts');
						$this->db->where('account_name', $paid_to);
						$this->db->where('customer_id', $customer_id);
						$this->db->set('debit_amount', 'debit_amount -' . $amount);
						//$this->db->where('track_code', $pay_payable_data['track_code']);
						$this->db->update('general_journal');
					}*/

			} //end of loop

			//let's delete from payment table now
			$this->db->delete('payment', array('receipt_code' => $receipt_code));

			//done, show confirmation flag
			$ajax_data['success'] = 'order';
			$ajax_data['code'] = 'psoload';
			$ajax_data['message'] = 'Receipt Code [' . $receipt_code . '] was deleted successfully.';

		} else {
			//nothing found, show error flag
			$ajax_data['success'] = 'order';
			$ajax_data['message'] = 'Error: Nothing was deleted!';

		} //end of if test

		echo json_encode($ajax_data);

	}

	//Delete invoice
	function delete_invoice($invoice_code = '', $invoice_id = '') {
		//check if this invoice is involved in any transaction. If yes, restrict deletion
		$payment_rows = $this->db->get_where('payment', array('invoice_code' => $invoice_code, 'invoice_id' => $invoice_id))->num_rows();

		$so_code = $this->db->get_where('invoice', array('invoice_code' => $invoice_code))->row()->so_code;
		$so_query = $this->db->get_where('sales_order', array('so_code' => $so_code));
		//$so_timestamp = $so_query->first_row()->timestamp;
		$sales_oder_rows = $so_query->num_rows();

		if ($payment_rows > 0) {

			//done, show confirmation flag
			$ajax_data['success'] = false;
			$ajax_data['message'] = 'You cannot delete the INVOICE CODE [' . $invoice_code . ']. It is used in payment(s). Delete all payments with this invoice code first.';
			echo json_encode($ajax_data);

		} else if ($sales_oder_rows > 0) {

			//done, show confirmation flag
			$ajax_data['success'] = false;
			$ajax_data['message'] = 'You cannot delete the INVOICE CODE [' . $invoice_code . ']. It is linked with SO CODE [' . $so_code . '] Delete the sales order with this invoice code first.';
			echo json_encode($ajax_data);

		} else {
			$this->db->delete('invoice', array('invoice_code' => $invoice_code, 'invoice_id' => $invoice_id));

			//done, show confirmation flag
			$ajax_data['success'] = 'order';
			$ajax_data['code'] = 'insoload';
			$ajax_data['message'] = 'Invoice Code [' . $invoice_code . '] was deleted successfully.';
			echo json_encode($ajax_data);
		}
	}

	//DELETE SALES ORDER
	function delete_sales_order($so_code = '') {
		//IF IT IS AN OPENING SALES ORDER CODE, JUST GO AHEAD AND DELETE IT FROM THE SALES ORDER TABLE AFTER CHECKING THE PAYMENT WITH GOODS TABLE TO MAKE SURE IT IS NOT THERE.
		$so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
		$so_code_length = strlen($so_no_prefix) + 8;

		$so_query = $this->db->get_where('sales_order', array('so_code' => $so_code));
		$so_timestamp = $so_query->first_row()->timestamp;

		if (substr($so_code, 0, $so_code_length) == 'Opening-' . $so_no_prefix) {
			$is_debtor_so = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->negative_or_goods;

			if ($is_debtor_so == 'debtors') {

				$rows_found_payment = $this->db->get_where('payment', array('so_code' => $so_code))->num_rows();
				if ($rows_found_payment < 1) {
					//no match
					//update account receivable balance
					$customer_id = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->customer_id;

					$amount_due = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'so_code' => $so_code))->row()->amount_due;

					$gs_grand_total = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'so_code' => $so_code))->row()->grand_total;
					//update general sales with the grand total
					$gs['current_balance'] = $gs_grand_total;
					$this->db->where('name', 'General Sales');
					$this->db->set('current_balance', 'current_balance -' . $gs['current_balance'], FALSE);
					$this->db->update('accounts');

					//update receivable with the due amount
					$receivable['current_balance'] = $amount_due;
					$this->db->where('name', 'Accounts Receivable');
					$this->db->set('current_balance', 'current_balance -' . $receivable['current_balance'], FALSE);
					$this->db->update('accounts');

					//update customer's opening_so_code to NULL
					$this->db->where('customer_id', $customer_id);
					$this->db->where('debtor_opening_so_code', $so_code);
					$this->db->set('debtor_opening_so_code', NULL);
					$this->db->set('opening_accounts_goods_receivable_id', NULL);
					$this->db->update('customers');

					//now delete
					// deleting data of sales order from all associated tables
					$tables = array('sales_order', 'payment_with_goods', 'invoice', 'general_journal', 'payment');

					for ($i = 0; $i < count($tables); $i++) {
						$this->db->delete($tables[$i], array('so_code' => $so_code));
					}

					//done, show confirmation flag
					$ajax_data['success'] = true;
					$ajax_data['code'] = 'soload';
					$ajax_data['user'] = 'Opening Sales Order';
					echo json_encode($ajax_data);
				} else {
					//done, show error flag
					$ajax_data['success'] = false;
					$ajax_data['message'] = 'Opening Sales Order [' . $so_code . '] cannot be deleted because it is associated with a number of payment transactions. You must delete all the related transactions before deleting this Order.';
					echo json_encode($ajax_data);
				}

			} else {
				//search payment with goods table
				$rows_found_op = $this->db->get_where('payment_with_goods', array('so_code' => $so_code))->num_rows();
				//if($rows_found_op < 1) {//no match

				//update account payable balance
				$customer_id = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->customer_id;

				$grand_total = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'so_code' => $so_code))->row()->grand_total;

				//update general sales with the grand total
				$gs['current_balance'] = $grand_total;
				$this->db->where('name', 'General Sales');
				$this->db->set('current_balance', 'current_balance -' . $gs['current_balance'], FALSE);
				$this->db->update('accounts');

				//let's get the item ids that we have not yet delivered
				$this->db->select('item_id');
				$this->db->where('customer_id', $customer_id);
				//$this->db->where('quantity_due >', 0);
				$this->db->where('so_code', $so_code);
				$item_ids_array = $this->db->get('sales_order')->result_array();

				//multiply the price and the quantity due for each
				$total_payable_to_customer = 0;
				foreach ($item_ids_array as $item) {

					//for price
					$this->db->where('customer_id', $customer_id);
					$this->db->where('so_code', $so_code);
					$this->db->where('quantity_due >', 0);
					$this->db->where('item_id', $item['item_id']);
					$price = $this->db->get('sales_order')->row()->price;

					//for quantity due
					$this->db->where('customer_id', $customer_id);
					$this->db->where('so_code', $so_code);
					$this->db->where('quantity_due >', 0);
					$this->db->where('item_id', $item['item_id']);
					$quantity_due = $this->db->get('sales_order')->row()->quantity_due;

					$total_payable_to_customer += $price * $quantity_due;

					//let's use this opportunity to also update the item balances
					//for quantity picked
					$this->db->where('customer_id', $customer_id);
					$this->db->where('so_code', $so_code);
					$this->db->where('item_id', $item['item_id']);
					$quantity_picked = $this->db->get('sales_order')->row()->quantity_picked;

					//update item now
					$this->db->where('item_id', $item['item_id']);
					$this->db->set('quantity', 'quantity +' . $quantity_picked, FALSE);
					$this->db->update('items');
				} //done

				//update payable with the due amount
				$payable['current_balance'] = $total_payable_to_customer;
				$this->db->where('name', 'Accounts Payable');
				$this->db->set('current_balance', 'current_balance -' . $payable['current_balance'], FALSE);
				$this->db->update('accounts');

				//update customer's opening_so_code to NULL
				$this->db->where('customer_id', $customer_id);
				$this->db->where('opening_so_code', $so_code);
				$this->db->set('opening_so_code', NULL);
				$this->db->set('opening_accounts_goods_payable_id', NULL);
				$this->db->update('customers');

				//now delete
				// deleting data of sales order from all associated tables
				$tables = array('sales_order', 'invoice', 'payment_with_goods', 'general_journal', 'payment');

				for ($i = 0; $i < count($tables); $i++) {
					$this->db->delete($tables[$i], array('so_code' => $so_code));
				}

				//done, show confirmation flag
				$ajax_data['success'] = true;
				$ajax_data['code'] = 'soload';
				$ajax_data['user'] = 'Opening Sales Order';
				echo json_encode($ajax_data);

				/*} else {
					//done, show error flag
					$ajax_data['success'] = false;
					$ajax_data['message'] = 'Opening Sales Order [' . $so_code . '] cannot be deleted because it is associated with a number of completed delivery transactions. You must delete all the related delivery transactions before deleting this Order.';
					echo json_encode($ajax_data);
				}*/
			}

		} else {

			//LET'S SEE IF THIS SALES ORDER HAS ANY PAYMENT TRANSACTION RECORDED. WE RESTRICT THIS COMMAND FROM EXECUTING IF IT IS TRUE
			$tables_veri = array('payment');
			$rows_counter = 0;
			for ($i = 0; $i < count($tables_veri); $i++) {
				$rows_found = $this->db->get_where($tables_veri[$i], array('so_code' => $so_code))->num_rows();

				$rows_counter += $rows_found;
			}

			if ($rows_counter < 1) {

				//NO MATCH FOUND, SO WE CAN DELETE IT SAFELY
				$general_sales = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->grand_total;

				$customer_id = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->customer_id;

				//update the item quantities
				$so_array = $this->db->get_where('sales_order', array('so_code' => $so_code))->result_array();
				$item_ids = array();
				foreach ($so_array as $row) {
					array_push($item_ids, $row['item_id']);
				}

				for ($i = 0; $i < count($item_ids); $i++) {
					$item_query = $this->db->get_where('sales_order', array('so_code' => $so_code, 'item_id' => $item_ids[$i]));
					$item['quantity'] = $item_query->row()->quantity_picked;
					$quantity_due = $item_query->row()->quantity_due;
					$price = $item_query->row()->price;

					$date_timestamp = $item_query->row()->date_timestamp; //we get the date this transaction happened

					$item['last_used_timestamp'] = strtotime(date('d-m-Y H:i:s'));
					//update item table now
					$this->db->where('item_id', $item_ids[$i]);
					$this->db->set('quantity', 'quantity + ' . $item['quantity'], FALSE);
					$this->db->set('last_used_timestamp', $item['last_used_timestamp']);
					$this->db->update('items');

					/*THE NEED TO UPDATE ALL SUBSEQUENT BALANCES DURING LATE EDITING OF A TRANSACTION*/
					//for sales order
					$item_id = $item_ids[$i];
					$item_quantity_update = $item['quantity'];
					$so_id_s = $this->db->get_where('sales_order', array('so_code' => $so_code, 'item_id' => $item_id))->row()->so_id;

					$this->db->select('so_id');
					$this->db->from('sales_order');
					$this->db->where('so_id >= ', $so_id_s);
					$so_ids_s_array = $this->db->get()->result_array();

					foreach ($so_ids_s_array as $soi) {
						$this->db->where('so_id', $soi['so_id']);
						$this->db->where('item_id', $item_id);
						$this->db->set('item_balance', 'item_balance + ' . $item_quantity_update, FALSE);
						$this->db->update('sales_order');
					} //update all the subsequent item balances

					//for payment with goods table
					$so_id_p = $this->db->get_where('payment_with_goods', array('so_code' => $so_code, 'item_id' => $item_id))->row()->so_id;

					$this->db->select('so_id');
					$this->db->from('payment_with_goods');
					$this->db->where('so_id >=', $so_id_p);
					$so_ids_p_array = $this->db->get()->result_array();

					foreach ($so_ids_p_array as $poi) {
						$this->db->where('so_id', $poi['so_id']);
						$this->db->where('item_id', $item_id);
						$this->db->set('item_balance', 'item_balance + ' . $item_quantity_update, FALSE);
						$this->db->update('payment_with_goods');
					} //update all the subsequent item balances

					//some adjustments in the stock manager table as well
					//For that particular day, it won't affect opening stock but only closing stock
					//FOR THAT PARTICULAR DAY --- ONLY CLOSING STOCK IS AFFECTED
					//FOR CLOSING STOCK
					$this->db->where('date_timestamp', $date_timestamp);
					$this->db->where('item_id', $item_id);
					$this->db->where('closing_stock IS NOT NULL');
					$this->db->set('closing_stock', 'closing_stock + ' . $item_quantity_update, FALSE);
					$this->db->update('stock_manager');

					//FOR ANY OTHER DAY AFTER THAT, BOTH OPENING AND CLOSING STOCKS ARE AFFECTED
					//FOR OPENING STOCK
					$this->db->where('date_timestamp >', $date_timestamp);
					$this->db->where('item_id', $item_id);
					$this->db->where('opening_stock IS NOT NULL');
					$this->db->set('opening_stock', 'opening_stock + ' . $item_quantity_update, FALSE);
					$this->db->update('stock_manager');

					//FOR CLOSING STOCK
					$this->db->where('date_timestamp >', $date_timestamp);
					$this->db->where('item_id', $item_id);
					$this->db->where('closing_stock IS NOT NULL');
					$this->db->set('closing_stock', 'closing_stock + ' . $item_quantity_update, FALSE);
					$this->db->update('stock_manager');

					//if there are some undelivered quantity, let's get the total amount and subtract it from payable
					$payable['current_balance'] = $quantity_due * $price;
					$this->db->where('name', 'Accounts Payable');
					$this->db->set('current_balance', 'current_balance -' . $payable['current_balance'], FALSE);
					$this->db->update('accounts');

				} //end of items update

				//update receivable account balance
				$receivable_balance = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->amount_due;

				$nog = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->negative_or_goods;

				if ($receivable_balance > 0 && $nog != 'negative') {
					$accounts_receivable_account_payment['current_balance'] = $receivable_balance;
					$this->db->where('name', 'Accounts Receivable');
					$this->db->set('current_balance', 'current_balance -' . $accounts_receivable_account_payment['current_balance'], FALSE);
					$this->db->update('accounts'); //end of receivable update
				}

				if ($nog == 'negative') {
					if ($receivable_balance < 0) {
						$ob = $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->opening_balance;

						$amt = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'so_code' => $so_code))->row()->grand_total;

						//update payable
						$payable['current_balance'] = $amt;
						$this->db->where('name', 'Accounts Payable');
						$this->db->set('current_balance', 'current_balance +' . $payable['current_balance'], FALSE);
						$this->db->update('accounts');

						//update invoice
						$this->db->where('so_code', $so_code);
						$this->db->where('customer_id', $customer_id);
						$this->db->set('so_code', NULL);
						$this->db->set('timestamp', NULL);
						$this->db->set('payment_timestamp', NULL);
						$this->db->set('status', NULL);
						$this->db->set('track_code', NULL);
						$this->db->set('amount', $ob);
						$this->db->set('amount_paid', 0);
						$this->db->set('amount_due', $ob);

						$this->db->update('invoice');

					} else {

						$ob = $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->opening_balance;

						$amt = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'so_code' => $so_code))->row()->grand_total;

						$amt_paid = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'so_code' => $so_code))->row()->amount_paid;

						//update payable
						$payable['current_balance'] = abs($ob);
						$this->db->where('name', 'Accounts Payable');
						$this->db->set('current_balance', 'current_balance +' . $payable['current_balance'], FALSE);
						$this->db->update('accounts');

						//update receivable balance
						//by finding the difference between the grand and the absolute value of the opening balance we then subtract all this from the receivable balance.
						$payable['current_balance'] = ($amt - abs($ob)); // - $amt_paid;
						$this->db->where('name', 'Accounts Receivable');
						$this->db->set('current_balance', 'current_balance -' . $payable['current_balance'], FALSE);
						$this->db->update('accounts');

						//update invoice
						$this->db->where('so_code', $so_code);
						$this->db->where('customer_id', $customer_id);
						$this->db->set('so_code', NULL);
						$this->db->set('timestamp', NULL);
						$this->db->set('payment_timestamp', NULL);
						$this->db->set('status', NULL);
						$this->db->set('track_code', NULL);
						$this->db->set('amount', $ob);
						$this->db->set('amount_paid', 0);
						$this->db->set('amount_due', $ob);

						$this->db->update('invoice');
					}

				}

				//update the general sales account here
				$this->db->where('name', 'General Sales');
				$this->db->set('current_balance', 'current_balance - ' . $general_sales, FALSE);
				$this->db->update('accounts');

				// deleting data of sales order from all associated tables
				if ($nog == 'negative') {
					$tables = array('sales_order', 'payment_with_goods', 'general_journal', 'payment');
				} else {
					$tables = array('sales_order', 'invoice', 'payment_with_goods', 'general_journal', 'payment');
				}

				for ($i = 0; $i < count($tables); $i++) {
					$this->db->delete($tables[$i], array('so_code' => $so_code));
				}

				//done, show confirmation flag
				$ajax_data['success'] = true;
				$ajax_data['code'] = 'soload';
				$ajax_data['user'] = 'Sales Order - '.$so_code;
				echo json_encode($ajax_data);

			} else {
				//let's prevent this command since this order is already associated with transactions
				//$this->db->delete('sales_order', array('so_code' => $so_code));

				//done, show error flag
				$ajax_data['success'] = false;
				$ajax_data['message'] = 'Sales Order [' . $so_code . '] cannot be deleted because it is associated with a number of completed payment transactions. You must delete all the related payments transactions before deleting this Order.';
				echo json_encode($ajax_data);

			}
		}

	}

	//delete items transfers
	function delete_items_transfers($token_no) {

		//let's get the item ids that we have not yet delivered
		$this->db->select('item_id');
		$this->db->where('token_no', $token_no);
		$item_ids_array = $this->db->get('items_transfers')->result_array();

		//update items
		foreach ($item_ids_array as $item) {
			$quantity_transferred = $this->db->get_where('items_transfers', array('item_id' => $item['item_id'], 'token_no' => $token_no))->row()->quantity;

			//update item now
			$this->db->where('item_id', $item['item_id']);
			$this->db->set('quantity', 'quantity +' . $quantity_transferred, FALSE);
			$this->db->update('items');
		} //done

		//delete
		$tables = array('items_transfers', 'general_journal');
		for ($i = 0; $i < count($tables); $i++) {
			$this->db->delete($tables[$i], array('token_no' => $token_no));
		}

		//done, show confirmation flag
		$ajax_data['success'] = true;
		$ajax_data['message'] = 'Transfer with Token Number ' . $token_no . 'was deleted successfully.';
		$ajax_data['user'] = 'Item Transfer';
		echo json_encode($ajax_data);
	}

	//Verify PO Number
	function verify_po_no($po_no) {
		$po_prefix = $this->db->get_where('settings', array('type' => 'po_prefix'))->row()->description;
		$po_no_full = $po_prefix . $this->db->get_where('settings', array('type' => 'po_no'))->row()->description;

		$po_no_query = $this->db->get_where('purchase_order', array('po_code' => $po_no));
		if (strlen($po_no) < strlen($po_no_full) || strlen($po_no) > strlen($po_no_full) || substr($po_no, 0, strlen($po_prefix)) !== $po_prefix || !is_numeric(substr($po_no, strlen($po_prefix) - 1))) {
			echo '<span style="color:red;">Invalid PO Number. <i class="glyphicon glyphicon-remove"></i></span>';
		} elseif ($po_no_query->num_rows() < 1) {
			//search general journal table too
			$po_no_query_journal = $this->db->get_where('general_journal', array('po_code' => $po_no));
			if ($po_no_query_journal->num_rows() < 1) {
				echo '<span style="color:green;">PO Number is Available <i class="glyphicon glyphicon-ok"></i></span>';
			} else {
				echo '<span style="color:red;">Not Available <i class="glyphicon glyphicon-remove"></i></span>';
			}
		} else {
			echo '<span style="color:red;">Not Available <i class="glyphicon glyphicon-remove"></i></span>';
		}

	}

	//Verify SO Number
	function verify_so_no($so_no) {
		$so_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
		$so_no_full = $so_prefix . $this->db->get_where('settings', array('type' => 'so_no'))->row()->description;

		$so_no_query = $this->db->get_where('sales_order', array('so_code' => $so_no));
		if (strlen($so_no) < strlen($so_no_full) || strlen($so_no) > strlen($so_no_full) || substr($so_no, 0, strlen($so_prefix)) != $so_prefix || !is_numeric(substr($so_no, strlen($so_prefix) - 1))) {
			echo '<span style="color:red;">Invalid SO Number. <i class="glyphicon glyphicon-remove"></i></span>';
		} elseif ($so_no_query->num_rows() < 1) {
			//search general journal table too
			$so_no_query_journal = $this->db->get_where('general_journal', array('so_code' => $so_no));
			if ($so_no_query_journal->num_rows() < 1) {
				echo '<span style="color:green;">SO Number is Available <i class="glyphicon glyphicon-ok"></i></span>';
			} else {
				echo '<span style="color:red;">Not Available <i class="glyphicon glyphicon-remove"></i></span>';
			}

		} else {
			echo '<span style="color:red;">Not Available <i class="glyphicon glyphicon-remove"></i></span>';
		}

	}

	//Verify INVOICE CODE Number
	function verify_invoice_code($invoice_code) {

		$nextInvoice = $this->getGeneratedInvoiceCode();

		if ($nextInvoice != $invoice_code) {

			echo '<span style="color:red;" class="text-lg">INVALID INVOICE CODE (expecting: ' . $nextInvoice . ')</span> <button type="button" class="ml-3 p-2 ring-1 ring-sky-600  rounded-md hover:ring-3 hover:text-white hover:shadow-lg hover:bg-sky-500 text-lg" onclick="toggleReasonForm()">Confirm Changes</button>';

		} else {

			echo '<span style="color:green;" class="text-lg">VALID INVOICE CODE</span>';
		}
	}

	//Verify WAYBILL CODE Number
	function verify_waybill_code($waybill_code, $customer_id, $useSameWaybillCode) {

		$nextWaybill = $this->getGeneratedWaybillCode($customer_id, $useSameWaybillCode);

		if ($nextWaybill != $waybill_code) {

			echo '<span style="color:red;">INVALID WAYBILL CODE</span>

			<div class="flex mb-3"><small class="text-success"> (expecting: ' . $nextWaybill . ')</small> <button type="button" class="ml-3 p-2 ring-1 ring-sky-600  rounded-md hover:ring-3 hover:text-white hover:shadow-lg hover:bg-sky-500 text-sm" onclick="toggleReasonForm()">Confirm Changes</button></div>';

		} else {

			echo '<span style="color:green;">VALID WAYBILL CODE</span>';
		}
	}

	//get orders by customer
	function get_orders_by_customer($customer_id) {
		$this->db->select('so_code');
		$this->db->distinct();
		$this->db->where('customer_id', $customer_id);
		$order_query = $this->db->get('sales_order');

		if ($order_query->num_rows() < 1) {
			$order_data['no_order_found'] = '<option value="">No Order found</option>';

			echo $order_data['no_order_found'];

		} else {
			$order_array = $order_query->result_array();
			foreach ($order_array as $order) {
				$order_data['order_found'] = '<option value="' . $order['so_code'] . '">' . $order['so_code'] . '</option>';

				echo $order_data['order_found'];

			}

		}

		//$send_data = $order_data;
		//echo json_encode($send_data);

	}
	/**===================================================================================
		    *               NEW EDITING ENDS HERE
		    *=====================================================================================
	*/

	function create_log($data) {
		$data['timestamp'] = strtotime(date('Y-m-d') . ' ' . date('H:i:s'));
		$data['ip'] = $_SERVER["REMOTE_ADDR"];
		$location = new SimpleXMLElement(file_get_contents('http://freegeoip.net/xml/' . $_SERVER["REMOTE_ADDR"]));
		$data['location'] = $location->City . ' , ' . $location->CountryName;
		$this->db->insert('log', $data);
	}

	function get_system_settings() {
		$query = $this->db->get('settings');
		return $query->result_array();
	}

	////////BACKUP RESTORE/////////
	function create_backup($type) {
		$this->load->dbutil();

		$options = array(
			'format' => 'txt', // gzip, zip, txt
			'add_drop' => TRUE, // Whether to add DROP TABLE statements to backup file
			'add_insert' => TRUE, // Whether to add INSERT data to backup file
			'newline' => "\n", // Newline character used in backup file
		);

		if ($type == 'all') {
			$tables = array('');
			$file_name = 'system_backup';
		} else {
			$tables = array('tables' => array($type));
			$file_name = 'backup_' . $type;
		}

		$backup = &$this->dbutil->backup(array_merge($options, $tables));

		$this->load->helper('download');
		force_download($file_name . '.sql', $backup);
	}

	/////////RESTORE TOTAL DB/ DB TABLE FROM UPLOADED BACKUP SQL FILE//////////
	function restore_backup() {
		//move_uploaded_file($_FILES['userfile']['tmp_name'], 'uploads/backup.sql');
		$this->load->dbutil();

		$prefs = array(
			'filepath' => base_url() . 'uploads/backup.sql',
			'delete_after_upload' => TRUE,
			'delimiter' => ';',
		);
		$restore = &$this->dbutil->restore($prefs);
		unlink($prefs['filepath']);
	}

	/////////DELETE DATA FROM TABLES///////////////
	function truncate($type) {
		if ($type == 'all') {
			$this->db->truncate('student');
			$this->db->truncate('mark');
			$this->db->truncate('teacher');
			$this->db->truncate('subject');
			$this->db->truncate('class');
			$this->db->truncate('exam');
			$this->db->truncate('grade');
		} else {
			$this->db->truncate($type);
		}
	}

	////////IMAGE URL//////////
	function get_image_url($type = '', $id = '', $gender = '') {
		if (file_exists('uploads/' . $type . '_image/' . $id . '.jpg')) {
			$image_url = base_url('uploads/' . $type . '_image/' . $id . '.jpg');
		} else {
			if ($gender == 'Male') {
				$image_url = base_url('uploads/user_male.jpg');
			} else if ($gender == 'Female') {
				$image_url = base_url('uploads/user_female.jpg');
			} else if ($type == 'item') {
				$image_url = base_url('uploads/item_image/placeholder.jpg');
			} else {
				$image_url = base_url('uploads/user.jpg');
			}

		}

		return $image_url;
	}

	////////private message//////
	function send_new_private_message() {
		$message = $this->input->post('message');
		$timestamp = strtotime(date("Y-m-d H:i:s"));

		$reciever = $this->input->post('reciever');
		$sender = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');

		//check if the thread between those 2 users exists, if not create new thread
		$num1 = $this->db->get_where('message_thread', array('sender' => $sender, 'reciever' => $reciever))->num_rows();
		$num2 = $this->db->get_where('message_thread', array('sender' => $reciever, 'reciever' => $sender))->num_rows();

		//check if file is attached or not
		if ($_FILES['attached_file_on_messaging']['name'] != "") {
			$data_message['attached_file_name'] = $_FILES['attached_file_on_messaging']['name'];
		}

		if ($num1 == 0 && $num2 == 0) {
			$message_thread_code = substr(md5(rand(100000000, 20000000000)), 0, 15);
			$data_message_thread['message_thread_code'] = $message_thread_code;
			$data_message_thread['sender'] = $sender;
			$data_message_thread['reciever'] = $reciever;
			$this->db->insert('message_thread', $data_message_thread);
		}
		if ($num1 > 0) {
			$message_thread_code = $this->db->get_where('message_thread', array('sender' => $sender, 'reciever' => $reciever))->row()->message_thread_code;
		}

		if ($num2 > 0) {
			$message_thread_code = $this->db->get_where('message_thread', array('sender' => $reciever, 'reciever' => $sender))->row()->message_thread_code;
		}

		$data_message['message_thread_code'] = $message_thread_code;
		$data_message['message'] = $message;
		$data_message['sender'] = $sender;
		$data_message['timestamp'] = $timestamp;
		$this->db->insert('message', $data_message);

		// notify email to email reciever
		//        $this->email_model->notify_email('new_message_notification', $this->db->insert_id());

		return $message_thread_code;
	}

	function send_reply_message($message_thread_code) {
		$message = $this->input->post('message');
		$timestamp = strtotime(date("Y-m-d H:i:s"));
		$sender = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
		//check if file is attached or not
		if ($_FILES['attached_file_on_messaging']['name'] != "") {
			$data_message['attached_file_name'] = $_FILES['attached_file_on_messaging']['name'];
		}
		$data_message['message_thread_code'] = $message_thread_code;
		$data_message['message'] = $message;
		$data_message['sender'] = $sender;
		$data_message['timestamp'] = $timestamp;
		$this->db->insert('message', $data_message);

		// notify email to email reciever
		//$this->email_model->notify_email('new_message_notification', $this->db->insert_id());
	}

	function send_reply_group_message($message_thread_code) {
		$message = $this->input->post('message');
		$timestamp = strtotime(date("Y-m-d H:i:s"));
		$sender = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
		//check if file is attached or not
		if ($_FILES['attached_file_on_messaging']['name'] != "") {
			$data_message['attached_file_name'] = $_FILES['attached_file_on_messaging']['name'];
		}
		$data_message['group_message_thread_code'] = $message_thread_code;
		$data_message['message'] = $message;
		$data_message['sender'] = $sender;
		$data_message['timestamp'] = $timestamp;
		$this->db->insert('group_message', $data_message);
	}

	function mark_thread_messages_read($message_thread_code) {
		// mark read only the oponnent messages of this thread, not currently logged in user's sent messages
		$current_user = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
		$this->db->where('sender !=', $current_user);
		$this->db->where('message_thread_code', $message_thread_code);
		$this->db->update('message', array('read_status' => 1));
	}

	function count_unread_message_of_thread($message_thread_code) {
		$unread_message_counter = 0;
		$current_user = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
		$messages = $this->db->get_where('message', array('message_thread_code' => $message_thread_code))->result_array();
		foreach ($messages as $row) {
			if ($row['sender'] != $current_user && $row['read_status'] == '0') {
				$unread_message_counter++;
			}

		}
		return $unread_message_counter;
	}

	function curl_request($code = '') {

		$product_code = $code;

		$personal_token = "FkA9UyDiQT0YiKwYLK3ghyFNRVV9SeUn";
		$url = "https://api.envato.com/v3/market/author/sale?code=" . $product_code;
		$curl = curl_init($url);

		//setting the header for the rest of the api
		$bearer = 'bearer ' . $personal_token;
		$header = array();
		$header[] = 'Content-length: 0';
		$header[] = 'Content-type: application/json; charset=utf-8';
		$header[] = 'Authorization: ' . $bearer;

		$verify_url = 'https://api.envato.com/v1/market/private/user/verify-purchase:' . $product_code . '.json';
		$ch_verify = curl_init($verify_url . '?code=' . $product_code);

		curl_setopt($ch_verify, CURLOPT_HTTPHEADER, $header);
		curl_setopt($ch_verify, CURLOPT_SSL_VERIFYPEER, false);
		curl_setopt($ch_verify, CURLOPT_RETURNTRANSFER, 1);
		curl_setopt($ch_verify, CURLOPT_CONNECTTIMEOUT, 5);
		curl_setopt($ch_verify, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows; U; Windows NT 5.1; en-US; rv:1.8.1.13) Gecko/20080311 Firefox/2.0.0.13');

		$cinit_verify_data = curl_exec($ch_verify);
		curl_close($ch_verify);

		$response = json_decode($cinit_verify_data, true);

		if (count($response['verify-purchase']) > 0) {
			return true;
		} else {
			return false;
		}

	}

	// Group messaging portion
	function create_group() {
		$data = array();
		$data['group_message_thread_code'] = substr(md5(rand(100000000, 20000000000)), 0, 15);
		$data['created_timestamp'] = strtotime(date("Y-m-d H:i:s"));
		$data['group_name'] = $this->input->post('group_name');
		if (!empty($_POST['user'])) {
			array_push($_POST['user'], $this->session->userdata('login_type') . '_' . $this->session->userdata('admin_id'));
			$data['members'] = json_encode($_POST['user']);
		} else {
			$_POST['user'] = array();
			array_push($_POST['user'], $this->session->userdata('login_type') . '_' . $this->session->userdata('admin_id'));
			$data['members'] = json_encode($_POST['user']);
		}
		$this->db->insert('group_message_thread', $data);
		redirect(site_url('admin/group_message'), 'refresh');
	}
	// Group messaging portion
	function update_group($thread_code = "") {
		$data = array();
		$data['group_name'] = $this->input->post('group_name');
		if (!empty($_POST['user'])) {
			array_push($_POST['user'], $this->session->userdata('login_type') . '_' . $this->session->userdata('admin_id'));
			$data['members'] = json_encode($_POST['user']);
		} else {
			$_POST['user'] = array();
			array_push($_POST['user'], $this->session->userdata('login_type') . '_' . $this->session->userdata('admin_id'));
			$data['members'] = json_encode($_POST['user']);
		}
		$this->db->where('group_message_thread_code', $thread_code);
		$this->db->update('group_message_thread', $data);
		redirect(site_url('admin/group_message'), 'refresh');
	}

	function get_settings($type) {
		$des = $this->db->get_where('settings', array('type' => $type))->row()->description;
		return $des;
	}

	function notifications($page_name, $marked_read = '', $user_id = '', $logged_in_id = '') {
		$account_type = $this->session->userdata('login_type');

		//check if the user who logged in
		if ($account_type == 'admin') {
			$session_id = $this->session->userdata('admin_id');
		} elseif ($account_type == 'accountant') {
			$session_id = $this->session->userdata('accountant_id');
		} elseif ($account_type == 'parent') {
			$session_id = $this->session->userdata('parent_id');
		} elseif ($account_type == 'teacher') {
			$session_id = $this->session->userdata('teacher_id');
		} elseif ($account_type == 'student') {
			$session_id = $this->session->userdata('student_id');
		} elseif ($account_type == 'librarian') {
			$session_id = $this->session->userdata('librarian_id');
		} //end

		if ($marked_read == 0) {

			if ($logged_in_id == $session_id) {

				//upadate user's table with the notice id

				if ($account_type == $account_type) {
					//$this->db->select('read_notice_ids');
					$this->db->where($account_type . '_id', $logged_in_id);
					$prev_ids = $this->db->get($account_type)->row()->read_notice_ids;
					$notice_query = $this->db->get_where('noticeboard', array('status' => '1'));
					$notice = $notice_query->result_array();
					$xp_prev_ids = explode(',', $prev_ids);

					$found_ids_array = array();
					foreach ($notice as $row) {

						for ($i = 0; $i < count($xp_prev_ids); $i++) {
							if ($xp_prev_ids[$i] == $row['notice_id']) {

								$found_ids_array[$i] = $xp_prev_ids[$i];
							}
						}
					}

					//load noticeboard table where notice_ids != $found_ids_array elements
					$found_ids_array;

					if (count($found_ids_array) > 0) {
						$this->db->where_not_in('notice_id', $found_ids_array);
						$this->db->where('status', '1');
						$n_id_query = $this->db->get('noticeboard')->result_array();

						foreach ($n_id_query as $row) {

							//time calculation
							$sent_time = $row['created_on'];
							$current_time = strtotime(date('d-M-Y, H:i:s'));
							$duration = $current_time - $sent_time;
							$hour = ($duration / 3600);
							$minute = ($hour * 60);
							$second = ($minute * 60);
							$time = '';
							if ($second <= 59) {
								$time = 'Just now';
							} else if ($second >= 60 && $second <= 119) {
								$time = '1 minute ago';
							} else if ($minute <= 59) {
								$time = intval($minute) . ' minutes ago';
							} else if ($minute >= 60 && $minute <= 119) {
								$time = '1 hour ago';
							} else if ($hour <= 23) {
								$time = intval($hour) . ' hours ago';
							} else if ($hour >= 24 && $hour <= 47) {
								$time = '1 day ago';
							} else if ($hour >= 48 && $hour <= 167) {
								$time = intval($hour / 24) . ' days ago';
							} else if ($hour >= 168 && ($hour / 24) <= 13) {
								$time = '1 week ago';
							} else if (($hour / 24) >= 14 && ($hour / 24) <= 29) {
								$time = intval(($hour / 24) / 7) . ' weeks ago';
							} else if (($hour / 24) >= 30 && ($hour / 24) <= 59) {
								$time = '1 month ago';
							} else if (($hour / 24) >= 60 && ($hour / 24) <= 364) {
								$time = intval(($hour / 24) / 30) . ' months ago';
							} else if (($hour / 24) >= 365 && ($hour / 24) <= 731) {
								$time = '1 year ago';
							} else if (($hour / 24) >= 732) {
								$time = intval(($hour / 24) / 365) . ' years ago';
							}

							echo '<a href="#" onclick="noticeboard(' . $row['notice_id'] . ')" class="list-group-item">
                                  <div class="media">
                                    <div class="user-status busy pull-left">
                                    <img class="media-object img-square pull-left" src="' . base_url() . 'uploads/frontend/noticeboard/' . $row['image'] . '" width="100">
                                    </div>
                                    <div class="media-body">
                                      <h4 class="media-heading message_list" style="margin-left: 5px;">' . $row['notice_title'] . '...</h4>
                                      <small class="text-muted" style="margin-left: 5px;">' . $time . '</small>
                                    </div>
                                  </div>
                                </a>';
						}
					} else {
						$n_id_query = $this->db->get_where('noticeboard', array('status' => '1'))->result_array();
						foreach ($n_id_query as $row) {

							//time calculation
							$sent_time = $row['created_on'];
							$current_time = strtotime(date('d-M-Y, H:i:s'));
							$duration = $current_time - $sent_time;
							$hour = ($duration / 3600);
							$minute = ($hour * 60);
							$second = ($minute * 60);
							$time = '';
							if ($second <= 59) {
								$time = 'Just now';
							} else if ($second >= 60 && $second <= 119) {
								$time = '1 minute ago';
							} else if ($minute <= 59) {
								$time = intval($minute) . ' minutes ago';
							} else if ($minute >= 60 && $minute <= 119) {
								$time = '1 hour ago';
							} else if ($hour <= 23) {
								$time = intval($hour) . ' hours ago';
							} else if ($hour >= 24 && $hour <= 47) {
								$time = '1 day ago';
							} else if ($hour >= 48 && $hour <= 167) {
								$time = intval($hour / 24) . ' days ago';
							} else if ($hour >= 168 && ($hour / 24) <= 13) {
								$time = '1 week ago';
							} else if (($hour / 24) >= 14 && ($hour / 24) <= 29) {
								$time = intval(($hour / 24) / 7) . ' weeks ago';
							} else if (($hour / 24) >= 30 && ($hour / 24) <= 59) {
								$time = '1 month ago';
							} else if (($hour / 24) >= 60 && ($hour / 24) <= 364) {
								$time = intval(($hour / 24) / 30) . ' months ago';
							} else if (($hour / 24) >= 365 && ($hour / 24) <= 731) {
								$time = '1 year ago';
							} else if (($hour / 24) >= 732) {
								$time = intval(($hour / 24) / 365) . ' years ago';
							}

							echo '<a href="#" onclick="noticeboard(' . $row['notice_id'] . ')" class="list-group-item">
                                  <div class="media">
                                    <div class="user-status busy pull-left">
                                    <img class="media-object img-square pull-left" src="' . base_url() . 'uploads/frontend/noticeboard/' . $row['image'] . '" width="100">
                                    </div>
                                    <div class="media-body">
                                      <h4 class="media-heading message_list" style="margin-left: 5px;">' . $row['notice_title'] . '...</h4>
                                      <small class="text-muted" style="margin-left: 5px;">' . $time . '</small>
                                    </div>
                                  </div>
                                </a>';
						}
					}

				}
			}

		} else {

			if ($user_id == $session_id) {

				//upadate user's table with the notice id

				if ($account_type == $account_type) {
					//$this->db->select('read_notice_ids');
					$this->db->where($account_type . '_id', $logged_in_id);
					$prev_ids = $this->db->get($account_type)->row()->read_notice_ids;
					$notice_query = $this->db->get_where('noticeboard', array('status' => '1'));
					$notice = $notice_query->result_array();
					$xp_prev_ids = explode(',', $prev_ids);

					$found_ids_array = array();
					foreach ($notice as $row) {

						for ($i = 0; $i < count($xp_prev_ids); $i++) {
							if ($xp_prev_ids[$i] == $row['notice_id']) {

								$found_ids_array[$i] = $xp_prev_ids[$i];
							}
						}
					}

					//load noticeboard table where notice_ids != $found_ids_array elements
					$found_ids_array;
					if (count($found_ids_array) > 0) {
						$this->db->where_not_in('notice_id', $found_ids_array);
						$this->db->where('status', '1');
						$n_id_query = $this->db->get('noticeboard')->result_array();

						foreach ($n_id_query as $row) {
							//time calculation
							$sent_time = $row['created_on'];
							$current_time = strtotime(date('d-M-Y, H:i:s'));
							$duration = $current_time - $sent_time;
							$hour = ($duration / 3600);
							$minute = ($hour * 60);
							$second = ($minute * 60);
							$time = '';
							if ($second <= 59) {
								$time = 'Just now';
							} else if ($second >= 60 && $second <= 119) {
								$time = '1 minute ago';
							} else if ($minute <= 59) {
								$time = intval($minute) . ' minutes ago';
							} else if ($minute >= 60 && $minute <= 119) {
								$time = '1 hour ago';
							} else if ($hour <= 23) {
								$time = intval($hour) . ' hours ago';
							} else if ($hour >= 24 && $hour <= 47) {
								$time = '1 day ago';
							} else if ($hour >= 48 && $hour <= 167) {
								$time = intval($hour / 24) . ' days ago';
							} else if ($hour >= 168 && ($hour / 24) <= 13) {
								$time = '1 week ago';
							} else if (($hour / 24) >= 14 && ($hour / 24) <= 29) {
								$time = intval(($hour / 24) / 7) . ' weeks ago';
							} else if (($hour / 24) >= 30 && ($hour / 24) <= 59) {
								$time = '1 month ago';
							} else if (($hour / 24) >= 60 && ($hour / 24) <= 364) {
								$time = intval(($hour / 24) / 30) . ' months ago';
							} else if (($hour / 24) >= 365 && ($hour / 24) <= 731) {
								$time = '1 year ago';
							} else if (($hour / 24) >= 732) {
								$time = intval(($hour / 24) / 365) . ' years ago';
							}

							echo '<a href="#" onclick="noticeboard(' . $row['notice_id'] . ')" class="list-group-item">
                                  <div class="media">
                                    <div class="user-status busy pull-left">
                                    <img class="media-object img-square pull-left" src="' . base_url() . 'uploads/frontend/noticeboard/' . $row['image'] . '" width="100">
                                    </div>
                                    <div class="media-body">
                                      <h4 class="media-heading message_list" style="margin-left: 5px;">' . $row['notice_title'] . '...</h4>
                                      <small class="text-muted" style="margin-left: 5px;">' . $time . '</small>
                                    </div>
                                  </div>
                                </a>';
						}
					} else {
						$n_id_query = $this->db->get_where('noticeboard', array('status' => '1'))->result_array();
						foreach ($n_id_query as $row) {

							//time calculation
							$sent_time = $row['created_on'];
							$current_time = strtotime(date('d-M-Y, H:i:s'));
							$duration = $current_time - $sent_time;
							$hour = ($duration / 3600);
							$minute = ($hour * 60);
							$second = ($minute * 60);
							$time = '';
							if ($second <= 59) {
								$time = 'Just now';
							} else if ($second >= 60 && $second <= 119) {
								$time = '1 minute ago';
							} else if ($minute <= 59) {
								$time = intval($minute) . ' minutes ago';
							} else if ($minute >= 60 && $minute <= 119) {
								$time = '1 hour ago';
							} else if ($hour <= 23) {
								$time = intval($hour) . ' hours ago';
							} else if ($hour >= 24 && $hour <= 47) {
								$time = '1 day ago';
							} else if ($hour >= 48 && $hour <= 167) {
								$time = intval($hour / 24) . ' days ago';
							} else if ($hour >= 168 && ($hour / 24) <= 13) {
								$time = '1 week ago';
							} else if (($hour / 24) >= 14 && ($hour / 24) <= 29) {
								$time = intval(($hour / 24) / 7) . ' weeks ago';
							} else if (($hour / 24) >= 30 && ($hour / 24) <= 59) {
								$time = '1 month ago';
							} else if (($hour / 24) >= 60 && ($hour / 24) <= 364) {
								$time = intval(($hour / 24) / 30) . ' months ago';
							} else if (($hour / 24) >= 365 && ($hour / 24) <= 731) {
								$time = '1 year ago';
							} else if (($hour / 24) >= 732) {
								$time = intval(($hour / 24) / 365) . ' years ago';
							}

							echo '<a href="#" onclick="noticeboard(' . $row['notice_id'] . ')" class="list-group-item">
                                  <div class="media">
                                    <div class="user-status busy pull-left">
                                    <img class="media-object img-square pull-left" src="' . base_url() . 'uploads/frontend/noticeboard/' . $row['image'] . '" width="100">
                                    </div>
                                    <div class="media-body">
                                      <h4 class="media-heading message_list" style="margin-left: 5px;">' . $row['notice_title'] . '...</h4>
                                      <small class="text-muted" style="margin-left: 5px;">' . $time . '</small>
                                    </div>
                                  </div>
                                </a>';
						}
					}

				}
			}
		}

	}

	function notifications_rows($marked_read = '', $user_id = '', $logged_in_id) {

		$account_type = $this->session->userdata('login_type');

		//check if the user who logged in
		if ($account_type == 'admin') {
			$session_id = $this->session->userdata('admin_id');
		} elseif ($account_type == 'accountant') {
			$session_id = $this->session->userdata('accountant_id');
		} elseif ($account_type == 'parent') {
			$session_id = $this->session->userdata('parent_id');
		} elseif ($account_type == 'teacher') {
			$session_id = $this->session->userdata('teacher_id');
		} elseif ($account_type == 'student') {
			$session_id = $this->session->userdata('student_id');
		} elseif ($account_type == 'librarian') {
			$session_id = $this->session->userdata('librarian_id');
		} //end

		if ($marked_read == 0) {

			if ($logged_in_id == $session_id) {

				//upadate user's table with the notice id

				if ($account_type == $account_type) {
					//$this->db->select('read_notice_ids');
					$this->db->where($account_type . '_id', $logged_in_id);
					$prev_ids = $this->db->get($account_type)->row()->read_notice_ids;
					$notice_query = $this->db->get_where('noticeboard', array('status' => '1'));
					$notice = $notice_query->result_array();
					$xp_prev_ids = explode(',', $prev_ids);

					$found_ids_array = array();
					foreach ($notice as $row) {
						for ($i = 0; $i < count($xp_prev_ids); $i++) {
							if ($xp_prev_ids[$i] == $row['notice_id']) {

								$found_ids_array[$i] = $xp_prev_ids[$i];
							}
						}
					}

					if (count($found_ids_array > 0)) {
						echo $notice_query->num_rows() - count($found_ids_array);
					} else {
						echo $notice_query->num_rows();
					}
				}

			}
		} else {

			if ($user_id == $session_id) {

				//upadate user's table with the notice id

				if ($account_type == $account_type) {
					//$this->db->select('read_notice_ids');
					$this->db->where($account_type . '_id', $user_id);
					$prev_ids = $this->db->get($account_type)->row()->read_notice_ids;
					$xp_prev_ids = explode(',', $prev_ids);
					$counter = 0; //set counter to count the number of times the current marked_read is repeated in the table
					//if it counts 1, dupplicate, don't update, if it counts 0, update
					for ($i = 0; $i < count($xp_prev_ids); $i++) {

						if ($xp_prev_ids[$i] === $marked_read) {
							$counter++;
						}
					}

					if ($counter <= 0) {
						$this->db->where($account_type . '_id', $user_id);
						$this->db->set('read_notice_ids', $prev_ids . ',' . $marked_read);
						$this->db->limit(1);
						$this->db->update($account_type);
					}

					//now update the number of rows status on the message alert area
					$this->db->where($account_type . '_id', $user_id);
					$prev_ids = $this->db->get($account_type)->row()->read_notice_ids;
					$notice_query = $this->db->get_where('noticeboard', array('status' => '1'));
					$notice = $notice_query->result_array();
					$xp_prev_ids = explode(',', $prev_ids);

					$found_ids_array = array();
					foreach ($notice as $row) {
						for ($i = 0; $i < count($xp_prev_ids); $i++) {
							if ($xp_prev_ids[$i] == $row['notice_id']) {

								$found_ids_array[$i] = $xp_prev_ids[$i];
							}
						}
					}

					if (count($found_ids_array > 0)) {
						echo $notice_query->num_rows() - count($found_ids_array);
					} else {
						echo $notice_query->num_rows();
					}
				}

			}
		}
	}

	function auth_verification($auth_key) {
		$tables = array('admin');

		$t_counter = 0;
		$block_counter = 0;
		$student_table = 0;

		for ($i = 0; $i < count($tables); $i++) {
			$query_block = $this->db->get_where($tables[$i], array('authentication_key' => $auth_key))->row()->block_limit;
			$query = $this->db->get_where($tables[$i], array('authentication_key' => $auth_key))->num_rows();

			if ($query_block == 3) {
				$block_counter++;
			} else {
				if ($query > 0) {
					$t_counter++;

					//check if the it was verified from students' table
					if ($tables[$i] == 'student') {
						$student_table = 1;
					}
				}
			}
		}

		if ($block_counter > 0) {
			echo 'blocked';
		} else {
			if ($t_counter > 0 && $student_table == 1) {
				echo 'true_student';
			} elseif ($t_counter > 0 && $student_table == 0) {
				echo 'true';
			} else {
				echo 'false';
			}
		}
	}

	//check internal messaging alert
	function check_internal_m($current_user) {
		$this->db->where('sender', $current_user);
		$this->db->or_where('reciever', $current_user);
		$query = $this->db->get('message_thread')->result_array();

		$this->db->where('sender', $current_user);
		$this->db->or_where('reciever', $current_user);
		$query_rows = $this->db->get('message_thread')->num_rows();

		$data_array = array();
		$i = 0;
		foreach ($query as $row) {

			$data_array[$i] = $row['message_thread_code'];
			$i++;
		}

		$this->db->where('read_status', NULL);
		$this->db->where('sender !=', $current_user);
		$this->db->where_in('message_thread_code', $data_array);
		$query2 = $this->db->get('message');
		$num = $query2->num_rows();

		echo $num;
	}

	//check internal messaging alert2
	function internal_m($current_user) {

		$this->db->where('sender', $current_user);
		$this->db->or_where('reciever', $current_user);
		$query = $this->db->get('message_thread')->result_array();

		$this->db->where('sender', $current_user);
		$this->db->or_where('reciever', $current_user);
		$query_rows = $this->db->get('message_thread')->num_rows();

		$data_array = array();
		$i = 0;
		foreach ($query as $row) {

			$data_array[$i] = $row['message_thread_code'];
			$i++;
		}

		$this->db->where('read_status', NULL);
		$this->db->where('sender', $current_user);
		$this->db->where_in('message_thread_code', $data_array);
		$query2 = $this->db->get('message');
		$num = $query2->num_rows();

		//echo $num;
	}

	function load_receipt($receipt_code, $invoice_code, $student_id, $year, $term) {
		$receipt_querry = $this->db->get_where('payment', array('receipt_code' => $receipt_code, 'invoice_code' => $invoice_code, 'student_id' => $student_id, 'year' => $year, 'term' => $term))->result_array();

		$i = 1;
		foreach ($receipt_querry as $row) {

			echo '
                <tr>
                    <td>' . $i . '</td>
                    <td align="left">' . $row['title'] . '</td>
                    <td></td>
                    <td align="right">' . $row['amount'] . '</td>
                </tr>
            ';

			$i++;

		}

	}

	function find_student($search) {
		$search = urldecode($search);
		//currency
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$running_year = get_settings('running_year');
		$running_term = get_settings('running_term');

		/** $this->db->select('invoice_code');
		$this->db->distinct();
		$num_invoice_rows = $this->db->get('invoice')->num_rows();
		$limit = $num_invoice_rows; **///i have reset the limit value to the number of rows returned for an invoice code per search.

		$query = $this
			->db
			/**->like('invoice_id', $search)
				                ->or_like('title', $search)
				                ->or_like('amount', $search)
				                ->or_like('year', $search)
			*/
			//->like('invoice_code', $search)
			//->or_like('status', $search)
			->like('name', $search, 'before')
			->or_like('name', $search, 'after')
			->join('student', 'student.student_id = invoice.student_id')
			->select('invoice_code') //let's select just unique invoice code at a time
			->distinct() //distinct invoice codes selection
			//->limit($limit)
			->order_by('invoice_code', 'desc')
			->get('invoice');

		if ($query->num_rows() > 0) {
			$invoices = $query->result();

			foreach ($invoices as $row) {

				if ($row->invoice_code[0] == 0) {
					$in_code = '9' . $row->invoice_code;
				} else {
					$in_code = $row->invoice_code;
				}

				//amount due
				$this->db->select_sum('due');
				$a_due = $this->db->get_where('invoice', array('invoice_code' => $row->invoice_code))->row()->due;

				//total amount
				$this->db->select_sum('amount');
				$total_amount = $this->db->get_where('invoice', array('invoice_code' => $row->invoice_code))->row()->amount;

				//total amount paid
				$this->db->select_sum('amount_paid');
				$amount_paid = $this->db->get_where('invoice', array('invoice_code' => $row->invoice_code))->row()->amount_paid;

				//year and term
				$year = $this->db->get_where('invoice', array('invoice_code' => $row->invoice_code))->row()->year;
				//year and term
				$term = $this->db->get_where('invoice', array('invoice_code' => $row->invoice_code))->row()->term;

				//creation date
				$creation_timestamp = $this->db->get_where('invoice', array('invoice_code' => $row->invoice_code))->row()->creation_timestamp;

				//student_id
				$student_id = $this->db->get_where('invoice', array('invoice_code' => $row->invoice_code))->row()->student_id;

				//current_class id
				$class_id = $this->db->get_where('enroll', array('student_id' => $student_id, 'year' => $running_year, 'term' => $running_term))->row()->class_id;
				$class_name = $this->db->get_where('class', array('class_id' => $class_id))->row()->name;
				$class_name_numeric = $this->db->get_where('class', array('class_id' => $class_id))->row()->name_numeric;

				//add section A or B if the class has more than one section
				$section_name = $this->db->get_where('section', array('class_id' => $class_id))->row()->name;
				$class_has_more_sections = $this->db->get_where('class', array('name' => $class_name, 'name_numeric' => $class_name_numeric))->num_rows();
				$sec_name = '';
				if ($class_has_more_sections > 1) {
					$sec_name = $section_name;
				}
				$student_class = $class_name . ' ' . $class_name_numeric . $sec_name;

				//invoice_id
				$invoice_id = $this->db->get_where('invoice', array('invoice_code' => $row->invoice_code))->row()->invoice_id;

				if ($a_due == 0) {
					$status = '<button class="btn btn-success btn-xs">' . get_phrase('paid') . '</button>';
					$payment_text = 'View Receipts';
				} elseif ($a_due < 0) {
					$status = '<button class="btn btn-warning btn-xs">' . get_phrase('over_paid') . '</button>';
					$payment_text = 'View Receipts';
				} else {
					$status = '<button class="btn btn-danger btn-xs">' . get_phrase('unpaid') . '</button>';

					$payment_text = 'Take Payment';
				}

				$payment_option = '<li><a href="#" onclick="invoice_pay_modal(' . $in_code . ')" style="color: #d803f8;"><i class="entypo-bookmarks"></i>&nbsp;' . get_phrase($payment_text) . '</a></li><li class="divider"></li>';
				$bulk_invoice_sel = '
                        <input type="checkbox" class="checkbox" onclick="boxChecked2()" name="invoices_sel[]" value="' . $row->invoice_code . '">

                        ';

				$options = '<div class="btn-group"><button type="button" class="btn btn-info btn-sm dropdown-toggle" data-toggle="dropdown">
                                    Action <span class="caret"></span></button><ul class="dropdown-menu dropdown-default pull-right" role="menu">' . $payment_option . '<li><a href="#" onclick="invoice_view_modal(' . $in_code . ')" style="color: blue;"><i class="entypo-credit-card"></i>&nbsp;' . get_phrase('view_invoice') . '</a></li><li class="divider"></li>

                                    <li><a href="#" onclick="bulk_invoice_view_modal(' . $student_id . ')" style="color: black;"><i class="entypo-credit-card"></i>&nbsp;' . get_phrase('view_bulk_invoice') . '</a></li><li class="divider"></li>

                                    <li class="divider"></li><li><a href="#" onclick="invoice_edit_modal(' . $invoice_id . ')" style="color: green;"><i class="entypo-pencil"></i>&nbsp;' . get_phrase('edit') . '</a></li><li class="divider"></li><li><a href="#" onclick="invoice_delete_confirm(' . $in_code . ')" style="color: red;"><i class="entypo-trash"></i>&nbsp;' . get_phrase('delete') . '</a></li></ul></div>';
				$tbody = '<tr>
                            <td>' . $bulk_invoice_sel . '</td>
                            <td>' . $row->invoice_code . '</td>
                            <td>' . $this->crud_model->get_type_name_by_id('student', $student_id) . '</td>
                            <td>' . $student_class . '</td>
                            <td>' . $year . '|' . $term . '</td>
                            <td>' . numfmt_format_currency($fmt, $total_amount, $currency) . '</td>
                            <td>' . numfmt_format_currency($fmt, $amount_paid, $currency) . '</td>
                            <td>' . $status . '</td>
                            <td>' . date('d M, Y', $creation_timestamp) . '</td>
                            <td>' . $options . '</td>
                          </tr>

                ';

				echo $tbody;
			}
		} else {
			echo '<tr>
                    <td colspan="10" align="center"><h4 style="color: red">No Record Found For This Search! Please Try Again With Either The First or The Last Name</h4></td>
                  </tr>';
		}
	}

	function DuplicateRecord($table, $primary_key_field, $primary_key_val) {
		/* CREATE SELECT QUERY */
		$this->db->where($primary_key_field, $primary_key_val);
		$query = $this->db->get($table);
		foreach ($query->result() as $row) {
			foreach ($row as $key => $val) {
				if ($key != $primary_key_field) {
					/* Below code can be used instead of passing a data array directly to the insert or update functions */
					$this->db->set($key, $val);
				} //endif
			} //endforeach
		} //endforeach
		/* insert the new record into table*/
		return $this->db->insert($table);
	}

	function array_unique_multidimensional($input) {
		$serialized = array_map('serialize', $input);
		$unique = array_unique($serialized);
		return array_intersect_key($input, $unique);
	}

	//get sales orders
	function get_sales_order_list($from = '', $to = '', $customer_id = '', $status = '', $type_of_sales = '', $item_id = '') {
		if ($this->session->userdata('admin_login') != 1) {
			redirect(site_url('login'), 'refresh');
		}

		//currency
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
		$this->db->select('so_code')->distinct()->from('payment_with_goods')->where('opening_entry', 0);
		if ($customer_id != 0) $this->db->where('customer_id', $customer_id);
		if ($item_id != 0) $this->db->where('item_id', $item_id);
		if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
		$summation_array = $this->db->get()->result_array();

		$data = array();
		$bt_row = array('bottom_row' => '');

		$total_quantity = 0;
		$quantity_due_amount = 0;
		$total_amount = 0;
		$grand_quantity = 0;
		$grand_amount = 0;
		$order_counter = 0;
		$grand_order_counter = 0;

		if (!empty($order_code_query)) {
			foreach ($order_code_query as $qt) {

				//other data - cache single query result
				$this->db->where('opening_entry', 0)->where('timestamp', $qt['timestamp']);
				if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
				$pwg_row = $this->db->get('payment_with_goods')->row();
				$q['so_code'] = $pwg_row->so_code;
				$track_code = $pwg_row->track_code;

				array_push($order_code_array, $qt['timestamp']);

				$this->db->where('opening_entry', 0)->where('so_code', $q['so_code'])->where('timestamp', $qt['timestamp']);
				if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
				if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
				$orders = $this->db->get('payment_with_goods');
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
				$this->db->select_sum('quantity_due')->where('so_code', $q['so_code'])->where('timestamp', $qt['timestamp'])->where('opening_entry', 0);
				if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
				if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
				$quantity_due = $this->db->get('payment_with_goods')->row()->quantity_due;

				//find other data - reuse pwg_row from earlier
				$date = '<strong>'.date('d-m-Y H:i:s', $pwg_row->timestamp).'</strong>';

				//find other data
				/*if($from != 0 && $to != 0) {
					          $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
					      }
					    $this->db->where('opening_entry', 0);
					    $time_bought = $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code'], 'timestamp' => $qt['timestamp']))->row()->date_timestamp;*/

				$this->db->where('timestamp <=', $qt['timestamp']);
				$this->db->select_sum('quantity_picked');
				$grand_quantity_picked = $this->db->get_where('payment_with_goods', array('so_code' => $q['so_code']))->row()->quantity_picked;

				//reuse pwg_row data
				$customer_id = $pwg_row->customer_id;
				$order_type = $pwg_row->negative_or_goods;
				$status = $pwg_row->status;
				$sales_person_id = $pwg_row->sales_person_id;
				$waybill_code = $pwg_row->waybill_code;

				//q_picked
				$this->db->select_sum('quantity_picked')->where('opening_entry', 0)->where('so_code', $q['so_code'])->where('timestamp', $qt['timestamp']);
				if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
				if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
				$q_picked = $this->db->get('payment_with_goods')->row()->quantity_picked;

				$type_of_sales_2 = $pwg_row->type_of_sales;

				$sales_person = $this->db->get_where('admin', array('admin_id' => $sales_person_id))->row()->name;

				$sPosition = strpos($sales_person, ' ');
				$sales_person = substr($sales_person, 0, $sPosition);

				//for item
				if ($item_id != 0) {
					$this->db->where('item_id', $item_id);
				}
				$this->db->where('so_code', $q['so_code']);
				$item_q = $this->db->get('sales_order');
				$item_qa = $item_q->result_array();

				$cnt = count($item_qa);
				$items_names = '';

				foreach ($item_qa as $item_) {
					$items_names .= $this->db->get('items', array('item_id' => $item_['item_id']))->row()->item_name . ',';

				}

				//for removing the edit button of rows that have been edited earlier than the current row
				$this->db->select_max('timestamp')->from('payment_with_goods')->where('opening_entry', 0)->where('so_code', $q['so_code']);
				if ($customer_id != 0) $this->db->where('customer_id', $customer_id);
				if ($item_id != 0) $this->db->where('item_id', $item_id);
				if ($status != 'All') $this->db->where('status', $status);
				if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
				if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
				$max_timestamp = $this->db->get()->row()->timestamp;
				/**We are ready to start collecting the main data for the table now***/

				if ($item_id != 0) {
					$this->db->where('item_id', $item_id);
				}
				$items_q = $this->db->get_where('sales_order', array('so_code' => $q['so_code']))->result_array();
				$item_names = '';
				$item_counter = count($items_q);

				foreach ($items_q as $item) {

					$unitName = '';
					if($item['unit_id'] != NULL || $item['unit_id'] != '') {

						$unitName = '<mark>'.$this->crud_model->getUnitNameById($item['unit_id']).'</mark>';
					}

					$item_names .= $this->db->get_where('items', array('item_id' => $item['item_id']))->row()->item_name.'-'.$item['quantity'].' '.$unitName;

					

					//just making sure the , appears at the right place laa
					if (count($items_q) > 1) {
						if ($item_counter > 1) {
							$item_names .= '<br/>';
						}
					}

					$item_counter--; //reduce it by 1 each time the loop runs
					//comma adjustment ends here
				}

				$invoiceCode = $this->crud_model->getInvoiceCodeBySoCode($q['so_code']);

				$nestedData['date'] = $date;
				$nestedData['sales_order_code'] = '<small><strong>'.$q['so_code'] . '</strong><br/>' . $item_names . '</small>';
				$nestedData['customer_name'] = '<strong>'.$this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name.'</strong><br/>'.$date.'<br/>'.$nestedData['sales_order_code'];
				$nestedData['waybill_code'] = $waybill_code == '' ? 'INV: '.$invoiceCode : 'WB: '.$waybill_code.' / INV: '.$invoiceCode;
				$nestedData['status'] = $status;
				$nestedData['sales_type'] = $type_of_sales_2;

				$nestedData['q_sold'] = '<strong>' . number_format($total_quantity, 0, '.', ',') . '</strong>';

				//few coding here
				//if it is payables, check if it has any new payment made in the payment table
				$paid_query = null;
				if ($type_of_sales_2 == 'Payables') {
					$this->db->where('so_code', $q['so_code'])->where('track_code', $track_code);
					if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
					$paid_query = $this->db->get('payment');

					if ($paid_query->num_rows() > 0) {
						$this->db->select_sum('amount')->where('so_code', $q['so_code']);
						if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
						$total_amount_paid = $this->db->get('payment')->row()->amount;
					} else {
						$total_amount_paid = 0;
					}
				}

				//we are done now with the amount

				$nestedData['total_amount'] = '<strong>' . number_format($total_amount, 2, '.', ',') . '</strong>';
				$nestedData['q_picked'] = '<strong>' . number_format(($q_picked), 0, '.', ',') . '</strong>';
				$nestedData['total_picked'] = '<strong>' . number_format(($grand_quantity_picked), 0, '.', ',') . '</strong>';
				$nestedData['q_left'] = '<strong>' . number_format($quantity_due, 0, '.', ',') . '</strong>';
				$nestedData['due_amount'] = '<strong>' . number_format($quantity_due_amount, 2, '.', ',') . '</strong>';

				//few coding here
				if ($type_of_sales_2 == 'Payables' && $paid_query->num_rows() < 1) {
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

				//reset total quantity and amount to 0
				$total_quantity = 0;
				$total_amount = 0;
				$quantity_due_amount = 0;
				$order_counter = 0;

				$grand_quantity += $q_picked;
			}

			//find total amount and quantity

			foreach ($summation_array as $sm) {

				//$grand_quantity += $cal['quantity'];
				$this->db->not_like('so_code', 'Opening-', 'after');
				$grand_amount += $this->db->get_where('payment_with_goods', array('so_code' => $sm['so_code']))->row()->grand_total;
				//count order
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

	//get invoice
	function get_invoice_list($from = '', $to = '', $customer_id = '', $status = '') {
		if ($this->session->userdata('admin_login') != 1) {
			redirect(site_url('login'), 'refresh');
		}

		//currency
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$payments_array_idss = array();

		$columns = array(
			0 => 'date',
			2 => 'sales_order_code',
			3 => 'invoice_code',
			4 => 'customer_name',
			5 => 'status',
			6 => 'total_amount',
			7 => 'amount_paid',
			8 => 'amount_due',
			9 => 'cashier',
		);

		$limit = $this->input->post('length');
		$start = $this->input->post('start');
		$order = $columns[$this->input->post('order')[0]['column']];
		$dir = $this->input->post('order')[0]['dir'];

		$totalData = $this->ajaxload->all_invoices_count($from, $to, $customer_id, $status, );
		$totalFiltered = $totalData;

		if (empty($this->input->post('search')['value'])) {
			$invoice_array = $this->ajaxload->all_invoices($from, $to, $customer_id, $status, $limit, $start, $order, $dir);
		} else {
			$search = $this->input->post('search')['value'];
			$invoice_array = $this->ajaxload->invoice_search($from, $to, $customer_id, $status, $limit, $start, $search, $order, $dir);
			$totalFiltered = $this->ajaxload->invoice_search_count($from, $to, $customer_id, $status, $search);
		}

		$invoice_counter = 0;
		$total_amount_paid = 0;
		$total_amount_due = 0;
		$invoice_codes_array = array();
		$invoice_ids_array = array();

		$data = array();

		if (!empty($invoice_array)) {
			foreach ($invoice_array as $invoice) {
				$customer_name = $this->db->get_where('customers', array('customer_id' => $invoice['customer_id']))->row()->customer_name;
				$sales_person = $this->db->get_where('admin', array('admin_id' => $invoice['sales_person_id']))->row()->name;

				//laoding and few updates
				$invoice_counter += 1;

				array_push($invoice_codes_array, $invoice['invoice_code']);
				array_push($invoice_ids_array, $invoice['invoice_id']);

				/**We are ready to start collecting the main data for the table now***/

				$nestedData['date'] = $invoice['date'];

				$nestedData['invoice_code'] = $invoice['invoice_code'];

				$nestedData['sales_order_code'] = $invoice['so_code'];
				$nestedData['customer_name'] = $customer_name;
				$nestedData['status'] = $invoice['status'];

				$nestedData['total_amount'] = '<strong>' . number_format($invoice['amount'], 2, '.', ',') . '</strong>';

				$amount_paid = number_format($invoice['amount_paid'], 2, '.', ',');
				$amount_due = number_format($invoice['amount_due'], 2, '.', ',');

				$a_paid = $invoice['amount_paid'];
				$a_due = $invoice['amount_due'];

				//======some adjustments here============//
				$so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
				$so_code_length = strlen($so_no_prefix) + 8;

				if (substr($invoice['so_code'], 0, $so_code_length) == 'Opening-' . $so_no_prefix) {
					$this->db->where('so_code', $invoice['so_code']);
					if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
					$paid_query = $this->db->get('payment');

					if ($paid_query->num_rows() > 0) {
						$this->db->select_sum('amount')->where('so_code', $invoice['so_code']);
						if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
						$amount_paid = $this->db->get('payment')->row()->amount;
						$a_paid = $amount_paid;
						$amount_paid = number_format($amount_paid, 2, '.', ',');

						$this->db->select_sum('due')->where('so_code', $invoice['so_code']);
						if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
						$amount_due = $this->db->get('payment')->row()->due;
						$a_due = $amount_due;
						$amount_due = number_format($amount_due, 2, '.', ',');
					} else {
						$amount_paid = '-';
						$amount_due = '-';
					}
				}

				$nestedData['amount_paid'] = '<strong>' . $amount_paid . '</strong>';
				$nestedData['amount_due'] = '<strong>' . $amount_due . '</strong>';

				$nestedData['cashier'] = $sales_person;

				$nestedData['DT_RowId'] = 'invoice_id_' . $invoice['invoice_id'];

				$nestedData['onclick'] = "populate_links('" . $invoice['invoice_id'] . "', '" . $invoice['so_code'] . "', '" . $invoice['invoice_code'] . "', '" . $invoice['customer_id'] . "')";
				$nestedData['ondblclick'] = "deselect_all()";

				$data[] = $nestedData;

				$total_amount_paid += $a_paid;
				$total_amount_due += $a_due;

			}

			$invoice = $invoice_counter > 1 ? 'Invoices' : 'Invoice';
			$bt_row['bottom_row'] = '
										            <div class="col-md-2 col-sm-2 text-lg-left"><strong>' . number_format($invoice_counter, 0, '.', ',') . ' ' . $invoice . '</strong></div>
										            <div class="col-md-4 col-sm-4 text-lg-left"><strong>Total Amount Paid: ' . numfmt_format_currency($fmt, $total_amount_paid, $currency) . '</strong></div> <div class="col-md-4 col-sm-4 text-lg-left"><strong>Total Amount Paid: ' . numfmt_format_currency($fmt, $total_amount_due, $currency) . '</strong></div>';

		}

		$json_data = array(
			"draw" => intval($this->input->post('draw')),
			"recordsTotal" => intval($totalData),
			"recordsFiltered" => intval($totalFiltered),
			"data" => $data,
			"invoice_ids" => $invoice_ids_array,
			"bt_row" => $bt_row,
		);

		echo json_encode($json_data);
	}

	//get cash received
	function get_cash_received_list($from = '', $to = '', $customer_id = '') {
		if ($this->session->userdata('admin_login') != 1) {
			redirect(site_url('login'), 'refresh');
		}

		//currency
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$payments_array_idss = array();

		$columns = array(
			0 => 'date',
			1 => 'customer_name',
			// 2 => 'sales_order_code',
			2 => 'invoice_code',
			3 => 'receipt_code',
			4 => 'paid_to',
			5 => 'total_amount',
			6 => 'sales_type',
			7 => 'cashier',
		);

		$limit = $this->input->post('length');
		$start = $this->input->post('start');
		$order = $columns[$this->input->post('order')[0]['column']];
		$dir = $this->input->post('order')[0]['dir'];

		$totalData = $this->ajaxload->all_cash_received_count($from, $to, $customer_id);
		$totalFiltered = $totalData;

		if (empty($this->input->post('search')['value'])) {
			$payments_array = $this->ajaxload->all_cash_received($from, $to, $customer_id, $limit, $start, $order, $dir);
		} else {
			$search = $this->input->post('search')['value'];
			$payments_array = $this->ajaxload->cash_received_search($from, $to, $customer_id, $limit, $start, $search, $order, $dir);
			$totalFiltered = $this->ajaxload->cash_received_search_count($from, $to, $customer_id, $search);
		}

		$data = array();
		$total_payment = 0;
		$total_amount = 0;

		$payment_modes = array();

		if (!empty($payments_array)) {
			foreach ($payments_array as $payment) {

				$this->db->select('account_id');
				$account_ids_array = $this->db->get_where('payment', array('receipt_code' => $payment['receipt_code']))->result_array();
				$account_ids = array_column($account_ids_array, 'account_id');

				$this->db->select('name');
				$this->db->where_in('account_id', $account_ids);
				$account_name_array = $this->db->get_where('accounts')->result_array();
				$account_name = implode(', ', array_column($account_name_array, 'name'));

				$payment_id = $this->db->get_where('payment', array('receipt_code' => $payment['receipt_code']))->row()->payment_id;

				$customer_id = $this->db->get_where('payment', array('receipt_code' => $payment['receipt_code']))->row()->customer_id;
				$expenditure_item = $this->db->get_where('payment', array('receipt_code' => $payment['receipt_code']))->row()->expenditure_item;

				$sales_person_id = $this->db->get_where('general_journal', array('payment_id' => $payment_id, 'journal' => 'Receipts'))->row()->sales_person_id;

				$this->db->select('invoice_code');
				$this->db->distinct();
				$invoice_code = $this->db->get_where('payment', array('receipt_code' => $payment['receipt_code']))->result_array();
				$invoice_codes = array();
				foreach ($invoice_code as $in) {
					array_push($invoice_codes, $in['invoice_code']);
				}

				$this->db->select_sum('amount');
				$this->db->from('payment');
				$this->db->where('receipt_code', $payment['receipt_code']);
				$amount = $this->db->get()->row()->amount;

				$total_payment++;
				$total_amount += $amount;

				//push the ids here
				array_push($payments_array_idss, $payment['receipt_code']);

				/**We are ready to start collecting the main data for the table now***/

				$nestedData['date'] = $this->db->get_where('payment', array('receipt_code' => $payment['receipt_code']))->row()->date;

				$nestedData['customer_name'] = $customer_id == null ? $expenditure_item : $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name;

				//$nestedData['sales_order_code'] = $this->db->get_where('payment', array('receipt_code' => $payment['receipt_code']))->row()->so_code;
				$nestedData['invoice_code'] = implode(', ', $invoice_codes);
				$nestedData['receipt_code'] = $payment['receipt_code'];

				$nestedData['paid_to'] = '<div class="p-2 w-fit max-w-fit bg-gray-300 dark:text-gray-900 rounded-lg">'.$account_name.'</div>';

				$nestedData['total_amount'] = '<strong>' . number_format($amount, 2, '.', ',') . '</strong>';
				$nestedData['sales_type'] = $this->db->get_where('payment', array('receipt_code' => $payment['receipt_code']))->row()->category;
				$nestedData['cashier'] = $this->db->get_where('admin', array('admin_id' => $sales_person_id))->row()->name;

				$nestedData['DT_RowId'] = 'payment_' . $payment['receipt_code'];

				$nestedData['onclick'] = "populate_links('" . $payment['receipt_code'] . "', '" . $customer_id . "')";
				$nestedData['ondblclick'] = "deselect_all()";

				$data[] = $nestedData;

			}

			//$nestedData2['paid_to'] = 'hello';//implode(', ', $payment_modes);
			//$data[] = $nestedData2;

			$payment = $total_payment > 1 ? 'Payments' : 'Payment';
			$bt_row['bottom_row'] = '
										            <div class="col-md-2 col-sm-2 text-lg-left"><strong>' . number_format($total_payment, 0, '.', ',') . ' ' . $payment . '</strong></div>
										            <div class="col-md-6 col-sm-6 text-lg-left"><strong>Total Amount: ' . numfmt_format_currency($fmt, $total_amount, $currency) . '</strong></div>';

		}

		$json_data = array(
			"draw" => intval($this->input->post('draw')),
			"recordsTotal" => intval($totalData),
			"recordsFiltered" => intval($totalFiltered),
			"data" => $data,
			"payment_ids" => $payments_array_idss,
			"bt_row" => $bt_row,
		);

		echo json_encode($json_data);
	}

	//for manager only
	function get_daily_cash_received_list($date = '') {
		if ($this->session->userdata('admin_login') != 1) {
			redirect(site_url('login'), 'refresh');
		}

		if ($date != 0) {
			$date = strtotime($date);
		}

		//currency
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
		$data = array();

		$columns = array(
			0 => 'payment_id',
			1 => 'credit_sales',
			2 => 'deposit',
			3 => 'cash',
			4 => 'momo',
			5 => 'cheque',
			6 => 'total_sales',
			7 => 'expenses',
			8 => 'cash_available',
			9 => 'cash_sales',

		);

		$limit = $this->input->post('length');
		$start = $this->input->post('start');
		$order = $columns[$this->input->post('order')[0]['column']];
		$dir = $this->input->post('order')[0]['dir'];

		$totalData = $this->ajaxload->all_daily_cash_received_count($date);
		$totalFiltered = $totalData;

		if (empty($this->input->post('search')['value'])) {
			$payments_array = $this->ajaxload->all_daily_cash_received($date, $limit, $start, $order, $dir);
		} else {
			$search = $this->input->post('search')['value'];
			$payments_array = $this->ajaxload->daily_cash_received_search($date, $limit, $start, $search, $order, $dir);
			$totalFiltered = $this->ajaxload->daily_cash_received_search_count($date, $search);
		}

		$data = array();
		$cash_sales = 0;
		$credit_sales = 0;
		$deposit = 0;
		$cash = 0;
		$momo = 0;
		$cheque = 0;
		$total_sales = 0;
		$expenditure = 0;
		$cash_available = 0;

		//Cash Sales
		$this->db->select_sum('amount');
		$this->db->from('payment');
		if ($date != 0) {
			$this->db->where('timestamp', $date);
		}
		$this->db->where('category', 'Cash Sales');
		$cash_sales = $this->db->get()->row()->amount;

		//Credit Sales
		$this->db->select_sum('amount');
		$this->db->from('payment');
		if ($date != 0) {
			$this->db->where('timestamp', $date);
		}
		$this->db->where('category', 'Receivables');
		$credit_sales = $this->db->get()->row()->amount;

		//Deposit Sales

		//FROM CASH SALES IN PAYABLES
		$this->db->select_sum('cash_sales_in_payables');
		$this->db->from('payment');
		if ($date != 0) {
			$this->db->where('timestamp', $date);
		}
		$this->db->where('category', 'Payables');
		$ds_query1 = $this->db->get()->row()->cash_sales_in_payables;

		//FROM DEPOSIT SALES
		$this->db->select_sum('amount');
		$this->db->from('payment');
		if ($date != 0) {
			$this->db->where('timestamp', $date);
		}
		$this->db->where('category', 'Payables');
		$ds_query2 = $this->db->get()->row()->amount;

		if ($ds_query1 > 0) {
			//part of the goods were picked up
			$cash_inside = $ds_query1;
			$cash_sales += $cash_inside;

			$payables_inside = $ds_query2 - $cash_inside;
			$deposit = $payables_inside;

		} else {
			//full payables. No good was picked
			$deposit = $ds_query2;
		}

		//account paid into
		$this->db->select('account_id');
		$this->db->distinct();
		if ($date != 0) {
			$this->db->where('timestamp', $date);
		}
		$account_id_array = $this->db->get_where('payment', array('receipt_code IS NOT  NULL'))->result_array();

		foreach ($account_id_array as $account_id):

			$account_name = $this->db->get_where('accounts', array('account_id' => $account_id['account_id']))->row()->name;
			//Payment Methods
			$this->db->select_sum('amount');
			$this->db->from('payment');
			$this->db->where('receipt_code IS NOT NULL');
			if ($date != 0) {
				$this->db->where('timestamp', $date);
			}
			$this->db->where('account_id', $account_id['account_id']);
			$paymentM = $this->db->get()->row()->amount;

			if ($account_name == 'Cheque') {
				$cheque = $paymentM;

			} else if ($account_name == 'Cash') {
			$cash = $paymentM;

		} else if ($account_name == 'Momo/e-PAYMENT') {
			$momo = $paymentM;
		}
		endforeach;

		$total_sales = ($cash_sales + $credit_sales + $deposit);

		//Expenses
		$this->db->select_sum('amount');
		$this->db->from('payment');
		if ($date != 0) {
			$this->db->where('timestamp', $date);
		}
		$this->db->where('payment_type', 'Expense');
		$expenditure = $this->db->get()->row()->amount;

		$cash_available = $total_sales - $expenditure;

		$nestedData['cash_sales'] = number_format($cash_sales, 2, '.', ',');
		$nestedData['credit_sales'] = number_format($credit_sales, 2, '.', ',');
		$nestedData['deposit'] = number_format($deposit, 2, '.', ',');
		$nestedData['cash'] = number_format($cash, 2, '.', ',');
		$nestedData['momo'] = number_format($momo, 2, '.', ',');
		$nestedData['cheque'] = number_format($cheque, 2, '.', ',');
		$nestedData['total_sales'] = '<strong>' . number_format($total_sales, 2, '.', ',') . '</strong>';
		$nestedData['expenses'] = '<strong>' . number_format($expenditure, 2, '.', ',') . '</strong>';
		$nestedData['cash_available'] = '<strong>' . number_format($cash_available, 2, '.', ',') . '</strong>';

		$data[] = $nestedData;

		$json_data = array(
			"draw" => intval($this->input->post('draw')),
			"recordsTotal" => intval($totalData),
			"recordsFiltered" => intval($totalFiltered),
			"data" => $data,
		);

		echo json_encode($json_data);

	}

	//get unit items balances
	function getUnitItemBalance($item_id = '') {
		$this->db->select_max('transfer_id');
		$this->db->where('item_id', $item_id);
		$transfer_id = $this->db->get('unit_transfer')->row()->transfer_id;

		//$this->db->where('item_id', $item_id);
		$this->db->where('transfer_id', $transfer_id);
		$balance_row = $this->db->get('unit_transfer')->row();
		$unit_balance = $balance_row->unit_quantity_balance;

		return $unit_balance;
	}

	//get the last unit the item was sold in
	function getLastUnit($item_id = '') {
		$this->db->select_max('updated_date');
		$this->db->where('item_id', $item_id);
		$updated_date = $this->db->get('items_in_units_order')->row()->updated_date;

		$this->db->where('updated_date', $updated_date);
		$unit_row = $this->db->get('items_in_units_order')->row();
		$unit = $unit_row->unit_id;

		return $unit;
	}

	function getItemUnitQuantity($item_id = '', $unit_id = '') {
		$this->db->where('unit_id', $unit_id);
		$this->db->where('item_id', $item_id);
		$unit_row = $this->db->get('units_items')->row();
		$unit_quantity = $unit_row->unit_total;

		return $unit_quantity;
	}

	function getItemUnitPrice($item_id = '', $unit_id = '') {
		$this->db->where('unit_id', $unit_id);
		$this->db->where('item_id', $item_id);
		$unit_row = $this->db->get('units_items')->row();
		$unit_price = $unit_row->unit_price;

		return $unit_price;
	}

	function getItemBundleQuantityByItemId($item_id = '') {
		$this->db->where('item_id', $item_id);
		$unit_row = $this->db->get('units_items')->row();
		$unit_quantity = $unit_row->unit_total;

		return $unit_quantity;
	}

	function getItemBundlePriceByItemId($item_id = '') {
		$this->db->where('item_id', $item_id);
		$unit_row = $this->db->get('units_items')->row();
		$unit_price = $unit_row->unit_price;

		return $unit_price;
	}

	//get item unit name by id
	function getUnitNameById($unit_id = '') {
		$this->db->where('unit_id', $unit_id);
		$unit_row = $this->db->get('units')->row();
		$unit_name = $unit_row->unit_name;

		return $unit_name;
	}

	

	function getUnitNameByItemId($item_id = '') {

		$unit_id = $this->db->get_where('units_items', ['item_id' => $item_id])->row()->unit_id;

		$this->db->where('unit_id', $unit_id);
		$unit_row = $this->db->get('units')->row();
		$unit_name = $unit_row->unit_name;

		return $unit_name;
	}

	function getUnitIdByItemId($item_id = '') {

		$unit_id = $this->db->get_where('units_items', ['item_id' => $item_id])->row()->unit_id;

		$this->db->where('unit_id', $unit_id);
		$unit_row = $this->db->get('units')->row();
		$unit_id = $unit_row->unit_id;

		return $unit_id;
	}

	function getItemBalance($item_id = '') {
		$this->db->where('item_id', $item_id);
		$balance_row = $this->db->get('items')->row();
		$item_balance = $balance_row->quantity;

		return $item_balance;
	}

	function getItemName($item_id = '') {
		$this->db->where('item_id', $item_id);
		$item_name_row = $this->db->get('items')->row();
		$item_name = $item_name_row->item_name;

		return $item_name;
	}

	function getItemSellingPriceById($item_id = '') {
		$this->db->where('item_id', $item_id);
		$item_name_row = $this->db->get('items')->row();
		$item_selling_price = $item_name_row->selling_price;

		return $item_selling_price;
	}


	function getItemCategoryNameById($category_id = '') {
		$category_name = $this->db->get_where('item_category', array('category_id' => $category_id))->row()->category_name;

		return $category_name;
	}

	function getItemCategoryNameByItemId($item_id = '') {
		$category_id = $this->db->get_where('items', array('item_id' => $item_id))->row()->category_id;

		return $this->crud_model->getItemCategoryNameById($category_id);
	}

	function getItemSupplierNameById($supplier_id = '') {
		$supplier_name = $this->db->get_where('suppliers', array('supplier_id' => $supplier_id))->row()->supplier_name;

		return $supplier_name;
	}


	//get invoice code by so_code
	function getInvoiceCodeBySoCode($so_code = '') {
		$this->db->where('so_code', $so_code);
		$invoice_row = $this->db->get('invoice')->row();
		$invoice_code = $invoice_row->invoice_code;

		return $invoice_code;
	}

	//get the first year of sales
	function getFirstSalesYear() {
		$this->db->select('date_timestamp');
		$this->db->distinct();
		$this->db->from('sales_order');
		$this->db->order_by('so_id', 'asc');
		$this->db->limit(1);
		$timestamp = $this->db->get()->row()->date_timestamp;

		$year = date('Y', $timestamp);

		return $year;

	}

	//get customer's details
	function getCustomerDetails($customer_id, $detail) {
		$customerInfo = $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->$detail;

		return $customerInfo;
	}

	//generate invoice automatically
	function automateInvoice() {
		$inv_no_prefix = $this->db->get_where('settings', array('type' => 'inv_prefix'))->row()->description;
		$inv_no = $this->db->get_where('settings', array('type' => 'inv_no'))->row()->description;

		$this->db->select('invoice_code')->like('invoice_code', $inv_no_prefix, 'after')->not_like('invoice_code', 'R', 'before')->order_by('invoice_code', 'desc')->limit(1);
		$inv_query = $this->db->get('invoice');

		if ($inv_query->num_rows() < 1) {
			$this->db->select('invoice_code')->like('invoice_code', $inv_no_prefix, 'after')->not_like('invoice_code', 'R', 'before')->order_by('invoice_code', 'desc')->limit(1);
			$inv_query = $this->db->get('general_journal');
		}

		$second_num_inv = 0;
		if ($inv_query->num_rows() > 0 && !empty($inv_query->row()->invoice_code)) {
			$inv_id = $inv_query->row()->invoice_code;
			$numeric_counter_inv = 0;
			$pos_counter = 0;
			
			for ($i = 0; $i < strlen($inv_id); $i++) {
				if (is_numeric($inv_id[$i])) {
					$numeric_counter_inv++;
					if($numeric_counter_inv == 2) {
						$second_num_inv = $inv_id[$i];
						break;
					}
				}
				$pos_counter++;
			}

			$position_of_second_num_inv = $pos_counter;
			$n_invid = substr($inv_id, $position_of_second_num_inv, strlen($inv_id) - $i);
			$invoice_code = $n_invid + 1;

			if ($second_num_inv == 0) {
				$old_len = strlen($inv_id);
				$new_len = strlen($invoice_code);
				$act_len = ($old_len - $new_len);
				$invoice_code = substr($inv_id, 0, $act_len) . $invoice_code;
			}
		} else {
			$invoice_code = $inv_no_prefix . $inv_no;
		}

		return ($second_num_inv == 0) ? $invoice_code : $inv_no_prefix . $invoice_code;
	}

	//get generated invoice
	function getGeneratedInvoiceCode() {

		$this->db->where('status', 'open');
		$this->db->order_by('id', 'asc');
		$this->db->limit(1);
		$code = $this->db->get('invoice_code')->row()->code;

		return $code;
	}

	function getGeneratedWaybillCode($customer_id = '', $useSameWaybillCode = 'yes') {

		//first we check if this customer had been issued any waybill today. If yes, we use same waybill number instead of generating new one

		//query
		$rowQuery = customerAlreadyPickedPayablesTodayQuery($customer_id);

		if ($rowQuery->num_rows() > 0 && $useSameWaybillCode == 'yes') {

			//it is a yes, so we get that used waybill and use it again
			$code = $rowQuery->last_row()->waybill_code;

		} else {

			$this->db->where('status', 'open');
			$this->db->order_by('id', 'asc');
			$this->db->limit(1);
			$code = $this->db->get('waybill_code')->row()->code;
		}

		return $code;
	}

	function getImprestBalance() {

		//currency
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		//imprest balance
		$this->db->where('name', 'Imprest');
		$this->db->or_where('name', 'Petty Cash');
		$imprest_row = $this->db->get_where('accounts')->row();

		$ajaxData['accountName'] = strtoupper($imprest_row->name);
		$ajaxData['accountBalance'] = numfmt_format_currency($fmt, $imprest_row->current_balance, $currency);

		return $ajaxData;

	}

	function getAccountNameById($id='') {
		$account_name = $this->db->get_where('accounts', array('account_id' => $id))->row()->name;

		return $account_name;
	}

	function getAccountDetailsByIds($idArray= array()) {
		$this->db->select('*');
		$this->db->where_in('account_id', $idArray);
		$account_details_query = $this->db->get('accounts');

		return $account_details_query;
	}


	function getAccountCurrentBalanceById($account_id) {

		//account balance
		$this->db->where('account_id', $account_id);
		$accountBalance = $this->db->get_where('accounts')->row()->current_balance;
		

		return $accountBalance;

	}

	//update the accounts_used table with all the payment transactions in payment table
	function populateAccountsUsedTable() {

		/*$this->db->select('receipt_code');
		$this->db->distinct();
		$this->db->from('payment');
		$receiptCodeArray = $this->db->get()->result_array();*/

		$dataExists = $this->db->get_where('accounts_used')->first_row();

		if(count($dataExists) < 1):

			//foreach($receiptCodeArray as $rec) {

			$this->db->select('receipt_code, payment.customer_id, payment.amount, account_id, sales_order.timestamp, sales_order.date_timestamp, sales_order.so_code, payment.so_code, general_journal.account_balance');
			//$this->db->where('receipt_code', $rec['receipt_code']);
			$this->db->join('sales_order', 'sales_order.so_code = payment.so_code');
			$this->db->join('general_journal', 'general_journal.journal_id = payment.journal_id');
			$this->db->where('account_id >', '0');
			$paymentArray = $this->db->get('payment')->result_array();

			$bulkInsertArray = [];

			foreach($paymentArray as $pm) {

				$data['account_id'] = $pm['account_id'];
				$data['receipt_code'] = $pm['receipt_code'];
				$data['customer_id'] = $pm['customer_id'];
				$data['account_amount'] = $pm['amount'];
				$data['account_balance'] = $pm['account_balance'];
				$data['created_date'] = date('Y-m-d H:i:s', $pm['timestamp']);
				$data['date_timestamp'] = $pm['date_timestamp'];
				$data['timestamp'] = $pm['timestamp'];

				$bulkInsertArray[] = $data;

			}

			//remove duplicates
			$bulkInsertArray = array_map('unserialize', array_unique(array_map('serialize', $bulkInsertArray)));
			//}

			/*var_dump($bulkInsertArray);
			return;*/

			//insert
			$result = $this->db->insert_batch('accounts_used', $bulkInsertArray);

			if($result) {
				return true;
			} else {
				return false;
			}

		else:
			return 'exists';
		endif;
	}


	function get_backups_creditors($date) {

		$this->db->where('date_timestamp <=', strtotime($date));
		$this->db->where('quantity_due >', '0');
		$data = $this->db->get('sales_order')->result_array();

		return $data;

	}

	function delete_creditors($date) {

		/*Correction bii*/
		$this->db->select('so_code');
		$this->db->distinct();
		$this->db->where('date_timestamp <=', strtotime($date));
		$this->db->where('quantity_due >', '0');
		$data = $this->db->get('sales_order')->result_array();

		$batch_update_array = array();
		$batch_item_update_array_sales_order = array();
		$batch_item_update_array_pwith_goods = array();

		foreach($data as $d) {

			$c_data['so_code'] = $d['so_code'];
			$c_data['quantity_due'] = 0;

			/*update quantity picked to the quantity bought*/
			$this->db->where('so_code', $d['so_code']);
			$items_array = $this->db->get('sales_order')->result_array();

			foreach($items_array as $item) {

				$item_data['so_id'] = $item['so_id'];
				$item_data['quantity_picked'] = $item['quantity'];

				$batch_item_update_array_sales_order[] = $item_data;

				/*get the first entry of this code in the payment with goods table*/
				$this->db->where('so_code', $d['so_code']);
				$this->db->where('item_id', $item['item_id']);
				$this->db->order_by('so_id', 'asc');
				$this->db->limit(1);
				$pw_row = $this->db->get('payment_with_goods')->first_row();
				$pso_id = $pw_row->so_id;

				/*we delete any further appearance of this code and item id*/
				$this->db->where('so_code', $d['so_code']);
				$this->db->where('item_id', $item['item_id']);
				$this->db->where('so_id !=', $pso_id);
				$this->db->delete('payment_with_goods');


				$pw_data['so_id'] = $pso_id;
				$pw_data['quantity_picked'] = $pw_row->quantity;

				$batch_item_update_array_pwith_goods[] = $pw_data;
			}

			


			$batch_update_array[] = $c_data;
		}

		
		

		if(sizeof($batch_update_array) > 0) {

			$this->db->update_batch('sales_order', $batch_update_array, 'so_code');
			$this->db->update_batch('payment_with_goods', $batch_update_array, 'so_code');
		}

		if(sizeof($batch_item_update_array_sales_order) > 0) {
			$this->db->update_batch('sales_order', $batch_item_update_array_sales_order, 'so_id');
		}
		
		if(sizeof($batch_item_update_array_pwith_goods) > 0) {
			$this->db->update_batch('payment_with_goods', $batch_item_update_array_pwith_goods, 'so_id');
		}

		/*$this->db->select('so_code');
		$this->db->distinct();
		$this->db->where('date_timestamp <=', strtotime($date));
		$this->db->where('quantity_due >', '0');
		$data = $this->db->get('sales_order')->result_array();

		foreach($data as $v) {

			/*reconcile in the sales order table*/
			/*$this->db->where('so_code', $v['so_code']);
			$this->db->delete('sales_order');*/

			/*for the payment with goods table*/
			/*$this->db->where('so_code', $v['so_code']);
			$this->db->delete('payment_with_goods');*/

			/*for the payment with goods table*/
			/*$this->db->where('so_code', $v['so_code']);
			$this->db->delete('general_journal');*/

			/*for the payment with goods table*/
			/*$this->db->where('so_code', $v['so_code']);
			$this->db->delete('payment');


		}*/

		return 'done';

	}



}
