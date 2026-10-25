<style>
  #overlay {
    position: fixed;
    top: 0;
    bottom: 0;
    right: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    z-index: 1040;
    background: rgba(0, 0, 0, 0.6);

  }

</style>

<?php

//for internal messaging
$current_user = $this->session->userdata('login_type') . '-' . $this->session->userdata('login_user_id');
$current_user_id = $this->session->userdata('login_user_id');



if(isset($_SESSION['user_clocked_in'])) {
  $current_user_clocked_in = $this->session->userdata('user_clocked_in');

} else {
  $current_user_clocked_in = 0;
}


///get current user's name
$level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;
$name = $this->db->get_where($this->session->userdata('login_type'), array($this->session->userdata('login_type') . '_id' => $this->session->userdata('login_user_id')))->row()->name;

?>

<!-- Topbar -->
        <nav class="navbar navbar-expand navbar-light bg-white topbar mb-4 static-top shadow">
          <!-- Topbar Navbar -->
          <!-- tabs contents -->
            <div class="nav-item tab-content" style="margin-left: -18px;" id="lower_menu">
              <?php include 'top-header-tabs-contents.php'; //include the tabs contents here?>
            </div>

          <ul class="navbar-nav ml-auto  flex gap-3">

            <li class="nav-item">
                <a class="nav-link btn btn-sm btn-outline-success rounded-lg p-3" type="button" target="_blank" href="https://www.ghbuildersco.com:2096">
                  <i class="fas fa-at fa-2x"></i>
                  <span class="hidden-xs">Staff WebMail</span>
                </a>
            </li>

            <!-- <li class="nav-item">
                <a class="nav-link btn btn-sm btn-success rounded-lg p-3" type="button" href="#" onclick="clock_in_out()" id="clock-in-out">
                  <i class="fas fa-clock-o fa-3x fa-spin text-white"></i>
                  <span class="hidden-xs text-white">CLOCK-IN</span>
                </a>
            </li> -->

            <div class="topbar-divider d-none d-sm-block"></div>

            <!-- Nav Item - User Information -->
            <li class="nav-item dropdown no-arrow">
              <a class="nav-link dropdown-toggle" href="#" id="userDropdown" role="button" data-toggle="dropdown" aria-haspopup="true" aria-expanded="false">
                <span class="mr-2 d-none d-lg-inline text-gray-600 small"><?=$name;?></span>
                <img class="img-profile rounded-circle" src="<?php echo $this->crud_model->get_image_url('admin', $current_user_id); ?>">
              </a>
              <!-- Dropdown - User Information -->
              <div class="dropdown-menu dropdown-menu-right shadow animated--grow-in" aria-labelledby="userDropdown">
                <a class="dropdown-item" href="#" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup/manage_profile/'); ?>', 'Manage My Profile')">
                  <i class="fas fa-user fa-sm fa-fw mr-2 text-gray-400"></i>
                  Profile
                </a>

                 <!-- Is the current logged in user the admin -->
                <?php if ($level == 1 || $level == 2): ?>
                  <a class="dropdown-item" href="javascript:;" onclick="showAjaxModal_calendar('<?php echo site_url('modal/popup/modal_admin_add/'); ?>', 'Add User');">
                     <i class="fas fa-plus fa-sm fa-fw mr-2 text-gray-400"></i>
                  <span><?php echo get_phrase('add_new_user'); ?></span>
                </a>

                <a class="dropdown-item" href="<?php echo '#'; // echo site_url($this->session->userdata('login_type').'/admins');   ?>" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/admin_list/'); ?>', 'Users List');">
                     <i class="fas fa-users fa-sm fa-fw mr-2 text-gray-400"></i>
                  <span><?php echo get_phrase('users_list'); ?></span>
                </a>

                <a class="dropdown-item" href="<?php echo '#'; // echo site_url($this->session->userdata('login_type').'/admins');   ?>" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/attendance_list/'); ?>', 'Attendance List');">
                     <i class="fa fa-line-chart fa-sm fa-fw mr-2 text-gray-400"></i>
                  <span><?php echo get_phrase('attendance_list'); ?></span>
                </a>

                <a class="dropdown-item" href="#" onclick="showAjaxModal_settings('<?php echo site_url('modal/popup/system_settings/'); ?>');">
                  <i class="fas fa-cogs fa-sm fa-fw mr-2 text-gray-400"></i>
                  Settings
                </a>

              <?php endif;?>
              <!-- Is the current logged in user the admin check ends-->

                <!--<a class="dropdown-item" href="#">
                  <i class="fas fa-list fa-sm fa-fw mr-2 text-gray-400"></i>
                  Activity Log
                </a>-->
                <div class="dropdown-divider"></div>
                <a class="dropdown-item" href="javascript:;" onclick="showAjaxModal_logout('<?php echo site_url('modal/popup/modal_logout/'); ?>');" data-toggle="modal" data-target="#logoutModal">
                  <i class="fas fa-sign-out-alt fa-sm fa-fw mr-2 text-gray-400"></i>
                  Logout
                </a>
              </div>
            </li>

          </ul>

        </nav>

        <?php

