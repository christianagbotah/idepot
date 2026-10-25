<!doctype html>
<?php
//$system_title = $this->db->get_where('settings', array('type' => 'system_title'))->row()->description;
$system_name  = $this->db->get_where('settings', array('type' => 'system_name'))->row()->description;
$admin_email = $this->db->get_where('admin', array('level' => 1))->first_row()->email;

//check for email validation
  function valid_email_address($email_address) {
    return (bool) filter_var($email_address, FILTER_VALIDATE_EMAIL);
  
  }

?>

<html class="no-js" lang="">
    <head>
      <meta charset="utf-8">
      <meta http-equiv="x-ua-compatible" content="ie=edge">
      <title>
        <?php echo get_phrase('login'); ?> | <?php echo $system_name; ?>
      </title>
      <meta name="description" content="">
      <meta name="viewport" content="width=device-width, initial-scale=1">

	    <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png');?>">
      <link rel="stylesheet" href="<?php echo base_url('assets/css/bootstrap.css');?>">
      <link href="<?php echo base_url('assets/login_page/css/all-font-awesome.min.css'); ?>" rel="stylesheet" type="text/css">
      <link rel="stylesheet" href="<?php echo base_url('assets/login_page/css/font-awesome.min.css');?>">
      <link rel="stylesheet" href="<?php echo base_url('assets/login_page/css/normalize.css');?>">
      <link rel="stylesheet" href="<?php echo base_url('assets/login_page/css/main.css');?>">
      <link rel="stylesheet" href="<?php echo base_url('assets/login_page/css/style.css');?>">
      <script src="<?php echo base_url('assets/login_page/js/vendor/modernizr-2.8.3.min.js');?>"></script>
		  <link href="https://fonts.googleapis.com/css?family=Quicksand:300,400,500,700" rel="stylesheet">

      


      <style>
    .main-content-wrapper {
      width: 100%;
      background: #d97f02;
      text-align: center;

      background-image: url("<?php echo base_url('assets/login_page/img/bg.jpg');?>");
      background-position: center center;
      background-size: cover;
      background-repeat: no-repeat;
    }
    .container header{
      background: #d97f02;
      padding: 1em;
      color: white;
      text-align: center;
      font-size: 2em;
    }


    .login-area{
      background-color: rgba(10, 12, 25, 0.47);
      margin-top: 0px;
      border-radius: 10px 60px 10px;
      -webkit-border-radius: 10px 60px 10px;
      -moz-border-radius: 10px 60px 10px;
      -o-border-radius: 10px 60px 10px;
      box-shadow: 5px 5px 13px 5px #000;
    }


    #fpass a {
      color: #9be0da;
    }
    #fpass a:hover {
      color: #ffffff;
    }

    #auth_form, #form_block, #blocked_not, #admin_mail, #admin_mail2 {
      max-width: 330px;
      margin: 0 auto;
    }

     #fail_login {
      max-width: 330px;
      margin: 7px auto;
    }

    #overlay {
      background: #000 !important;
      border: 20px groove black;
      z-index: 9999;
    }
  </style>

  </head>
  <body oncontextmenu="return true"> 
    <div id="overlay" style="min-height: 100vh;">
		<div class="main-content-wrapper" style="min-height: 100vh;">
			<div class="login-area" style="display: none">
        <div style="margin-top: -50px; border-bottom: 1px solid #fff; padding-bottom: 10px; margin-bottom: 10px"><i class="fa fa-cash-register fa-3x"></i></div>
				<div>
  				<div class="login-header">
  					<a href="<?php echo site_url('login');?>" class="logo">
  						<img src="<?php echo base_url('uploads/school_logo.png');?>" height="120" alt="">
  					</a>
            <br><br>
  					<h2 class="title"><?php echo $system_name; ?></h2>
  				</div>
				<div class="login-content">

          <?php if(validation_errors()) :?>
            <div class="alert alert-danger alert-dismissible" role="alert">
                <button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span>
                </button>
               <strong> <?php echo validation_errors(); ?></strong>
            </div>
            <?php endif;?>

            <?php 
              //don't display all forms if user account is marked as blocked
              if(isset($page_info) && $page_info == 'blocked') {?>

                  <div class="alert alert-danger alert-dismissible" id="blocked_not" role="alert" style="border-top: 4px solid red;">
                    <button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span>
                    </button>
                   <em>Sorry, your account has been marked as blocked. Please contact your administrator for assistance!</em>
                </div>

                <div id="admin_mail">Send mail to: <a href="mailto:<?php echo $admin_email; ?>" style="color: #ffffff;" title="Send Email to the admin"><u><?php echo $admin_email; ?></u></a></div>

                <?php
              } else {
            ?>

              <div class="alert alert-danger alert-dismissible" id="fail_login" style="display: none;" role="alert">
                <button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span>
                </button>
               <em></em>
            </div>

            <div id="admin_mail2" style="display: none;">Send mail to: <a href="mailto:<?php echo $admin_email; ?>" style="color: #ffffff;" title="Send Email to the admin"><u><?php echo $admin_email; ?></u></a></div>


            <?php echo form_open('', array('id' => 'form_block', 'role' => 'form', 'style' => 'display: none')); ?>
            <div class="form-group">
              <input type="email" class="input-field" name="email_block" id="email_block" style="text-align: center; font-size: 14px; font-weight: bolder;" data-validate="required" data-message-required="Email required" placeholder="<?php echo get_phrase('enter_your_email');?>"
                required autocomplete="off">
            </div>
            </form>
            
            <div class="form-group" id="email_block_btn" style="display: none;">
              <button id="send_mail" class="btn btn-danger">Send Email</button>
            </div>
            
          

            <?php echo form_open('', array('id' => 'auth_form')); ?>
              
               <div id="auth_verification_holder"></div>
              <div class="form-group" style="border-top: 7px solid #fdfb08;" id="auth_key_holder">
                <div class="input-group-addon">
                  <input type="text" class="input-field" name="auth_key" style="text-align: center; font-size: 21px; font-weight: bolder;" id="auth_key" minlength="5" maxlength="5" placeholder="Your Authentication Key" data-validate="required" data-message-required="Authentication Key required" autocorrect="off" autocomplete="off" autosave="off"  autofocus="true" onkeyup="auth_verification(this.value)">
                  <i class="fa fa-key" style="font-size: 20px;"></i>
                </div>
                
              </div>
              
            <?php echo form_close(); ?>

            <?php echo form_open(site_url('login/validate_login'), array('id' => 'form_login', 'role' => 'form', 'onsubmit' => 'return showProgressModal()')); ?>
            <div class="form-group">
              <input type="email" class="input-field" id="username_email" name="email" data-validate="required" data-message-required="Email required" placeholder="<?php echo get_phrase('email');?>"
                required autocomplete="off" autocorrect="off">
            </div>
            <div class="form-group">
              <input type="password" class="input-field" name="password"  data-validate="required" data-message-required="Password required" autocomplete="off" autocorrect="off" placeholder="<?php echo get_phrase('password');?>"
                required>
            </div>
            <input type="hidden" name="auth_key2" value="" id="auth_key2">
            <button type="submit" class="btn btn-primary"><?php echo get_phrase('login'); ?><i class="fa fa-lock"></i></button>
          <?php echo form_close(); ?>

          <div class="login-bottom-links" id="fpass">
            <a href="<?php echo site_url('login/forgot_password');?>" class="link" >
              <?php echo get_phrase('forgot_your_password'); ?> ?
            </a>
                <?php 
                      }
                ?>

              
					</div><br>
          <center>
            <small style="font-size: 10px; color: #c5bfbf;">
              &copy; <?php echo date('Y'); ?> <?php //echo $this->db->get_where('settings' , array('type'=>'system_name'))->row()->description; ?>. All rights reserved. | 
              Powered By: <a href="https://www.lightworldtech.com" target="_blank" style="color: #d97f02;">Lightworldtech</a>
            </small>
          </center>
				</div>
			</div>
			</div>
		<!--	<div class="image-area"></div> -->
		</div>
  </div>

  <!-- Progress Modal -->
  <div class="modal fade" id="progressModal" tabindex="-1" role="dialog" data-backdrop="static" data-keyboard="false">
    <div class="modal-dialog modal-sm" role="document">
      <div class="modal-content">
        <div class="modal-body text-center">
          <div class="progress" style="margin-bottom: 15px;">
            <div class="progress-bar progress-bar-striped active" id="progressBar" role="progressbar" style="width: 0%"></div>
          </div>
          <p id="progressText">Authenticating...</p>
        </div>
      </div>
    </div>
  </div>

    <script src="<?php echo base_url('assets/login_page/js/vendor/jquery-3.3.1.min.js');?>"></script>
    <script src="<?php echo base_url('assets/login_page/js/all-font-awesome.min.js');?>"></script>
    <script src="<?php echo base_url('assets/js/bootstrap-notify.js');?>"></script>
    <script src="<?php echo base_url('assets/js/bootstrap.js');?>"></script>

    <?php if ($this->session->flashdata('login_error') != '') { ?>
      <script type="text/javascript">
        $.notify({
          // options
          title: '<strong><?php echo get_phrase('error');?>!!</strong>',
          message: '<?php echo $this->session->flashdata('login_error');?>'
          },{
          // settings
          type: 'danger'
        });
      </script>
    <?php } ?>
  </body>
