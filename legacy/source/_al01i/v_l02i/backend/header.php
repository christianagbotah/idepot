<?php 
	
	//for internal messaging
	$current_user     = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
	$current_user_id  = $this->session->userdata('login_user_id');



 ?>
 <style type="text/css">
  ul li a {
    font-size: 14px !important;
  }

  input, select, .select2-container {
        height: 45px !important;
    }

   select, .select2-container {
    min-width: 75%;
  }

  #order_list_processing, #invoice_list_processing, #view_payment_history_table_processing, #debtors_list_processing {
    position: absolute !important;
    top: 100px !important;
    z-index:  999 !important;
    margin-left: -120px !important;
    width: 250px !important;
    border-radius:  10px !important;
    background-color: red !important;
    font-size: 11px !important;
    color: #ffffff !important;
  }

 	#notice_term {
 		position: absolute;
 		left: 5px;
 		top: -15px;
 		color: red;
 		font-weight: bold;
 		animation-name: blink;
 		animation-duration: 1s;
 		animation-iteration-count: infinite;
 		animation-timing-function: all;
 	}


  #att_alert  h3{
    font-weight: bold;
    animation-name: blink;
    animation-duration: 1s;
    animation-iteration-count: infinite;
    animation-timing-function: all;
    cursor: pointer;
  }


 	@keyframes blink {

 		50%{
 			opacity: 0;
 			color: #ffffff;
 		}
 		100%{
 			opacity: 1;

 		}
 	}

 	#mega_m .dropdown-menu {
 		top: 0px !important;
 	}

  .coming_s, .coming_s a {
    opacity: 0.6;
    cursor: not-allowed;
  }

  #main_header {
  	background-image: url('<?php echo base_url('uploads/header/header_4.jpg') ?>');
  	background-position: center center;
    background-size: cover;
  	background-repeat: no-repeat;
		background-position: right;
  }

  body, .form-control {
    font-size: 1.5rem !important;
  }

 </style>
<div class="row" id="main_header" style="padding-top: 20px; width: 100%;  padding-left: 20px; z-index: 9999; box-shadow: 0px 2px 2px 2px #505052;">
	<div class="col-md-12 col-sm-12 col-xs-12 clearfix" style="text-align:center; margin-top: 20px;">
		<h2 id="sys_name" style="font-weight:200; margin:0px; color: #fff !important;"><small><span id="notice_term" class="pull-left"><em id="lgw" style="float: left; color: #d97f02; font-weight: bold; font-family: serif; font-size: 17px">Linventory Manager</em> </span></small> <span id="s_name" style="font-size: 31px; font-weight: bold; letter-spacing: 6px; font-family: serif;"><?php echo $system_name;?></span> </h2>
    </div>

    <div id="top"></div><!-- just to let the page scroll up to this-->

	<!-- Raw Links -->
	<div class="col-md-12 col-sm-12 col-xs-12 clearfix ">
    <div class="pull-right" style="margin-top: -30px; margin-right: 20px;">

      <!-- empty -->
    </div>

    <div><h2 id="clock" style="font-family: Orbitron; color: #fff; text-align: right; margin-right: 15px;">00:00:00</h2></div>
	</div><br>
  <div style="">
    <div class="row">
      <div class="col-md-12">
        <!-- Main Header Tab Navs-->
        <ul class="nav nav-tabs">
          <li class="nav-item" id="dashboard_tab" onclick="changeNavMenuAndPageContent('dashboard')">
            <a href="#tab1" data-toggle="tab" class="nav-link <?php if ($page_name == 'dashboard') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-tachometer-alt"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('dashboard'); ?></span>
            </a>
          </li>

          <li class="nav-item" style="background-color: red; width: 80px; margin: 0 3px; border-top-left-radius: 4px; border-top-right-radius: 4px;">
            <a href="<?=site_url('admin/pos') ?>" target="_blank" style="color: #fff; ">
              <span class="visible-xs" style="font-weight: bold; font-size: 14px;"><i class="fas fa-fw fa-cash-register"></i> POS</span>
              <span class="hidden-xs" style="font-weight: bold; font-size: 20px;"><i class="fas fa-fw fa-cash-register"></i> <?php echo get_phrase('POS'); ?></span>
            </a>
          </li>

          <li class="nav-item sales_tab" onclick="changeNavMenuAndPageContent('sales')">
            <a href="#tab2" data-toggle="tab" class="nav-link <?php if ($page_name == 'sales') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-hand-holding-usd"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('sales'); ?></span>
            </a>
          </li>
          <li class="nav-item purchases_tab" onclick="changeNavMenuAndPageContent('purchases')">
            <a href="#tab3" data-toggle="tab" class="nav-link <?php if ($page_name == 'purchases') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-money"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('purchases'); ?></span>
            </a>
          </li>
          <li class="nav-item banking_tab" onclick="changeNavMenuAndPageContent('banking')">
            <a href="#tab4" data-toggle="tab" class="nav-link <?php if ($page_name == 'banking') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-landmark"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('banking'); ?></span>
            </a>
          </li>
          <li class="nav-item reports_tab" onclick="changeNavMenuAndPageContent('reports')">
            <a href="#tab5" data-toggle="tab" class="nav-link <?php if ($page_name == 'reports') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-bar-chart"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('reports'); ?></span>
            </a>
          </li>
        </ul>
        
      </div>
      
    </div>
  </div>

	
