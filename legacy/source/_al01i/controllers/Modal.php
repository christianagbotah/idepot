<?php if ( ! defined('BASEPATH')) exit('No direct script access allowed');

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
class Modal extends CI_Controller {


	function __construct()
    {
        parent::__construct();
		$this->load->database();
		$this->load->library('session');
		/*cache control*/
		$this->output->set_header('Last-Modified: ' . gmdate("D, d M Y H:i:s") . ' GMT');
        $this->output->set_header('Cache-Control: no-store, no-cache, must-revalidate, post-check=0, pre-check=0');
        $this->output->set_header('Pragma: no-cache');
        $this->output->set_header("Expires: Mon, 26 Jul 1997 05:00:00 GMT");
    }

	/***default functin, redirects to login page if no admin logged in yet***/
	public function index()
	{

	}


	/*
	*	$page_name		=	The name of page
	*/
	function popup($page_name = '' , $param2 = '' , $param3 = '', $param4 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$this->load->view( 'backend/'.$account_type.'/pages/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}


	/*
	*	$page_name		=	The name of page
	*/
	function popup_dates($page_name = '' , $param2 = '' , $param3 = '', $param4 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$this->load->view( 'backend/'.$account_type.'/pages/dates_selection/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}

	/*
	*	$page_name		=	The name of page
	*/
	function popup_modal($folder_name = 'banking', $page_name = '' , $param2 = '' , $param3 = '', $param4 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$this->load->view( 'backend/'.$account_type.'/pages/'.$folder_name.'/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}

	/*
	*	$page_name		=	The name of page
	*for purchases
	*/
	function popup_purchases($page_name = '' , $param2 = '' , $param3 = '', $param4 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$this->load->view( 'backend/'.$account_type.'/pages/purchases/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}

	/*
	*	$page_name		=	The name of page
	*for sales
	*/
	function popup_sales($page_name = '' , $param2 = '' , $param3 = '', $param4 = '',  $param5 = '' , $param6 = '', $param7 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$page_data['param5']		=	$param5;
		$page_data['param6']		=	$param6;
		$page_data['param7']		=	$param7;
		$this->load->view( 'backend/'.$account_type.'/pages/sales/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}

	/*
	*	$page_name		=	The name of page
	*for pos
	*/
	function popup_pos($page_name = '' , $param2 = '' , $param3 = '', $param4 = '',  $param5 = '' , $param6 = '', $param7 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$page_data['param5']		=	$param5;
		$page_data['param6']		=	$param6;
		$page_data['param7']		=	$param7;
		$this->load->view( 'backend/'.$account_type.'/pages/pos/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}


		/*
	*	$page_name		=	The name of page
	*for sales
	*/
	function popup_item_transfer($page_name = '' , $param2 = '' , $param3 = '', $param4 = '',  $param5 = '' , $param6 = '', $param7 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$page_data['param5']		=	$param5;
		$page_data['param6']		=	$param6;
		$page_data['param7']		=	$param7;
		$this->load->view( 'backend/'.$account_type.'/pages/items_transfers/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}

	/*
	*	$page_name		=	The name of page
	*for banking
	*/
	function popup_banking($page_name = '' , $param2 = '' , $param3 = '', $param4 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$this->load->view( 'backend/'.$account_type.'/pages/banking/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}

	/*
	*	$page_name		=	The name of page
	*for reports
	*/
	function popup_reports($page_name = '' , $param2 = '' , $param3 = '', $param4 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$this->load->view( 'backend/'.$account_type.'/pages/reports/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
	}

	function popup_calendar($page_name = '' , $param2 = '' , $param3 = '', $param4 = '')
	{
		//$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$this->load->view( 'backend/'.$page_name.'.php' ,$page_data);

	}

	function popup_receipt($page_name = '' , $param1 = '' , $param2 = '', $param3 = '' , $param4 = '' , $param5 = '' , $param6 = '' , $param7 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param1']		=	$param1;
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$page_data['param5']		=	$param5;
		$page_data['param6']		=	$param6;
		$page_data['param7']		=	$param7;
		$this->load->view( 'backend/'.$account_type.'/'.$page_name.'.php' ,$page_data);
	}

	function popup_2($page_name = '' , $param2 = '') {
		$account_type		=	$this->session->userdata('login_type');

		//decode the url from showing %20
		$page_data['param2'] = urldecode($param2);
		$this->load->view( 'backend/'.$account_type.'/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

	}

	function popup_idle_user($page_name = '' , $param2 = '' , $param3 = '', $param4 = '')
	{
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$this->load->view( 'backend/'.$page_name.'.php' ,$page_data);

		echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

	}


	/*
	*	$page_name		=	The name of page
	*for branches
	*/
	function popup_branches($page_name = '' , $param2 = '' , $param3 = '', $param4 = '',  $param5 = '' , $param6 = '', $param7 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$page_data['param5']		=	$param5;
		$page_data['param6']		=	$param6;
		$page_data['param7']		=	$param7;
		$this->load->view( 'backend/'.$account_type.'/pages/branches/'.$page_name.'.php' ,$page_data);

			echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
		
	}

	function popup_branch_installation($page_name = '' , $param2 = '' , $param3 = '', $param4 = '',  $param5 = '' , $param6 = '', $param7 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$page_data['param5']		=	$param5;
		$page_data['param6']		=	$param6;
		$page_data['param7']		=	$param7;
		$this->load->view( 'backend/'.$account_type.'/pages/branches/branch_installation/'.$page_name.'.php' ,$page_data);

			echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
		
	}

	/*
	*	$page_name		=	The name of page
	*for warehouses
	*/
	function popup_warehouses($page_name = '' , $param2 = '' , $param3 = '', $param4 = '',  $param5 = '' , $param6 = '', $param7 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$page_data['param5']		=	$param5;
		$page_data['param6']		=	$param6;
		$page_data['param7']		=	$param7;
		$this->load->view( 'backend/'.$account_type.'/pages/warehouses/'.$page_name.'.php' ,$page_data);

			echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
		
	}

	function popup_warehouse_installation($page_name = '' , $param2 = '' , $param3 = '', $param4 = '',  $param5 = '' , $param6 = '', $param7 = '')
	{
		$account_type		=	$this->session->userdata('login_type');
		$page_data['param2']		=	$param2;
		$page_data['param3']		=	$param3;
		$page_data['param4']		=	$param4;
		$page_data['param5']		=	$param5;
		$page_data['param6']		=	$param6;
		$page_data['param7']		=	$param7;
		$this->load->view( 'backend/'.$account_type.'/pages/warehouses/warehouse_installation/'.$page_name.'.php' ,$page_data);

			echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
		
	}
}
