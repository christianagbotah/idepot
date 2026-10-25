<?php
$so_code = $param2;

//database query
$customer_id = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->customer_id;
$date = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->date_timestamp;
?>

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

<div class="row" id="preview_main">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary" style="background: #eaecf4;">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('edit_sales_order'); ?>
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
                    <input type="text" required="true" onkeyup="verify_so_no()" class="form-control" name="order_no" id="order_no" value="<?php echo $so_code; ?>" readonly="readonly">
                    </div>
                    <div style="position: absolute;" id="so_code_err_message"></div>
                </div>

                <input type="hidden" name="so_update" value="yes">

                <?php
$customers_add = $this->db->get('customers');
$customers_array_add = $customers_add->result_array();

?>
                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">To:</div>
                        </div>
                        <select required="true" class="form-control" onchange="populate_edit_button($('#order_to').val())" name="order_to" id="order_to" readonly="readonly">
                            <option value="<?=$customer_id;?>"><?=$this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name; ?></option>
                        </select>
                    </div>
                </div>

                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Order Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date" id="order_date" data-format="dd-mm-yyyy"
                            value="<?php echo date('d-m-Y', $date); ?>" readonly="readonly">

                        <input type="hidden" class="form-control datepicker" name="order_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('bill_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="bill_to" id="bill_to" class="form-control" cols="50"><?php echo $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->address; ?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('ship_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="ship_to" id="ship_to" class="form-control" cols="50" readonly="readonly"><?php echo $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->address; ?></textarea>
                    </div>
                </div>
            </div>

            <?php
//select order details
$this_order_array = $this->db->get_where('sales_order', array('so_code' => $so_code))->result_array();

?>
            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="s_order_create_table">
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <th>Qty Picked</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                        <?php
$table_row_counter = 1;
foreach ($this_order_array as $order):
?>
                        <tr id="tr_<?=$table_row_counter;?>">
                            <td width="90">
                                <input type="number" min="1" required="true" onkeyup="row_total($('#order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity" id="order_quantity_<?=$order['html_id'];?>" name="order_quantity_<?=$order['html_id'];?>" value="<?=$order['quantity'];?>">
                            </td>



                            <td width="90">
                                <input type="number" min="0" required="true" onkeyup="quantity_left($('#order_picked_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control" id="order_picked_<?=$order['html_id'];?>" name="order_picked_<?=$order['html_id'];?>" value="<?=$order['quantity_picked'];?>">

                                <input type="hidden" name="hidden_quantity_balance_per_<?=$order['html_id'];?>" id="hidden_quantity_balance_per_<?=$order['html_id'];?>" value="<?=$order['quantity_due'];?>">
                            </td>

                            <td>
                                <?php
$all_items_array = $this->db->get_where('items')->result_array();
?>
                                <select required="true" class="form-control" onchange="change_fields($('#order_item_<?=$order['html_id'];?>').val(), $('#order_item_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="order_item_<?=$order['html_id'];?>" id="order_item_<?=$order['html_id'];?>">
                                    <option value="">Choose Item</option>
                                    <?php foreach ($all_items_array as $item): ?>
                                        <option value="<?=$item['item_id'];?>" <?php if ($item['item_id'] === $order['item_id']) {
    echo 'selected';
}
?>><?=$item['item_name'];?></option>
                                    <?php endforeach;?>
                                </select>
                            </td>

                            <td id="description_td_<?=$order['html_id'];?>"><?=$this->db->get_where('items', array('item_id' => $order['item_id']))->row()->description;?>
                            </td>

                            <td width="120" align="right">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="text" required="true" class="form-control" id="order_unit_price_<?=$order['html_id'];?>" onkeyup="row_total($('#order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="order_unit_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['price'];?>" readonly="readonly">
                                </div>
                            </td>

                            <td width="140">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="text" class="form-control sum_total_amount" name="order_total_price_<?=$order['html_id'];?>" id="order_total_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['amount'];?>" readonly="readonly">
                                </div>
                            </td>

                        <?php
