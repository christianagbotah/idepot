<?php
$system_name = $this->db->get_where('settings', array('type' => 'system_name'))->row()->description;
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

    <?php include 'css.php'; //header?>

    <style type="text/css">

    </style>
    <?php include 'includes_top.php'; //header?>
</head>



<body style="min-height: 100vh; background-color: #ffffff" oncontextmenu="return true">

  <!--MAIN PAGE STARTS-->
  <style type="text/css">
    .btn {
        border-radius: 8px;
        height: 30px;
    }
    .select2-selection__choice {
        font-size: 11px !important;
    }
</style>

<?php

    echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

    $items = $this->db->get('items')->result_array();


    

    ///get current user's name
    $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

    echo form_open(site_url('admin/loadItemHistory'),
    array('class' => 'form-horizontal form-groups-bordered', 'id' => 'itemHistory2', 'target' => '_blank')); ?>

    <div class="form-group container row m-auto bg-primary" style="padding-top: 30px; position: sticky; top: 0">
        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Item</div>
                </div>
                    <select class="form-control select2" onchange="loadItemHistoryPurchaseDates($(this).val())" name="item" id="item">
                        <?php
                        foreach($items as $item):?>
                            <option value="<?=$item['item_id'];?>"><?=$item['item_name'];?></option>
                        <?php
                        endforeach;
                        ?>
                    </select>
            </div><hr>
            
        </div>

        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Start Date:</div>
                </div>
                    <select class="form-control select2" disabled="disabled" name="from" id="from">
                      <option value="">Select Item First</option>
                    </select>
            </div><hr>
            
        </div>

        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">End Date:</div>
                </div>
                <input type="text" name="to" id="to" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>" style="height: 45px">
            </div><hr>
            
        </div>

        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Type:</div>
                </div>
                    <select class="form-control select2" name="type" id="type">
                      <option value="0">All</option>
                      <option value="s">Sales</option>
                      <option value="t">Transfers</option>
                    </select>
            </div><hr>
            
        </div>

        <div class="col-sm-2 col-md-2">
          <button type="submit" class="btn btn-info btn-lg" id="submit-button" style="height: 45px"><strong>Load Data</strong></button>
        </div>

    </div>

</form>


  <div class="col-sm-12 col-md-12" id="main_holder">
      <center>
          <div style="margin-top: 20vh">
              <?=get_spinner_image();?>
          </div>
          <h3>Please wait. Page is being loaded...</h3>
      </center>
  </div>

  <?php include 'includes_bottom.php'; //header?>

  <script type="text/javascript">

    $(function(e) {

      //set up csrf
      $.ajaxSetup({
        cache: false,
        data: {
            '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
        } 
     });

      //load it on page load event
      loadItemHistoryAjax();
    })
    
    //load the item history
    function loadItemHistoryAjax(item_id, first_date, second_date) {

      $('#main_holder').html('<center><div style="margin-top: 20vh"><?=get_spinner_image();?></div><h3>Please wait. Page is being loaded...</h3></center>');

      let myType = $('#type').val();

      let ajaxUrl = '<?php echo site_url('admin/loadItemHistoryAjax/');?>' + item_id + '/' + first_date + '/' + second_date +'/' + myType;

      if(item_id == undefined || first_date == undefined || second_date == undefined) {

        ajaxUrl = '<?php echo site_url('admin/loadItemHistoryAjax/' . $item_id.'/'.$first_date.'/'.$second_date) ?>/' + myType;

      }

      $.ajax({

        url: ajaxUrl,
        dataType: 'html',
        type: 'post',
        cache: false

      })
      .done(function(response) {

        $('#main_holder').html(response);

      })
      .fail(function(err) {
        $('#main_holder').html('<center><div class="alert alert-danger col-md-6 col-lg-6" style="margin-top: 20vh"><strong>Error Occured: </strong>We could not fetch the data. Please try again!</div></center>' + err.responseText);
      });
    }

    //load item history purchase dates
    function loadItemHistoryPurchaseDates(item_id) {

      $('#from').attr('disabled', 'disabled');
      if(item_id == '') {
        $('#main_holder').html('<center><h3 class="text-danger">No item was selected. Please try again!</h3></center>');
      }

      $('#submit-button').removeAttr('disabled');

      $.ajax({
        url: '<?php echo site_url('admin/loadItemHistoryPurchaseDates/'); ?>' + item_id,
        type: 'post',
        dataType: 'html',
        cache: false
      })
      .done(function(response) {
        $('#from').removeAttr('disabled');
        $('#from').html(response);

      })
      .fail(function(err) {

        $('#main_holder').html('<center><h3 class="text-danger">Error Occurred:</h3><p>Something happened and we could not fetch the data!</p> ' + err.responseText + '</center>');

      })
    }


    $('#itemHistory2').submit(function(ev) {

      ev.preventDefault();

      let item_id = $('#item').val();
      let from = $('#from').val();
      let to = $('#to').val();

      if(from == '' || to == '') {
        $('#main_holder').html('<center><h3 class="text-danger">One of the dates is not selected. Please try again!</h3></center>');
      }

      loadItemHistoryAjax(item_id, from, to);

    })

  </script>
</body>
</html>
