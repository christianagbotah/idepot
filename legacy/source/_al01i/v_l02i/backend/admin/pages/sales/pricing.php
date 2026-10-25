
<!DOCTYPE html>
<html lang="en">
<head>

    <title><?php echo $page_title;?> | <?php echo $system_name;?></title>

    <meta charset="utf-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="Lightworldtech Inventory Management Software - Lightworld Technologies Ltd" />
    <meta name="author" content="Lightworldtech" />

    <?php //include('css.php'); ?>

    <?php include 'includes_top.php';?>

</head>
<body style="min-height: 100vh; font-size: 13px;">

    <?php


      $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

     //Is the current logged in user the admin -->
       if($level == 1 || $level == 2):
    ?>

<?php
    //use get method to retrieve the values of from and to
    if(isset($_GET['from']) && isset($_GET['to'])) {
        $from = $_GET['from'];
        $to = date('d-m-Y', strtotime($from) + 518400); //$_GET['to'];

    } else {
        $from = $from;
        $to = date('d-m-Y', strtotime($from) + 518400);
    }

    //latest to date
  /*  $latest_to = $this->db
                            ->select('to')
                            ->distinct()
                            ->order_by('to', 'desc')
                            ->limit(1)
                            ->get('prices')->row()->to;

    if($latest_to > strtotime($to)) {
        $to = date('d-m-Y', $latest_to);
    }
    */
?>
<style type="text/css">
    /*body {
        overflow: visible !important;
    }*/

    #modal_confirm .modal-content {
        margin-top: -90vh !important;
    }

   
</style>
<div class="container">
    <div id="top"></div>
    <div class="row pt-5 pb-3">
        <div class="col-lg-12 col-md-12 col-sm-12 col-xs-12">
            <center>
                <h2 class="font-weight-bold"><?=$page_title; ?></h2>
            </center>
        </div>
    </div>

 
            
            <?php
    echo form_open(site_url('admin/pricing/update'),
        array('class' => 'form-groups-bordered', 'id' => 'pricing_form', 'target' => '_top')); ?>

                <!--SEARCH FOR NAME HERE-->
                <div class="row">
                        <div class="col-lg-2 col-md-2"></div>
                        <div class="col-lg-8 col-md-8 col-sm-12 col-xs-12">
                            <?php
                            $all_customers = $this->db->get_where('customers', array('customer_active' => 1))->result_array(); ?>

                            
                                <select class="form-control select2" id="nameSearch" onchange="get_price_list($(this).val())">
                                    <?php
                                        if(isset($_GET['customer_id'])) {
                                            $customer_name = $this->db->get_where('customers', ['customer_id' => $_GET['customer_id']])->row()->customer_name;
                                            echo '<option selected value="'.$_GET['customer_id'].'">'.$customer_name.'</option>';
                                            
                                        } else {
                                            
                                            echo '<option value="">Search/Select Customer</option>';
                                        }
                                    ?>
                                    
                                    <?php
                                        foreach($all_customers as $c) { ?>
                                            <option value="<?=$c['customer_id']; ?>"><?=$c['customer_name']; ?></option>

                                        <?php } ?>

                                </select>

                        </div>
                        <div class="col-lg-2 col-md-2"></div>
                </div>

                <div class="form-group row" id="_loader" style="display: none;">
                    <div class="col-md-3 col-lg-3 col-sm-3"></div>
                    <div class="col-md-6 col-lg-6 col-sm-6 col-xs-12">
                        <p style="text-align: center; font-size: 16px;" class="text-success"><img src="<?php echo base_url(); ?>assets/images/validate.gif" width="30px"/> A minute please... We are loading your data...</p>
                    </div>
                    <div class="col-md-3 col-lg-3 col-sm-3"></div>
                </div>
            
            

                <div class="row">
                    <div class="col-lg-2 col-md-2"></div>
                    <div class="col-lg-8 col-md-8 col-sm-12 col-xs-12">
                        <div class="card p-lg-5 p-md-3">
                            <div class="card-body">
                                <div class="card rounded-lg shadow">
                                    <div class="card-body">
                                        <div id="content_holder">
                                            <p>No customer selected. Please select one</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Contents here --> 
                    </div>
                    <div class="col-lg-2 col-md-2"></div>
                </div>

                


        </form> 

    <div class="row" id="modals_holder">

            <?php include 'modal.php';?>

    </div>

    <?php
    //verification here
else:
?>
<center><strong class="bg-danger text-light p-5 m-t-5">Sorry! You don't have enough permission to view this page.</strong>

    <br><br>
    <button onclick="window.close()" class="btn btn-success p-3">Take Me Back!</button>
