<?php 
  
  //for internal messaging
  $current_user     = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
  $current_user_id  = $this->session->userdata('login_user_id');

  ///get current user's name
  $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;
  $name = $this->db->get_where($this->session->userdata('login_type'), array($this->session->userdata('login_type').'_id' => $this->session->userdata('login_user_id')))->row()->name;

  $opening_day =  $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description; 
  $from = date('d-m-Y', strtotime('this week '. $opening_day));
  $to = date('d-m-Y');
                        

 ?>

 <style type="text/css">
   #clock:hover {
    color: #ffffff !important;
   }

   .text-danger:hover, .text-success:hover {
    color: #ffffff !important;
   }
 </style>

<!-- Topbar -->
        <nav class="navbar navbar-expand navbar-light bg-white topbar mb-4 static-top shadow">
          

            <ul class="navbar-nav ml-0" id="payments_nav" style="display: none">

              <!-- Nav Item - INVOICE ITEM-->
            <li class="nav-item dropdown no-arrow btn-primary">
              <a class="nav-link dropdown-toggle" href="#" id="invoice_item_nav" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                <span class="mr-2 d-none d-lg-inline text-white">Items & Reports</span>
              </a>
              <!-- Dropdown - INVOICE ITEM -->
              <div class="dropdown-menu dropdown-menu-left shadow animated--grow-in" aria-labelledby="invoice_item_nav">

                  <!--<a class="dropdown-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/add_item/'); ?>', 'Add Item')">Add new item</a>-->
                  

                  <a class="dropdown-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_items/'); ?>', 'View Items')">View Items</a>
                  <div class="dropdown-divider"></div>

                  <a class="dropdown-item" href="#" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_item_transfer/add_item_transfer/'); ?>', 'Transfer Item')">Transfer Items</a>
                  <div class="dropdown-divider"></div>

                  <a class="dropdown-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_item_transfer/items_transfer_list/'); ?>', 'View Transferred Items')">View Transferred Items</a>
                  <div class="dropdown-divider"></div>

                  <a class="dropdown-item" href="#"><strong>Reports</strong></a>

                  <a class="dropdown-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_backlog_report/'); ?>')">Stock Report</a>
                  <div class="dropdown-divider"></div>

                  <a class="dropdown-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_accounts_receivable_report/'); ?>')">Accounts Receivable</a>
                  <div class="dropdown-divider"></div>

                  <a class="dropdown-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_accounts_payable_report/'); ?>')">Accounts Payable</a>
                  <div class="dropdown-divider"></div>

                  <a class="dropdown-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_invoice_report/'); ?>')">Invoice Report</a>
                  <div class="dropdown-divider"></div>

                  <a class="dropdown-item" href="#" onclick="date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_inventory_report/'); ?>')">Inventory Report</a>
                 
              </div>
            </li>

            <!-- Nav Item - Payments -->
            <li class="nav-item">
                <a class="nav-link btn btn-sm btn-success" type="button" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_pos/payments/'); ?>', 'Take Payment')">
                  <span class="visible-xs"><i class="fas fa-fw fa-hand-holding-usd"></i></span>
                  <span class="hidden-xs"><i class="fas fa-fw fa-hand-holding-usd"></i> Take Payment</span>
                </a>
            </li>

            <li class="nav-item">
                <a class="nav-link btn btn-sm btn-outline-success" type="button" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_payments?from='.$from.'&to='.$to); ?>', 'View Payments')">
                  <span class="visible-xs"><i class="fas fa-coins"></i></span>
                  <span class="hidden-xs text-success"><i class="fas fa-coins"></i> View Cash Received</span>
                </a>
            </li>

            <li class="nav-item">
                <a class="nav-link btn btn-sm btn-outline-primary" type="button" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_receipts?from='.$from.'&to='.$to); ?>', 'View Receipts')">
                  <span class="visible-xs"><i class="fas fa-receipt"></i></span>
                  <span class="hidden-xs"><i class="fas fa-receipt"></i> View Receipts</span>
                </a>
            </li>
            
            <li class="nav-item">
                <a class="nav-link btn btn-sm btn-outline-danger" type="button" href="#"  onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_purchases/payments_history/'); ?>', 'View Payments History')">
                  <span class="visible-xs"><i class="fas fa-donate"></i></span>
                  <span class="hidden-xs text-danger"><i class="fas fa-donate"></i> Expenses & Purchases</span>
                </a>
            </li>

            <li class="nav-item dropdown no-arrow btn-warning">
              <a class="nav-link dropdown-toggle" href="#" id="invoice_item_nav" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                <span class="mr-2 d-none d-lg-inline text-dark">Orders & Invoices</span>
              </a>
              <!-- Dropdown - INVOICE ITEM -->
              <div class="dropdown-menu dropdown-menu-left shadow animated--grow-in" aria-labelledby="invoice_item_nav">

                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/sales_order_list/'); ?>', 'View Sales Orders')">Sales Orders
                </a>

                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="#" onclick="showAjaxModal_proforma_invoice_create('<?php echo site_url('modal/popup_sales/create_proforma_invoice/'); ?>', 'Create Pro Forma Invoice')">Create Pro Forma Invoice
                </a>

                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup_sales/view_invoices/'); ?>', 'View Invoices')">Invoices
                </a>

              </div>
            </li>

          </ul>
            
          <ul class="navbar-nav ml-auto">

            <li class="nav-item">
                <a href="#" class="nav-link btn btn-sm btn-info calendar_pop text-white" type="button" onclick="showAjaxModal_calendar('<?php echo site_url('modal/popup_calendar/calendar/'); ?>');">
                  <span class="visible-xs"><i class="fas fa-calendar fa-2"></i></span>
                  <span class="hidden-xs text-white"><i class="fas fa-calendar fa-2"></i> Calendar</span>
                </a>
            </li>

            <li class="nav-item">
                <a class="nav-link btn btn-sm btn-outline-danger" type="button" href="#" style="width: 130px;">
                  <h2 id="clock" style="font-family: Orbitron; color: #000; text-align: right; margin-right: 15px; width: 130px; text-align: center">00:00:00</h2>
                </a>
            </li>

            <li class="nav-item">
                <a class="nav-link btn btn-sm btn-outline-success" type="button" target="_blank" href="https://www.ghbuildersco.com:2096">
                  <i class="fas fa-at fa-2x"></i>
                  <span class="hidden-xs hidden-sm hidden-md hidden-lg">Staff WebMail</span>
                </a>
            </li>
            
            <li class="nav-item">
                <a class="nav-link btn btn-sm btn-success" type="button" href="#" id="clock-in-out">
                  <i class="fas fa-clock-o fa-3x fa-spin text-white"></i>
                  <span class="hidden-xs text-white">CLOCK-IN</span>
                </a>
            </li>

            <!--<li class="nav-item">
                <a class="nav-link btn btn-sm btn-outline-info" type="button" href="#">
                  <span class="hidden-xs">WELCOME BACK</span>
                </a>
            </li>-->

            
            <div class="topbar-divider d-none d-sm-block"></div>



            <!-- Nav Item - User Information -->
            <li class="nav-item dropdown no-arrow">
              <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                
                <img class="img-profile rounded-circle" src="<?php echo $this->crud_model->get_image_url('admin' , $current_user_id);?>" >
              </a>
              <!-- Dropdown - User Information -->
              <div class="dropdown-menu dropdown-menu-right shadow animated--grow-in" aria-labelledby="userDropdown">
                <a class="dropdown-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup/manage_profile/'); ?>', 'Manage My Profile')">
                  <i class="fas fa-user fa-sm fa-fw mr-2 text-gray-400"></i>
                  Profile
                </a>

                 <!-- Is the current logged in user the admin -->
                <?php if($level == 1 || $level == 2): ?>
                  <a class="dropdown-item" href="javascript:;" onclick="showAjaxModal_calendar('<?php echo site_url('modal/popup/modal_admin_add/');?>', 'Add User');">
                     <i class="fas fa-plus fa-sm fa-fw mr-2 text-gray-400"></i>
                  <span><?php echo get_phrase('add_new_user');?></span>
                </a>

                <a class="dropdown-item" href="<?php echo '#'; // echo site_url($this->session->userdata('login_type').'/admins'); ?>" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/admin_list/');?>', 'Users List');">
                     <i class="fas fa-users fa-sm fa-fw mr-2 text-gray-400"></i>
                  <span><?php echo get_phrase('users_list');?></span>
                </a>

                <a class="dropdown-item" href="<?php echo '#'; // echo site_url($this->session->userdata('login_type').'/admins'); ?>" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/attendance_list/');?>', 'Attendance List');">
                     <i class="fa fa-line-chart fa-sm fa-fw mr-2 text-gray-400"></i>
                  <span><?php echo get_phrase('attendance_list');?></span>
                </a>

                <a class="dropdown-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/system_settings/'); ?>');">
                  <i class="fas fa-cogs fa-sm fa-fw mr-2 text-gray-400"></i>
                  Settings
                </a>

              <?php endif; ?>
              <!-- Is the current logged in user the admin check ends-->

                <!--<a class="dropdown-item" href="#">
                  <i class="fas fa-list fa-sm fa-fw mr-2 text-gray-400"></i>
                  Activity Log
                </a>-->
                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="avascript:;" onclick="showAjaxModal_logout('<?php echo site_url('modal/popup/modal_logout/');?>');" data-toggle="modal" data-target="#logoutModal">
                  <i class="fas fa-sign-out-alt fa-sm fa-fw mr-2 text-gray-400"></i>
                  Logout
                </a>
              </div>
            </li>

          </ul>

        </nav>
        <!-- End of Topbar -->

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

     setInterval(() => {
        // Todo...
        $.ajax({
          url: '<?php echo site_url('admin/check_session/'.$current_user_id) ?>',
          type: 'POST',
          dataType: 'text',
        })
        .done(function(response) {
          if(response == 'expired') {
            showAjaxModal_confirm('We realized that you have been away from this page for over 15 minutes now. For security reasons, your session has been logged out. Kindly press the F5 key on your keyboard or click anywhere on the page to login again.', 'Logged Out');

            $('#modal_confirm').on('hidden.bs.modal', function () {
                window.location.href = '<?php echo site_url('login/logout') ?>';
            });
          }
        });
        
      }, 30000);

    //call and update clock
    setInterval(() => {
      show_clock();
    }, 1000);

    clock_in_out_status();

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


  
  //check clock-in-out status anytime page loads
  function clock_in_out_status() {

    const user_id = <?php echo $current_user_id; ?>;
    //check the current attendance status of the user; 0 == clocked out, 1 == clocked in
    $.ajax({
      url: '<?php echo site_url('admin/clock_in_out/status_check/') ?>' + user_id,
      type: 'POST',
      dataType: 'text',
      cache: false,
    })
    .done(function(att_status) {

      if(att_status == 'clocked-out') { //clocked out so display clock in button
        $('#clock-in-out').removeClass('btn-danger');
        $('#clock-in-out').addClass('btn-success');
        $('#clock-in-out span').text('CLOCK-IN');

        //hide the portal now
        $('#clock-in-out').slideDown('slow'); 
        $('#goodbye').slideDown('slow');
        $('#welcomer').slideUp('slow');
        $('#welcomer #time_display').slideUp('slow');
        $('#main_holder').slideUp('slow');
        $('#payments_nav').slideUp('slow');

      } else if(att_status == 'new-today') { //just now wants to clock in
        $('#welcomer h3').text('Please CLOCK-IN to have access to your POS Portal.');
        $('#clock-in-out').removeClass('btn-danger');
        $('#clock-in-out').addClass('btn-success');
        $('#clock-in-out span').text('CLOCK-IN');

        //hide the portal now
        $('#clock-in-out').slideDown('slow'); 
        $('#welcomer').slideDown('slow');
        $('#welcomer #time_display').slideUp('slow');
        $('#main_holder').slideUp('slow');
        $('#payments_nav').slideUp('slow');

      } else if(att_status == true) { //clocked in so display clock out button
        $('#clock-in-out').removeClass('btn-success');
        $('#clock-in-out').addClass('btn-danger');
        $('#clock-in-out span').text('CLOCK-OUT');

        //show the portal now
        $('#clock-in-out').slideDown('slow'); 
        $('#welcomer').slideUp('slow');
        $('#welcomer #time_display').slideUp('slow');
        $('#main_holder').slideDown('slow');
        $('#payments_nav').slideDown('slow');

      } else if(att_status == 'could_not_clock_out') { //forgot to clock-out the previous time so display an alert

        $('#welcomer h3').text('You forgot to CLOCK-OUT during the previous session. Please enter the time you left the office after your last CLOCK-IN.');  
        $('#clock-in-out').slideUp('slow');    
        $('#clock-in-out').removeClass('btn-danger');
        $('#clock-in-out').addClass('btn-success');
        $('#clock-in-out span').text('CLOCK-IN');

        //hide the portal now
        $('#welcomer').slideDown('slow');
        $('#welcomer #time_display').slideDown('slow');
        $('#main_holder').slideUp('slow');
        $('#payments_nav').slideUp('slow');
      }
    })
    .fail(function(err) {
      showAjaxModal_confirm(err.responseText, 'Error');
    });
  }


  //mark attendance here
  $('#clock-in-out').click(function(event) {
    /* Act on the event */
    let timeNow = new Date();
    let hr = timeNow.getHours();
    let mn = timeNow.getMinutes();
    let timeFull = hr + ':' + mn;

    const user_id = <?php echo $current_user_id; ?>;

    let nTime = Number('<?php echo date('H') ?>');
    let greeting = '';

    if(nTime >= 0 && nTime < 12) {
      greeting = 'Morning';

    } else if(nTime == 12) {
      greeting = 'Afternoon';

    } else if(nTime > 12 && nTime <= 16) {
      greeting = 'Afternoon';

    } else if(nTime > 16 && nTime <= 21) {
      greeting = 'Evening';

    } else if(nTime > 21 && nTime <= 23) {
      greeting = 'Night';
    }


    //check the current attendance status of the user; 0 == clocked out, 1 == clocked in
    $.ajax({
      url: '<?php echo site_url('admin/clock_in_out/status_check_update/') ?>' + user_id,
      type: 'POST',
      dataType: 'text',
      cache: false,
    })
    .done(function(att_status) {

      if(att_status == 'clocked-in') { //clocked in so display clock out button
        $('#clock-in-out').removeClass('btn-success');
        $('#clock-in-out').addClass('btn-danger');
        $('#clock-in-out span').text('CLOCK-OUT');

        //show the portal now
        $('#welcomer').slideUp('slow');
        $('#main_holder').slideDown('slow');
        $('#payments_nav').slideDown('slow');

        showAjaxModal_confirm('GOOD ' + greeting + '! WELCOME BACK <?=$name .'! You have successfully clocked-in.\n Your Clock-In time today is <strong>' ?>' + timeFull + '<?='</strong>' ?>', 'Success');

            setTimeout(() => {
              $('#modal_confirm .close').click();

              //show opening stock summary
              oc_stock_modal('<?php echo site_url('modal/popup_pos/opening_stock_summary/'); ?>' + user_id, 'YOUR OPENING STOCK SUMMARY');
            }, 7000);

      } else if(att_status == 'shift-ended') { //clocked in so display clock out button
        showAjaxModal_confirm('Your Shift for today has ended! You cannot clock-in again.', 'Error');

            setTimeout(() => {
              $('#modal_confirm .close').click();
            }, 4000); 

      } else if(att_status == 'fraud') { //clocked in so display clock out button
        showAjaxModal_confirm('Your request is prohibited! It seems you are not at the office at the moment or probably, you are not using the preferred computer. Please check and try again.', 'Error');

            setTimeout(() => {
              $('#modal_confirm .close').click();
            }, 10000); 

      } else if(att_status == 'confirm') {//ask user to confirm when he clicks on the clock-out button
        
        //show modal now
        $('#confirm_clock_out').modal('show', {backdrop: 'static'});

        $('#clock_me_out').click(function(event) {
          /* Act on the event */
          $.ajax({
            url: '<?php echo site_url('admin/clock_in_out/status_check_update/') ?>' + user_id + '/1',
            type: 'POST',
            dataType: 'text',
            cache: false,
          })
          .done(function(att_status2) {
            if(att_status2 == 'clocked-out') { //clocked out so display clock in button
            $('#clock-in-out').removeClass('btn-danger');
            $('#clock-in-out').addClass('btn-success');
            $('#clock-in-out span').text('CLOCK-IN');

            //hide the portal now
            $('#goodbye').slideDown('slow');
            $('#main_holder').slideUp('slow');
            $('#payments_nav').slideUp('slow');

            showAjaxModal_confirm('GOOD ' + greeting + '! GOODBYE <?=$name .'! You have successfully clocked-out.\n Your Clock-Out time today is <strong>' ?>' + timeFull + '<?='</strong>' ?>', 'Success');

                setTimeout(() => {
                  $('#modal_confirm .close').click();

                  //show Closing Stock Summary
                  oc_stock_modal('<?php echo site_url('modal/popup_pos/closing_stock_summary/'); ?>' + user_id, 'YOUR CLOSING STOCK SUMMARY');
                }, 7000);


            }

          });
        });
        
      }
    });
  });
</script>