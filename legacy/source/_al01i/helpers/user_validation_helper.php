<?php if (!defined('BASEPATH')) {
	exit('No direct script access allowed');
}

/**
 * CodeIgniter
 *
 * An open source application development framework for PHP 5.1.6 or newer
 *
 * @package		CodeIgniter
 * @author		ExpressionEngine Dev Team
 * @copyright	Copyright (c) 2008 - 2011, EllisLab, Inc.
 * @license		http://codeigniter.com/user_guide/license.html
 * @link		http://codeigniter.com
 * @since		Version 1.0
 * @filesource
 */

//explode and join words together (append words)
//my own functions
if (!function_exists('append_words')) {
	function append_words($word, $pre_separator) {
		//$pre_separator = '\'' . $pre_separator . '\'';
		$word = explode($pre_separator, $word);

		if (count($word) > 1) {
			$po_code2 = $word[0];

			for ($i = 1; $i < count($word); $i++) {
				$po_code2 = $po_code2 . ' ' . $word[$i];
			}

			$word = $po_code2;
			return $word;
		} else {
			$word = $word[0];
			return $word;
		}
	}
}

//search for po codes that match the predefined format
if (!function_exists('email_validation')) {
	function po_code_search() {
		$po_no_prefix = $this->db->get_where('settings', array('type' => 'po_prefix'))->row()->description;

		$po_no = $this->db->get_where('settings', array('type' => 'po_no'))->row()->description;
		$id_length = strlen($po_no_prefix . $po_no);

		$this->db->select('po_code');
		$this->db->order_by('po_code', 'desc');
		$this->db->limit(1);
		$po_code = $this->db->get('purchase_order')->row()->po_code;

		if (substr($po_code, 0, 2) != $po_no_prefix) {
			//call the function
		}
	}
}

if (!function_exists('email_validation')) {
	function email_validation($email) {
		$ci = &get_instance();
		$num_rows = 0;
		$user_array = array('admin', 'suppliers', 'customers');
		$size = sizeof($user_array);

		for ($i = 0; $i < $size; $i++) {
			$ci->db->where('email', $email);
			$num_rows = $ci->db->get($user_array[$i])->num_rows();
			if ($num_rows > 0) {
				return 0;
			}
		}
		return 1;
	}
}

if (!function_exists('validate_phone_number')) {
	function validate_phone_number($phone) {
		if($phone != '' || !empty($phone)) {
			// Allow +, - and . in phone number
			$filtered_phone_number = filter_var(trim($phone), FILTER_SANITIZE_NUMBER_INT);
			// Remove "-" from number
			$phone_to_check = str_replace("-", "", $filtered_phone_number);
			$phone_to_check = str_replace(".", "", $phone_to_check);
			$phone_to_check = str_replace(" ", "", $phone_to_check);
			// Check the lenght of number
			// This can be customized if you want phone number from a specific country
			if (strlen($phone_to_check) != 10) {
				return false;
			} else {
					//extract the numeric out and increase it by 1
					$i = 0;
					$counter = 0;
					$counter2 = 0;
					for ($i = 0; $i < strlen($phone_to_check); $i++) {
						
						if($i > 0) {
							if (!is_numeric($phone_to_check[$i])) {
								$counter++;
								break;
							}
						} /**else if ($i == 0) {
							if($phone_to_check[$i] == 0) {
								if(strlen($phone_to_check) != 10) {
									return false;
								} else {
									for ($j = 1; $j < strlen($phone_to_check); $j++) {
										if (!is_numeric($phone_to_check[$j])) {
											$counter2++;
											break;
										}
									}
								}
								
								
							} else if($phone_to_check[$i] == '+') {
								if(strlen($phone_to_check) < 13) {
									return false;
								} else {
									for ($j = 1; $j < strlen($phone_to_check); $j++) {
										if (!is_numeric($phone_to_check[$j])) {
											$counter2++;
											break;
										}
									}
								} 

								if(strlen($phone_to_check) != 14) {
									return false;
								} else {
									for ($j = 1; $j < strlen($phone_to_check); $j++) {
										if (!is_numeric($phone_to_check[$j])) {
											$counter2++;
											break;
										}
									}
								}
							}

							if($counter2 > 0) {
								return false;
								break;
							}
						}
						**/
					}

					if($counter > 0) {
						return false;
					} else {
						return true;
					}
				}
			} else {
				return true;
			}
	}
}