</div>
<style type="text/css">
	#user_name {
		color: #ffffff !important;
	}

	.glyphicon-dashboard {
		color: #ffffff;
		font-size: 20px;
	}

	#user_name:hover {
		 background: rgba(235, 235, 235, 0.4);
 		 color:  #0a0069;
	}

  .page-container .sidebar-menu #main-menu #nav_items_holder > li {

     padding: 5 0 5 0;
  }

	#msgs {
			right: 400px !important;
		}

	@media only screen and (min-width: 768px) {
		#main_header {
			margin-top: -20px !important; 
		}
	}



	@media only screen and (max-width: 1255px) {
		#note_alert{
			margin-left: 0px !important;
		}

		#sys_name {
			font-size: 18px !important;
		}
	}

	@media only screen and (max-width: 625px) {
		#msgs{
			right: 290px !important;
		}

		#lgw {
			font-size: 13px !important;
		}

		#s_name {
			font-size: 25px !important;
		}
	}

	@media only screen and (max-width: 398px) {

		#lgw {
			font-size: 11px !important;
		}

		#s_name {
			font-size: 18px !important;
		}

		ul li .info {
			font-size: 10px !important;
		}

		#msgs {
			right: 270px !important;
			top: 100px !important;
		}

		#sys_name {
			font-size: 16px !important;
		}
	}
	
	table thead th, table tbody td {
        font-size: 13px !important;
    }
</style>

<hr style="margin-top:0px;" />
<table class="table table-h"></table>

<script type="text/javascript">
	$ = jQuery;

	$(function() {

		//called to update the crsf name and key
     $.ajaxSetup({
        cache: false,
        data: {
            '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
        } 
     }); 
     
		//call and update clock
		setInterval(() => {
		  show_clock();
		}, 1000);

	});

	//UPDATE DEBTORS AND CREDITORS
  // $('.btn').click(function(e) {
  //   debtorsCreditorsUpdator();
  // });

  // function debtorsCreditorsUpdator() {
  //   $.ajax({
  //     url: '<?php //echo site_url('admin/debtorsCreditorsUpdator') ?>',
  //     type: 'POST',
  //     dataType: 'html',
  //     cache: false,
  //   })
  //   .done(function(data) {
  //     //alert("success");
  //   })
  //   .fail(function(err) {

  //     //showAjaxModal_confirm(err.responseText, 'error');
  //   });
    
  // }


	//clock
	function show_clock() {
		let clock = new Date();

		let h = clock.getHours();
		let m = clock.getMinutes();
		let s = clock.getSeconds();

		//let's keep 2-digit for each eg. 01:06:03
		if(h.toString().length == 1) {
			h = '0' + h;
		} else {
			h = h;
		}

		if(m.toString().length == 1) {
			m = '0' + m;
		} else {
			m = m;
		}

		if(s.toString().length == 1) {
			s = '0' + s;
		} else {
			s = s;
		}

		let full_clock = h + ':' + m + ':' + s;

		$('#clock').text(full_clock);
	}
	

  //this changes the left-sidebar content when the top-navbar is clicked

  function changeNavMenuAndPageContent(type) {

    showPageLoading(); //pre-loader

    $('#nav_menu_loading_holder').slideDown('slow');
    $('#nav_items_holder').slideUp('slow');

    $.ajax({
      url: '<?php echo site_url('admin/loadContents/') ?>' + type,
      type: 'post',
      dataType: 'json',
      cache: false
    })
    .done(function(response) {
      
      //load nav menu
      $('#nav_items_holder').html(response.navMenu);
      $('#nav_menu_loading_holder').slideUp('slow');
      $('#nav_items_holder').slideDown('slow');

      //load page
      $('#ajax_update').html(response.mainPage);
  

      hidePageLoading();
    })
    .fail(function(err) {

    });
  }




  $('#mega_link').click(function(event) {
    event.preventDefault();
    $('#main_div').addClass('sidebar-collapsed');
  });

	$(function() {

		//called to update the crsf name and key
     $.ajaxSetup({
        cache: false,
        data: {
            '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
        } 
     }); 

  });


	$(document).ready(function() {

    //changeNavMenuAndPageContent('dashboard');

		$('#webs').click(function() {
			$('#webs').css('color', 'red');
			var account_type = '<?php echo $account_type; ?>';
			if(account_type == 'admin') {
				$('#webs').text('You have not requested for this service.');
			}else {
				$('#webs').text('This service is not available.');
			}
			
		});

    $('.card .mb-4').css('cursor', 'pointer');


	});


		function noticeboard(notice_id) {
			showAjaxModal('<?php echo site_url('modal/popup/modal_view_notice/'); ?>' + notice_id);
		}

	

             
</script>
