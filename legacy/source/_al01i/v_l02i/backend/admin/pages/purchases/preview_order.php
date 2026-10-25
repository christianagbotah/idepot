<?php
$po_code = $param2;

//database query
$supplier_id = $this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->supplier_id;
$date = $this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->date_timestamp;
?>
<div class="row" id="preview_main_po">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary" style="background: #eaecf4;">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('edit_purchase_order'); ?>
              </div>
          </div>



          <div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/purchase_order/update'),
	array('class' => 'form-groups-bordered', 'id' => 'purchase_order_update_form', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">PO No:</div>
                        </div>
                    <input type="text" required="true" onkeyup="verify_po_no()" readonly="readonly" class="form-control" name="order_no" id="order_no" value="<?php echo $po_code; ?>">
                    </div>
                    <div style="position: absolute;" id="po_code_err_message"></div>
                </div>

                <input type="hidden" name="po_update" value="yes">

                <?php
$suppliers_add = $this->db->get('suppliers');
$suppliers_array_add = $suppliers_add->result_array();

?>
                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">From:</div>
                        </div>
                        <select required="true" class="form-control" onchange="populate_edit_button($('#order_from').val())" name="order_from" id="order_from">
                            <option value="">Select Supplier</option>
                            <?php foreach ($suppliers_array_add as $srow): ?>
                            <option value="<?=$srow['supplier_id'];?>" <?php if ($srow['supplier_id'] === $supplier_id) {
	echo 'selected';
}
?>><?=$srow['supplier_name'];?></option>
                            <?php endforeach;?>
                        </select>
                    </div>
                </div>


                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Order Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date" data-format="dd-mm-yyyy"
                            value="<?php echo date('d-m-Y', $date); ?>">

                        <input type="hidden" class="form-control datepicker" name="order_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('supplier\'s_address'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="vendor_address" id="vendor_address" class="form-control" cols="50" required ><?php echo $this->db->get_where('suppliers', array('supplier_id' => $supplier_id))->row()->address; ?></textarea>
                    </div>
                </div>

               <!-- <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('ship_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="ship_to" id="ship_to" class="form-control" cols="50"   readonly="readonly"><?php echo $this->db->get_where('suppliers', array('supplier_id' => $supplier_id))->row()->address; ?></textarea>
                    </div>
                </div>-->
            </div>


            <?php
//select order details
$this_order_array = $this->db->get_where('purchase_order', array('po_code' => $po_code))->result_array();

?>
            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="p_order_create_table">
                    <thead>
                      <tr>
                        <th>Quantity</th>
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
                            <td width="100">
                                <input type="number" min="1" required="true" onkeyup="row_total($('#order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity" id="order_quantity_<?=$order['html_id'];?>" name="order_quantity_<?=$order['html_id'];?>" value="<?=$order['quantity'];?>">
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
                                    <input type="currency" required="true" class="form-control" id="order_unit_price_<?=$order['html_id'];?>" onkeyup="row_total($('#order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="order_unit_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['price'];?>">
                                </div>
                            </td>

                            <td width="180">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="currency" class="form-control sum_total_amount" name="order_total_price_<?=$order['html_id'];?>" id="order_total_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['amount'];?>" readonly="readonly">
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
                        <textarea  name="comments" class="form-control" cols="50" placeholder="Comments" ><?=$this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->comment;?></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="private_comments" placeholder="Private Comments" class="form-control" cols="50" ><?=$this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->private_comment;?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="subtotal"><?=number_format($this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->grand_total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="total"><?=number_format($this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->grand_total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total" id="hidden_total" value="<?=$this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->grand_total;?>">
                                <input type="hidden" name="hidden_payment_balance" id="hidden_payment_balance" value="<?=$this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->amount_due;?>">
                                <input type="hidden" name="hidden_account_balance" id="hidden_account_balance_po_edit" value="">
                            </thead>
                        </table>

                        <hr><hr>
                        <?php
                            $paid_amount =$this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->amount_paid;
                            
                        ?>
                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <label class="control-label col-sm-6 col-sm-6"><strong class="text-success">CASH PURCHASES</strong></label>  

                                <div class="switch-button  showcase-switch-button">
                                <input id="instant_payment"  type="checkbox"  value="<?= $paid_amount > 0 ? 1 : 0 ?>" name="instant_payment" <?= $paid_amount > 0 ? 'checked' : '' ?> onchange="value_change(this.value)">
                                <label for="instant_payment" ></label>   <strong style="font-size: 22px;" id="yes_no_inst">NO</strong>                               
                                </div>    
                            </div>
                        </div>

                            <hr>
                        <div id="payment_info_holder">
                        <div>
                            <strong>Payment <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?> <span id="amount_pd"><?=$this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->amount_paid;?></span>
                            </strong>
                        </div>

                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <div id="report_error" style="display: none"></div>
                            </div>
                        </div>
                        <div class="form-group row">
                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Amount Paid: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>

                                    <input type="currency" onchange="payment_update()" min="0" name="amount_paid" id="amount_paid" class="form-control" value="<?=$this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->amount_paid;?>" required="required">
                                </div>
                            </div>

                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Balance: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>
                                    <input type="text" name="balance_amount" id="balance_amount" class="form-control form-control-plaintext" value="<?=number_format($this->db->get_where('purchase_order', array('po_code' => $po_code))->row()->amount_due, 2, '.', ',');?>" readonly="readonly">
                                </div>
                            </div>
                        </div>
                        <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1))->result_array();
$account_id = $this->db->get_where('payment', array('po_code' => $po_code))->row()->account_id;
if($account_id == '') {
    $account_id = $this->db->get_where('accounts_payable', array('po_code' => $po_code))->row()->account_id;
}
?>
                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-danger text-light">Paid From:</div>
                                    </div>
                                    <select name="paid_from" id="paid_from" class="form-control" onchange="update_bank_balance($(this).val())" required="required">
                                        <option value="">Select Account</option>
                                        <?php foreach ($accounts as $acc): ?>
                                            <option value="<?=$acc['account_id'];?>" <?php if ($acc['account_id'] === $account_id) {
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
                                    <input type="text" name="account_balance" id="account_balance_po_edit" class="form-control form-control-plaintext" value="<?php echo number_format($this->db->get_where('accounts', array('account_id' => $account_id))->row()->current_balance, 2, '.', ','); ?>" readonly="readonly">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

            <div class="form-group row">
                <div class="col-sm-2 col-md-2 col-xs-6">
                    <button class="btn btn-success btn-lg" onclick="PrintElem('#preview_main_po')">Print</button>
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
        //disable all the fields
        $('#preview_main_po input, #preview_main_po textarea, #preview_main_po select').attr('disabled', 'disabled');

        b_balance();
        value_change();

        let table_row_counter = <?php echo $table_row_counter; ?>;

        
    });


    function value_change(val) {
       let instant_payment = $('#instant_payment').filter(':checked').length;

       if(instant_payment > 0) {
            $('#instant_payment').val(1);
            $('#instant_payment').attr('checked', 'checked');
            $('#yes_no_inst').text('YES');
            $('#yes_no_inst').css('color', '#000000');
            $('#payment_info_holder').slideDown('slow');
            $('#paid_from').attr('required', 'required');
            $('#amount_paid').attr('required', 'required');
            payment_update();

       } else {
            $('#instant_payment').val(0);
            $('#yes_no_inst').text('NO');
            $('#yes_no_inst').css('color', '#b3afaf');

            //reset some values
            $('#amount_paid').val(0);
            $('#paid_from').val('');
            $('#account_balance_po_edit').val('');
            $('#payment_info_holder').slideUp('slow');
            $('#paid_from').removeAttr('required');
            $('#amount_paid').removeAttr('required');
            payment_update(); 
       }
    }

    ////live update ship to info
    $('#vendor_address').keyup(function(event) {
        /* Act on the event */
        let v_address = $('#vendor_address').val();
        $('#ship_to').val(v_address);
    });

    $('#amount_paid').keyup(function(event) {
        /* Act on the event */
        check_bank_balance($(this).val());
        payment_update()
    });

    //check blances
    function b_balance() {
      let paid_from = $('#paid_from').val();

      $.ajax({
          url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + paid_from,
          type: 'POST',
          dataType: 'text',
          cache: false
      })
      .done(function(bank_balance) {
            $('#hidden_account_balance_po_edit').val(bank_balance.balance);

      });
    }

    //check blances
    function check_bank_balance(amount) {
      let paid_from = $('#paid_from').val();
      amount = Number(amount);
      $.ajax({
          url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + paid_from,
          type: 'POST',
          dataType: 'json',
          cache: false
      })
      .done(function(bank_balance) {
        $('#hidden_account_balance_po_edit').val(bank_balance.balance);
         if(amount > bank_balance.balance) {

            $('#report_error').html('<strong style="color: red">Your account will be in red</strong>');
            $('#report_error').slideDown('slow');
            //$('input[name="amount_paid"]').attr('maxlength', _leng);
         } else {
            $('#report_error').slideUp('slow');
         }
      });
    }



    //populate the edit button with the selected supplier
    function populate_edit_button(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_purchases/edit_supplier/"); ?>' + id + '", "Edit Supplier")');
        let set_supplier_id = $('#order_from').val();

        //clear all table rows and inputs if supplier is changed
        //amounts
 /**       let row_total_cost = Number($('#tr_' + id + ' td .sum_total_amount').val());
        let grand_total = Number($('#hidden_total').val());
        let balance = grand_total - row_total_cost;

        //quantities
        let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity').val());
        let grand_total_quantity = Number($('#hidden_total_quantity').val());
        let balance_quantity = grand_total_quantity - row_total_quantity;
**/

        $('#hidden_total').val(0);
        $('#subtotal').html(number_format(0, 2, '.', ','));
        $('#total').html(number_format(0, 2, '.', ','));
        $('#amount_paid').val('0.00');
        $('#balance_amount').val(number_format(0, 2, '.', ','));

/**
        $('#hidden_total_quantity').val(balance_quantity);
        $('#quantity_picked').val(0);
        $('#balance_quantity').val(balance_quantity);**/

        $('#p_order_create_table tbody tr').css('display', 'none');
        $('#p_order_create_table tbody tr').slideUp('slow');
        $('#p_order_create_table tbody tr').remove();

        //let auto fill the bill to and ship to addresses with the supplier's address
        if(id != '') {
            $.ajax({
            url: '<?php echo site_url('admin/get_supplier_address/') ?>' + id,
            type: 'POST',
            dataType: 'json',
            cache: false
            })
            .done(function(response) {
                if(response != '') {
                    $('#vendor_address').val(response.address);
                    $('#ship_to').val(response.address);

                    if(response.all_items_array == '') {
                        alert('This Supplier has no registered Item');
                        $('#add_btn').attr('disabled', 'disabled');
                        return false;
                    } else {
                        set_supplier_id =  id;//put the supplier id here and send it when the add button is clicked.
                        $('#add_btn').removeAttr('disabled');
                    }

                }
            });
        }  else {
                    $('#vendor_address').val('');
                    $('#ship_to').val('');
                }

    }

     //add row to table at a button click
    function add_new_row() {
        let tbody = $('#p_order_create_table tbody').find('tr').length + 1;
        let set_supplier_id = $('#order_from').val();

        $.ajax({
            url: '<?php echo site_url('admin/add_order_row/') ?>' + set_supplier_id + '/' + 'purchase',
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {


            let tr = '<tr id="tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#p_order_create_table tbody').append(tr);

            //disable the previous button
            $('#tr_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');

         });
    }

    //Verify po no
    function verify_po_no() {
        //verify id
        var po_no = $('#order_no').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_po_no/'); ?>' + po_no
        })
        .done(function(response) {
                $('#po_code_err_message').html(response);
        });
    }

    //Purchase Order Creation form submitted
  $('#purchase_order_update_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    //let po_code = <?php echo $po_code; ?>;
    let no_tr = $('#p_order_create_table tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(i = 1; i <= no_tr; i++) {
      let each_id_numeric =  $('#tr_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');
      input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }

    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-')
    let form_data = $('#purchase_order_update_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/purchase_order/update/' . $po_code . '/') ?>' + input_ids_numeric,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Purchase Order Updated Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
        }, 3000);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: Order with the same PO No [' + data.po_code + '] already exists', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_p_order_update').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_p_order_update"></ul>', 'Error');
      }
    })
    .fail(function(err) {
         showAjaxModal_confirm(err.responseText, 'Error');
     });
  })


  function change_fields(item_id, num) {
        /* Act on the event */
        if(item_id != '') {

            let quantity = Number($('#order_quantity_' + num).val());
            $.ajax({
                url: '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + 'purchase',
                type: 'POST',
                dataType: 'json',
            })
            .done(function(response) {
                $('#description_td_' + num).html(response.description);
                $('#order_unit_price_' + num).val(response.unit_price);

                let unit_price = Number(response.unit_price);
                $('#order_total_price_' + num).val(numeric_format((quantity * unit_price),0,'',''));
                //update the subtotal and total amounts
                grand_total();

            });
        }
}