/**===========================================================================
 *DATA CREATION DUPLICATES CHECKING AREA
 *=============================================================================
 **/

//supplier's full duplication on insert
if (!function_exists('supplier_validation_insert')) {
	function supplier_validation_insert($supplier_name = '', $mobile = '', $email = '') {

		$ci = &get_instance();
		$num_rows = 0;
		//$ci->db->where('supplier_name', $supplier_name);
		$ci->db->where('mobile', $mobile);

		if (!empty($email)) {
			$ci->db->where('email', $email);
		}
		$num_rows = $ci->db->get('suppliers')->num_rows();

		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}

	}
}

//customer's full duplication on insert
if (!function_exists('customer_validation_insert')) {
	function customer_validation_insert($customer_name = '', $mobile = '', $email = '') {

		$ci = &get_instance();
		$num_rows = 0;
		//$ci->db->where('customer_name', $customer_name);
		if (!empty($mobile) || $mobile != '') {
			$ci->db->where('mobile', $mobile);

			if (!empty($email)) {
				$ci->db->where('email', $email);
			}
			$num_rows = $ci->db->get('customers')->num_rows();

			if ($num_rows == 0) {
				return true;
			} else if ($num_rows > 0) {
				return false;
			}
		} else {
			return true;
		}

		

	}
}

//account's full duplication on insert
if (!function_exists('account_name_validation_insert')) {
	function account_name_validation_insert($account_name = '') {

		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where('name', $account_name);
		$num_rows = $ci->db->get('accounts')->num_rows();

		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}

	}
}

//item's full duplication on insert
if (!function_exists('item_name_validation_insert')) {
	function item_name_validation_insert($item_name = '') {

		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where('item_name', $item_name);
		$num_rows = $ci->db->get('items')->num_rows();

		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}

	}
}


//item category full duplication on insert
if (!function_exists('item_category_validation_insert')) {
	function item_category_validation_insert($category_name = '') {

		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where('category_name', $category_name);
		$num_rows = $ci->db->get('item_category')->num_rows();

		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}

	}
}

if (!function_exists('item_main_category_validation_insert')) {
	function item_main_category_validation_insert($category_name = '') {

		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where('category_name', $category_name);
		$num_rows = $ci->db->get('item_main_category')->num_rows();

		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}

	}
}

//Purchase order full duplication on insert
if (!function_exists('p_order_validation_insert')) {
	function p_order_validation_insert($po_code) {

		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where('po_code', $po_code);
		$num_rows = $ci->db->get('purchase_order')->num_rows();

		if ($num_rows == 0) {
			//let's search through the general journal table too an see
			$ci->db->where('po_code', $po_code);
			$num_rows = $ci->db->get('general_journal')->num_rows();

			if ($num_rows == 0) {
				return true;
			} else if ($num_rows > 0) {
				return false;
			}
		} else if ($num_rows > 0) {
			return false;
		}

	}
}

//Sales order full duplication on insert
if (!function_exists('s_order_validation_insert')) {
	function s_order_validation_insert($so_code) {

		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where('so_code', $so_code);
		$num_rows = $ci->db->get('sales_order')->num_rows();

		if ($num_rows == 0) {
			//let's search through the general journal table too an see
			$ci->db->where('so_code', $so_code);
			$num_rows = $ci->db->get('general_journal')->num_rows();

			if ($num_rows == 0) {
				return true;
			} else if ($num_rows > 0) {
				return false;
			}
		} else if ($num_rows > 0) {
			return false;
		}

	}
}

