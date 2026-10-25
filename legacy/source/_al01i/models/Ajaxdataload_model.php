<?php
defined('BASEPATH') OR exit('No direct script access allowed');

class Ajaxdataload_model extends CI_Model {
	function __construct() {
		parent::__construct();
	}

	/*----------------------------- BOOKS -------------------------------*/

	function all_books_count() {
		$query = $this->db->get('book');
		return $query->num_rows();
	}

	function all_books($limit, $start, $col, $dir) {
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('book')->result() ?: [];
	}

	function book_search($limit, $start, $search, $col, $dir) {
		$this->db->group_start()->like('name', $search)->or_like('author', $search)->or_like('book_id', $search)->or_like('price', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('book')->result() ?: [];
	}

	function book_search_count($search) {
		$this->db->group_start()->like('name', $search)->or_like('book_id', $search)->or_like('author', $search)->or_like('price', $search)->group_end();
		return $this->db->count_all_results('book');
	}

	/*----------------------------- BOOKS -------------------------------*/

	/*----------------------------- ADMIN -------------------------------*/
	function all_admin_count() {
		$query = $this->db->get('admin');
		return $query->num_rows();
	}

	function all_admin($limit, $start, $col, $dir) {
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('admin')->result() ?: [];
	}

	function admin_search($limit, $start, $search, $col, $dir) {
		$this->db->group_start()->like('admin_id', $search)->or_like('name', $search)->or_like('email', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('admin')->result() ?: [];
	}

	function admin_search_count($search) {
		$this->db->group_start()->like('admin_id', $search)->or_like('name', $search)->or_like('email', $search)->group_end();
		return $this->db->count_all_results('admin');
	}

	/*----------------------------- SALES ORDER -------------------------------*/
	function all_sales_order_count($from = '', $to = '', $customer_id = '', $status = '', $type_of_sales = '', $item_id = '') {
		$this->db->select('timestamp')->distinct()->from('payment_with_goods')->where('opening_entry', 0);
		if ($customer_id != 0) $this->db->where('customer_id', $customer_id);
		if ($item_id != 0) $this->db->where('item_id', $item_id);
		if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
		return $this->db->count_all_results();
	}

	function all_sales_order($from = '', $to = '', $customer_id = '', $status = '', $type_of_sales = '', $item_id = '', $limit, $start, $col, $dir) {
		$this->db->select('timestamp')->distinct()->from('payment_with_goods')->where('opening_entry', 0);
		if ($customer_id != 0) $this->db->where('customer_id', $customer_id);
		if ($item_id != 0) $this->db->where('item_id', $item_id);
		if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get()->result_array() ?: [];
	}

	function sales_order_search($from = '', $to = '', $customer_id = '', $status = '', $type_of_sales = '', $item_id = '', $limit, $start, $search, $col, $dir) {
		$this->db->from('payment_with_goods')->join('customers', 'customers.customer_id = payment_with_goods.customer_id')->where('opening_entry', 0);
		if ($customer_id != 0) $this->db->where('payment_with_goods.customer_id', $customer_id);
		if ($item_id != 0) $this->db->where('item_id', $item_id);
		if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
		$this->db->group_start()->like('so_code', $search)->or_like('customer_name', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get()->result() ?: [];
	}

	function sales_order_search_count($from = '', $to = '', $customer_id = '', $status = '', $type_of_sales = '', $item_id = '', $search) {
		$this->db->from('payment_with_goods')->join('customers', 'customers.customer_id = payment_with_goods.customer_id')->where('opening_entry', 0);
		if ($customer_id != 0) $this->db->where('payment_with_goods.customer_id', $customer_id);
		if ($item_id != 0) $this->db->where('item_id', $item_id);
		if ($type_of_sales != '0') $this->db->where('type_of_sales', $type_of_sales);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('date_timestamp >=', strtotime($from))->where('date_timestamp <=', strtotime($to));
		$this->db->group_start()->like('so_code', $search)->or_like('customer_name', $search)->group_end();
		return $this->db->count_all_results();
	}

	/*----------------------------- INVOICES -------------------------------*/
	function all_invoices_count($from = '', $to = '', $customer_id = '', $status = '') {
		if ($customer_id != 0) $this->db->where('customer_id', $customer_id);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
		return $this->db->count_all_results('invoice');
	}

	function all_invoices($from = '', $to = '', $customer_id = '', $status = '', $limit, $start, $col, $dir) {
		if ($customer_id != 0) $this->db->where('customer_id', $customer_id);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('invoice')->result_array() ?: [];
	}

	function invoice_search($from = '', $to = '', $customer_id = '', $status = '', $limit, $start, $search, $col, $dir) {
		$this->db->from('invoice')->join('customers', 'customers.customer_id = invoice.customer_id');
		if ($customer_id != 0) $this->db->where('invoice.customer_id', $customer_id);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
		$this->db->group_start()->like('so_code', $search)->or_like('invoice_code', $search)->or_like('customer_name', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get()->result() ?: [];
	}

	function invoice_search_count($from = '', $to = '', $customer_id = '', $status = '', $search) {
		$this->db->from('invoice')->join('customers', 'customers.customer_id = invoice.customer_id');
		if ($customer_id != 0) $this->db->where('invoice.customer_id', $customer_id);
		if ($status != 'All') $this->db->where('status', $status);
		if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
		$this->db->group_start()->like('so_code', $search)->or_like('invoice_code', $search)->or_like('customer_name', $search)->group_end();
		return $this->db->count_all_results();
	}

	/*----------------------------- CASH RECEIVED -------------------------------*/
	function all_cash_received_count($from = '', $to = '', $customer_id = '') {
		$this->db->select('receipt_code')->distinct()->from('payment')->where('receipt_code IS NOT NULL');
		if ($customer_id != 0) $this->db->where('customer_id', $customer_id);
		if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
		$this->db->where_in('payment_type', ['Receivable', 'Income']);
		return $this->db->count_all_results();
	}

	function all_cash_received($from = '', $to = '', $customer_id = '', $limit, $start, $col, $dir) {
		$this->db->select('receipt_code')->distinct()->from('payment')->where('receipt_code IS NOT NULL');
		if ($customer_id != 0) $this->db->where('customer_id', $customer_id);
		if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
		$this->db->where_in('payment_type', ['Receivable', 'Income']);
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get()->result_array() ?: [];
	}

	function cash_received_search($from = '', $to = '', $customer_id = '', $limit, $start, $search, $col, $dir) {
		$this->db->from('payment')->join('customers', 'customers.customer_id = payment.customer_id');
		if ($customer_id != 0) $this->db->where('payment.customer_id', $customer_id);
		if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
		$this->db->where_in('payment_type', ['Receivable', 'Income']);
		$this->db->group_start()->like('so_code', $search)->or_like('receipt_code', $search)->or_like('customer_name', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get()->result_array() ?: [];
	}

	function cash_received_search_count($from = '', $to = '', $customer_id = '', $search) {
		$this->db->from('payment')->join('customers', 'customers.customer_id = payment.customer_id');
		if ($customer_id != 0) $this->db->where('payment.customer_id', $customer_id);
		if ($from != 0 && $to != 0) $this->db->where('timestamp >=', strtotime($from))->where('timestamp <=', strtotime($to));
		$this->db->where_in('payment_type', ['Receivable', 'Income']);
		$this->db->group_start()->like('so_code', $search)->or_like('receipt_code', $search)->or_like('customer_name', $search)->group_end();
		return $this->db->count_all_results();
	}

	/*----------------------------- DAILY CASH RECEIVED -------------------------------*/
	function all_daily_cash_received_count($date = '') {
		$this->db->select('timestamp')->distinct()->from('payment')->where('receipt_code IS NOT NULL');
		if ($date != 0) $this->db->where('timestamp', $date);
		return $this->db->count_all_results();
	}

	function all_daily_cash_received($date = '', $limit, $start, $col, $dir) {
		$this->db->select('timestamp')->distinct()->from('payment');
		if ($date != 0) $this->db->where('timestamp', $date);
		
		return $this->db->where('receipt_code IS NOT NULL')->limit($limit, $start)->order_by($col, $dir)->get()->result_array() ?: [];
	}

	function daily_cash_received_search($date = '', $limit, $start, $search, $col, $dir) {
		if ($date != 0) $this->db->where('timestamp', $date);
		return $this->db->like('timestamp', $search)->limit($limit, $start)->order_by($col, $dir)->get('payment')->result_array() ?: [];
	}

	function daily_cash_received_search_count($date = '', $search) {
		if ($date != 0) $this->db->where('timestamp', $date);
		$this->db->like('timestamp', $search);
		return $this->db->count_all_results('payment');
	}



	/*----------------------------- ATTENDANCE -------------------------------*/
	function all_att_count() {
		$query = $this->db->get('attendance');
		return $query->num_rows();
	}

	function all_att($limit, $start, $col, $dir) {
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('attendance')->result() ?: [];
	}

	function att_search($limit, $start, $search, $col, $dir) {
		$this->db->from('attendance')->join('admin', 'admin.admin_id = attendance.user_id')->like('attendance_id', $search);
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get()->result() ?: [];
	}

	function att_search_count($search) {
		$this->db->from('attendance')->join('admin', 'admin.admin_id = attendance.user_id')->like('user_id', $search);
		return $this->db->count_all_results();
	}

	/*----------------------------- TEACHERS -------------------------------*/

	function all_teachers_count() {
		$query = $this->db->get('teacher');
		return $query->num_rows();
	}

	function all_teachers($limit, $start, $col, $dir) {
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('teacher')->result() ?: [];
	}

	function teacher_search($limit, $start, $search, $col, $dir) {
		$this->db->group_start()->like('teacher_id', $search)->or_like('name', $search)->or_like('email', $search)->or_like('phone', $search)->or_like('teacher_code', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('teacher')->result() ?: [];
	}

	function teacher_search_count($search) {
		$this->db->group_start()->like('teacher_id', $search)->or_like('name', $search)->or_like('email', $search)->or_like('phone', $search)->or_like('teacher_code', $search)->group_end();
		return $this->db->count_all_results('teacher');
	}

	/*----------------------------- TEACHERS -------------------------------*/

	/*----------------------------- PARENTS -------------------------------*/

	function all_parents_count() {
		$query = $this->db->get('parent');
		return $query->num_rows();
	}

	function all_inactive_parents_count() {
		$pt_ids_array = $this->get_active_parent_ids();
		return $this->db->where_not_in('parent_id', $pt_ids_array)->count_all_results('parent');
	}

	function all_active_parents_count() {
		$pt_ids_array = $this->get_active_parent_ids();
		return $this->db->where_in('parent_id', $pt_ids_array)->count_all_results('parent');
	}

	function all_active_parents($limit, $start, $col, $dir) {
		$pt_ids_array = $this->get_active_parent_ids();
		return $this->db->where_in('parent_id', $pt_ids_array)->limit($limit, $start)->order_by($col, $dir)->get('parent')->result() ?: [];
	}

	private function get_active_parent_ids() {
		$running_year = get_settings('running_year');
		$running_term = get_settings('running_term');
		
		$st_ids = $this->db->select('student_id')->where('year', $running_year)->where('term', $running_term)->get('enroll')->result_array();
		if (empty($st_ids)) return [0];
		
		$st_ids_array = array_column($st_ids, 'student_id');
		$pt_ids = $this->db->select('parent_id')->where_in('student_id', $st_ids_array)->get('student')->result_array();
		return empty($pt_ids) ? [0] : array_column($pt_ids, 'parent_id');
	}

	function all_inactive_parents($limit, $start, $col, $dir) {
		$pt_ids_array = $this->get_active_parent_ids();
		return $this->db->where_not_in('parent_id', $pt_ids_array)->limit($limit, $start)->order_by($col, $dir)->get('parent')->result() ?: [];
	}

	function active_parent_search($limit, $start, $search, $col, $dir) {
		$pt_ids_array = $this->get_active_parent_ids();
		$this->db->where_in('parent_id', $pt_ids_array);
		$this->db->group_start()->like('parent_id', $search)->or_like('name', $search)->or_like('email', $search)->or_like('phone', $search)->or_like('profession', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('parent')->result() ?: [];
	}

	function inactive_parent_search($limit, $start, $search, $col, $dir) {
		$pt_ids_array = $this->get_active_parent_ids();
		$this->db->where_not_in('parent_id', $pt_ids_array);
		$this->db->group_start()->like('parent_id', $search)->or_like('name', $search)->or_like('email', $search)->or_like('phone', $search)->or_like('profession', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('parent')->result() ?: [];
	}

	function active_parent_search_count($search) {
		$pt_ids_array = $this->get_active_parent_ids();
		$this->db->where_in('parent_id', $pt_ids_array);
		$this->db->group_start()->like('parent_id', $search)->or_like('name', $search)->or_like('email', $search)->or_like('phone', $search)->or_like('profession', $search)->group_end();
		return $this->db->count_all_results('parent');
	}

	function inactive_parent_search_count($search) {
		$pt_ids_array = $this->get_active_parent_ids();
		$this->db->where_not_in('parent_id', $pt_ids_array);
		$this->db->group_start()->like('parent_id', $search)->or_like('name', $search)->or_like('email', $search)->or_like('phone', $search)->or_like('profession', $search)->group_end();
		return $this->db->count_all_results('parent');
	}

	function all_parents($limit, $start, $col, $dir) {
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('parent')->result() ?: [];
	}

	function parent_search($limit, $start, $search, $col, $dir) {
		$this->db->group_start()->like('parent_id', $search)->or_like('name', $search)->or_like('email', $search)->or_like('phone', $search)->or_like('profession', $search)->group_end();
		return $this->db->limit($limit, $start)->order_by($col, $dir)->get('parent')->result() ?: [];
	}

	function parent_search_count($search) {
		$this->db->group_start()->like('parent_id', $search)->or_like('name', $search)->or_like('email', $search)->or_like('phone', $search)->or_like('profession', $search)->group_end();
		return $this->db->count_all_results('parent');
	}

	/*----------------------------- LOAD RECEIPT BY DATE -------------------------------*/

	function get_receipt_bydate($search = '', $date = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		if ($search == 'search') {

			$date_timestamp = strtotime($date);

		} else {

			$date_timestamp = strtotime(date('d-m-Y'));

		}

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'invoice_id !=' => NULL))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'invoice_id !=' => NULL))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function get_feeding_fee_receipt_bydate($search = '', $date = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		if ($search == 'search') {

			$date_timestamp = strtotime($date);

		} else {

			$date_timestamp = strtotime(date('d-m-Y'));

		}

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'invoice_id' => NULL, 'title' => 'Feeding Fee'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'invoice_id' => NULL, 'title' => 'Feeding Fee'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function get_classes_fee_receipt_bydate($search = '', $date = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		if ($search == 'search') {

			$date_timestamp = strtotime($date);

		} else {

			$date_timestamp = strtotime(date('d-m-Y'));

		}

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'invoice_id' => NULL, 'title' => 'Classes Fee'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'invoice_id' => NULL, 'title' => 'Classes Fee'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function get_transport_fare_receipt_bydate($search = '', $date = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		if ($search == 'search') {

			$date_timestamp = strtotime($date);

		} else {

			$date_timestamp = strtotime(date('d-m-Y'));

		}

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'invoice_id' => NULL, 'title' => 'Transport Fare'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'invoice_id' => NULL, 'title' => 'Transport Fare'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function issuer_update($date = '', $issuer_id = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$date_timestamp = strtotime($date);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'issuer_id' => $issuer_id, 'invoice_id !=' => NULL))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'issuer_id' => $issuer_id, 'invoice_id !=' => NULL))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function feeding_fee_issuer_update($date = '', $issuer_id = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$date_timestamp = strtotime($date);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'issuer_id' => $issuer_id, 'invoice_id' => NULL, 'title' => 'Feeding Fee'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'issuer_id' => $issuer_id, 'invoice_id' => NULL, 'title' => 'Feeding Fee'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function classes_fee_issuer_update($date = '', $issuer_id = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$date_timestamp = strtotime($date);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'issuer_id' => $issuer_id, 'invoice_id' => NULL, 'title' => 'Classes Fee'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'issuer_id' => $issuer_id, 'invoice_id' => NULL, 'title' => 'Classes Fee'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function transport_fare_issuer_update($date = '', $issuer_id = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$date_timestamp = strtotime($date);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'issuer_id' => $issuer_id, 'invoice_id' => NULL, 'title' => 'Transport Fare'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'issuer_id' => $issuer_id, 'invoice_id' => NULL, 'title' => 'Transport Fare'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function class_update($date = '', $class_id = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$date_timestamp = strtotime($date);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'class_id' => $class_id, 'invoice_id !=' => NULL))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'class_id' => $class_id, 'invoice_id !=' => NULL))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function feeding_fee_class_update($date = '', $class_id = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$date_timestamp = strtotime($date);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'class_id' => $class_id, 'invoice_id' => NULL, 'title' => 'Feeding Fee'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'class_id' => $class_id, 'invoice_id' => NULL, 'title' => 'Feeding Fee'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function classes_fee_class_update($date = '', $class_id = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$date_timestamp = strtotime($date);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'class_id' => $class_id, 'invoice_id' => NULL, 'title' => 'Classes Fee'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'class_id' => $class_id, 'invoice_id' => NULL, 'title' => 'Classes Fee'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function transport_fare_class_update($date = '', $class_id = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$date_timestamp = strtotime($date);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'class_id' => $class_id, 'invoice_id' => NULL, 'title' => 'Transport Fare'))->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', array('day_timestamp' => $date_timestamp, 'class_id' => $class_id, 'invoice_id' => NULL, 'title' => 'Transport Fare'))->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function get_receipt_byterm($search = '', $year = '', $term = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		if ($search == 'search') {

			$selected_year = $year;
			$selected_term = $term;

		} else {

			$selected_year = get_settings('running_year');
			$selected_term = get_settings('running_term');

		}

		$data_array = array(
			'year' => $selected_year,
			'term' => $selected_term,
			'invoice_id !=' => NULL,
		);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', $data_array)->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', $data_array)->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['duration'] = 'Year: ' . $selected_year . '| Term: ' . $selected_term;
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['duration'] = 'Year: ' . $selected_year . '| Term: ' . $selected_term;
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function issuer_update_term($issuer_id = '', $year = '', $term = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$selected_year = $year;
		$selected_term = $term;

		$data_array = array(
			'issuer_id' => $issuer_id,
			'year' => $selected_year,
			'term' => $selected_term,
			'invoice_id !=' => NULL,
		);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', $data_array)->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', $data_array)->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['duration'] = 'Year: ' . $selected_year . '| Term: ' . $selected_term;
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	function class_update_term($class_id = '', $year = '', $term = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		$selected_year = $year;
		$selected_term = $term;

		$data_array = array(
			'class_id' => $class_id,
			'year' => $selected_year,
			'term' => $selected_term,
			'invoice_id !=' => NULL,
		);

		$this->db->select_sum('amount');
		$receipt_issued = $this->db->get_where('payment', $data_array)->result_array();

		$total_receipt_issued_amount = 0;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$total_receipt_issued = $this->db->get_where('payment', $data_array)->num_rows();

		foreach ($receipt_issued as $re) {
			$total_receipt_issued_amount = $total_receipt_issued_amount + $re['amount'];
		}

		if ($total_receipt_issued < 1) {
			$nestedData['duration'] = 'Year: ' . $selected_year . '| Term: ' . $selected_term;
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = 'Data Not Available';
		} else {
			$nestedData['duration'] = 'Year: ' . $selected_year . '| Term: ' . $selected_term;
			$nestedData['total_number'] = $total_receipt_issued;
			$nestedData['total_amount'] = numfmt_format_currency($fmt, $total_receipt_issued_amount, $currency);
		}

		$data[] = $nestedData;

		echo json_encode($data);

	}

	//for feeding, classes fees and transport fare by date
	function get_fct_bydate($search = '', $date = '') {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		if ($search == 'search') {

			$date_timestamp = strtotime($date);

		} else {

			$date_timestamp = strtotime(date('d-m-Y'));

		}

		//feeding and classes fee
		$feeding_owe_now = $this->db->get_where('feeding_fee', array('timestamp' => $date_timestamp))->result_array();

		$total_feeding_owe = 0;
		$total_feeding_paid = 0;

		$total_classes_owe = 0;
		$total_classes_paid = 0;

		foreach ($feeding_owe_now as $feeding) {
			$total_feeding_owe = $total_feeding_owe + $feeding['due'];
			$total_classes_owe = $total_classes_owe + $feeding['cdue'];
		}

		$feeding_paid_array = $this->db->get_where('feeding_fee', array('timestamp' => $date_timestamp))->result_array();

		foreach ($feeding_paid_array as $feeding2) {

			$total_feeding_paid = $total_feeding_paid + $feeding2['feeding_paid'];
			$total_classes_paid = $total_classes_paid + $feeding2['classes_paid'];
		}

		//fare
		$fare_owe_now = $this->db->get_where('transport_fare', array('timestamp' => $date_timestamp))->result_array();

		$total_fare_owe = 0;
		$total_fare_paid = 0;
		foreach ($fare_owe_now as $fare) {
			$total_fare_owe = $total_fare_owe + $fare['due'];
		}

		$fare_paid_array = $this->db->get_where('transport_fare', array('timestamp' => $date_timestamp))->result_array();
		foreach ($fare_paid_array as $fare2) {
			$total_fare_paid = $total_fare_paid + $fare2['amount_paid'];
		}

		//summary
		$fo = $total_feeding_owe;
		$co = $total_classes_owe;
		$to = $total_fare_owe;

		$total_feeding_owe = numfmt_format_currency($fmt, $total_feeding_owe, $currency);
		$total_fare_owe = numfmt_format_currency($fmt, $total_fare_owe, $currency);
		$total_classes_owe = numfmt_format_currency($fmt, $total_classes_owe, $currency);

		$total_feeding_paid = numfmt_format_currency($fmt, $total_feeding_paid, $currency);
		$total_fare_paid = numfmt_format_currency($fmt, $total_fare_paid, $currency);
		$total_classes_paid = numfmt_format_currency($fmt, $total_classes_paid, $currency);

		//payments
		$nestedData['total_feeding_paid'] = $total_feeding_paid;
		$nestedData['total_classes_paid'] = $total_classes_paid;
		$nestedData['total_fare_paid'] = $total_fare_paid;

		//owings
		$nestedData['total_feeding_owe'] = $total_feeding_owe;
		$nestedData['total_classes_owe'] = $total_classes_owe;
		$nestedData['total_fare_owe'] = $total_fare_owe;

		$nestedData['fo'] = $fo;
		$nestedData['co'] = $co;
		$nestedData['to'] = $to;

		$nestedData['date_chosen'] = date('l M d, Y', $date_timestamp);
		$nestedData['timestamp'] = $date_timestamp;

		$data[] = $nestedData;

		echo json_encode($data);

	}

	//for feeding, classes fees and transport fare by term
	function get_fct_byterm($search = '', $year = '', $term = '') {
		$running_year = get_settings('running_year');
		$running_term = get_settings('running_term');

		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

		if ($search == 'search') {
			$year;
			$term;

			$un_year = $year;
			$un_term = $term;

		} else {
			$un_year = $running_year;
			$un_term = $running_term;

		}

		//feeding and classes fee

		$total_feeding_paid = 0;

		$total_classes_paid = 0;

		$feeding_paid_array = $this->db->get_where('feeding_fee', array('year' => $un_year, 'term' => $un_term))->result_array();

		foreach ($feeding_paid_array as $feeding2) {

			$total_feeding_paid = $total_feeding_paid + $feeding2['feeding_paid'];
			$total_classes_paid = $total_classes_paid + $feeding2['classes_paid'];
		}

		//fare
		$total_fare_paid = 0;

		$fare_paid_array = $this->db->get_where('transport_fare', array('year' => $un_year, 'term' => $un_term))->result_array();
		foreach ($fare_paid_array as $fare2) {
			$total_fare_paid = $total_fare_paid + $fare2['amount_paid'];
		}

		//summary
		$total_feeding_paid = numfmt_format_currency($fmt, $total_feeding_paid, $currency);
		$total_fare_paid = numfmt_format_currency($fmt, $total_fare_paid, $currency);
		$total_classes_paid = numfmt_format_currency($fmt, $total_classes_paid, $currency);

		$nestedData['total_feeding_paid'] = $total_feeding_paid;
		$nestedData['total_classes_paid'] = $total_classes_paid;
		$nestedData['total_fare_paid'] = $total_fare_paid;
		$nestedData['duration_chosen'] = 'Year|Term: ' . $year . '|' . $term;

		$data[] = $nestedData;

		echo json_encode($data);

	}

	//by date on modal
	function get_receipt_bydate_modal($param2) {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
		$active_sms_service = $this->db->get_where('settings', array('type' => 'active_sms_service'))->row()->description;

		$param2 = strtotime($param2);
		$this->db->select('receipt_code');
		$this->db->distinct();

		$check = $this->db->get_where('payment', array('day_timestamp' => $param2, 'invoice_id !=' => NULL));
		$receipt_issued = $check->result_array();

		if ($check->num_rows() < 1) {
			echo '<tr>
                    <td align="center" rowspan="10"><h4>No Data Found</h4></td>
                    </tr>';
		} else {
			$receipt_code_array = array();
			foreach ($receipt_issued as $row) {
				array_push($receipt_code_array, $row['receipt_code']);
			}

			$total_amount = 0;
			for ($i = 0; $i < count($receipt_code_array); $i++) {
				//total amount selection
				$this->db->select_sum('amount');
				$receipt_amount = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id !=' => NULL))->result_array();

				foreach ($receipt_amount as $ra) {
					$total_amount = $total_amount + $ra['amount'];
				}

				//generation selection
				$this->db->limit(1);
				$receipts = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id !=' => NULL))->result_array();

				foreach ($receipts as $row):
					$gender = $this->db->get_where('student', array('student_id' => $row['student_id']))->row()->sex;

					//who issued the receipt
					$issuer_id = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->issuer_id;

					$issuer_name = $this->db->get_where('admin', array('admin_id' => $issuer_id))->row()->name;
					$account_type = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->account_type;

					if (!empty($issuer_name) && !empty($account_type)) {
						$issuer_name = $issuer_name . '<small>(' . $account_type . ')</small>';
					} else {
						$issuer_name = 'Not Available';
					}

					//add section A or B if the class has more than one section
					$class_id = $this->db->get_where('enroll', array('student_id' => $row['student_id']))->row()->class_id;
					$class_name = $this->db->get_where('class', array('class_id' => $class_id))->row()->name;
					$class_name_numeric = $this->db->get_where('class', array('class_id' => $class_id))->row()->name_numeric;
					$section_name = $this->db->get_where('section', array('class_id' => $class_id))->row()->name;
					$class_has_more_sections = $this->db->get_where('class', array('name' => $class_name, 'name_numeric' => $class_name_numeric))->num_rows();
					$sec_name = '';
					if ($class_has_more_sections > 1) {
						$sec_name = $section_name;
					}

					$class = '';
					if ($class_name == 'CRECHE') {
						$class = $class_name;
					} else {
						$class = $class_name . ' ' . $class_name_numeric . $sec_name;
					}

					echo ' <tr>
	                            <td>' . $this->db->get_where('student', array(
						'student_id' => $row['student_id']))->row()->student_code . '</td>

	                            <td align="center"><img src="' . $this->crud_model->get_image_url('student', $row['student_id'], $gender) . '" class="img-circle" width="30" /></td>
	                            <td>

	                                    ' . $this->db->get_where('student', array(
						'student_id' => $row['student_id'],
					))->row()->name
					. '
	                            </td>
	                            <td>
	                                ' . $class . '
	                            </td>
	                            <td>

	                                    ' . $receipt_code_array[$i] . '

	                            </td>
	                            <td style="text-align: right">' .

					numfmt_format_currency($fmt, $total_amount, $currency) . '

	                            </td>
	                            <td>

	                                ' . date('l M d, Y H:s:i', $row['timestamp']) . '

	                            </td>
	                            <td>
	                                ' .
					$row['year'] . '|' . $row['term'] . '

	                            </td>
	                            <td>
	                                ' . $issuer_name . '

	                            </td>
	                            <td>

	                                <div class="btn-group">
	                                    <button type="button" class="btn btn-info btn-sm dropdown-toggle" data-toggle="dropdown">
	                                        Action <span class="caret"></span>
	                                    </button>
	                                    <ul class="dropdown-menu dropdown-default pull-right" role="menu">

	                                        <!-- STUDENT PROFILE LINK -->
	                                        <li>
	                                            <a href="#" style="color: #0029ff;" onclick="invoice_pay_modal(' . $row['student_id'] . ',' . $param2 . ')">
	                                                <i class="entypo-credit-card"></i>
	                                                    ' . get_phrase('view_student\'s_receipt') . '
	                                                </a>
	                                        </li>
	                                        <li class="divider"></li>

	                                        <!-- SMS LINK -->
	                                        <li>
	                                            <a href="' . site_url('admin/message/sms_send?si=' . $row['student_id']) . '" class="pt_link" onclick="check_sms_status()" style="color: green;"><i class="glyphicon glyphicon-envelope"></i>
	                                                ' . get_phrase('send_sMS') . '
	                                            </a>
	                                        </li>
	                                        <li class="divider"></li>
	                                    </ul>
	                                </div>

	                            </td>
	                        </tr>';

					//let's reset the total amount value to 0
					$total_amount = 0;
				endforeach;
			}
		}

	}

	//feeding fee  by date on modal
	function get_feeding_fee_receipt_bydate_modal($param2) {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
		$active_sms_service = $this->db->get_where('settings', array('type' => 'active_sms_service'))->row()->description;

		$param2 = strtotime($param2);
		$this->db->select('receipt_code');
		$this->db->distinct();

		$check = $this->db->get_where('payment', array('day_timestamp' => $param2, 'invoice_id' => NULL, 'title' => 'Feeding Fee'));
		$receipt_issued = $check->result_array();

		if ($check->num_rows() < 1) {
			echo '<tr>
                    <td align="center" rowspan="10"><h4>No Data Found</h4></td>
                    </tr>';
		} else {
			$receipt_code_array = array();
			foreach ($receipt_issued as $row) {
				array_push($receipt_code_array, $row['receipt_code']);
			}

			$total_amount = 0;
			for ($i = 0; $i < count($receipt_code_array); $i++) {
				//total amount selection
				$this->db->select_sum('amount');
				$receipt_amount = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id' => NULL, 'title' => 'Feeding Fee'))->result_array();

				foreach ($receipt_amount as $ra) {
					$total_amount = $total_amount + $ra['amount'];
				}

				//generation selection
				$this->db->limit(1);
				$receipts = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id' => NULL, 'title' => 'Feeding Fee'))->result_array();

				foreach ($receipts as $row):
					$gender = $this->db->get_where('student', array('student_id' => $row['student_id']))->row()->sex;

					//who issued the receipt
					$issuer_id = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->issuer_id;

					if (substr($issuer_id, 0, 1) == 't') {
						//find out it is a teacher
						$issuer_id = substr($issuer_id, 1);
						$issuer_name = $this->db->get_where('teacher', array('teacher_id' => $issuer_id))->row()->name;
						$account_type = 'Teacher';

					} else {
						//not a teacher
						$issuer_name = $this->db->get_where('admin', array('admin_id' => $issuer_id))->row()->name;
						$account_type = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->account_type;
					}

					if (!empty($issuer_name) && !empty($account_type)) {
						$issuer_name = $issuer_name . '<small>(' . $account_type . ')</small>';
					} else {
						$issuer_name = 'Not Available';
					}

					//add section A or B if the class has more than one section
					$class_id = $this->db->get_where('enroll', array('student_id' => $row['student_id']))->row()->class_id;
					$class_name = $this->db->get_where('class', array('class_id' => $class_id))->row()->name;
					$class_name_numeric = $this->db->get_where('class', array('class_id' => $class_id))->row()->name_numeric;
					$section_name = $this->db->get_where('section', array('class_id' => $class_id))->row()->name;
					$class_has_more_sections = $this->db->get_where('class', array('name' => $class_name, 'name_numeric' => $class_name_numeric))->num_rows();
					$sec_name = '';
					if ($class_has_more_sections > 1) {
						$sec_name = $section_name;
					}

					$class = '';
					if ($class_name == 'CRECHE') {
						$class = $class_name;
					} else {
						$class = $class_name . ' ' . $class_name_numeric . $sec_name;
					}

					echo ' <tr>
	                            <td>' . $this->db->get_where('student', array(
						'student_id' => $row['student_id']))->row()->student_code . '</td>

	                            <td align="center"><img src="' . $this->crud_model->get_image_url('student', $row['student_id'], $gender) . '" class="img-circle" width="30" /></td>
	                            <td>

	                                    ' . $this->db->get_where('student', array(
						'student_id' => $row['student_id'],
					))->row()->name
					. '
	                            </td>
	                            <td>
	                                ' . $class . '
	                            </td>
	                            <td>

	                                    ' . $receipt_code_array[$i] . '

	                            </td>
	                            <td style="text-align: right">' .

					numfmt_format_currency($fmt, $total_amount, $currency) . '

	                            </td>
	                            <td>

	                                ' . date('l M d, Y H:s:i', $row['timestamp']) . '

	                            </td>
	                            <td>
	                                ' .
					$row['year'] . '|' . $row['term'] . '

	                            </td>
	                            <td>
	                                ' . $issuer_name . '

	                            </td>
	                            <td>

	                                <div class="btn-group">
	                                    <button type="button" class="btn btn-info btn-sm dropdown-toggle" data-toggle="dropdown">
	                                        Action <span class="caret"></span>
	                                    </button>
	                                    <ul class="dropdown-menu dropdown-default pull-right" role="menu">

	                                        <!-- STUDENT PROFILE LINK -->
	                                        <li>
	                                            <a href="#" style="color: #0029ff;" onclick="invoice_pay_modal(' . $row['student_id'] . ',' . $param2 . ', \'Feeding Fee\')">
	                                                <i class="entypo-credit-card"></i>
	                                                    ' . get_phrase('view_student\'s_receipt') . '
	                                                </a>
	                                        </li>
	                                        <li class="divider"></li>

	                                        <!-- SMS LINK -->
	                                        <li>
	                                            <a href="' . site_url('admin/message/sms_send?si=' . $row['student_id']) . '" class="pt_link" onclick="check_sms_status()" style="color: green;"><i class="glyphicon glyphicon-envelope"></i>
	                                                ' . get_phrase('send_sMS') . '
	                                            </a>
	                                        </li>
	                                        <li class="divider"></li>
	                                    </ul>
	                                </div>

	                            </td>
	                        </tr>';

					//let's reset the total amount value to 0
					$total_amount = 0;
				endforeach;
			}
		}

	}

	//classes fee  by date on modal
	function get_classes_fee_receipt_bydate_modal($param2) {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
		$active_sms_service = $this->db->get_where('settings', array('type' => 'active_sms_service'))->row()->description;

		$param2 = strtotime($param2);
		$this->db->select('receipt_code');
		$this->db->distinct();

		$check = $this->db->get_where('payment', array('day_timestamp' => $param2, 'invoice_id' => NULL, 'title' => 'Classes Fee'));
		$receipt_issued = $check->result_array();

		if ($check->num_rows() < 1) {
			echo '<tr>
                    <td align="center" rowspan="10"><h4>No Data Found</h4></td>
                    </tr>';
		} else {
			$receipt_code_array = array();
			foreach ($receipt_issued as $row) {
				array_push($receipt_code_array, $row['receipt_code']);
			}

			$total_amount = 0;
			for ($i = 0; $i < count($receipt_code_array); $i++) {
				//total amount selection
				$this->db->select_sum('amount');
				$receipt_amount = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id' => NULL, 'title' => 'Classes Fee'))->result_array();

				foreach ($receipt_amount as $ra) {
					$total_amount = $total_amount + $ra['amount'];
				}

				//generation selection
				$this->db->limit(1);
				$receipts = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id' => NULL, 'title' => 'Classes Fee'))->result_array();

				foreach ($receipts as $row):
					$gender = $this->db->get_where('student', array('student_id' => $row['student_id']))->row()->sex;

					//who issued the receipt
					$issuer_id = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->issuer_id;

					if (substr($issuer_id, 0, 1) == 't') {
						//find out it is a teacher
						$issuer_id = substr($issuer_id, 1);
						$issuer_name = $this->db->get_where('teacher', array('teacher_id' => $issuer_id))->row()->name;
						$account_type = 'Teacher';

					} else {
						//not a teacher
						$issuer_name = $this->db->get_where('admin', array('admin_id' => $issuer_id))->row()->name;
						$account_type = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->account_type;
					}

					if (!empty($issuer_name) && !empty($account_type)) {
						$issuer_name = $issuer_name . '<small>(' . $account_type . ')</small>';
					} else {
						$issuer_name = 'Not Available';
					}

					//add section A or B if the class has more than one section
					$class_id = $this->db->get_where('enroll', array('student_id' => $row['student_id']))->row()->class_id;
					$class_name = $this->db->get_where('class', array('class_id' => $class_id))->row()->name;
					$class_name_numeric = $this->db->get_where('class', array('class_id' => $class_id))->row()->name_numeric;
					$section_name = $this->db->get_where('section', array('class_id' => $class_id))->row()->name;
					$class_has_more_sections = $this->db->get_where('class', array('name' => $class_name, 'name_numeric' => $class_name_numeric))->num_rows();
					$sec_name = '';
					if ($class_has_more_sections > 1) {
						$sec_name = $section_name;
					}

					$class = '';
					if ($class_name == 'CRECHE') {
						$class = $class_name;
					} else {
						$class = $class_name . ' ' . $class_name_numeric . $sec_name;
					}

					echo ' <tr>
	                            <td>' . $this->db->get_where('student', array(
						'student_id' => $row['student_id']))->row()->student_code . '</td>

	                            <td align="center"><img src="' . $this->crud_model->get_image_url('student', $row['student_id'], $gender) . '" class="img-circle" width="30" /></td>
	                            <td>

	                                    ' . $this->db->get_where('student', array(
						'student_id' => $row['student_id'],
					))->row()->name
					. '
	                            </td>
	                            <td>
	                                ' . $class . '
	                            </td>
	                            <td>

	                                    ' . $receipt_code_array[$i] . '

	                            </td>
	                            <td style="text-align: right">' .

					numfmt_format_currency($fmt, $total_amount, $currency) . '

	                            </td>
	                            <td>

	                                ' . date('l M d, Y H:s:i', $row['timestamp']) . '

	                            </td>
	                            <td>
	                                ' .
					$row['year'] . '|' . $row['term'] . '

	                            </td>
	                            <td>
	                                ' . $issuer_name . '

	                            </td>
	                            <td>

	                                <div class="btn-group">
	                                    <button type="button" class="btn btn-info btn-sm dropdown-toggle" data-toggle="dropdown">
	                                        Action <span class="caret"></span>
	                                    </button>
	                                    <ul class="dropdown-menu dropdown-default pull-right" role="menu">

	                                        <!-- STUDENT PROFILE LINK -->
	                                        <li>
	                                            <a href="#" style="color: #0029ff;" onclick="invoice_pay_modal(' . $row['student_id'] . ',' . $param2 . ', \'Classes Fee\')">
	                                                <i class="entypo-credit-card"></i>
	                                                    ' . get_phrase('view_student\'s_receipt') . '
	                                                </a>
	                                        </li>
	                                        <li class="divider"></li>

	                                        <!-- SMS LINK -->
	                                        <li>
	                                            <a href="' . site_url('admin/message/sms_send?si=' . $row['student_id']) . '" class="pt_link" onclick="check_sms_status()" style="color: green;"><i class="glyphicon glyphicon-envelope"></i>
	                                                ' . get_phrase('send_sMS') . '
	                                            </a>
	                                        </li>
	                                        <li class="divider"></li>
	                                    </ul>
	                                </div>

	                            </td>
	                        </tr>';

					//let's reset the total amount value to 0
					$total_amount = 0;
				endforeach;
			}
		}

	}

	//feeding fee  by date on modal
	function get_transport_fare_receipt_bydate_modal($param2) {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
		$active_sms_service = $this->db->get_where('settings', array('type' => 'active_sms_service'))->row()->description;

		$param2 = strtotime($param2);
		$this->db->select('receipt_code');
		$this->db->distinct();

		$check = $this->db->get_where('payment', array('day_timestamp' => $param2, 'invoice_id' => NULL, 'title' => 'Transport Fare'));
		$receipt_issued = $check->result_array();

		if ($check->num_rows() < 1) {
			echo '<tr>
                    <td align="center" rowspan="10"><h4>No Data Found</h4></td>
                    </tr>';
		} else {
			$receipt_code_array = array();
			foreach ($receipt_issued as $row) {
				array_push($receipt_code_array, $row['receipt_code']);
			}

			$total_amount = 0;
			for ($i = 0; $i < count($receipt_code_array); $i++) {
				//total amount selection
				$this->db->select_sum('amount');
				$receipt_amount = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id' => NULL, 'title' => 'Transport Fare'))->result_array();

				foreach ($receipt_amount as $ra) {
					$total_amount = $total_amount + $ra['amount'];
				}

				//general selections
				$this->db->limit(1);
				$receipts = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id' => NULL, 'title' => 'Transport Fare'))->result_array();

				foreach ($receipts as $row):
					$gender = $this->db->get_where('student', array('student_id' => $row['student_id']))->row()->sex;

					//who issued the receipt
					$issuer_id = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->issuer_id;

					if (substr($issuer_id, 0, 1) == 't') {
						//find out it is a teacher
						$issuer_id = substr($issuer_id, 1);
						$issuer_name = $this->db->get_where('teacher', array('teacher_id' => $issuer_id))->row()->name;
						$account_type = 'Teacher';

					} else {
						//not a teacher
						$issuer_name = $this->db->get_where('admin', array('admin_id' => $issuer_id))->row()->name;
						$account_type = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->account_type;
					}

					if (!empty($issuer_name) && !empty($account_type)) {
						$issuer_name = $issuer_name . '<small>(' . $account_type . ')</small>';
					} else {
						$issuer_name = 'Not Available';
					}

					//add section A or B if the class has more than one section
					$class_id = $this->db->get_where('enroll', array('student_id' => $row['student_id']))->row()->class_id;
					$class_name = $this->db->get_where('class', array('class_id' => $class_id))->row()->name;
					$class_name_numeric = $this->db->get_where('class', array('class_id' => $class_id))->row()->name_numeric;
					$section_name = $this->db->get_where('section', array('class_id' => $class_id))->row()->name;
					$class_has_more_sections = $this->db->get_where('class', array('name' => $class_name, 'name_numeric' => $class_name_numeric))->num_rows();
					$sec_name = '';
					if ($class_has_more_sections > 1) {
						$sec_name = $section_name;
					}

					$class = '';
					if ($class_name == 'CRECHE') {
						$class = $class_name;
					} else {
						$class = $class_name . ' ' . $class_name_numeric . $sec_name;
					}

					echo ' <tr>
	                            <td>' . $this->db->get_where('student', array(
						'student_id' => $row['student_id']))->row()->student_code . '</td>

	                            <td align="center"><img src="' . $this->crud_model->get_image_url('student', $row['student_id'], $gender) . '" class="img-circle" width="30" /></td>
	                            <td>

	                                    ' . $this->db->get_where('student', array(
						'student_id' => $row['student_id'],
					))->row()->name
					. '
	                            </td>
	                            <td>
	                                ' . $class . '
	                            </td>
	                            <td>

	                                    ' . $receipt_code_array[$i] . '

	                            </td>
	                            <td style="text-align: right">' .

					numfmt_format_currency($fmt, $total_amount, $currency) . '

	                            </td>
	                            <td>

	                                ' . date('l M d, Y H:s:i', $row['timestamp']) . '

	                            </td>
	                            <td>
	                                ' .
					$row['year'] . '|' . $row['term'] . '

	                            </td>
	                            <td>
	                                ' . $issuer_name . '

	                            </td>
	                            <td>

	                                <div class="btn-group">
	                                    <button type="button" class="btn btn-info btn-sm dropdown-toggle" data-toggle="dropdown">
	                                        Action <span class="caret"></span>
	                                    </button>
	                                    <ul class="dropdown-menu dropdown-default pull-right" role="menu">

	                                        <!-- STUDENT PROFILE LINK -->
	                                        <li>
	                                            <a href="#" style="color: #0029ff;" onclick="invoice_pay_modal(' . $row['student_id'] . ',' . $param2 . ', \'Transport Fare\')">
	                                                <i class="entypo-credit-card"></i>
	                                                    ' . get_phrase('view_student\'s_receipt') . '
	                                                </a>
	                                        </li>
	                                        <li class="divider"></li>

	                                        <!-- SMS LINK -->
	                                        <li>
	                                            <a href="' . site_url('admin/message/sms_send?si=' . $row['student_id']) . '" class="pt_link" onclick="check_sms_status()" style="color: green;"><i class="glyphicon glyphicon-envelope"></i>
	                                                ' . get_phrase('send_sMS') . '
	                                            </a>
	                                        </li>
	                                        <li class="divider"></li>
	                                    </ul>
	                                </div>

	                            </td>
	                        </tr>';

					//let's reset the total amount value to 0
					$total_amount = 0;
				endforeach;
			}
		}

	}

	//by term on modal
	function get_receipt_byterm_modal($param2, $param3) {
		$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
		$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
		$active_sms_service = $this->db->get_where('settings', array('type' => 'active_sms_service'))->row()->description;

		$this->db->select('receipt_code');
		$this->db->distinct();
		$receipt_issued = $this->db->get_where('payment', array('year' => $param2, 'term' => $param3, 'invoice_id !=' => NULL))->result_array();

		$receipt_code_array = array();
		foreach ($receipt_issued as $row) {
			array_push($receipt_code_array, $row['receipt_code']);
		}

		$total_amount = 0;
		for ($i = 0; $i < count($receipt_code_array); $i++) {
			//total amount selection
			$this->db->select_sum('amount');
			$receipt_amount = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id !=' => NULL))->result_array();

			foreach ($receipt_amount as $ra) {
				$total_amount = $total_amount + $ra['amount'];
			}

			//generation selection
			$this->db->limit(1);
			$receipts = $this->db->get_where('payment', array('receipt_code' => $receipt_code_array[$i], 'invoice_id !=' => NULL))->result_array();

			foreach ($receipts as $row):
				$gender = $this->db->get_where('student', array('student_id' => $row['student_id']))->row()->sex;

				//who issued the receipt
				$issuer_id = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->issuer_id;

				$issuer_name = $this->db->get_where('admin', array('admin_id' => $issuer_id))->row()->name;
				$account_type = $this->db->get_where('payment', array('receipt_code' => $row['receipt_code'], 'student_id' => $row['student_id']))->row()->account_type;

				if (!empty($issuer_name) && !empty($account_type)) {
					$issuer_name = $issuer_name . '<small>(' . $account_type . ')</small>';
				} else {
					$issuer_name = 'Not Available';
				}

				//add section A or B if the class has more than one section
				$class_id = $this->db->get_where('enroll', array('student_id' => $row['student_id']))->row()->class_id;
				$class_name = $this->db->get_where('class', array('class_id' => $class_id))->row()->name;
				$class_name_numeric = $this->db->get_where('class', array('class_id' => $class_id))->row()->name_numeric;
				$section_name = $this->db->get_where('section', array('class_id' => $class_id))->row()->name;
				$class_has_more_sections = $this->db->get_where('class', array('name' => $class_name, 'name_numeric' => $class_name_numeric))->num_rows();
				$sec_name = '';
				if ($class_has_more_sections > 1) {
					$sec_name = $section_name;
				}

				$class = '';
				if ($class_name == 'CRECHE') {
					$class = $class_name;
				} else {
					$class = $class_name . ' ' . $class_name_numeric . $sec_name;
				}

				echo ' <tr>
	                            <td>' . $this->db->get_where('student', array(
					'student_id' => $row['student_id']))->row()->student_code . '</td>

	                            <td align="center"><img src="' . $this->crud_model->get_image_url('student', $row['student_id'], $gender) . '" class="img-circle" width="30" /></td>
	                            <td>

	                                    ' . $this->db->get_where('student', array(
					'student_id' => $row['student_id'],
				))->row()->name
				. '
	                            </td>
	                            <td>
	                                ' . $class . '
	                            </td>
	                            <td>

	                                    ' . $receipt_code_array[$i] . '

	                            </td>
	                            <td style="text-align: right">' .

				numfmt_format_currency($fmt, $total_amount, $currency) . '

	                            </td>
	                            <td>

	                                ' . date('l M d, Y H:s:i', $row['timestamp']) . '

	                            </td>
	                            <td>
	                                ' .
				$row['year'] . '|' . $row['term'] . '

	                            </td>
	                            <td>
	                                ' . $issuer_name . '

	                            </td>
	                            <td>

	                                <div class="btn-group">
	                                    <button type="button" class="btn btn-info btn-sm dropdown-toggle" data-toggle="dropdown">
	                                        Action <span class="caret"></span>
	                                    </button>
	                                    <ul class="dropdown-menu dropdown-default pull-right" role="menu">

	                                        <!-- STUDENT PROFILE LINK -->
	                                        <li>
	                                            <a href="#" style="color: #0029ff;" onclick="invoice_pay_modal(' . $row['student_id'] . ',\'' . $param2 . '\',' . $param3 . ')">
	                                                <i class="entypo-credit-card"></i>
	                                                    ' . get_phrase('view_student\'s_receipt') . '
	                                                </a>
	                                        </li>
	                                        <li class="divider"></li>

	                                        <!-- SMS LINK -->
	                                        <li>
	                                            <a href="' . site_url('admin/message/sms_send?si=' . $row['student_id']) . ' class="pt_link" onclick="check_sms_status()" style="color: green;"><i class="glyphicon glyphicon-envelope"></i>
	                                                ' . get_phrase('send_sMS') . '
	                                            </a>
	                                        </li>
	                                        <li class="divider"></li>
	                                    </ul>
	                                </div>
	                            </td>
	                        </tr>';

				//let's reset the total amount value to 0
				$total_amount = 0;
			endforeach;
		}

	}


	function getSOCodeForNewOrder() {
		$so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
		$so_no = $this->db->get_where('settings', array('type' => 'so_no'))->row()->description;

		$this->db->select('so_code')->like('so_code', $so_no_prefix, 'after')->not_like('so_code', 'R', 'before')->order_by('so_code', 'desc')->limit(1);
		$so_query = $this->db->get('sales_order');

		if ($so_query->num_rows() < 1) {
			$this->db->select('so_code')->like('so_code', $so_no_prefix, 'after')->not_like('so_code', 'R', 'before')->order_by('so_code', 'desc')->limit(1);
			$so_query = $this->db->get('general_journal');
		}

		$second_num = 0;
		if ($so_query->num_rows() > 0 && !empty($so_query->row()->so_code)) {
			$so_id = $so_query->row()->so_code;
			$numeric_counter = 0;
			$pos_counter = 0;
			
			for ($i = 0; $i < strlen($so_id); $i++) {
				if (is_numeric($so_id[$i])) {
					$numeric_counter++;
					if($numeric_counter == 2) {
						$second_num = $so_id[$i];
						break;
					}
				}
				$pos_counter++;
			}

			$position_of_second_num = $pos_counter;
			$n_soid = substr($so_id, $position_of_second_num, strlen($so_id) - $i);
			$so_code = $n_soid + 1;

			if ($second_num == 0) {
				$old_len = strlen($so_id);
				$new_len = strlen($so_code);
				$act_len = ($old_len - $new_len);
				$so_code = substr($so_id, 0, $act_len) . $so_code;
			}
		} else {
			$so_code = $so_no_prefix . $so_no;
		}

		return ($second_num == 0) ? $so_code : $so_no_prefix . $so_code;
	}

	function getINVCodeForNewOrder() {
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

	function getPOCodeForNewOrder() {
		$po_no_prefix = $this->db->get_where('settings', array('type' => 'po_prefix'))->row()->description;
		$po_no = $this->db->get_where('settings', array('type' => 'po_no'))->row()->description;

		$this->db->select('po_code')->like('po_code', $po_no_prefix, 'after')->order_by('po_code', 'desc')->limit(1);
		$po_query = $this->db->get('purchase_order');

		if ($po_query->num_rows() < 1) {
			$this->db->select('po_code')->like('po_code', $po_no_prefix, 'after')->order_by('po_code', 'desc')->limit(1);
			$po_query = $this->db->get('general_journal');
		}

		$second_num = 0;
		if ($po_query->num_rows() > 0 && !empty($po_query->row()->po_code)) {
			$po_id = $po_query->row()->po_code;
			$numeric_counter = 0;
			$pos_counter = 0;
			
			for ($i = 0; $i < strlen($po_id); $i++) {
				if (is_numeric($po_id[$i])) {
					$numeric_counter++;
					if($numeric_counter == 2) {
						$second_num = $po_id[$i];
						break;
					}
				}
				$pos_counter++;
			}

			$position_of_second_num = $pos_counter;
			$n_poid = substr($po_id, $position_of_second_num, strlen($po_id) - $i);
			$po_code = $n_poid + 1;

			if ($second_num == 0) {
				$old_len = strlen($po_id);
				$new_len = strlen($po_code);
				$act_len = ($old_len - $new_len);
				$po_code = substr($po_id, 0, $act_len) . $po_code;
			}
		} else {
			$po_code = $po_no_prefix . $po_no;
		}

		return ($second_num == 0) ? $po_code : $po_no_prefix . $po_code;
	}

}