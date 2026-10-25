<?php
$so_code = $param2;

$customer_id = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->customer_id;

//database query


?>
<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('Goods Payment (Goods Creditor)'); ?>
              </div>
          </div>

          <div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/sales_order/update'),
	array('class' => 'form-groups-bordered', 'id' => 'sales_order_form', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">SO No:</div>
                        </div>
                        <select required="true" class="form-control" name="order_no" onchange="get_order()" id="order_no">
                            <?php 
                            $this->db->select('so_code');
                            $this->db->distinct();
                            $order_array = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'quantity_due >' => 0))->result_array();
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

                <div class="col-sm-3 col-md-3">
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
                <div class="col-sm-2 col-md-2"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer')"><i class="fa fa-fw fa-plus"></i></a>

                <a href="javascript:;" class="btn btn-success btn-sm" id="edit_button" title="Edit"><i class="fa fa-fw fa-edit"></i></a></div> -->

                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Order Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date" id="order_date" data-format="dd-mm-yyyy"
                            value="" readonly="readonly">

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

    

    $.ajax({
    url: '<?php echo site_url('admin/get_payment_with_goods_order/') ?>' + so_code,
    type: 'POST',
    dataType: 'html'
    })
    .done(function(response) {

        $('#order_holder').html(response);
        $('#order_date').val('<?=date('d-m-Y', $date); ?>');

        $.ajax({
        url: '<?php echo site_url('admin/get_payment_with_goods_order_date/') ?>' + so_code,
        type: 'POST',
        dataType: 'html'
        })
        .done(function(data) {

            $('#order_date').val(data);

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

function quantity_left(num) {

        let quantity = Number($('#order_quantity_' + num).val());
        let quantity_picked = Number($('#order_picked_' + num).val());

        let balance = quantity - quantity_picked;
        $('#hidden_quantity_balance_per_' + num).val(balance);

}

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


    //populate the edit button with the selected customer
    function populate_edit_button(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_sales/edit_customer/"); ?>' + id + '", "Edit Customer")');

        //clear all table rows and inputs if Customer is changed
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

    let so_code = $('#order_no').val();
    let no_tr = $('#s_order_create_table tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(i = 1; i <= no_tr; i++) {
      let each_id_numeric =  $('#tr_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');

      input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }

    

    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-')
    let form_data = $('#sales_order_form').serialize();

    //send data via ajax

    $.ajax({
      url: '<?php echo site_url('admin/sales_order/update/') ?>' + so_code + '/' + input_ids_numeric + '/goods',
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

              getMainPage();

        $('.close').click();
        showAjaxModal_confirm('Delivery Edited Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); 
          //window.location.reload();
        }, 500);
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



</script>