//invoice id duplication on insert
if (!function_exists('invoice_code_validation_insert')) {
	function invoice_code_validation_insert($invoice_code) {
		$ci = &get_instance();
		$num_rows = 0;

		$tables = array(
			'invoice',
			'general_journal',
		);

		$ounter = 0;
		for ($i = 0; $i < count($tables); $i++) {
			$num_rows = $ci->db->get_where($tables[$i], array('invoice_code' => $invoice_code))->num_rows();
			if ($num_rows > 0) {
				$counter++;
			}
		}

		if ($counter > 0) {
			return false;
		} else {
			return true;
		}
	}
}
/**===========================================================================
 *END OF DATA CREATION DUPLICATES CHECKING AREA
 *=============================================================================
 **/

/**===========================================================================
 *DATA UPDATES DUPLICATES CHECKING AREA
 *=============================================================================
 **/
//ACCOUNTS DUPLICATE CHECKER
if (!function_exists('account_name_validation_update')) {
	function account_name_validation_update($account_id, $account_name) {
		$ci = &get_instance();
		$num_rows = 0;

		$ci->db->where('account_id !=', $account_id);
		$ci->db->where('name', $account_name);
		$num_rows = $ci->db->get('accounts')->num_rows();
		if ($num_rows > 0) {
			return false;
		} else {
			return true;
		}
	}
}

//SUPPLIER DUPLICATE CHECKER
if (!function_exists('supplier_validation_update')) {
	function supplier_validation_update($supplier_id, $supplier_name, $mobile, $email = '') {
		$ci = &get_instance();
		$num_rows = 0;

		$ci->db->where('supplier_id !=', $supplier_id);
		//$ci->db->where('supplier_name', $supplier_name);
		$ci->db->where('mobile', $mobile);

		if (!empty($email)) {
			$ci->db->where('email', $email);
		}
		$num_rows = $ci->db->get('suppliers')->num_rows();
		if ($num_rows > 0) {
			return false;
		} else {
			return true;
		}
	}
}

//CUSTOMER DUPLICATE CHECKER
if (!function_exists('customer_validation_update')) {
	function customer_validation_update($customer_id, $customer_name, $mobile, $email = '') {
		$ci = &get_instance();
		$num_rows = 0;

		$ci->db->where('customer_id !=', $customer_id);
		//$ci->db->where('customer_name', $customer_name);
		if (!empty($mobile) || $mobile != '') {
			$ci->db->where('mobile', $mobile);
		}

		if (!empty($email)) {
			$ci->db->where('email', $email);
		}
		$num_rows = $ci->db->get('customers')->num_rows();
		if ($num_rows > 0) {
			return false;
		} else {
			return true;
		}
	}
}

//ITEM DUPLICATE CHECKER
if (!function_exists('item_name_validation_update')) {
	function item_name_validation_update($item_id, $item_name) {
		$ci = &get_instance();
		$num_rows = 0;

		$ci->db->where('item_id !=', $item_id);
		$ci->db->where('item_name', $item_name);
		$num_rows = $ci->db->get('items')->num_rows();
		if ($num_rows > 0) {
			return false;
		} else {
			return true;
		}
	}
}


//ITEM CATEGORY DUPLICATE CHECKER
if (!function_exists('item_category_validation_update')) {
	function item_category_validation_update($category_id, $category_name) {
		$ci = &get_instance();
		$num_rows = 0;

		$ci->db->where('category_id !=', $category_id);
		$ci->db->where('category_name', $category_name);
		$num_rows = $ci->db->get('item_category')->num_rows();
		if ($num_rows > 0) {
			return false;
		} else {
			return true;
		}
	}
}

if (!function_exists('item_main_category_validation_update')) {
	function item_main_category_validation_update($category_id, $category_name) {
		$ci = &get_instance();
		$num_rows = 0;

		$ci->db->where('category_id !=', $category_id);
		$ci->db->where('category_name', $category_name);
		$num_rows = $ci->db->get('item_main_category')->num_rows();
		if ($num_rows > 0) {
			return false;
		} else {
			return true;
		}
	}
}

