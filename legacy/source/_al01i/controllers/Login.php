<?php

if (!defined('BASEPATH'))
    exit('No direct script access allowed');

// *************************************************************************
// *                                                                       *
// * Lisofts School Manager                                                 *
// * Copyright (c) Lightworld Technologies Limited. All Rights Reserved    *
// *                                                                       *
// *************************************************************************
// * @author : Lightworldtech                                              *
// * date        : August 11, 2019                                         *
// * description : For managing different levels of schools                *
// * Email   : softmail@lisofts.com                                         *
// * Website : https://www.lisofts.com                                      *
// * Support : https://www.support.lisofts.com                              *
// *                                                                       *
// *************************************************************************
// *                                                                       *
// * This software is furnished under a license and may be used and copied *
// * only  in  accordance  with  the  terms  of such  license and with the *
// * inclusion of the above copyright notice.                              *
// *                                                                       *
// *************************************************************************

/**
 * @property CI_DB_query_builder $db
 * @property CI_Session $session
 * @property CI_Output $output
 * @property CI_Input $input
 * @property CI_Form_validation $form_validation
 * @property CI_Loader $load
 * @property Crud_model $crud_model
 * @property Email_model $email_model
 */
class Login extends CI_Controller {

    function __construct() {
        parent::__construct();
        $this->load->model('crud_model');
        $this->load->database();
        $this->load->library('session');
        
        /* cache control */
        $this->output->set_header('Last-Modified: ' . gmdate("D, d M Y H:i:s") . ' GMT');
        $this->output->set_header('Cache-Control: no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
        $this->output->set_header('Pragma: no-cache');
        $this->output->set_header("Expires: Mon, 26 Jul 2010 05:00:00 GMT");

        //load encryption library
        $this->load->library('encryption');
        $this->load->helper('form');
        $this->load->library('form_validation');
    }

    //Default function, redirects to logged in user area
    public function index() {

        if ($this->session->userdata('admin_login') == 1)
            redirect(site_url('admin/dashboard'), 'refresh');


        $this->load->view('backend/login');
    }

    function auth_verification($auth_key) {
      $this->crud_model->auth_verification($auth_key);
    }

    //block account
    function block_account() {

      $email_block = $_REQUEST['email_block'];

      // Single query to check if email exists and block it
      $query = $this->db->get_where('admin', array('email' => $email_block));
      if ($query->num_rows() > 0) {
        $this->db->where('email', $email_block);
        $this->db->set('block_limit', 3);
        $this->db->update('admin');
        echo 1;
      } else {
        echo 0;
      }

    }

    //Validating login from ajax request
    function account_status($account_type, $current_user_id) {

        $account_st = $this->db->get_where($account_type, array($account_type.'_id' => $current_user_id))->row()->block_limit;

        if($account_st == 3) {
          echo 'blocked';
        }
    }

    function validate_login() {
      $start_time = microtime(true);

      //validate form

      if($this->input->post('email') != '' || $this->input->post('email') != null) {
        $this->form_validation->set_rules('email', 'Email', 'trim|required');
      }

      if($this->input->post('username') != '' || $this->input->post('username') != null) {
        $this->form_validation->set_rules('username', 'Username', 'trim|required');
      }

      $this->form_validation->set_rules('password', 'Password', 'trim|required|min_length[6]');

      if($this->form_validation->run() === FALSE) {
        $this->load->view('backend/login');
        return;
      }

      $username = $this->input->post('username');
      $email = ($username != '' && $username != null) ? $username : $this->input->post('email');

      // Single query to get user and check block status
      $query_start = microtime(true);
      $query = $this->db->get_where('admin', array('email' => $email));
      $query_time = microtime(true) - $query_start;

      if ($query->num_rows() == 0) {
        $this->session->set_flashdata('login_error', get_phrase('invalid_login'));
        redirect(site_url('login'), 'refresh');
        return;
      }

      $row = $query->row();

      // Check if account is blocked
      if($row->block_limit == 3) {
        $page_data['page_info'] = 'blocked';
        $this->load->view('backend/login', $page_data);
        return;
      }

      $password = $this->input->post('password');
      $auth_key2 = $this->input->post('auth_key2');

      // Verify authentication key and password
      $verify_start = microtime(true);
      $auth_valid = ($row->authentication_key == $auth_key2);
      $pass_valid = password_verify($password, $row->password);
      $verify_time = microtime(true) - $verify_start;

      if($auth_valid && $pass_valid) {
        $this->session->set_userdata('admin_login', '1');
        $this->session->set_userdata('admin_id', $row->admin_id);
        $this->session->set_userdata('login_user_id', $row->admin_id);
        $this->session->set_userdata('name', $row->name);
        $this->session->set_userdata('login_type', 'admin');

        // Update online status to 1 (User is online now)
        $update_start = microtime(true);
        $this->db->where('admin_id', $row->admin_id);
        $this->db->set('online_status', 1);
        $this->db->update('admin');
        $update_time = microtime(true) - $update_start;

        // Handle attendance and stock management with progress updates
        $user_first_login = $this->handle_attendance_and_stock($row->admin_id);
        
        // Set welcome message for user's first login today
        if($user_first_login) {
          $this->session->set_flashdata('first_login_today', true);
          $this->session->set_flashdata('welcome_message', 'Welcome! This is your first login today.');
        }

        // Admin or Cashier
        if($row->level == 3) {
          // Cashier to the POS portal
          redirect(site_url('admin/pos'), 'refresh');
        } else {
          // Admin to the dashboard
          redirect(site_url('admin/dashboard'), 'refresh');
        }
      } else {
        $this->session->set_flashdata('login_error', get_phrase('invalid_login'));
        redirect(site_url('login'), 'refresh');
      }
    }

    private function handle_attendance_and_stock($admin_id) {
        $today = date('Y-m-d');
        
        // Check if this user has logged in today
        $user_logged_today = $this->db->get_where('attendance', array(
            'user_id' => $admin_id,
            'date_timestamp' => strtotime($today)
        ))->num_rows() > 0;
        
        // Check if this is first login by anyone today
        $first_login_today = $this->db->get_where('attendance', array(
            'date_timestamp' => strtotime($today)
        ))->num_rows() == 0;
        
        // Record attendance
        if(!$user_logged_today) {
          $this->db->insert('attendance', array(
              'user_id' => $admin_id,
              'date_timestamp' => strtotime('today'),
              'in_timestamp' => strtotime('now'),
              'status' => '1'
          ));
        }

        
        
        if ($first_login_today) {

          
            // Update closing stock for previous day and create new stock entries
            $this->update_stock_manager();
        }
        
        // Return true if this is user's first login today
        return !$user_logged_today;
    }

    private function update_stock_manager() {
        $current_time = strtotime('now');
        $today = strtotime('today');
        $user_id = $this->session->userdata('admin_id');
        
        // Update closing stock for all items from previous day
        $this->db->query("
            UPDATE stock_manager sm1 
            JOIN (
                SELECT item_id, MAX(date_timestamp) as max_date 
                FROM stock_manager 
                GROUP BY item_id
            ) sm2 ON sm1.item_id = sm2.item_id AND sm1.date_timestamp = sm2.max_date
            JOIN items i ON sm1.item_id = i.item_id
            SET sm1.closing_stock = i.quantity,
                sm1.closing_timestamp = (UNIX_TIMESTAMP(DATE(FROM_UNIXTIME(sm1.date_timestamp))) + 64800)
        ");
        
        
        // Update attendance out_timestamp with same closing timestamp
        // $this->db->query("
        //     UPDATE attendance a
        //     JOIN stock_manager sm ON a.date_timestamp = sm.date_timestamp
        //     SET a.out_timestamp = (UNIX_TIMESTAMP(DATE(FROM_UNIXTIME(sm.date_timestamp))) + 64800),
        //         a.status = 0
        // ");

          // Update attendance with max date_timestamp from stock_manager and set status to 0
          $this->db->select_max('date_timestamp', 'max_date_timestamp');
          $result = $this->db->get('stock_manager')->row();
          $max_timestamp = $result->max_date_timestamp;
          

        $this->db->where('out_timestamp IS NULL');
        $this->db->where('date_timestamp <', $today);
        $this->db->set('out_timestamp', strtotime(date('d-m-Y 18:00:00', $max_timestamp)));
        $this->db->set('status', 0);
        $this->db->update('attendance');  
    
        
        // Create new stock entries for today
        $this->db->query("
            INSERT INTO stock_manager (item_id, opening_stock, selling_price, cost_price, date_timestamp, user_id, opening_timestamp)
            SELECT item_id, quantity, selling_price, purchase_price, $today, $user_id, $current_time
            FROM items
        ");
    }

    /*     * *DEFAULT NOT FOUND PAGE**** */

    function four_zero_four() {
        $this->load->view('four_zero_four');
    }

    // PASSWORD RESET BY EMAIL
    function forgot_password()
    {
        $this->load->view('backend/forgot_password');
    }

    function reset_password()
    {
        $email = $this->input->post('email');

        $this->form_validation->set_rules('email', 'Email', 'trim|required');

      if($this->form_validation->run() === FALSE) {
        $this->load->view('backend/forgot_password');
      }
        $reset_account_type     = '';
        //resetting user password here
        $new_password           =   substr( md5( rand(100000000,20000000000) ) , 0,7);

        // Checking credential for admin
        $query = $this->db->get_where('admin' , array('email' => $email));
        if ($query->num_rows() > 0)
        {
            $reset_account_type     =   'admin';
            $this->db->where('email' , $email);
            $this->db->update('admin' , array('password' => password_hash($new_password, PASSWORD_BCRYPT)));
            // send new password to user email
            $this->email_model->password_reset_email($new_password , $reset_account_type , $email);
            $this->session->set_flashdata('reset_success', get_phrase('please_check_your_email_for_the_new_password'));
            redirect(site_url('login/forgot_password?succ=1'), 'refresh');
        } else {
            $this->session->set_flashdata('reset_fail', get_phrase('sorry,_your_email_was_not_found_in_our_system!'));
            redirect(site_url('login/forgot_password?err=1'), 'refresh');
        }
        $this->session->set_flashdata('reset_error', get_phrase('password_reset_failed'));
        redirect(site_url('login/forgot_password'), 'refresh');
 
        $this->session->set_flashdata('reset_error', get_phrase('password_reset_failed'));
        redirect(site_url('login/forgot_password'), 'refresh');
    }

    /*     * *****LOGOUT FUNCTION ****** */

    function mark_welcome_shown() {
        $this->session->set_userdata('welcome_shown_today', true);
    }

    function logout() {

        //update online status to 0 (User is offline now)
        $user_id = $_SESSION['admin_id'];
        $this->db->where('admin_id', $user_id);
        $this->db->set('online_status', 0);
        $this->db->update('admin');

        $this->session->sess_destroy();
        $this->session->set_flashdata('logout_notification', 'logged_out');
       
        redirect(site_url('login'), 'refresh');
        $this->session->sess_destroy();
    }

}