<?php if (!defined('BASEPATH')) {
	exit('No direct script access allowed');
}

if (!function_exists('manager')) {
	function manager($total_rows, $per_page_item) {
		$config['per_page'] = $per_page_item;
		$config['num_links'] = 2;
		$config['total_rows'] = $total_rows;
		$config['full_tag_open'] = '<ul class="pagination justify-content-end">';
		$config['full_tag_close'] = '</ul>';
		$config['prev_link'] = '<span class="page-link">Previous</span>';
		$config['prev_tag_open'] = '<li class="page-item">';
		$config['prev_tag_close'] = '</li>';
		$config['next_link'] = '<span class="page-link">Next</span>';
		$config['next_tag_open'] = '<li class="page-item">';
		$config['next_tag_close'] = '</li>';
		$config['cur_tag_open'] = '<li class="page-item active"><span class="page-link">';
		$config['cur_tag_close'] = '<span class="sr-only">(current)</span></span></li>';
		$config['num_tag_open'] = '<li class="page-item"><span class="page-link">';
		$config['num_tag_close'] = '</span></li>';
		// $config['first_tag_open']  = '<span class="page-link">';
		// $config['first_tag_close'] = '</span>';
		// $config['last_tag_open']   = '<span class="page-link">';
		// $config['last_tag_close']  = '</span>';
		// $config['first_link']      = 'First';
		// $config['last_link']       = 'Last';
		$config['first_link'] = false;
		$config['last_link'] = false;
		return $config;
	}
}
if (!function_exists('get_settings')) {

	function get_settings($type) {

		$CI = get_instance();
		$CI->load->database();
		$des = $CI->db->get_where('settings', array('type' => $type))->row()->description;

		return $des;

	}
}

if (!function_exists('get_spinner_image')) {

	function get_spinner_image($size = 50) {

		$spinner = '<img src="' . base_url() . '/assets/gif/Iphone-spinner-2.gif" width="' . $size . '" heigth="' . $size . '"/>';
		return $spinner;

	}
}

if (!function_exists('is_decimal')) {
	function is_decimal($val) {
		return is_numeric($val) && floor($val) != $val;
	}
}

if (!function_exists('customerAlreadyPickedPayablesTodayQuery')) {
	function customerAlreadyPickedPayablesTodayQuery($customer_id) {

		//first we check if this customer had been issued any waybill today. If yes, we use same waybill number instead of generating new one

		$dateTodayTimestamp = strtotime('today');

		$CI = get_instance();

		$CI->db->where('waybill_code IS NOT NULL');
		$rowQuery = $CI->db->get_where('payment_with_goods', ['date_timestamp' => $dateTodayTimestamp, 'customer_id' => $customer_id]);

		return $rowQuery;

	}
}

if (!function_exists('userHasClockedInToday')) {
	function userHasClockedInToday($user_id) {
		$today_date = strtotime('today');
		$CI = get_instance();

		$CI->db->where('user_id', $user_id);
		$CI->db->where('date_timestamp', $today_date);
		$CI->db->limit(1);
		$rowCount = $CI->db->get('attendance')->num_rows();

		if($rowCount > 0) {
			return '1';
		} else {
			return '0';
		}

	}
}

function clock_in_out($param1 = '', $user_id, $confirmation_id = 0) {
		$today_date = strtotime(date('d-m-Y'));

		$CI = get_instance();
		
		if ($param1 == 'status_check_update') {
			$status_query = $CI->db->get_where('attendance', array('user_id' => $user_id, 'date_timestamp' => $today_date));
			if ($status_query->num_rows() > 0) {
				$status = $status_query->row()->status;
				if ($status == 0) {
					return 'shift-ended';
				} else if ($status == 1) {
					if ($confirmation_id == 1) {
						$CI->clock_out($user_id, $today_date);
						return 'clocked-out';
					} else {
						return 'confirm';
					}
				}
			} else {
				$CI->clock_in($user_id, $today_date);
				return 'clocked-in';
			}
		}

		else if ($param1 == 'status_check') {
			// Check previous day clock-out status and today's status in one query
			$CI->db->select('date_timestamp');
			$CI->db->where('user_id', $user_id);
			$CI->db->where('date_timestamp <=', $today_date);
			$CI->db->order_by('date_timestamp', 'DESC');
			$CI->db->limit(2);
			$records = $CI->db->get('attendance')->result();

			if (!empty($records)) {
				$today_record = null;
				$prev_record = null;
				
				foreach ($records as $record) {
					if ($record->date_timestamp == $today_date) {
						$today_record = $record;
					} else {
						$prev_record = $record;
						break;
					}
				}

				// Check previous day first
				if ($prev_record && $prev_record->status == 1 && $prev_record->out_timestamp == NULL) {
					return 'could_not_clock_out';
					//return;
				}

				// Check today's status
				if ($today_record) {
					if ($today_record->status == 1 && $today_record->out_timestamp == NULL) {
						return true;
					} else {
						return 'clocked-out';
					}
				} else {
					return 'new-today';
				}
			} else {
				return 'new-today';
			}
		}

		else if($param1 == 'checked_in') {
			$CI->db->where('user_id', $user_id);
			$CI->db->where('date_timestamp', $today_date);
			$CI->db->where('status', 1);
			$CI->db->where('out_timestamp IS NULL');
			if ($CI->db->count_all_results('attendance') > 0) {
				echo true;
			}
		}

		else if ($param1 == 'update_clock_out') {
			// Get previous day in single query
			$CI->db->select('date_timestamp');
			$CI->db->where('user_id', $user_id);
			$CI->db->where('date_timestamp <', $today_date);
			$CI->db->order_by('date_timestamp', 'DESC');
			$CI->db->limit(1);
			$prev_day_result = $CI->db->get('attendance')->row();

			if ($prev_day_result) {
				$prev_day = $prev_day_result->date_timestamp;
				$selected_time = $CI->input->post('closing_time');
				$out_timestamp = strtotime(date('d-m-Y', $prev_day) . ' ' . $selected_time);

				// Update attendance
				$CI->db->where('user_id', $user_id);
				$CI->db->where('date_timestamp', $prev_day);
				$CI->db->update('attendance', array(
					'out_timestamp' => $out_timestamp,
					'status' => 0
				));

				// Get stock data with JOIN to avoid N+1 queries
				$CI->db->select('sm.stock_id, i.quantity, i.purchase_price, i.selling_price');
				$CI->db->from('stock_manager sm');
				$CI->db->join('items i', 'i.item_id = sm.item_id');
				$CI->db->where('sm.user_id', $user_id);
				$CI->db->where('sm.date_timestamp', $prev_day);
				$stock_items = $CI->db->get()->result_array();

				if (!empty($stock_items)) {
					$bulkUpdateArray = array();
					foreach ($stock_items as $stock) {
						$bulkUpdateArray[] = array(
							'stock_id' => $stock['stock_id'],
							'closing_timestamp' => $out_timestamp,
							'closing_stock' => $stock['quantity'],
							'cost_price' => $stock['purchase_price'],
							'selling_price' => $stock['selling_price']
						);
					}
					$CI->db->update_batch('stock_manager', $bulkUpdateArray, 'stock_id');
				}

				return 'done';
			}
		}
	}