//Purchase order full duplication on insert
if (!function_exists('p_order_validation_update')) {
	function p_order_validation_update($po_code) {

		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where('po_code', $po_code);
		$num_rows = $ci->db->get('purchase_order')->num_rows();

		if ($num_rows == 1) {
			return true;
		} else if ($num_rows > 1) {
			return false;
		} else if ($num_rows < 1) {
			//search general journal table
			$ci->db->where('po_code', $po_code);
			$num_rows = $ci->db->get('general_journal')->num_rows();

			if ($num_rows == 4) {
				return true;
			} else if ($num_rows > 4) {
				return false;
			}
		}

	}
}

//Validate SO Number
if (!function_exists('validate_so_no')) {
	function validate_so_no($so_no) {
		$ci = &get_instance();

		$so_prefix = $ci->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
		$so_no_full = $so_prefix . $ci->db->get_where('settings', array('type' => 'so_no'))->row()->description;

		if (strlen($so_no) < strlen($so_no_full) || strlen($so_no) > strlen($so_no_full) || substr($so_no, 0, strlen($so_prefix)) !== $so_prefix || !is_numeric(substr($so_no, strlen($so_prefix) - 1))) {
			return false;
		} else {
			return true;
		}

	}
}

//Validate PO Number
if (!function_exists('validate_po_no')) {
	function validate_po_no($po_no) {

		$ci = &get_instance();
		$po_prefix = $ci->db->get_where('settings', array('type' => 'po_prefix'))->row()->description;
		$po_no_full = $po_prefix . $ci->db->get_where('settings', array('type' => 'po_no'))->row()->description;

		if (strlen($po_no) < strlen($po_no_full) || strlen($po_no) > strlen($po_no_full) || substr($po_no, 0, strlen($po_prefix)) !== $po_prefix || !is_numeric(substr($po_no, strlen($po_prefix) - 1))) {
			return false;
		} else {
			return true;
		}

	}
}

/**===========================================================================
 *END OF DATA UPDATES DUPLICATES CHECKING AREA
 *=============================================================================
 **/

if (!function_exists('email_validation_for_edit')) {
	function email_validation_for_edit($email, $id, $type) {
		$num_rows = 0;
		$ci = &get_instance();
		$user_array = array('admin', 'teacher', 'parent', 'student', 'accountant', 'librarian');
		$size = sizeof($user_array);
		for ($i = 0; $i < $size; $i++) {
			if ($type == $user_array[$i]) {
				$ci->db->where_not_in($user_array[$i] . '_id', $id);
				$ci->db->where('email', $email);
				$num_rows = $ci->db->get($user_array[$i])->num_rows();
				if ($num_rows == 0) {
					return 1;
				}
			} else {
				$ci->db->where('email', $email);
				$num_rows = $ci->db->get($user_array[$i])->num_rows();
				if ($num_rows > 0) {
					return 0;
				}
			}
		}
		return 0;
	}
}

// Section duplication on create
if (!function_exists('duplication_of_section_on_create')) {
	function duplication_of_section_on_create($class_id, $section_name) {
		$ci = &get_instance();
		$num_rows = 0;
		$data = array(
			'class_id' => $class_id,
			'name' => $section_name,
		);
		$ci->db->where($data);
		$num_rows = $ci->db->get('section')->num_rows();
		if ($num_rows == 0) {
			return 1;
		} else if ($num_rows > 0) {
			return 0;
		}
	}
}
// section duplication on edit
if (!function_exists('duplication_of_section_on_edit')) {
	function duplication_of_section_on_edit($section_id, $class_id, $section_name) {
		$ci = &get_instance();
		$num_rows = 0;
		$data = array(
			'class_id' => $class_id,
			'name' => $section_name,
		);
		$ci->db->where_not_in('section_id', $section_id);
		$ci->db->where($data);
		$num_rows = $ci->db->get('section')->num_rows();
		if ($num_rows == 0) {
			return 1;
		} else if ($num_rows > 0) {
			return 0;
		}
	}
}

// class routine duplication on create
if (!function_exists('duplication_of_class_routine_on_create')) {
	function duplication_of_class_routine_on_create($data) {
		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where($data);
		$num_rows = $ci->db->get('class_routine')->num_rows();
		if ($num_rows == 0) {
			return 1;
		} else if ($num_rows > 0) {
			return 0;
		}
	}
}