echo form_open(site_url('admin/clock_in_out/update_clock_out/'), array('class' => 'form-groups-bordered', 'id' => 'update_clock_out', 'target' => '_top'));
?>
            <input type="hidden" name="closing_time" id="closing_time" value="18:00">
            </form>

        <!-- End of Topbar -->

        <!-- <div id="overlay"><center class="text-light" style="margin-top: 45vh"><strong><i class="fa fa-spinner fa-pulse"></i> Hello! A Moment Please...</strong></center></div> -->

        <script type="text/javascript">
          $(function() {
            //called to update the crsf name and key
           $.ajaxSetup({
              cache: false,
              data: {
                  '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
              }
           });


          //  userCheckedIn(function(response) {
          //     if(response != true || response != 1) {
          //       clock_in_out_status();
          //     } else {
          //       $('#clock-in-out').removeClass('btn-success').addClass('btn-danger').find('span').text('CLOCK-OUT');
          //       $('#overlay').fadeOut('slow');
          //       $('.modal-backdrop').removeClass('modal-backdrop');
          //       $('#modal_confirm .close, #create .close').click();
          //     }
          //  });



          //  setInterval(() => {
          //     $.ajax({
          //       url: '<?php echo site_url('admin/check_session/' . $current_user_id) ?>',
          //       type: 'POST',
          //       dataType: 'text'
          //     })
          //     .done(function(response) {
          //       if(response == 'expired') {
          //         showAjaxModal_confirm('We realized that you have been away from this page for over 15 minutes now. For security reasons, your session has been logged out. Kindly press the F5 key on your keyboard or click anywhere on the page to login again.', 'Logged Out');
          //         $('#modal_confirm').on('hidden.bs.modal', () => window.location.href = '<?php echo site_url('login/logout') ?>');
          //       }
          //     });
          //   }, 30000);


    });

    function showPageLoading() {
      $('#overlay').fadeIn('slow');
    }

    function hidePageLoading() {
      $('#overlay').fadeOut('slow');
    }


  /*function userCheckedIn(callback) {

    $.ajax({
      url: '<?php echo site_url('admin/userHasClockedInToday/'.$current_user_id) ?>',
      type: 'POST',
      dataType: 'text',
      cache: false
    })
    .done(function(response) {

      callback(response);
    });
  }*/

  function clock_in_out_status() {
    const user_id = <?php echo $current_user_id; ?>;
    $.ajax({
      url: '<?php echo site_url('admin/clock_in_out/status_check/') ?>' + user_id,
      type: 'POST',
      dataType: 'text',
      cache: false
    })
    .done(function(att_status) {
      
      if(att_status == 'clocked-out') {
        $('#create .close').slideUp('slow');
        $('#create').addClass('show').attr({'data-backdrop': 'static', 'data-keyboard': 'false'});
        $('#clock-in-out').removeClass('btn-danger').addClass('btn-success').find('span').text('CLOCK-IN');
        $('#overlay').fadeOut('slow');
        $('.modal-backdrop').removeClass('modal-backdrop');
        $('#modal_confirm .close').click();
        showAjaxModal_data_create('<?php echo site_url('modal/popup/modal_goodbye/'); ?>', 'GOOD BYE');

      } else if(att_status == 'new-today') {
        $('#create .close').slideUp('slow');
        $('#create').addClass('show').attr({'data-backdrop': 'static', 'data-keyboard': 'false'});
        $('#clock-in-out').removeClass('btn-danger').addClass('btn-success').find('span').text('CLOCK-IN');
        $('#overlay').fadeOut('slow');
        $('.modal-backdrop').removeClass('modal-backdrop');
        $('#modal_confirm .close').click();
        showAjaxModal_data_create('<?php echo site_url('modal/popup/modal_welcome/'); ?>', 'WELCOME BACK');

      } else if(att_status == true) {
        $('#clock-in-out').removeClass('btn-success').addClass('btn-danger').find('span').text('CLOCK-OUT');
        $('#overlay').fadeOut('slow');
        $('.modal-backdrop').removeClass('modal-backdrop');
        $('#modal_confirm .close, #create .close').click();

      } else if(att_status == 'could_not_clock_out') {
        $('#create .close').slideUp('slow');
        $('#create').addClass('show').attr({'data-backdrop': 'static', 'data-keyboard': 'false'});
        $('#clock-in-out').slideUp('slow').removeClass('btn-danger').addClass('btn-success').find('span').text('CLOCK-IN');
        previousClockOut(user_id);
      }
    })
    .fail(function(err) {
      $('#overlay').fadeOut('slow');
      $('.modal-backdrop').removeClass('modal-backdrop');
      showAjaxModal_confirm(err.responseText, 'Error');
    });
  }

  function previousClockOut(user_id) {
    $('#update_clock_out').submit();
  }

  $('#update_clock_out').submit(function(event) {
      event.preventDefault();
      $.ajax({
        url: '<?php echo site_url('admin/clock_in_out/update_clock_out/') ?>' + <?php echo $current_user_id; ?>,
        type: 'POST',
        data: new FormData(this),
        dataType: 'text',
        cache: false,
        contentType: false,
        processData: false
      })
      .done(function(response) {
        $('#overlay').fadeOut('slow');
        $('.modal-backdrop').removeClass('modal-backdrop');
        if(response == 'done') {
          showAjaxModal_data_create('<?php echo site_url('modal/popup/modal_welcome/'); ?>', 'WELCOME BACK');
        } else {
          showAjaxModal_confirm('Sorry, there seems to be a problem somewhere. Please try again.', 'Error');
        }
      });
    });


  //mark attendance here
  function clock_in_out() {
    const timeNow = new Date();
    const hr = timeNow.getHours();
    const mn = timeNow.getMinutes();
    const timeFull = (mn < 10 ? hr + ':0' + mn : hr + ':' + mn);
    const user_id = <?php echo $current_user_id; ?>;
    const nTime = Number('<?php echo date('H') ?>');
    const greeting = nTime < 12 ? 'MORNING' : nTime == 12 ? 'NOON' : nTime <= 16 ? 'AFTERNOON' : nTime <= 21 ? 'EVENING' : 'NIGHT';


    //check the current attendance status of the user; 0 == clocked out, 1 == clocked in
    $.ajax({
      url: '<?php echo site_url('admin/clock_in_out/status_check_update/') ?>' + user_id,
      type: 'POST',
      dataType: 'text',
      cache: false,
    })
    .done(function(att_status) {

      if(att_status == 'clocked-in') {
        $('#clock-in-out').removeClass('btn-success').addClass('btn-danger').find('span').text('CLOCK-OUT');
        $('#create').slideUp('slow');
        showAjaxModal_confirm('GOOD ' + greeting + '! WELCOME BACK <?=$name . '! YOU HAVE SUCCESSFULLY CLOCK-IN.\n TIME:<strong>'?>' + timeFull + '<?='</strong>'?>', 'Success');
        setTimeout(() => {
          $('#modal_confirm .close').click();
          $('#overlay').fadeOut('slow');
          $('.modal-backdrop').removeClass('modal-backdrop');
        }, 4000);

      } else if(att_status == 'shift-ended') {
        showAjaxModal_confirm('Your Shift for today has ended! You cannot clock-in again.', 'Error');
        setTimeout(() => {
          $('#modal_confirm .close').click();
          $('#overlay').fadeOut('slow');
          $('.modal-backdrop').removeClass('modal-backdrop');
        }, 4000);
      } else if(att_status == 'fraud') {
        showAjaxModal_confirm('Your request is prohibited! It seems you are not at the office at the moment or probably, you are not using the preferred computer. Please check and try again.', 'Error');
        setTimeout(() => {
          $('#modal_confirm .close').click();
          $('#overlay').fadeOut('slow');
          $('.modal-backdrop').removeClass('modal-backdrop');
        }, 10000);

      } else if(att_status == 'confirm') {
        $('#confirm_clock_out').modal('show', {backdrop: 'static'});
        $('#clock_me_out').click(function(event) {
          $.ajax({
            url: '<?php echo site_url('admin/clock_in_out/status_check_update/') ?>' + user_id + '/1',
            type: 'POST',
            dataType: 'text',
            cache: false
          })
          .done(function(att_status2) {
            if(att_status2 == 'clocked-out') {
              $('#clock-in-out').removeClass('btn-danger').addClass('btn-success').find('span').text('CLOCK-IN');
              showAjaxModal_confirm('GOOD ' + greeting + '! GOODBYE <?=$name . '! You have successfully clocked-out.\n Your Clock-Out time today is <strong>'?>' + timeFull + '<?='</strong>'?>', 'Success');
              setTimeout(() => {
                $('#modal_confirm .close').click();
                $('#overlay').fadeOut('slow');
                $('.modal-backdrop').removeClass('modal-backdrop');
              }, 3000);
              showAjaxModal_data_create('<?php echo site_url('modal/popup/modal_goodbye/'); ?>', 'GOOD BYE');
              $('#overlay').fadeOut('slow');
              $('.modal-backdrop').removeClass('modal-backdrop');
            }
          });
        });
      }
    });
  }
</script>