//find the total for each row
function row_total(num) {

        let quantity = Number($('#order_quantity_' + num).val());
        let unit_price = Number($('#order_unit_price_' + num).val());


        let total_price = quantity * unit_price;
        $('#order_total_price_' + num).val(numeric_format(total_price,0,'',''));
        grand_total();
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

function update_bank_balance(id) {
    if(id != '') {
        $.ajax({
            url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + id,
            type: 'POST',
            dataType: 'json',
            cache: false
        })
        .done(function(response) {
           $('#account_balance_po_edit').val(number_format(response.balance, 2, '.', ','));
           $('#hidden_account_balance_po_edit').val(response.balance);
        });
    } else {
        $('#account_balance_po_edit').val('');
        $('#hidden_account_balance_po_edit').val('');
    }

}


 //reemove row
function remove_row(id) {
    //amounts
    let row_total_cost = Number($('#tr_' + id + ' td .sum_total_amount').val());
    let grand_total = Number($('#hidden_total').val());
    let balance = grand_total - row_total_cost;

    //quantities
    //let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity').val());
    //let grand_total_quantity = Number($('#hidden_total_quantity').val());
   // let balance_quantity = grand_total_quantity - row_total_quantity;


    $('#hidden_total').val(balance);
    $('#subtotal').html(number_format(balance, 2, '.', ','));
    $('#total').html(number_format(balance, 2, '.', ','));
    $('#amount_paid').val('0.00');
    $('#balance_amount').val(number_format(balance, 2, '.', ','));


   // $('#hidden_total_quantity').val(balance_quantity);
   // $('#quantity_picked').val(0);
    //$('#balance_quantity').val(balance_quantity);

    //enable the previous button
    $('#tr_' + (Number(id) - 1) + ' td a').removeAttr('disabled');

    //remove row now
    $('#tr_'+id).remove();
}


//printing commands here
function PrintElem(elem)
    {
        $('.btn').remove();//remove buttons
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