</html>

<script type="text/javascript">
  //hide login form
  $(function() {
    //show the login area
    $('.login-area').slideDown('slow');
    $('#form_login').css('display', 'none');
  });

  //call onkeyup function on the auth_key input field and use ajax to verify the input
  var fail_counter = 1;
  var cookie_var = 0;

  function auth_verification(auth_key) {
    
    var counter_holder = 0;
    $.ajax({
      url: '<?php echo site_url('login/auth_verification/') ?>' + auth_key,
      success: function(response) {
        var login_times_counter = 0;
       if(auth_key.length == 5) {

          if(response == 'blocked') {

             preloader();
            function preloader(){
            $('#auth_verification_holder').css({'background-color': '#e4dada91'});
            $('#auth_verification_holder').html('<div style="text-align:center;"><img src="<?php echo base_url();?>assets/images/validate.gif" width="25px" style="z-index: 9999;"/><em"> authenticating, please wait...</em></div>');
            }

            setTimeout(() => {
            blocked_acc_ver();
            }, 2000);

            function blocked_acc_ver() {
              $('#auth_key_holder').css('display', 'none');
              $('#auth_verification_holder').css('display', 'none');
              $('#fpass').css('display', 'none');
              $('#form_block').css('display', 'none');
              $('#email_block_btn').css('display', 'none');
              $('#fail_login').css({'display': 'block', 'border-top': '4px solid red'});
              $('#fail_login em').text('Sorry, your account has been marked as blocked. Please contact your administrator for assistance!');
              $('#admin_mail2').removeAttr('style');
            }
            
          } else {
            if(response == 'true') {
            
              $('#auth_key2').val(auth_key);
              preloader();
              function preloader(){
              $('#auth_verification_holder').css({'background-color': '#e4dada91'});
              $('#auth_verification_holder').html('<div style="text-align:center;"><img src="<?php echo base_url();?>assets/images/validate.gif" width="25px" style="z-index: 9999;"/><em"> authenticating, please wait...</em></div>');
              }

              setTimeout(() => {
              verification_result();
              }, 2000);

              function verification_result() {
                $('#fail_login').css({'display': 'none'});
                $('.fa-key').css({'color': 'green'});
                $('#auth_key').attr('readonly', 'readonly');
                $('#auth_verification_holder').css({'background-color': 'green', 'padding': '5px', 'color': '#ffffff'});
                $('#auth_verification_holder').html('Authentication Key <u>' + auth_key + '</u> verified successfully');
                $('#auth_key_holder').removeAttr('style');
              }

              //reload the login form now
              setTimeout(() => {
                reload_form();
              }, 3500);
              function reload_form() {
                $('#auth_form').css('display', 'none');
                $('#fail_login').css({'display': 'none'});
                $('#form_login').css('display', 'block');
              }
            
         } else if(response == 'true_student') {
            
              $('#auth_key2').val(auth_key);
              preloader();
              function preloader(){
              $('#auth_verification_holder').css({'background-color': '#e4dada91'});
              $('#auth_verification_holder').html('<div style="text-align:center;"><img src="<?php echo base_url();?>assets/images/validate.gif" width="25px" style="z-index: 9999;"/><em"> authenticating, please wait...</em></div>');
              }

              setTimeout(() => {
              verification_result();
              }, 2000);

              function verification_result() {
                $('#fail_login').css({'display': 'none'});
                $('.fa-key').css({'color': 'green'});
                $('#auth_key').attr('readonly', 'readonly');
                $('#auth_verification_holder').css({'background-color': 'green', 'padding': '5px', 'color': '#ffffff'});
                $('#auth_verification_holder').html('Authentication Key <u>' + auth_key + '</u> verified successfully');
                $('#auth_key_holder').removeAttr('style');
              }

              //reload the login form now
              setTimeout(() => {
                reload_form();
              }, 3500);
              function reload_form() {
                
                //show login form
                $('#auth_form').css('display', 'none');
                $('#fail_login').css({'display': 'none'});
                $('#form_login').css('display', 'block');

                //change Email field to Username field
                //First, remove some attr
                $('#username_email').removeAttr('type');
                $('#username_email').removeAttr('data-message-required');
                $('#username_email').removeAttr('placeholder');
                $('#username_email').removeAttr('name');

                //Then add them with different values
                $('#username_email').attr('type', 'text');
                $('#username_email').attr('data-message-required', 'Username Required');
                $('#username_email').attr('placeholder', 'Username');
                $('#username_email').attr('name', 'username');

              }
            
         }else {

            preloader();
            function preloader(){
            $('#auth_verification_holder').css({'background-color': '#e4dada91'});
            $('#auth_verification_holder').html('<div style="text-align:center;"><img src="<?php echo base_url();?>assets/images/validate.gif" width="25px" style="z-index: 9999;"/><em"> authenticating, please wait...</em></div>');
            }

            setTimeout(() => {
            verification_result(); auth_faliure();
            }, 3000);

            function verification_result() {
              $('.fa-key').css({'color': 'red'});
              $('#auth_verification_holder').css({'background-color': 'red', 'padding': '5px', 'color': '#ffffff'});
              $('#auth_verification_holder').html('Authentication Key <u>' + auth_key + '</u> verification failed');
              $('#auth_key_holder').removeAttr('style');
            }

              function auth_faliure() {
                counter_holder = fail_counter;
                if(counter_holder == 2) {
                  $('#fail_login').removeAttr('style');
                  $('#fail_login').css({'border-top': '4px solid red'});
                  $('#fail_login em').text('You have 2 times of authentication failure. Your account will be blocked after the 3rd failure.');
                }else if(counter_holder == 3) {
                  $('#auth_form').css('display', 'none');
                  $('#fpass').css('display', 'none');
                  $('#form_block').css('display', 'block');
                  $('#email_block_btn').css('display', 'block');
                  $('#fail_login').css('display', 'none');

                  verify_email_block();
                  
                  
                } else {
                  $('#fail_login').css('display', 'none');
                }

                fail_counter++;
              
             }

            }
          }
        } else {
            $('#auth_verification_holder').text('');
          }
      }
    });    
  }

  function verify_email_block() {

    //verify email and block it
    $('#send_mail').click(function(event) {
      //get email 
      var email_block =  $('#form_block').serialize();

      $.ajax({
        url: '<?php echo site_url('login/block_account/'); ?>',
        data: email_block,
        
        success: function(block_email) {
          if(block_email == 0) {
              $('#fail_login').css('display', 'block');
              $('#fail_login em').text('No match was found. Make sure you enter your correct email address!');
          }else {
              $('#form_block').css('display', 'none');
              $('#email_block_btn').css('display', 'none');
              $('#fail_login').css({'display': 'block', 'border-top': '4px solid red'});
              $('#fail_login em').text('Sorry, your account has been blocked temporarily. Please contact your system administrator');
          }
        }
      });
      
    });
  }

  function showProgressModal() {
    $('#progressModal').modal('show');
    updateProgress(20, 'Validating credentials...');
    
    setTimeout(() => updateProgress(40, 'Checking attendance...'), 1000);
    setTimeout(() => updateProgress(60, 'Processing stock data...'), 2000);
    setTimeout(() => updateProgress(80, 'Initializing system...'), 3000);
    setTimeout(() => updateProgress(100, 'Redirecting to dashboard...'), 4000);
    
    return true;
  }

  function updateProgress(percent, text) {
    $('#progressBar').css('width', percent + '%');
    $('#progressText').text(text);
  }
</script>


