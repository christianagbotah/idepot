<?php
$token_number = 'TR' . substr(sha1(md5(mt_rand(1098545600, strtotime(date('d-m-Y H:i:s'))))), 0, 18);
?>

<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('new_item_transfer'); ?>
              </div>
          </div>


<style type="text/css">
  input[name="amount_paid"] {
    height: 35px !important;
    font-size: 25px !important;
    font-weight: bolder !important;
  }

  input[name="account_balance"], #balance_amount {
    height: 30px !important;
    font-size: 20px !important;
    font-weight: bolder !important;
  }
</style>
<div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/items_transfer/create'),
	array('class' => 'form-groups-bordered', 'id' => 'items_transfer_form', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">Token Number</div>
                        </div>
                    <input type="text" required="true" readonly="readonly" class="form-control" name="token_no" id="token_no"  value="<?=$token_number;?>">
                    </div>
                </div>

                <div class="col-sm-5 col-md-5">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">Transfer To:</div>
                        </div>
                        <input type="text" required="true" class="form-control" name="transfer_to" id="transfer_to"  value="">
                    </div>
                </div>

                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Transfer Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="transfer_date" id="transfer_date" data-format="dd-mm-yyyy"
                            value="<?php echo date('d-m-Y'); ?>">

                        <input type="hidden" class="form-control datepicker" name="transfer_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">
                    </div>
                </div>
            </div>


            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="item_transfer_create_table">
                    <thead>
                      <tr>
                        <th>Quantity</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Available Quantity</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>

                    </tbody>

                </table>
            </div>

            <hr>
            <div class="row">
                <div class="col-md-8 col-sm-8 col-lg-8"></div>
                <div class="col-md-4 col-sm-4 col-lg-4" style="text-align: right">
                    <a href="javascript:;" onclick="add_new_item_row()" class="btn btn-info btn-lg" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr>

            <div class="form-group row">
                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Total Quantity:</th>
                                    <th><strong><span></span> <span id="total">0</span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="">

                            </thead>
                        </table>

                        <hr><hr>


            <div class="form-group row">
                <div class="col-sm-4 col-md-4 col-xs-6">
                    <button type="submit" class="btn btn-success btn-lg">ISSUE TRANSFER</button>
                </div>
                <div class="col-sm-3 col-md-3 col-xs-6">
                    <button class="btn btn-danger btn-lg" data-dismiss="modal">CANCEL</button>
                </div>
                <div class="col-sm-2 col-md-3"></div>
            </div>
          </form>
          </div>

          </div>
        </div>
    </div>
</div>

<!-- for those goods that can be sold in units -->
  <div class="modal fade" id="confirm_transfer_unit" tabindex="-1" role="dialog" aria-labelledby="calendar-modal" aria-hidden="true">
    <div class="modal-dialog modal-dialog-centered" role="document" style="margin-top: -3vh">
      <div class="modal-content">
        <div class="modal-header bg-warning">
          <h3 class="modal-title text-dark">Are you sure you really want to transfer this item?</h3>
        </div>
        <div class="modal-body">
          <div id="transfer-main-content"></div>

          <div class="d-flex flex-row justify-content-center">
            <div class="alert alert-warning">
              <i class="fa fa-info"></i> <strong>Warning!</strong> This product can be transferred in other units.
            </div>
          </div>
          <div class="d-flex flex-row justify-content-between">
            <div class="col-lg-7 col-md-7 col-sm-7 font-weight-bold">
              <label class="form-label">I want to transfer in:</label>

            </div>
            <div class="col-lg-5 col-md-5 col-sm-5" id="transfer_item_units_list"></div>
          </div>

          <input type="hidden" id="hidden_item_id"/>
          <input type="hidden" id="hidden_row_id"/>
          <input type="hidden" id="hidden_unit_name"/>
          <input type="hidden" id="hidden_package_name"/>
          <input type="hidden" id="hidden_radio_val"/>



          <div class="d-flex flex-row">
              <div class="form-check-inline">

                <input type="radio" class="form-check-input" onclick="getPackage($(this).val(), $('#hidden_item_id').val())" name="tpackage_or_unit" id="transfer_package" class="form-checkinput" value="0" style="cursor: pointer !important;"/>
                <label class="form-check-label" for="transfer_package" style="cursor: pointer !important;">
                  <span id="transfer_item_package_name"></span>
                </label>
              </div>
              <div class="form-check-inline">

                <input type="radio" class="form-check-input" onclick="getPackage($(this).val(), $('#hidden_item_id').val())" name="tpackage_or_unit" id="tunit" class="form-checkinput" value="1" style="cursor: pointer !important;"/>
                <label class="form-check-label" for="tunit" style="cursor: pointer !important;">
                    Unit
                </label>
              </div>
          </div>
        </div>

        <div class="modal-footer">
          <div class="d-flex flex-row justify-content-end">
              <button class="btn btn-success btn-lg mr-2" onclick="$('#confirm_transfer_unit').modal('toggle')" id="yes_btn_unit" disabled style="font-weight: bolder; font-size: 25px;"><?php echo get_phrase('Yes'); ?></button>
              <button type="button" class="btn btn-danger btn-lg" id="no_btn_unit" onclick="$('#confirm_transfer_unit').modal('toggle')" style="font-weight: bolder; font-size: 25px;"><?php echo get_phrase('No'); ?></button>
          </div>
        </div>
      </div>
    </div>
  </div>
  <!--end of modal-->

<script type="text/javascript">
    $(function() {

        $('#confirm_transfer_unit .modal-content').hover(function() {

            $(this).css({
                background: 'bisque',
            });

        }, function() {

            $(this).css({
                background: '#fff',
            });

        });

    });

    function getPackage(selVal, item_id) {

      $('#hidden_radio_val').val(selVal);


      $('#confirm_transfer_unit .modal-body #transfer_item_units_list').html('');

      /*Enable the Yes button now*/
      $('#yes_btn_unit').removeAttr('disabled');

      if(selVal == 1) { //in other units such as kg, p, m ton, etc

        $.ajax({
          url: '<?php echo site_url('admin/item_unit_selection_pos/show_units/') ?>' + item_id + '/0',
          type: 'POST',
          dataType: 'json',
        })
        .done(function(response) {
          $('#confirm_transfer_unit .modal-body #transfer_item_units_list').html(response.unit_list);

        })
      } else { //in package such as boxes, coils etc or the primary unit for sale

         $('#confirm_transfer_unit .modal-body #transfer_item_units_list').html('');

      }

    }


    //ask user to confirm if that is the item he/she really wants to transfer
    function confirm_selection(item_id, rowId, unitName, packageName, unitQuantity, unitId) {

      $('#confirm_transfer_unit').addClass('backdrop');
      $('#confirm_transfer_unit .modal-content').css({
          boxShadow: '4px 8px 10px 10px rgba(0, 0, 0, 0.5), 4px 8px 25px 10px rgba(0, 0, 0, 0.3)',
          borderRadius: '20px'
      });



      //the ajax brain
      $.ajax({
        url: '<?php echo site_url('admin/confirm_item_selection/') ?>' + item_id,
        type: 'POST',
        dataType: 'json',

      })
      .done(function(response) {
        //result is ready===add the data first
        if(response.isSoldInUnit) {

          //item_id
          $('#hidden_item_id').val(item_id);
          $('#hidden_row_id').val(rowId);
          $('#hidden_unit_name').val(unitName);
          $('#hidden_package_name').val(packageName);

          $('#unit_quantity_' + rowId).val(unitQuantity);
          $('#unit_id_' + rowId).val(unitId);


          $('input[name="tpackage_or_unit"]').prop('checked', false);

          $('#confirm_transfer_unit .modal-body #transfer_item_package_name').html(response.package_name);
          $('#confirm_transfer_unit .modal-body #transfer-main-content').html(response.data);

          //show modal now
          $('#confirm_transfer_unit').modal('show', {backdrop: 'static'});

        } else {

        }

      })
      .fail(function(err) {
        showAjaxModal_confirm('Failed to load item: ' + err.responseText, 'Error');
        //alert();
      });

    }

    $('#transfer_date').change(function(event) {
        /* Act on the event */
        //clear all table rows and inputs if Customer is changed
        $('#s_order_create_table tbody tr').css('display', 'none');
        $('#s_order_create_table tbody tr').slideUp('slow');
        $('#s_order_create_table tbody tr').remove();
    });



    //add row to table at a button click
    function add_new_item_row() {

        //be sure user selected customer before trying to add row
        let selected_receiver = $('#transfer_to').val();
        if(selected_receiver == '') {
            //no customer selected, flag error message
            showAjaxModal_confirm('No Receiver Was Specified! Indicate where you are transferring the item(s) to and try again.', 'Error');
            return false;
        }

        let tbody = $('#item_transfer_create_table tbody').find('tr').length + 1;

        let transfer_date = $('#transfer_date').val();

        //trying to make sure that a selected item does not appear in the next row
        let selected_item_ids = [];
        let i = 1;
        $.each($('tr td select'), function(index, val) {

             /* iterate through array or object */
                selected_item_ids.push($('#tr_'+ i +' td select').val());
            i++;
        });

        selected_item_ids = selected_item_ids.join('-');


        $.ajax({
            url: '<?php echo site_url('admin/add_item_transfer_row/') ?>'+ selected_item_ids,
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-lg"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#item_transfer_create_table tbody').append(tr);

            //disable the previous delete button
            //$('#tr_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');
         });
    }


    //update inserted row for this item
    function update_item_row(item_id, unit_id, row_id, unit_name, package_name) {

      let radio_val = $('#hidden_radio_val').val();
      if(radio_val == '0') {
        //package selected
       $('#unit_name_' + row_id).text('Tranferring in ' + package_name);

      } else {

        $('#unit_name_' + row_id).text('Tranferring in ' + unit_name);
        $('#unit_id_' + row_id).val(unit_id);
        //('#unit_quantity_' + row_id).val(unit_quantity);

      }
    }


    //item transfer form submitted
  $('#items_transfer_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    let no_tr = $('#item_transfer_create_table tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(i = 1; i <= no_tr; i++) {

        let each_id_numeric =  $('#tr_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');
        input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }

    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-')


    let form_data = $('#items_transfer_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/items_transfer/create/') ?>' + input_ids_numeric,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Successful.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 3000);
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_item_transfer_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_item_transfer_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm(err.responseText, 'Error');
    });
  });

    function remove_this_row(id) {
        //remove row now
        $('#tr_'+id).remove();
    }
</script>