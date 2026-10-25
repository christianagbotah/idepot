
<?php

//$so_code = $param2;

if ($param3 == 'goods') {
	$customer_id = $this->db->get_where('sales_order', array('so_code' => $param2))->row()->customer_id;
} else {
	$customer_id = $param3;
}

$track_code = $this->db->get_where('sales_order', array('so_code' => $param2, 'customer_id' => $customer_id))->row()->track_code;

?>
<link href="<?php echo base_url('assets/tailwindcss/output.css'); ?>" rel="stylesheet">
<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('Goods Payment'); ?>
              </div>
          </div>

          <div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/sales_order/update'),
	array('class' => 'form-groups-bordered', 'id' => 'sales_order_form', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-sm-4 col-md-4">
                    <div id="so_code_holder">please wait...</div>
                    <div style="position: absolute;" id="so_code_err_message"></div>
                </div>

                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">To:</div>
                        </div>
                        <select required="true" class="form-control" onchange="populate_edit_button($('#order_to').val())" name="order_to" id="order_to" readonly="readonly">

                            <option value="<?=$customer_id;?>" selected><?=$this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name;?></option>

                        </select>
                    </div>
                </div>
<!--
                <div class="col-sm-2 col-md-2"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php //echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer')"><i class="fa fa-fw fa-plus"></i></a>

                <a href="javascript:;" class="btn btn-success btn-sm" id="edit_button" title="Edit"><i class="fa fa-fw fa-edit"></i></a></div> -->

                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Picking Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date" id="order_date" data-format="dd-mm-yyyy"
                            value="<?=date('d-m-Y');?>">

                        <input type="hidden" required="true" class="form-control datepicker" name="order_date_old" id="order_date_old" data-format="dd-mm-yyyy"
                            value="<?=date('d-m-Y');?>">

                        <input type="hidden" class="form-control datepicker" name="order_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">

                    </div>

                    <div class="col-md-12 col-lg-12 col-sm-12 text-right text-muted">
                        <p id="order_date_display"></p>
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('bill_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="bill_to" id="bill_to" class="form-control" cols="50" readonly="readonly"><?php echo $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->address; ?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('ship_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="ship_to" id="ship_to" class="form-control" cols="50" readonly="readonly"><?php echo $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->address; ?></textarea>
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-sm-8 col-md-8" id="order_balance_holder"></div>
            </div>


            <div id="order_holder">

                <center>
                    <h3>Please wait <i class="fa fa-spinner fa-pulse"></i></h3>
                </center>
            </div>

            <div>
                <div class="form-group row p-3">
                    <div class="input-group col-md-4 col-lg-4"></div>
                    <div class="input-group col-md-8 col-lg-8">
                      <div class="input-group-prepend">
                          <div class="input-group-text bg-info text-light font-bold">PICKED BY:</div>
                      </div>
                      <input type="text"  title="WHO IS PICKING NOW?" placeholder="Enter the name of the person picking" required="required" class="form-control" name="picked_by">
                    </div>
                </div>
            </div>

            <div class="form-group flex flex-row justify-start gap-4 mt-5">
                <div class="">
                    <button type="submit" class="btn-info btn-lg ring-2 ring-sky-200 p-3 rounded-md font-bold hover:shadow-2xl"
                        >Update</button>
                </div>
                <div class="">
                    <button class="btn-danger btn-lg ring-2 ring-red-400 p-3 rounded-md font-bold hover:shadow-2xl" data-dismiss="modal">Cancel</button>
                </div>
                
            </div>
          </form>
          </div>

          </div>
        </div>
    </div>
</div>

<script type="text/javascript">
    $(function() {
        get_order();



    });

    function verify_waybill_code(callbackFunction) {
        //verify id
        let result = false;
        var waybill_code = $('#waybill_code').val();
        let useSameWaybillCodeVal = $('#useSameWaybillCode').val();

        $.ajax({
            url: '<?php echo site_url('admin/get_generated_waybill_code/'); ?>' + waybill_code + '/' + <?=$customer_id?> + '/' + useSameWaybillCodeVal,
            dataType: 'html',
            type: 'post',
            cache: false
        })
        .done(function(response) {
            $('#error_holder_pos').slideDown('slow');
            $('#waybill_code_err_message_pos').html(response);

            if($('#waybill_code_err_message_pos span').text() == 'VALID WAYBILL CODE') {
              $('#waybillReasonRow').slideUp('slow'); //hide

              result = true;
            } else {

              result = false;
              //$('#waybillReasonRow').slideDown('slow');
            }

            callbackFunction(result);
        });
    }

    /*toggle waybill code change reason form*/
    function toggleReasonForm() {

          $('#waybillReasonRow').toggle('slow');

    }


    //get invoice code section for verification
      function getWaybillCodeSection4Verification(customer_id, useSameWaybillCode) {

        if(useSameWaybillCode == undefined) {
            useSameWaybillCode = 'yes'; //set default value
        }


        console.log('here ' + useSameWaybillCode);

        $('#waybill_verification_holder').html('<p>Loading waybill code... <i class="fa fa-spinner fa-pulse"></i></p>'); //preloader

        let ajaxUrl = '<?php echo site_url('admin/getWaybillCodeSection4Verification/') ?>' + customer_id + '/' + useSameWaybillCode;

        $.ajax({
          url: ajaxUrl,
          type: 'post',
          dataType: 'html',
          cache: false,
        })
        .done(function(response) {
          //success
          $('#waybill_verification_holder').html(response); //loaded

          //we update the switch on the waybill verification section
          if(useSameWaybillCode == 'yes') {

            $('#useSameWaybillCode').attr('checked');
            $('#useSameWaybillCodeLabel').removeClass('text-muted');


          } else {

            $('#useSameWaybillCode').removeAttr('checked');
            $('#useSameWaybillCodeLabel').addClass('text-muted');

          }


        })
        .fail(function(err) {
          $('#waybill_verification_holder').html('Unable to load waybill code. Please refresh the page!');
          //error
        })
      }

//get order
function get_order() {

    showPageLoading(); //disable  editing until page fully loads

    let customer_id = <?=$customer_id;?>;
    let selected_so_code = $('#order_no').val();

    $.ajax({
    url: '<?php echo site_url('admin/get_payment_with_goods_order_so_codes/') ?>' + customer_id + '/' + selected_so_code,
    type: 'POST',
    dataType: 'json'
    })
    .done(function(response) {

        $('#so_code_holder').html(response.so_code);//update so_code

        let so_code = $('#order_no').val();

        $.ajax({
        url: '<?php echo site_url('admin/get_payment_with_goods_order/') ?>' + so_code  + '/' + customer_id,
        type: 'POST',
        dataType: 'json'
        })
        .done(function(data) {

            $('#order_holder').html(data.order);
            $('#order_balance_holder').html(data.unpicked_order);

            $('#order_date_old').val('<?=date('d-m-Y');?>');


            $('#order_date_old').val(data.order_date);
            $('#order_date_display').text('Order Date: ' + data.order_date);
            $('#q_due').val(data.quantity_due);

            /*check if the date difference elapsed 6 months or not*/
            if(Number(data.date_difference) > 180) {

                showAjaxModal_confirm('PLEASE NOTE: <strong>THIS PAYABLE HAS ELASPSED THE 6 MONTHS PICKING GRACE PERIOD. CUSTOMER NEEDS TO TOPUP OR GET LESSER QUANTITY!</strong>', 'Warning');
            }
            

            hidePageLoading(); //hide overlay

        });

    });
}

function row_total(num) {

    let quantity = Number($('#order_quantity_' + num).val());
    let unit_price = Number($('#order_unit_price_' + num).val());


    let total_price = quantity * unit_price;
    $('#order_total_price_' + num).val(numeric_format(total_price,0,'',''));
    $('#order_picked_' + num).val(quantity);
    $('#hidden_quantity_balance_per_' + num).val(0);
    grand_total();
}



/*
function grand_total() {
    let subtotal = 0;
    let total = 0;
    let total_quantity = 0;

    $('tbody tr').each(function() {
        //sum up the amount
        $(this).find('td .sum_total_amount').each(function() {
            total = total + Number($(this).val());
        });

        //sum up the quantity
        $(this).find('td .sum_total_quantity').each(function() {
            total_quantity = total_quantity + Number($(this).val());
        });

    });

    //for amount
    $('#total').html(number_format(total, 2, '.', ','));
    $('#subtotal').html(number_format(total, 2, '.', ','));
    $('#balance_amount').val(number_format(total, 2, '.', ','));
    $('#hidden_total').val(total);

    //for quantity
    $('#hidden_total_quantity').val(total_quantity);

    payment_update();
}
*/

    //populate the edit button with the selected customer
    function populate_edit_button(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_sales/edit_customer/"); ?>' + id + '", "Edit Customer")');

        //clear all table rows and inputs if Customer is changed
        //clear all table rows and inputs if Customer is changed
        $('#s_order_create_table tbody tr').css('display', 'none');
        $('#s_order_create_table tbody tr').slideUp('slow');
        $('#s_order_create_table tbody tr').remove();
        remove_this_row(id);
        //amounts
        let row_total_cost = Number($('#tr_' + id + ' td .sum_total_amount').val());

        if(!isNaN(row_total_cost)) {
            let grand_total = Number($('#hidden_total').val());
            let balance = grand_total - row_total_cost;

            //quantities
            let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity').val());
            let grand_total_quantity = Number($('#hidden_total_quantity').val());
            let balance_quantity = grand_total_quantity - row_total_quantity;


            $('#hidden_total').val(balance);
            $('#subtotal').html(number_format(balance, 2, '.', ','));
            $('#total').html(number_format(balance, 2, '.', ','));
            $('#amount_paid').val('0.00');
            $('#balance_amount').val(number_format(balance, 2, '.', ','));


            $('#hidden_total_quantity').val(balance_quantity);
            $('#quantity_picked').val(0);
            $('#balance_quantity').val(balance_quantity);

            $('#s_order_create_table tbody tr').css('display', 'none');
            $('#s_order_create_table tbody tr').slideUp('slow');
            $('#s_order_create_table tbody tr').remove();
        }

        //let's auto fill the bill to and ship to addresses with the customer's address
        if(id != '') {
            $.ajax({
            url: '<?php echo site_url('admin/get_customer_address/') ?>' + id,
            type: 'POST',
            dataType: 'text'
            })
            .done(function(response) {
                if(response != '') {
                    $('#bill_to').val(response);
                    $('#ship_to').val(response);
                }
            });
        }  else {
                    $('#bill_to').val('');
                    $('#ship_to').val('');
                }

    }

    //Sales Order Creation form submitted
  $('#sales_order_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    showAjaxModal_confirm('Updating transaction...', 'Loading');

    verify_waybill_code(function(result) {

      if(!result) {
        showAjaxModal_confirm('WAYBILL CODE IS INVALID', 'Error');
        return;
      }

        let useSameWaybillCodeVal = $('#useSameWaybillCode').val();

        console.log('updated ' + useSameWaybillCodeVal);
        let so_code = $('#order_no').val();
        let no_tr = $('#s_order_create_table tbody').find('tr').length;
        let input_ids_numeric = []; //array to hold the numeric parts of the ids
        let param3 = '<?=$param3;?>';
        let track_code = '<?=$track_code;?>';
        let goods = '';

        if(param3 == 'goods') {
            goods = 'goods';
        } else {
            goods = 'not';
        }

        for(i = 1; i <= no_tr; i++) {
          let each_id_numeric =  $('#tr_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');

          input_ids_numeric.push(each_id_numeric); //push the numbers into this array
        }

        //verify if at least one item has been picked
        let picked_tracker = 0;
        for(n = 0; n < input_ids_numeric.length; n++) {
            if(Number($('#order_picking_' + input_ids_numeric[n]).val()) > 0) {
                picked_tracker++;
                break; //no need checking all since one has been verified successfully
            }
        }

        //feedback if all picking field are 0
        if(picked_tracker < 1) {
            showAjaxModal_confirm('Sorry! You didn\'t pick any quantity of the selected items. Make sure at least one Item Picking field is not zero or empty.', 'Error');
            return false; //don't continue the data processing
        }

        //replace the , with -
        input_ids_numeric = input_ids_numeric.join('-')
        let form_data = $('#sales_order_form').serialize();

        //send data via ajax

        $.ajax({
          url: '<?php echo site_url('admin/payment_with_goods/create/') ?>' + so_code + '/' + input_ids_numeric + '/' + goods + '/' + track_code,
          type: 'POST',
          dataType: 'json',
          data: form_data,
          cache: false
        })
        .done(function(data) {
          if(data.success == true) {

            /*$('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');*/

                 // getMainPage();

            //$('.close').click();
            showAjaxModal_confirm('Delivery Updated Successfully.', 'Success');

            //do some data loading
            loadInvoiceItems(); //load items
            loadAllCustomers(); //load customers
            getWaybillCodeSection4Verification(<?=$customer_id;?>);//load new WAYBILL code
            //end

            if(data.has_more == 'yes') {
                get_order();// load the other invoices if any
            }

            setTimeout(() => {

                if(data.has_more == 'yes') {

                    $('#modal_confirm .close').click(); //close only confirm modal
                } else {

                    $('.close').click(); //close all opened modals
                }

            }, 3000);
          } else if(data.success == 'duplicate') {
            showAjaxModal_confirm('Duplicate found: Order with the same SO No [' + data.so_code + '] already exists', 'Error');
          } else {
            $(function(){
              $.each(data, function(index, val) {
              $('#list_err_s_order_update').append('<li>' + val + '</li>');
            }); });

            //$('.close').click();
            showAjaxModal_confirm('<ul id="list_err_s_order_update"></ul>', 'Error');
          }
        })
        .fail(function(err) {
            showAjaxModal_confirm(err.responseText, 'Error');
        });
    }); //WAYBILL CODE VALIDATION
  });

function remove_this_row(id) {
        //remove row now
        $('#tr_'+id).remove();
    }

    //load invoice items
    function loadInvoiceItems() {
        $.ajax({
          url: '<?php echo site_url('admin/get_all_invoice_items/') ?>',
          type: 'POST',
          dataType: 'html',
          cache: false,

        })
        .done(function(response) {
          $('#item_list').html(response);
        })
        .fail(function(err) {
          $('#item_list').html('Items not loaded - Reason: ' + err.responseText);
        })
    }

    function loadAllCustomers() {
        $.ajax({
          url: '<?php echo site_url('admin/get_customers/') ?>',
          type: 'POST',
          dataType: 'html',
          cache: false,

        })
        .done(function(response) {
          $('#order_to_pos').html(response);
        })
        .fail(function(err) {
         return;
        })
    }

</script>
