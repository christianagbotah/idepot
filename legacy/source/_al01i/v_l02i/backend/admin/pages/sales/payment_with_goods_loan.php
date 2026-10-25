<?php

//$so_code = $param2;

if($param3 == 'goods') {
    $customer_id = $this->db->get_where('sales_order', array('so_code' => $param2))->row()->customer_id;
} else {
    $customer_id = $param3;
}


$date = $this->db->get_where('sales_order', array('so_code' => $param2, 'customer_id' => $customer_id))->row()->date_timestamp;
$track_code = $this->db->get_where('sales_order', array('so_code' => $param2, 'customer_id' => $customer_id))->row()->track_code;

$total_quantity_left = $this->db
                                ->select_sum('quantity_due')
                                ->where('so_code', $param2)
                                ->where('customer_id', $customer_id)
                                ->get('sales_order')->row()->quantity_due;




?>
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
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">SO No:</div>
                        </div>
                        <select required="true" class="form-control" name="order_no" onchange="get_order()" id="order_no">
                            <?php 
                            $this->db->select('so_code');
                            $this->db->distinct();
                            if($param3 == 'goods') {
                                $order_array = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'so_code' => $param2))->result_array();

                            } else {
                                $order_array = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'quantity_due >' => 0))->result_array();
                            }
                            foreach($order_array as $code):

                                ?>
                                <option value="<?=$code['so_code'];?>"><?=$code['so_code'] ?></option>
                                <?php
                            endforeach;
                            ?>
                            

                        </select>
                    </div>
                    <div style="position: absolute;" id="so_code_err_message"></div>
                </div>

                <div class="col-sm-5 col-md-5">
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

                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Order Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date_old" id="order_date_old" data-format="dd-mm-yyyy"
                            value="<?=date('d-m-Y'); ?>" readonly="readonly">

                        <input type="hidden" required="true" class="form-control datepicker" name="order_date" id="order_date" data-format="dd-mm-yyyy"
                            value="<?=date('d-m-Y'); ?>">

                        <input type="hidden" class="form-control datepicker" name="order_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">

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
                <!--<div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-danger text-light">Tax:</div>
                        </div>
                        <select class="form-control" name="tax" readonly="readonly">
                            <option value="">0.00</option>
                        </select>
                    </div>
                </div>-->

                <div class="col-sm-8 col-md-8" id="order_balance_holder">
                    <p>Please wait <i class="fa fa-spinner fa-pulse"></i></p>
                    

                    <!-- <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light" style="font-size: 15px; font-weight: bolder">Quantity Left:</div>
                        </div>
                        <input type="text" class="form-control-md col-sm-6 col-md-6" style="font-size: 40px; font-weight: bolder;" id="q_due" value="<?//=number_format($total_quantity_left, 0, '.', ','); ?>" readonly="readonly">
                    </div> -->
                </div>
            </div>

            <!--<div><strong style="color: red">To add delivery, just add the new quantity to the previous one.</strong></div>-->
            <div id="order_holder">


            </div>

            <div class="form-group row">
                <div class="col-sm-3 col-md-3 col-xs-6">
                    <input type="submit" class="btn btn-info btn-lg"
                        value="Update">
                </div>
                <div class="col-sm-2 col-md-2 col-xs-6">
                    <button class="btn btn-danger btn-lg" data-dismiss="modal">Cancel</button>
                </div>
                <div class="col-sm-4 col-md-4"></div>
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


//get order
function get_order() {
    
    
    let so_code = $('#order_no').val();
    let customer_id = <?=$customer_id; ?>;

    

    $.ajax({
    url: '<?php echo site_url('admin/get_payment_with_goods_order/') ?>' + so_code + '/' + customer_id,
    type: 'POST',
    dataType: 'json'
    })
    .done(function(response) {

        $('#order_holder').html(response.order);
        $('#order_balance_holder').html(response.unpicked_order);
        
        $('#order_date_old').val('<?=date('d-m-Y'); ?>');

        $.ajax({
        url: '<?php echo site_url('admin/get_payment_with_goods_order_date/') ?>' + so_code  + '/' + customer_id,
        type: 'POST',
        dataType: 'json'
        })
        .done(function(data) {

            $('#order_date_old').val(data.order_date);
            $('#q_due').val(data.quantity_due);

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

    let so_code = $('#order_no').val();
    let no_tr = $('#s_order_create_table tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids
    let param3 = '<?=$param3; ?>';
    let track_code = '<?=$track_code; ?>';
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
        //end

        setTimeout(() => {
          $('.close').click(); //window.location.reload();
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
