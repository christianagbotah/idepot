<?php
$system_name_row = $this->db->get_where('settings', array('type' => 'system_name'))->row();
$system_name = $system_name_row->description ?? 'POS System';
?>

<!DOCTYPE html>
<html lang="en" dir="<?php if ($text_align == 'right-to-left') echo 'rtl';?>">
<head>

    <title><?php echo $page_title;?> | <?php echo $system_name;?></title>

    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Lightworldtech Inventory Management Software - Lightworld Technologies Ltd" />
    <meta name="author" content="Lightworldtech" />

    <link rel="stylesheet" href="<?=base_url('node_modules/flowbite/dist/flowbite.css')?>">
    <?php include 'css.php'; //header?>

    <link href="<?php echo base_url('assets/tailwindcss/output.css'); ?>" rel="stylesheet">

    <style type="text/css">

      .item_images:hover, .printers:hover {
        transition: transform 0.6s;
        transform-style: all;
        transform: scale(2);
        cursor: pointer;
      }

      .modal-backdrop.show {
        z-index: 1 !important;
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

      body, .form-control {
        font-size: 1.5rem !important;
      }

      input[type="radio"], input[type="checkbox"] {

        width: 22px !important;
        height: 22px !important;
      }
         

    </style>
    <?php include 'includes_top.php'; //header?>
</head>



<body style="min-height: 100vh; max-height: 100vh;" class="overflow-y-scroll md:overflow-y-hidden" oncontextmenu="return true">

  <div class="container-fluid" id="top_top">
        <div id="header-nav">
          <?php include 'top-header.php';?>
        </div>
<br>

<div id="welcomer" style="display: none">
  <center>
    <div class="jumbotron jumbotron-fluid">
      <div class="container">
        <h1 style="font-size: 30px; font-weight: bolder;">WELCOME BACK <?php echo $name; ?></h1>
        <br>
        <h3 class="text-white bg-danger p-5">Please CLOCK-IN to have access to your POS Portal.</h3>

        <!--FOR DISPLAYING TIME INPUT IF USER DID NOT LOGOUT DURING THE PREVIOUS SESSION -->
        <div id="time_display">
          <?php
            echo form_open(site_url('admin/clock_in_out/update_clock_out/'),
  array('class' => 'form-groups-bordered', 'id' => 'update_clock_out', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-md-12 col-sm-12 col-xs-12">
                  <div class="col-md-2 col-sm-2 col-xs-2"></div>
                  <input type="time" required="true" class="form-control col-md-4 col-sm-4 col-xs-4" name="closing_time" id="closing_time" value="17:30" style="text-align: center; font-size: 30px; font-weight: bolder"><br>

                  <button type="submit" class="col-md-4 col-sm-4 col-xs-4 btn btn-success btn-lg" style="text-align: center; font-size: 25px; font-weight: bolder"><i class="fas fa-clock-o fa-spin text-white"></i> Submit</button>
                  <div class="col-md-2 col-sm-2 col-xs-2"></div>
                </div>
              </div>
            </form>
        </div> <!--END OF THAT -->

        <hr>
        <hr>
        <br>
        <h4 class="text-success">Do have a great day and great sales today.</h4>
          <hr>
          <h5 class="text-warning"><small><em>Software Developed & Designed By Lightworld Technologies Ltd - 0243618186|0247612799</em></small></h4>
      </div>
    </div>
  </center>
</div>

<div id="goodbye" style="display: none">
  <center>
    <div class="jumbotron jumbotron-fluid">
      <div class="container">
        <h1 style="font-size: 30px; font-weight: bolder;">GOODBYE <?php echo $name; ?></h1>
        <br>
        <h3 class="text-white bg-danger p-5">You have just ended your shift for today!</h3>
        <hr>
        <hr>
        <br>
        <h4 class="text-success">We hope you had a great day and great sales today.</h4>
          <hr>
          <h5 class="text-warning"><small><em>Software Developed & Designed By Lightworld Technologies Ltd - 0243618186|0247612799</em></small></h4>
      </div>
    </div>
  </center>
</div>

<!--MAIN PAGE STARTS-->
  <div class="row container-fluid col-sm-12 col-md-12" style="padding-bottom: 20px;" id="main_holder">
          <center>
            <div style="position: absolute; top: 38vh; left: 46vw;">
              <h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3>
              <h4 style="color: black">Loading your page</h4>
            </div>
          </center>
</div>
<input type="hidden" name="hidden_item_id" id="hidden_item_id"/>
<!--MAIN PAGE ENDS-->

    

  <!-- confirm selection modal-->
  <div class="modal fade" id="confirm_selection" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document" style="margin-top: -3vh">
      <div class="modal-content">
        <div class="modal-header bg-warning">
          <h3 class="modal-title text-dark">Are you sure you really want to sell this item?</h3>
        </div>
        <div class="modal-body">
                    
        </div>

        <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
          <a href="#" class="btn btn-success btn-lg rounded-lg" data-dismiss="modal" id="yes_btn" style="font-weight: bolder; font-size: 25px;"><?php echo get_phrase('Yes'); ?></a>
          <button type="button" class="btn btn-danger btn-lg rounded-lg" id="no_btn" data-dismiss="modal" style="font-weight: bolder; font-size: 25px;"><?php echo get_phrase('No'); ?></button>
      </div>
      </div>
    </div>
  </div>

  <!-- for those goods that can be sold in units -->
  <div class="modal fade" id="confirm_selection_unit" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document" style="margin-top: -3vh">
      <div class="modal-content">
        <div class="modal-header bg-warning">
          <h3 class="modal-title text-dark">Are you sure you really want to sell this item?</h3>
        </div>
        <div class="modal-body">
          <div id="main-content"></div>

          <div class="d-flex flex-row justify-content-center">
            <div class="alert alert-warning">
              <i class="fa fa-info"></i> <strong>Warning!</strong> This product is sold in other units as well.
            </div>
          </div>
          <div class="d-flex flex-row justify-content-between">
            <div class="col-lg-7 col-md-7 col-sm-7 font-weight-bold">
              <label class="form-label text-sm">I want to sell in:</label>
              <div class="form-check-inline">
                <label class="form-check-label" for="package" style="cursor: pointer !important;">
                  <input type="radio" onclick="getPackage($(this).val())" name="package_or_unit" id="package" class="form-checkinput" value="0" style="cursor: pointer !important;"/> <span id="item_package_name"></span>
                </label>
              </div>
              <div class="form-check-inline">
                <label class="form-check-label" for="unit" style="cursor: pointer !important;">
                  <input type="radio" onclick="getPackage($(this).val())" name="package_or_unit" id="unit" class="form-checkinput" value="1" style="cursor: pointer !important;"/> Unit
                </label>
              </div>
            </div>
            <div class="col-lg-5 col-md-5 col-sm-5" id="item_units_list"></div>
          </div> 
        </div>

        <div class="modal-footer">
          <div class="d-flex flex-row justify-content-end">
              <a href="#" class="btn btn-success btn-lg mr-2 rounded-lg" data-dismiss="modal" id="yes_btn_unit" disabled style="font-weight: bolder; font-size: 25px;"><?php echo get_phrase('Yes'); ?></a>
              <button type="button" class="btn btn-danger btn-lg rounded-lg" id="no_btn_unit" data-dismiss="modal" style="font-weight: bolder; font-size: 25px;"><?php echo get_phrase('No'); ?></button>
          </div>         
        </div>
      </div>
    </div>
  </div>
  <!--end of modal-->

  <!-- confirm clock-out modal-->
  <div class="modal fade" id="confirm_clock_out" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document" style="margin-top: -15vh">
      <div class="modal-content">
        <div class="modal-header bg-danger">
          <h3 class="modal-title text-white">You requested to CLOCK-OUT!</h3>
        </div>
        <div class="modal-body">
           <strong>Are you sure you want to perform this action? If you CLOCK-OUT you will not be able to CLOCK-IN today again, until tomorrow as this will end your shift for today! If you intend to remain CLOCKED-IN till the end of your shift today, then consider using the LOGOUT button instead!</strong>         
        </div>

        <div class="modal-footer" style="margin:0px; border-top:0px; text-align:center;">
          <a href="#" class="btn btn-success btn-lg" data-dismiss="modal" id="clock_me_out" style="font-weight: bolder; font-size: 16px;"><?php echo get_phrase('CLOCK ME OUT'); ?></a>
          <button type="button" class="btn btn-danger btn-lg" id="no_btn" data-dismiss="modal" style="font-weight: bolder; font-size: 16px;"><?php echo get_phrase('CANCEL'); ?></button>
      </div>
      </div>
    </div>
  </div><!--end of modal-->

</div>





<script type="text/javascript">
    $(function() {

        $.ajaxSetup({
            cache: false,
            data: {
                '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
            } 
         });

        getMainPage();
        //value_change_pos();
        
       // get_price_list();

       // $('#pricing_table').DataTable();

       getImprestBalance();

    });


    //get imprest account balance
  function getImprestBalance() {

    $('#imprest-balance').html('<p style="margin-top: 15px">Updating...</p>');
    

    $.ajax({
      url: '<?php echo site_url('admin/getImprestBalance') ?>',
      type: 'post',
      dataType: 'json',
      cache: false,

    })
    .done(function(response) {

      $('#imprest-name').html(response.accountName);
      $('#imprest-balance').html(response.accountBalance);

    })
    .fail(function(err) {

      $('#imprest-balance').html('Error');
    })
  }

    function getPackage(selVal) {

      let item_id = $('#hidden_item_id').val();
      $('#confirm_selection_unit .modal-body #item_units_list').html('');

      /*Enable the Yes button now*/
      $('#yes_btn_unit').removeAttr('disabled');

      if(selVal == 1) { //in other units such as kg, p, m ton, etc

        $.ajax({
          url: '<?php echo site_url('admin/item_unit_selection_pos/show_units/') ?>' + item_id,
          type: 'POST',
          dataType: 'json',
        })
        .done(function(response) {
          $('#confirm_selection_unit .modal-body #item_units_list').html(response.unit_list);

        })
      } else { //in package such as boxes, coils etc or the primary unit for sale

         $('#confirm_selection_unit .modal-body #item_units_list').html('');
         $('#yes_btn_unit').attr('onclick', 'add_new_row_pos('+item_id+')');
      }

    }



    //get main page
    function getMainPage() {
      $.ajax({
        url: '<?php echo site_url('admin/get_pos_main_page') ?>',
        type: 'POST',
        dataType: 'html',
      })
      .done(function(response) {

        $('#main_holder').html(response);
      })
      .fail(function() {
        //alert("error");
      });
      
    }


    //delay clock out form submitted
  $('#update_clock_out').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    showAjaxModal_confirm('Please wait...<i class="fa fa-spinner fa-pulse"></i>', 'Loading');
    
    const user_id = <?php echo $this->session->userdata('admin_id'); ?>;

    $.ajax({
      url: '<?php echo site_url('admin/clock_in_out/update_clock_out/') ?>' + user_id,
      type: 'POST',
      data: new FormData(this),
      dataType: 'text',
      cache: false,
      contentType: false,
      processData: false
    })
    .done(function(response) {
      if(response == 'done') {

        showAjaxModal_confirm('Very well. Your previous day\'s CLOCK-OUT has been successful. Kindly CLOCK-IN now to proceed', 'Success');

          //setTimeout(() => {
            $('#modal_confirm .close').click(); window.location.reload();
          //}, 5000);

      } else {
        showAjaxModal_confirm('Sorry, there seems to be a problem somewhere. Please try again.', 'Error');
      }
    });
  });


  </script>


  <div class="row" id="modals_holder">

                  <?php include 'modal.php';?>

      </div>
<?php include 'includes_bottom.php'; //header?>

<script type="text/javascript">
        //remove the preloader after page has fully loaded
        $(document).ready(function() {
          

         /* $(window).on("load", function() {
            $('#modal_preloader').slideUp('400', function() {
              $('.modal-backdrop').removeClass('modal-backdrop');
              $('#modal_preloader').modal('hidden');
              $('#modal_preloader').remove();
              $('#modal_preloader').css('display', 'none');
            });
          
          });*/
        });

        //for firefox browser
       /* window.onload = function() {
            $('#modal_preloader').slideUp('400', function() {
              $('.modal-backdrop').removeClass('modal-backdrop');
              $('#modal_preloader').modal('hidden');
              $('#modal_preloader').remove();
              $('#modal_preloader').css('display', 'none');
            });
          
          //
          if($('#main_div').hasClass('sidebar-collapsed')) {
            $('#main-menu > div ul').addClass('toggled');
          }
          };

          $(function() {
            //
          if($('#main_div').hasClass('sidebar-collapsed')) {
            $('#main-menu > div ul').addClass('toggled');
          }
        });*/

          //let the first opened modal still gain focus if an aux modal get closed
        
            let mod_counter = 0;
            // when any modal is still opened
            $(document).on('shown.bs.modal', function (e) {

              mod_counter++;
              $('body').addClass('modal-open');

              $('.modal-open .modal').css({
                'overflow-x' : 'scroll'
              });

            });


            $('#create').on('hidden.bs.modal', function () {
              
              /*$('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

              //getMainPage();*///window.location.reload();
            });

            $(document).on('hidden.bs.modal', function () {
              mod_counter--;
            });

            $(document).on('hidden.bs.modal', function () {
              
              if(mod_counter > 0) {
                //there is still an opened modal
                $('body').addClass('modal-open');
              }
            });


            /////////////////////////////////////////////////////////////////////////
          //providing extra shadow when a modal is called on another modal
          ////////////////////////////////////////////////////////////////////////
          //for extra detail or creation modal
          $(document).on('shown.bs.modal', '#create', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#create', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for deleting modal
          $(document).on('shown.bs.modal', '#deletion_modal', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#deletion_modal', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for confirming modal
          $(document).on('shown.bs.modal', '#modal_confirm', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#modal_confirm', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for date selection modal
          $(document).on('shown.bs.modal', '#date_selection', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#date_selection', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for date other deletion modal
          $(document).on('shown.bs.modal', '#deletion', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#deletion', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for date loading modal
          $(document).on('shown.bs.modal', '#loading', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#loading', function () {
            $('#main').removeClass('modal-backdrop');
          });

          //for payment modal
          $(document).on('shown.bs.modal', '#payments_sales', function (e) {
            $('#main').addClass('modal-backdrop');

          });

          $(document).on('hidden.bs.modal', '#loading', function () {
            $('#main').removeClass('modal-backdrop');
          });
                          /////////////////////////////////////
                                          //END//
                          /////////////////////////////////////

            
      </script>
      <script src="<?=base_url('node_modules/flowbite/dist/flowbite.min.js')?>"></script>
</body>

</html>