// class routine duplication on edit
if (!function_exists('duplication_of_class_routine_on_edit')) {
	function duplication_of_class_routine_on_edit($data, $class_routine_id) {
		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where_not_in('class_routine_id', $class_routine_id);
		$ci->db->where($data);
		$num_rows = $ci->db->get('class_routine')->num_rows();
		if ($num_rows == 0) {
			return 1;
		} else if ($num_rows > 0) {
			return 0;
		}
	}
}

//parent's full duplication on insert
if (!function_exists('parent_name_validation_insert')) {
	function parent_full_validation_insert($parent_name = '', $phone = '') {
		if ($parent_name == '' && $phone == '') {
			return true;
		} else {
			$ci = &get_instance();
			$num_rows = 0;
			$ci->db->where('name', $parent_name);
			$ci->db->where('phone', $phone);
			$num_rows = $ci->db->get('parent')->num_rows();

			if ($num_rows == 0) {
				return true;
			} else if ($num_rows > 0) {
				return false;
			}
		}

	}
}

//Teacher's full duplication on insert
if (!function_exists('teacher_name_validation_insert')) {
	function teacher_name_validation_insert($teacher_name = '', $phone = '') {
		if ($teacher_name == '' && $phone == '') {
			return true;
		} else {
			$ci = &get_instance();
			$num_rows = 0;
			$ci->db->where('name', $teacher_name);
			$ci->db->where('phone', $phone);
			$num_rows = $ci->db->get('teacher')->num_rows();

			if ($num_rows == 0) {
				return true;
			} else if ($num_rows > 0) {
				return false;
			}
		}

	}
}

//student id duplication on insert
if (!function_exists('code_validation_insert')) {
	function code_validation_insert($student_code) {
		$ci = &get_instance();
		$num_rows = 0;

		$num_rows = $ci->db->get_where('student', array('student_code' => $student_code))->num_rows();
		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}
	}
}

//teacher code duplication on insert
if (!function_exists('teacher_code_validation_insert')) {
	function teacher_code_validation_insert($teacher_code) {
		$ci = &get_instance();
		$num_rows = 0;

		$num_rows = $ci->db->get_where('teacher', array('teacher_code' => $teacher_code))->num_rows();
		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}
	}
}

//student authentication_key duplication on insert
if (!function_exists('auth_validation_insert')) {
	function auth_validation_insert($authentication_key) {
		$ci = &get_instance();
		$num_rows = 0;

		$num_rows = $ci->db->get_where('student', array('authentication_key' => $authentication_key))->num_rows();
		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}
	}
}

//teacher authentication_key duplication on insert
if (!function_exists('t_auth_validation_insert')) {
	function t_auth_validation_insert($authentication_key) {
		$ci = &get_instance();
		$num_rows = 0;

		$num_rows = $ci->db->get_where('teacher', array('authentication_key' => $authentication_key))->num_rows();
		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}
	}
}

//parent/guardian authentication_key duplication on insert
if (!function_exists('g_auth_validation_insert')) {
	function g_auth_validation_insert($authentication_key) {
		$ci = &get_instance();
		$num_rows = 0;

		$num_rows = $ci->db->get_where('parent', array('authentication_key' => $authentication_key))->num_rows();
		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}
	}
}

//student id duplication in update

if (!function_exists('code_validation_update')) {
	function code_validation_update($student_code, $student_id) {
		$ci = &get_instance();
		$num_rows = 0;
		$ci->db->where('student_id !=', $student_id);
		$ci->db->where('student_code', $student_code);
		$num_rows = $ci->db->get('student')->num_rows();
		if ($num_rows == 0) {
			return true;
		} else if ($num_rows > 0) {
			return false;
		}

	}
}

