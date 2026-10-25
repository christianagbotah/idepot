<?php 
	
	//for internal messaging
	$current_user     = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
	$current_user_id  = $this->session->userdata('login_user_id');

 ?>
 <style type="text/css">
  ul li a {
    font-size: 14px !important;
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

 </style>
<div class="row" id="main_header" style="padding-top: 20px; width: 100%;  padding-left: 20px; z-index: 9999; box-shadow: 0px 2px 2px 2px #505052;">
	<div class="col-md-12 col-sm-12 col-xs-12 clearfix" style="text-align:center; margin-top: 20px;">
		<h2 id="sys_name" style="font-weight:200; margin:0px; color: #fff !important;"><small><span id="notice_term" class="pull-left"><em id="lgw" style="float: left; color: #d97f02; font-weight: bold; font-family: serif; font-size: 17px">Linventory Manager</em> </span></small> <span id="s_name" style="font-size: 31px; font-weight: bold; letter-spacing: 6px; font-family: serif;"><?php echo $system_name;?></span> </h2>
    </div>

	<!-- Raw Links -->
	<div class="col-md-12 col-sm-12 col-xs-12 clearfix ">
    <div class="pull-right" style="margin-top: -30px; margin-right: 20px;">

      <!-- empty -->
    </div>

    <div><h2 id="clock" style="font-family: Orbitron; color: #fff; text-align: right; margin-right: 15px;">00:00:00</h2></div>
	</div><br>
  <div style="" id="upper_menu">
    <div class="row">
      <div class="col-md-12">
        <!-- Main Header Tab Navs-->
        <ul class="nav nav-tabs">
          <li class="nav-item" id="dashboard_tab">
            <a href="#tab1" data-toggle="tab" class="nav-link <?php if ($page_name == 'dashboard') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-tachometer-alt"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('dashboard'); ?></span>
            </a>
          </li>

          <li class="nav-item" style="background-color: red; width: 80px; margin: 0 3px; border-top-left-radius: 4px; border-top-right-radius: 4px;">
            <a href="<?=site_url('admin/pos') ?>" target="_blank" style="color: #fff; ">
              <span class="visible-xs"><i class="fas fa-fw fa-cash-register"></i></span>
              <span class="hidden-xs" style="font-weight: bold; font-size: 20px;"><i class="fas fa-fw fa-cash-register"></i> <?php echo get_phrase('POS'); ?></span>
            </a>
          </li>

          <li class="nav-item" id="sales_tab">
            <a href="#tab2" data-toggle="tab" class="nav-link <?php if ($page_name == 'sales') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-hand-holding-usd"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('sales'); ?></span>
            </a>
          </li>
          <li class="nav-item" id="purchases_tab">
            <a href="#tab3" data-toggle="tab" class="nav-link <?php if ($page_name == 'purchases') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-money"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('purchases'); ?></span>
            </a>
          </li>
          <li class="nav-item" id="banking_tab">
            <a href="#tab4" data-toggle="tab" class="nav-link <?php if ($page_name == 'banking') echo 'active'; ?>">
              <span class="visible-xs"><i class="fas fa-fw fa-landmark"></i></span>
              <span class="hidden-xs"><?php echo get_phrase('banking'); ?></span>
            </a>
          </li>
          <li class="nav-item" id="reports_tab">
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
  //for Dashboard tab
  $('#dashboard_tab').click(function(event) {
    /* Act on the event */
    $('#active_dashboard').addClass('active');
    $('#dashboard_nav').slideDown('400', function() {
      $('#sales_nav').slideUp('400');
      $('#purchases_nav').slideUp('400');
      $('#banking_nav').slideUp('400');
      $('#reports_nav').slideUp('400');
    });

    //update the main content
    $.ajax({
        url: '<?php echo site_url('admin/dashboard/ajax'); ?>',
        success: function(response) {
          $('#ajax_update').html(response);
          $('.card .mb-4').css('cursor', 'pointer');
        }
    });
  });

  //for Sales tab
  $('#sales_tab').click(function(event) {
    /* Act on the event */
    $('#sales_nav').removeAttr('style');
    $('#active_sales').addClass('active');
    $('#sales_nav').slideDown('400', function() {
      $('#dashboard_nav').slideUp('400');
      $('#purchases_nav').slideUp('400');
      $('#banking_nav').slideUp('400');
      $('#reports_nav').slideUp('400');
    });

      $.ajax({
        url: '<?php echo site_url('admin/sales/ajax'); ?>',
        success: function(response) {
          $('#ajax_update').html(response);
          $('.card .mb-4').css('cursor', 'pointer');
        }
      });
  });

  //for Purchases tab
  $('#purchases_tab').click(function(event) {
    /* Act on the event */
    $('#active_purchases').addClass('active');
    $('#purchases_nav').removeAttr('style');
    $('#purchases_nav').slideDown('400', function() {
      $('#dashboard_nav').slideUp('400');
      $('#sales_nav').slideUp('400');
      $('#banking_nav').slideUp('400');
      $('#reports_nav').slideUp('400');
    });

    //update the main content
    $.ajax({
        url: '<?php echo site_url('admin/purchases/ajax'); ?>',
        success: function(response) {
          $('#ajax_update').html(response);
          $('.card .mb-4').css('cursor', 'pointer');
        }
    });

  });

  //for Banking tab
  $('#banking_tab').click(function(event) {
    /* Act on the event */
    $('#active_banking').addClass('active');
    $('#banking_nav').removeAttr('style');
    $('#banking_nav').slideDown('400', function() {
      $('#dashboard_nav').slideUp('400');
      $('#sales_nav').slideUp('400');
      $('#purchases_nav').slideUp('400');
      $('#reports_nav').slideUp('400');
    });

    //update the main content
    $.ajax({
        url: '<?php echo site_url('admin/banking/ajax'); ?>',
        success: function(response) {
          $('#ajax_update').html(response);
          $('.card .mb-4').css('cursor', 'pointer');
        }
    });
  });

  //for Reports tab
  $('#reports_tab').click(function(event) {
    /* Act on the event */
    $('#active_reports').addClass('active');
    $('#reports_nav').removeAttr('style');
    $('#reports_nav').slideDown('400', function() {
      $('#dashboard_nav').slideUp('400');
      $('#sales_nav').slideUp('400');
      $('#purchases_nav').slideUp('400');
      $('#banking_nav').slideUp('400');
    });

    //update the main content
    $.ajax({
        url: '<?php echo site_url('admin/reports/ajax'); ?>',
        success: function(response) {
          $('#ajax_update').html(response);
          $('.card .mb-4').css('cursor', 'pointer');
        }
    });
  });

	//var block_int = null;

	

	/**$(function() {

		//remove table-responsive class from all tables
		$('.table').removeClass('table-responsive');
		$('.table').removeClass('table-striped');
		$('.table').removeClass('table-hover');
		$('.table').removeClass('table-active');

		$('.table').addClass('table-striped');
		$('.table').addClass('table-hover');
		$('.table').addClass('table-active');
		//add checkbox class to checkbox input types
		$('input[type="checkbox"]').removeClass('form-control');
		$('input[type="checkbox"]').addClass('checkbox');

		block_int = setInterval(() => {
		  //account_status();
		}, 4000);

		//log user out after 10 mins of inactiveness
		var LOG_TIME_OUT = 10 * 60;
		var INACTIVE_TIME_SECONDS = 0;

		document.onclick = function() {
			INACTIVE_TIME_SECONDS = 0;
		}

		document.onkeypress = function() {
			INACTIVE_TIME_SECONDS = 0;
		}


		document.onmousemove = function() {
			INACTIVE_TIME_SECONDS = 0;
		}


		setInterval(() => {
		  check_idle_time();
		}, 1000);

		function check_idle_time() {
			INACTIVE_TIME_SECONDS++;
			var user_name = '<?php echo $name; ?>';

			if(INACTIVE_TIME_SECONDS == LOG_TIME_OUT) {
				showAjaxModal_idle_user('<?php echo site_url('modal/popup_idle_user/idle_user_logged_out/'); ?>' + user_name);
				clearTimeout();

				//redirect user to the login page after the login here button is clicked
				$(document).on('hidden.bs.modal', '#modal_idle_user', function() {
					window.location.href = '<?php echo site_url('login/logout'); ?>';
				});			
			}
		}		
	}); **/

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
/**
         check_internal_m();
         setInterval(() => {
               check_internal_m(); internal_m(); attendance_update();
             }, 3000); **/
        //called to check if current user has an internal message alert

      /**  function check_internal_m() {
        	var current_user = '<?php echo $current_user; ?>';

        	$.ajax({
        		url: '<?php echo site_url('admin/check_internal_m/') ?>' + current_user,
        		success: function(response) {
					$('#badge_message').text(response);
        		}
        	});
        } **/

        //called to check if current user has an internal message alert2
      /**  function internal_m() {
        	var current_user = '<?php echo $current_user; ?>';

        	$.ajax({
        		url: '<?php echo site_url('admin/internal_m/') ?>' + current_user,
        		success: function(response) {
					$('.badge_message2').html(response);
        		}
        	});
        }
          **/

       });

	function get_session_changer()
	{
		$.ajax({
            url: '<?php echo site_url('admin/get_session_changer');?>',
            success: function(response)
            {
                jQuery('#session_static').html(response);
            }
        });
	}

	function get_term_changer()
	{
		$.ajax({
            url: '<?php echo site_url('admin/get_term_changer');?>',
            success: function(response)
            {
                jQuery('#term_static').html(response);
            }
        });
	}

	$(document).ready(function() {
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


		//update payment alert for admin
	/**	setInterval(function() {
			mobile_money_payment_alert_rows(); //mobile_money_payment_alert_show();
		}, 600); **/

		/**function mobile_money_payment_alert_rows() {
			$.ajax({
				url: '<?php echo site_url('admin/mobile_money_payment_alert_rows'); ?>',
				success: function(num_rows) {
					if(num_rows > 0) {
						$('#badge1').text(num_rows);
						$('#badge1').css('display', 'inline-flex');
						$('#momo').css({'color': '#ffffff', 'font-weight': 'bold'});
					}else{
						$('#badge1').css('display', 'none');
						$('#momo').css({'color': '#1325ab'});
					}
				}
			});
		} **/

	/**	function mobile_money_payment_alert_show() {
			var page_name = '<?php echo $page_name; ?>';
			$.ajax({
				url: '<?php echo site_url('admin/mobile_money_payment_alert_show/'); ?>' + page_name,
				success: function(message) {
					$('#momo_message_list_holder').html(message);
				}
			});
		} **/

		/**update payment alert for admin
		setInterval(function() {
			notifications(); notifications_rows();
		}, 600); 

		var marked_read = '';
		var user_id = '';

		//function notifications_rows() {
			//the id of the closed notice item when the modal is closed
			/**$(document).on('hidden.bs.modal', '#modal_ajax', function() {
			 marked_read = $('#marked_read').filter(':checked').val();
			 user_id = $('#user_id').val();
			});

			if(marked_read == '' || marked_read == null) {
				marked_read = 0;
			}
			if(user_id == '' || user_id == null) {
				user_id = 0;
			}

			var logged_in_id = '<?php echo $this->session->userdata($account_type.'_id') ?>';

			$.ajax({
				url: '<?php echo site_url('admin/notifications_rows/'); ?>' + marked_read + '/' + user_id + '/' + logged_in_id,
				success: function(num_rows) {
					if(num_rows > 0) {
						$('#badge2').text(num_rows);
						$('#badge2').css('display', 'inline-flex');
						$('#bell').css({'color': '#ffffff', 'font-weight': 'bold'});
					}else{
						$('#badge2').css('display', 'none');
						$('#bell').css({'color': '#1325ab'});
					}
				}
				
			});
		}**/

		//function notifications() {
			//the id of the closed notice item when the modal is closed
		/**	$(document).on('hidden.bs.modal', '#modal_ajax', function() {
			 marked_read = $('#marked_read').filter(':checked').val();
			 user_id = $('#user_id').val();
			});

			if(marked_read == '' || marked_read == null) {
				marked_read = 0;
			}
			if(user_id == '' || user_id == null) {
				user_id = 0;
			}

			var logged_in_id = '<?php echo $this->session->userdata($account_type.'_id') ?>';
			var page_name = '<?php echo $page_name; ?>';

			$.ajax({
				url: '<?php echo site_url('admin/notifications/'); ?>' + page_name + '/' + marked_read + '/' + user_id + '/' + logged_in_id,
				success: function(notifications) {
					$('#message_list_holder').html(notifications);
				}
			});
		}**/

		function noticeboard(notice_id) {
			showAjaxModal('<?php echo site_url('modal/popup/modal_view_notice/'); ?>' + notice_id);
		}

		//frequently check if user's account has been blocked
	/**	function account_status() {
			var account_type = '<?php echo $account_type; ?>';
			var current_user_id = '<?php echo $current_user_id; ?>';
			var current_user_name = '<?php echo $name; ?>';

			$.ajax({
				url: '<?php echo site_url('login/account_status/'); ?>' + account_type + '/' + current_user_id,
				success: function(response) {
					if(response == 'blocked') {
						showAjaxModal_user_blocked('<?php echo site_url('modal/popup_idle_user/account_blocked/'); ?>' + current_user_name);

						clearInterval(block_int);

						$(document).on('hidden.bs.modal', '#modal_user_blocked', function() {
							window.location.href = '<?php echo site_url('login/logout'); ?>';
						});
					}
				}
			})
		}

    **/

		//check and update attendance status whether all attendance were taken today
    /**function attendance_update() {
      $.ajax({
        url: '<?php echo site_url('admin/att_update'); ?>',
        success: function(response) {
          if(response == 1) {
            $('#att_alert h3').slideDown('500');
          } else {

          }     
        }
      });

    }

    **/

    //$('#att_alert h3').mouseenter(function(event) {
      /* Act on the event */
    /**  $.ajax({
        url: '<?php echo site_url('admin/att_update_show'); ?>',
        success: function(response) {
          $('#unmarked_tb').slideDown('500');
          $('table #att_list_holder').html(response);       
        }
      });
    }); **/

   // $('#unmarked_tb').mouseleave(function(event) {
      /* Act on the event */
  //    $('#unmarked_tb').slideUp('slow');
  //  });
  //   $('#att_alert').click(function(event) {
      /* Act on the event */
  //    $('#unmarked_tb').slideUp('slow');
  //  });
   //  $('body').click(function(event) {
      /* Act on the event */
   //   $('#unmarked_tb').slideUp('slow');
 //   }); 


             
</script>