</center>

<?php
endif; 
?>

    <div id="toTop" onclick="toTop()"></div>
</div>


<?php include 'includes_bottom.php';?>

    
</body>

  <?php
  echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';
?>

<script type="text/javascript">
    $(function() {
        $.ajaxSetup({
            cache: false,
            data: {
                '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
            } 
         });

        $(".select2").select2({
            theme: "classic"
        });

        //load customer's price list if page refreshes after price update
        if('<?=$_GET['customer_id'];?>' != '') {
            get_price_list(<?=$_GET['customer_id'];?>);
        }
        
    });

    $('#submit').click(function(event) {
        /* Act on the event */
         $('html, body').animate({
              scrollTop: ($('#top').offset().top )
          }, 1000);                   
        
    });

    function toTop() {
        $('html, body').animate({
              scrollTop: ($('#top').offset().top )
          }, 1000);
    }

    function get_price_list(customer_id) {

        if(customer_id == ' ') {
            return false;
        }



        var tableHeight = $('#pricing_form').height();
        tableHeight = tableHeight / 2;

        var mHeight = tableHeight - 400;

        tableHeight = $('#pricing_form').height();
        tableHeight = tableHeight / 2;
        mHeight = -50;// tableHeight - 10; //change the value of the margin top

        /*customer_name = customer_name.replace(/ /g, '-');//replace spaces with -
        customer_name = customer_name.replace(/\//g, '_');//replace / with _
        customer_name = customer_name.replace(/&/g, '00');//replace  with _*/

        //DISPLAY LOADING MODAL
        //showAjaxModal_loading('A minute please... We are loading your request', 'Loading');
        $('#_loader').slideDown('slow');


        $.ajax({
            url: '<?php echo site_url('admin/get_price_list/') ?>',
            type: 'POST',
            dataType: 'html',
            cache: false,
            data: {'customer_id': customer_id},
        })
        .done(function(data) {

            $('#_loader').slideUp('slow');
            //close the modal
            //$('#loading .close').click();
           // $('#modal_confirm .modal-body h3:last-child').remove();
            
            

            //display content
            $('#submit').slideDown('slow'); //show the submit button
            $('#content_holder').html(data);

        })
        .fail(function(err) {
            return;
        });
        
    }


    //form submitted
    $('#pricing_form').submit(function(event) {
        /* Act on the event */
        event.preventDefault();

        //alert(mHeight);
        //return false;

        //$('table th').css('zIndex', '-9999');
        $('#modal_confirm').attr('data-backdrop', 'static');
        $('#modal_confirm').attr('data-keyboard', 'false');
        

        $('#modal_confirm').css({
          zIndex: '9999',
          maxHeight: '40%',
        });

        $('#modal_confirm .modal-dialog').css({
          marginTop: '60px'
        });
        
        showAjaxModal_confirm('Please Wait... We are working on it!', 'Loading');

        items_ids_numeric = items_ids_numeric.toString();
        items_ids_numeric = items_ids_numeric.replace(/,/g, '-');


        let form_data = new FormData(this);

        //send data via ajax
        $.ajax({
          url: '<?php echo site_url('admin/pricing/update/') ?>'+ items_ids_numeric + '/' + customer_id,
          type: 'POST',
          dataType: 'json',
          data: form_data,
          processData: false,
          contentType: false,
          cache: false
        })
        .done(function(data) {

         // $('#modal_confirm .close').click();

          if(data.success == true) {

            //$('table th').css('zIndex', '-9999');
            $('#modal_confirm').css({
              position: 'absolute',
              top: '0px'
            });


            showAjaxModal_confirm('Price List Updated Successfully.<br><p class="text-white-50">Go ahead and update more</p>', 'Success');

            setTimeout(() => {
              $('#modal_confirm .close').click();
               location.replace('<?php echo site_url('admin/manage_prices?customer_id='); ?>'  + customer_id);
               //location.reload();
                
            }, 4000);
          } else {
            /*$(function(){
              $.each(data, function(index, val) {
              $('#list_err_price_list').append('<li>' + val + '</li>');
            }); });
    */
            //$('.close').click();
            $('#modal_confirm').css({
              position: 'absolute',
              top: '0px'
            });

            showAjaxModal_confirm(data.error, 'Error');
          }
        })
        .fail(function(err) {
          $('#modal_confirm').css({
              position: 'absolute',
              top: '0px'
            });

          showAjaxModal_confirm(error.responseText, 'Error');
        });
      });


</script>