// helper to find receivers email from message id
if (!function_exists('get_receiver_email')) {
	function get_receiver_email($message_id) {
		$ci = &get_instance();
		$message_detail = $ci->db->get_where('message', array('message_id' => $message_id))->row();
		$thread_code = $message_detail->message_thread_code;
		$sender = $message_detail->sender;
		$thread_details = $ci->db->get_where('message_thread', array('message_thread_code' => $thread_code))->row();
		if ($sender == $thread_details->sender) {
			$receiver = $thread_details->reciever;
		} else {
			$receiver = $thread_details->sender;
		}

		$receiver = explode('-', $receiver);
		$email = $ci->db->get_where($receiver[0], array($receiver[0] . '_id' => $receiver[1]))->row()->email;
		return $email;

	}
}

if (!function_exists('show_invoice_items')) {
	function show_invoice_items($vi, $itemi = array(), $amounti = array()) {
		for ($vi = 0; $vi < count($itemi); $vi++) {
			return ' ' . $itemi[$vi] . ':' . $amounti[$vi] . ',';
		}
	}
}

//converting date format
if (!function_exists('date_format_converter')) {
	function date_format_converter($date, $format = 'd M Y') {

		$old_date = $date;
		$date_format = $format;

		if (preg_match("/^(0[1-9]|[1-2][0-9]|3[0-1])-(0[1-9]|1[0-2])-[0-9]{2}$/", $old_date)) {
			//***DD-MM-YY
			$new_date = '<span style="color: red;">This format is ambiguous. 2-digits for all is difficult to differentiate. Please try different format; e.g 25-04-2019!</span>';
		} else if (preg_match("/^(0[1-9]|[1-2][0-9]|3[0-1])\/(0[1-9]|1[0-2])\/[0-9]{2}$/", $old_date)) {
			//***DD-MM-YY
			$new_date = '<span style="color: red;">This format is ambiguous. 2-digits for all is difficult to differentiate. Please try different format; e.g 25/04/2019!</span>';
		}

		//default formats from the user should be dd/mm/yyyy if both dd and mm are below or equal 12
		else if (preg_match("/^(0[1-9]|[1-2][0-9]|3[0-1])\/(0[1-9]|1[0-2])\/[0-9]{4}$/", $old_date)) {
			//***DD/MM/YYYY
			$old_date_exp = implode('-', explode('/', $old_date));
			$new_date = date($date_format, strtotime($old_date_exp));
		} else if (preg_match("/^(0[1-9]|[1-2][0-9]|3[0-1])-(0[1-9]|1[0-2])-[0-9]{4}$/", $old_date)) {
			//***DD-MM-YYYY
			$new_date = date($date_format, strtotime($old_date));
		}

		/** - DASH FORMATS **/
		else if (preg_match("/^[0-9]{4}-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])$/", $old_date)) {
			//***YYYY-MM-DD
			$new_date = date($date_format, strtotime($old_date));
		} else if (preg_match("/^[0-9]{4}-(0[1-9]|[1-2][0-9]|3[0-1])-(0[1-9]|1[0-2])$/", $old_date)) {
			//***YYYY-DD-MM
			$old_date_exp = explode('-', $old_date);
			$y = $old_date_exp[0];
			$d = $old_date_exp[1];
			$m = $old_date_exp[2];
			$new_date = $y . '-' . $m . '-' . $d;
			$new_date = date($date_format, strtotime($new_date));
		} else if (preg_match("/^[0-9]{2}-(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])$/", $old_date)) {
			//***YY-MM-DD
			$new_date = date($date_format, strtotime($old_date));
		} else if (preg_match("/^(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])-[0-9]{4}$/", $old_date)) {
			//***MM-DD-YYYY
			$old_date_exp = explode('-', $old_date);
			$m = $old_date_exp[0];
			$d = $old_date_exp[1];
			$y = $old_date_exp[2];
			$new_date = $y . '-' . $m . '-' . $d;
			$new_date = date($date_format, strtotime($new_date));

		} else if (preg_match("/^(0[1-9]|1[0-2])-(0[1-9]|[1-2][0-9]|3[0-1])-[0-9]{2}$/", $old_date)) {
			//***MM-DD-YY
			$old_date_exp = explode('-', $old_date);
			$m = $old_date_exp[0];
			$d = $old_date_exp[1];
			$y = $old_date_exp[2];
			$new_date = $y . '-' . $m . '-' . $d;
			$new_date = date($date_format, strtotime($new_date));
		}

		/** / SLASH FORMATS **/
		else if (preg_match("/^[0-9]{4}\/(0[1-9]|1[0-2])\/(0[1-9]|[1-2][0-9]|3[0-1])$/", $old_date)) {
			//***YYYY/MM/DD
			echo date('d M, Y', strtotime($old_date));
		} else if (preg_match("/^[0-9]{4}\/(0[1-9]|[1-2][0-9]|3[0-1])\/(0[1-9]|1[0-2])$/", $old_date)) {
			//***YYYY-DD-MM
			$old_date_exp = explode('/', $old_date);
			$y = $old_date_exp[0];
			$d = $old_date_exp[1];
			$m = $old_date_exp[2];
			$new_date = $y . '/' . $m . '/' . $d;
			$new_date = date($date_format, strtotime($new_date));
		} else if (preg_match("/^[0-9]{2}\/(0[1-9]|1[0-2])\/(0[1-9]|[1-2][0-9]|3[0-1])$/", $old_date)) {
			//***YY/MM/DD
			$old_date_exp = implode('-', explode('/', $old_date));
			$new_date = date($date_format, strtotime($old_date_exp));
		} else if (preg_match("/^(0[1-9]|1[0-2])\/(0[1-9]|[1-2][0-9]|3[0-1])\/[0-9]{4}$/", $old_date)) {
			//***MM/DD/YYYY
			$old_date_exp = explode('/', $old_date);
			$m = $old_date_exp[0];
			$d = $old_date_exp[1];
			$y = $old_date_exp[2];
			$new_date = $y . '/' . $m . '/' . $d;
			$new_date = date($date_format, strtotime($new_date));
		} else if (preg_match("/^(0[1-9]|1[0-2])\/(0[1-9]|[1-2][0-9]|3[0-1])\/[0-9]{2}$/", $old_date)) {
			//***MM/DD/YY
			$old_date_exp = explode('/', $old_date);
			$m = $old_date_exp[0];
			$d = $old_date_exp[1];
			$y = $old_date_exp[2];
			$new_date = '20' . $y . '/' . $m . '/' . $d;
			$new_date = date($date_format, strtotime($new_date));
		} else {
			$old_date = date('Y-m-d', strtotime($date));
			$new_date = date($date_format, strtotime($old_date));
			//$new_date = '<span style="color: red;">This type of date is not supported, please try a different one!</span>';
		}

		return $new_date;
	}
}