$table_row_counter++;
endforeach;?>
                    </tbody>

                </table>
            </div>

            <hr>

            <div class="form-group row">
                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('comments'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="comments" class="form-control" cols="50" placeholder="Comments" ><?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->comment;?></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="private_comments" class="form-control" cols="50" placeholder="Private Comments"><?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->private_comment;?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="subtotal"><?=number_format($this->db->get_where('sales_order', array('so_code' => $so_code))->row()->grand_total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="total"><?=number_format($this->db->get_where('sales_order', array('so_code' => $so_code))->row()->grand_total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total" id="hidden_total" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->grand_total;?>">
                                <input type="hidden" name="hidden_payment_balance" id="hidden_payment_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->amount_due;?>">

                                <!--select total quantity here-->
                                <?php
$grand_quantity = $this->db
    ->from('sales_order')
    ->where('so_code', $so_code)
    ->get()->row()->total_quantity;

?>
                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="<?=$grand_quantity;?>">
                                <input type="hidden" name="hidden_quantity_balance" id="hidden_quantity_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->quantity_due;?>">

                            </thead>
                        </table>

                        <hr><hr>
                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12"><h3>INVOICE</h3></div>
                        </div>
                        <hr>
                        <div class="form-group row" style="display: none" id="error_holder">
                                <div class="col-sm-12 col-md-12">
                                    <div id="inv_code_err_message"></div>
                                </div>
                            </div>
                            <div class="form-group row">
                                <div class="col-sm-12 col-md-12">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light">Invoice Code</div>
                                        </div>
                                        <input type="text" class="form-control" name="invoice_code" id="invoice_code" value="<?=$this->db->get_where('invoice', array('so_code' => $so_code))->row()->invoice_code;?>" readonly="readonly">
                                    </div>

                                </div>
                            </div>
                        <div class="form-group row">
                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Amount: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>
                                    <input type="text" onkeyup="payment_update()" onchange="payment_update()" min="0" name="amount_paid" id="amount_paid" class="form-control" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->amount_paid;?>" required="required">
                                </div>
                            </div>

                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Bal: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>
                                    <input type="text" name="balance_amount" id="balance_amount" class="form-control form-control-plaintext" value="<?=number_format($this->db->get_where('sales_order', array('so_code' => $so_code))->row()->amount_due, 2, '.', ',');?>" readonly="readonly">
                                </div>
                            </div>
                        </div>

                        <!--
                        <div class="form-group row">
                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Quantity Picked:</div>
                                    </div>
                                    <input type="number" onkeyup="payment_update()" onchange="payment_update()" min="0" name="quantity_picked" id="quantity_picked" class="form-control" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->quantity_picked;?>" required="required">
                                </div>
                            </div>

                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Balance:</div>
                                    </div>
                                    <input type="text" name="balance_quantity" id="balance_quantity" class="form-control form-control-plaintext" value="<?=number_format($this->db->get_where('sales_order', array('so_code' => $so_code))->row()->quantity_due, 2, '.', ',');?>" readonly="readonly">
                                </div>
                            </div>
                        </div> -->

                        <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
$account_id = $this->db->get_where('payment', array('so_code' => $so_code))->row()->account_id;
if($account_id == '') {
    $account_id = $this->db->get_where('invoice', array('so_code' => $so_code))->row()->account_id;
}
?>
                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-danger text-light">Deposit Account:</div>
                                    </div>
                                    <select name="paid_to" id="paid_to" onchange="update_bank_balance($(this).val())" class="form-control" value="">
                                        <option value="">Select Account</option>
                                        <?php foreach ($accounts as $acc): ?>
                                            <option value="<?=$acc['account_id']?>" <?php if ($acc['account_id'] === $account_id) {
    echo 'selected';
}
?>><?=$acc['name']?></option>
                                        <?php endforeach;?>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="form-group row">
                            <div class="col-sm-8 col-md-8">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-danger text-light">Balance: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>
                                    <input type="text" name="account_balance" id="account_balance_so_edit" class="form-control form-control-plaintext" value="<?php echo number_format($this->db->get_where('accounts', array('account_id' => $account_id))->row()->current_balance, 2, '.', ','); ?>" readonly="readonly">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-sm-2 col-md-2 col-xs-6">
                    <button class="btn btn-success btn-lg" onclick="PrintElem('#preview_main')">Print</button>
                </div>
                <div class="col-sm-2 col-md-2 col-xs-6">
                    <button class="btn btn-danger btn-lg" data-dismiss="modal">Close</button>
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
        let table_row_counter = <?php echo $table_row_counter; ?>;

        //enable the last button
        $('#tr_' + (Number(table_row_counter) - 1) + ' td a').removeAttr('disabled');

        //disable all the fields
        $('#preview_main input, #preview_main textarea, #preview_main select').attr('disabled', 'disabled');
    });

    ////live update ship to info
    $('#bill_to').keyup(function(event) {
        /* Act on the event */
        let bill_to = $('#bill_to').val();
        $('#ship_to').val(bill_to);
    });

    //add row to table at a button click
    function add_new_row() {
        //be sure user selected customer before trying to add row
        let selected_customer = $('#order_to').val();
        if(selected_customer == '') {
            //no customer selected, flag error message
            showAjaxModal_confirm('No Customer Was Selected! Select One and Try Again.', 'Error');
            return false;
        }

        let tbody = $('#s_order_create_table tbody').find('tr').length + 1;

        let order_date = $('#order_date').val();

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
            url: '<?php echo site_url('admin/add_order_row/so/0/0/') ?>' + selected_customer + '/' + order_date + '/' + selected_item_ids,
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#s_order_create_table tbody').append(tr);

            //disable the previous button
            $('#tr_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');
         });
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

    //Verify po no
    function verify_so_no() {
        //verify id
        var so_no = $('#order_no').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_so_no/'); ?>' + so_no
        })
        .done(function(response) {
                $('#so_code_err_message').html(response);
        });
    }

    //Sales Order Creation form submitted
  $('#sales_order_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    let a_paid = Number($('#amount_paid').val());
    let ac_paid_to = $('#paid_to').val();

    if(a_paid > 0 && ac_paid_to == '') {
        //reject submission
        showAjaxModal_confirm('No Deposit Account Is Selected. Select A Deposit Account!', 'Error');
        return false;

    }

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
      url: '<?php echo site_url('admin/sales_order/update/' . $so_code . '/') ?>' + input_ids_numeric,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Sales Order Updated Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
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

   function change_fields(item_id, num) {
        /* Act on the event */
        if(item_id != '') {

            let selected_customer = $('#order_to').val();
            let order_date = $('#order_date').val();
            let ajax_url = '';

        if(order_date != '' && selected_customer != '') {
            ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/so' + '/' + selected_customer + '/' + order_date;

        } else {
            ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/so';
        }

        if(item_id != '') {

            let quantity = Number($('#order_quantity_' + num).val());
            $.ajax({
                url: ajax_url,
                type: 'POST',
                dataType: 'json',
            })
            .done(function(response) {
            //  alert(response.unit_price);
                //return false;

                if(response.exists != false) {
                    //it exists
                    $('#description_td_' + num).html(response.description);
                    $('#order_unit_price_' + num).val(response.unit_price);

                    let unit_price_raw = response.unit_price;
                    let unit_price = Number(response.unit_price);

                    //update unit price
                    if(unit_price_raw == undefined || unit_price_raw == 0) {
                        //does not exist so alert the user to update this info before proceeding
                    showAjaxModal_confirm('Price of the selected item/good for this customer is invalid! Kindly update the price of this item/good for this customer first!', 'Error');
            

                        $('#order_unit_price_' + num).val(Number(0)); //set it to 0 since the price is not available
                        //update total price
                        $('#order_total_price_' + num).val(numeric_format(0, 0, '', ''));
                            
                    } else {
                        $('#order_unit_price_' + num).val(unit_price);
                        //update total price
                        $('#order_total_price_' + num).val(numeric_format((quantity * unit_price), 0, '', ''));
                    }
                    
                    

                    
                    //update the subtotal and total amounts
                    grand_total();

                } else {
                    //does not exist so alert the user to update this info before proceeding
                    showAjaxModal_confirm('We couldn\'t find any valid price list for this customer. Kindly select this customer from the "View All Customers" button under the "Sales" tab  and click on the "Edit" button at the top. On the popup window, click on the "Update" button to add this customer to the price list. Then manage the price list from there using the "Pricing" button!', 'Error');
                return false;
                    }

                });
            }
            
        }
}

//find the total for each row
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

//update amount left to be paid when user enters the amount paid in all
function payment_update() {
    /* Act on the event */
    //amount balancing
    let total_amount = Number($('#hidden_total').val());
    let amount_paid = Number($('#amount_paid').val());
    let amount_left = total_amount - amount_paid;
    $('#amount_pd').html(number_format(amount_paid, 2, '.', ','));

    //qunatity balancing
    let total_quantity = Number($('#hidden_total_quantity').val());
    let quantity_picked = Number($('#quantity_picked').val());
    let quantity_left = total_quantity - quantity_picked;


    //amount fields
    //populate the hidden payment balance field with this
    $('#hidden_payment_balance').val(amount_left);
    ///Now let's format the balance field with this
    $('#balance_amount').val(number_format(amount_left, 2, '.', ','));

    //qunatity fields
    //populate the hidden quantity balance field with this
    $('#hidden_quantity_balance').val(quantity_left);
    ///Now let's format the balance field with this
    $('#balance_quantity').val(number_format(quantity_left, 0, '.', ','));
}

function auto_fill() {
    /* Act on the event */
    //amounts
    let total_amount = Number($('#hidden_total').val());
    let amount_paid = Number(total_amount);
    let amount_left = total_amount - amount_paid;

    //quantities
    let total_quantity = Number($('#hidden_total_quantity').val());
    let quantity_picked = Number(total_quantity);
    let quantity_left = total_quantity - quantity_picked;


    //amounts
    //populate the hidden payment balance field with this
    $('#hidden_payment_made').val(amount_paid);

    //populate the hidden payment balance field with this
    $('#hidden_payment_balance').val(amount_left);
    ///Now let's format the balance field with this
    $('#amount_pd').html(number_format(total_amount, 2, '.', ','));
    $('#amount_paid').val(total_amount);
    $('#balance_amount').val(number_format(amount_left, 2, '.', ','));


    //quantities
    //populate the hidden quantity balance field with this
    $('#hidden_quantity_balance').val(quantity_left);
    ///Now let's format the balance field with this
    $('#quantity_picked').val(quantity_picked);
    $('#balance_quantity').val(number_format(quantity_left, 0, '.', ','));
}

//get bank account balance
function update_bank_balance(id) {
    if(id != '') {
        $.ajax({
            url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + id,
            type: 'POST',
            dataType: 'json',
            cache: false
        })
        .done(function(response) {
           $('#account_balance_so_edit').val(number_format(response.balance, 2, '.', ','));
        });
    } else {
        $('#account_balance_so_edit').val('');
    }

}

 //reemove row
function remove_row(id) {
    //amounts
    let row_total_cost = Number($('#tr_' + id + ' td .sum_total_amount').val());
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

    //enable the previous button
    $('#tr_' + (Number(id) - 1) + ' td a').removeAttr('disabled');

    //remove row now
    $('#tr_'+id).remove();
}



//printing commands here
function PrintElem(elem)
    {
        //remove the buttons
        $('.btn').remove();
        $.ajaxSetup({
              cache: false,
              data: {
                  '<?php echo $this->security->get_csrf_token_name(); ?>': '<?php echo $this->security->get_csrf_hash(); ?>'
              } 
           });

        Popup($(elem).html());

        window.location.reload();
    }

    function Popup(data)
    {
        var mywindow = window.open('', '', '');
        mywindow.document.write('<!doctype html><html><head><title></title>');
        //mywindow.document.write('<link rel="stylesheet" href="assets/css/chartjs/dist/Chart.min.css" type="text\/css" \/>');
        mywindow.document.write('<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.css');?>" />');
        mywindow.document.write('<link rel="stylesheet" href="<?php echo base_url('assets/css/custom.css');?>">');
        mywindow.document.write('<link rel="stylesheet" href="<?php echo base_url('assets/css/neon-forms.css');?>">');
        mywindow.document.write('<link rel="stylesheet" href="<?php echo base_url('assets/css/bootstrap.css');?>">');
        mywindow.document.write('<link href="<?php echo base_url('assets/bootstrap4-theme/vendor/fontawesome-free/css/all.min.css'); ?>" rel="stylesheet" type="text/css">');
        mywindow.document.write('<link href="<?php echo base_url('assets/bootstrap4-theme/css/sb-admin-2.css'); ?>" rel="stylesheet">');


        mywindow.document.write('<script src="<?php echo base_url('assets/bootstrap4-theme/js/sb-admin-2.min.js');?>" type="text\/javascript"><\/script>');

        mywindow.document.write('<script src="<?php echo base_url('assets/bootstrap4.4.1/js/bootstrap.min.js');?>" type="text\/javascript"><\/script>');

        mywindow.document.write('<script type="text\/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"><\/script>');

        mywindow.document.write('<\/head><body style="font-size: 13px">');
        mywindow.document.write(data);

        mywindow.document.write('<\/body><\/html>');
        mywindow.document.close();

        mywindow.onload=function(){
            mywindow.focus();
            mywindow.print();
            mywindow.close();
        }
        
    }
</script>