//getting start and end dates from a week number
if ( ! function_exists('getStartAndEndDate')){

    function getStartAndEndDate($week, $year) {
      $dto = new DateTime();
      $dto->setISODate($year, $week);
      $ret['week_starts'] = $dto->format('d-m-Y');
      $dto->modify('+6 days'); //just for 7 days: Monday - Sunday
      $ret['week_ends'] = $dto->format('d-m-Y');
      return $ret;
    }
}


//let's see if the invoice range already exists
if ( ! function_exists('invoiceDuplicateChecker')){

    function invoiceDuplicateChecker($column, $field) {

    	$result = false;

      $ci = &get_instance();
      $ci->db->where($field, $column);
      $ci->db->limit(1);
      $query_rows = $ci->db->get('invoice_code')->num_rows();

      if($query_rows > 0) {
      	$result = true;
      } else {
      	$result = false;
      }

      return $result;
    }
}

//let's see if the waybill range already exists
if ( ! function_exists('waybillDuplicateChecker')){

    function waybillDuplicateChecker($column, $field) {

    	$result = false;

      $ci = &get_instance();
      $ci->db->where($field, $column);
      $ci->db->limit(1);
      $query_rows = $ci->db->get('waybill_code')->num_rows();

      if($query_rows > 0) {
      	$result = true;
      } else {
      	$result = false;
      }

      return $result;
    }
}

// ------------------------------------------------------------------------
/* End of file User_validation.php */
/* Location: ./system/helpers/User_validation.php */
