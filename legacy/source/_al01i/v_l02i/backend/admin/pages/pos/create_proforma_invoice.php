<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-success">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('PRO FORMA INVOICE'); ?>
              </div>
          </div>

          <?php
//generate so id
$so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;

$so_no = $this->db->get_where('settings', array('type' => 'so_no'))->row()->description;
$id_length = strlen($so_no_prefix . $so_no);

$this->db->select('so_code');
//$this->db->where('so_code !=', 'Opening Balance');
$this->db->like('so_code', $so_no_prefix, 'after');
$this->db->order_by('so_code', 'desc');
$this->db->limit(1);
$so_query = $this->db->get('proforma_invoice_order');
$so_id = $so_query->row()->so_code;

if ($so_query->num_rows() < 1) {
  //let's search from the general journal table instead
  $this->db->select('so_code');
  $this->db->like('so_code', $so_no_prefix, 'after');
  $this->db->order_by('so_code', 'desc');
  $this->db->limit(1);
  $so_query = $this->db->get('sales_order');
  $so_id = $so_query->row()->so_code;
}

if ($so_query->row()->so_code != '' || $so_query->row()->so_code != null) {
  if ($so_query->num_rows() > 0) {
    //extract the numeric out and increase it by 1
    $second_num = ''; //the second occurence of a number in the string ....
    $position_of_second_num = ''; //the position of the second number

    $i = 0;
    $numeric_counter = 0;
    $pos_counter = 0;
    for ($i = 0; $i < strlen($so_id); $i++) {
      if (is_numeric($so_id[$i])) {

        $numeric_counter++;

        if($numeric_counter == 2) {//get the 2nd time a number is found
            $second_num = $so_id[$i];
            break;
        }
      }

      $pos_counter++;
    }


    //find the position
    $position_of_second_num = $pos_counter; //strpos($so_id, $second_num);


    //now let's do the extraction
    $n_soid = substr($so_id, $position_of_second_num, strlen($so_id) - $i);

    $so_code = $n_soid + 1;

    if ($second_num == 0) {
      $old_len = strlen($so_id);
      $new_len = strlen($so_code);
      $act_len = ($old_len - $new_len);
      $so_code = substr($so_id, 0, $act_len) . $so_code;
    } else {
      $so_code = $so_code;
    }

  } else {
    $so_code = $so_no_prefix . $so_no;
  }
} else {
  $so_code = $so_no_prefix . $so_no;
}

//generate invoice code
$inv_no_prefix = $this->db->get_where('settings', array('type' => 'inv_prefix'))->row()->description;

$inv_no = $this->db->get_where('settings', array('type' => 'inv_no'))->row()->description;
$inv_length = strlen($inv_no_prefix . $inv_no);

$this->db->select('invoice_code');
//$this->db->where('invoice_code !=', 'Opening Balance');
$this->db->like('invoice_code', $inv_no_prefix, 'after');
$this->db->order_by('invoice_code', 'desc');
$this->db->limit(1);
$inv_query = $this->db->get('proforma_invoice');
$inv_id = $inv_query->row()->invoice_code;

if ($inv_query->num_rows() < 1) {
  //let's search from the general journal table instead
  $this->db->select('invoice_code');
  $this->db->like('invoice_code', $inv_no_prefix);
    $this->db->like('invoice_code', $inv_no_prefix, 'after');
  $this->db->order_by('invoice_code', 'desc');
  $this->db->limit(1);
  $inv_query = $this->db->get('general_journal');
  $inv_id = $inv_query->row()->invoice_code;
}

if ($inv_query->row()->invoice_code != '' || $inv_query->row()->invoice_code != null) {
  if ($inv_query->num_rows() > 0) {
    //extract the numeric out and increase it by 1
    $second_num_inv = ''; //the second occurence of a number in the string ....
    $position_of_second_num_inv = ''; //the position of the second number

    $i = 0;
    $numeric_counter_inv = 0;
    $pos_counter = 0;
    for ($i = 0; $i < strlen($inv_id); $i++) {
      if (is_numeric($inv_id[$i])) {

        $numeric_counter_inv++;
        
        if($numeric_counter_inv == 2) {//get the 2nd time a number is found
            $second_num_inv = $inv_id[$i];
            break;
        }
      }

      $pos_counter++;
    }

    //find the position
    $position_of_second_num_inv = $pos_counter; //strpos($inv_id, $second_num_inv);

    //now let's do the extraction
    $n_invid = substr($inv_id, $position_of_second_num_inv, strlen($inv_id) - $i);

    $invoice_code = $n_invid + 1;

    if ($second_num_inv == 0) {
      $old_len = strlen($inv_id);
      $new_len = strlen($invoice_code);
      $act_len = ($old_len - $new_len);
      $invoice_code = substr($inv_id, 0, $act_len) . $invoice_code;
    } else {
      $invoice_code = $invoice_code;
    }

  } else {
    $invoice_code = $inv_no_prefix . $inv_no;
  }
} else {
  $invoice_code = $inv_no_prefix . $inv_no;
}
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
<div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/sales_order/create'),
	array('class' => 'form-groups-bordered', 'id' => 'proforma_invoice_form', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">SO No:</div>
                        </div>
                    <input type="text" required="true" onkeyup="verify_so_no()" class="form-control" name="order_no" id="order_no" minlength="<?php echo $id_length; ?>" maxlength="<?php echo $id_length; ?>" value="<?php if ($second_num == 0) {echo $so_code;} else {echo $so_no_prefix . $so_code;}?>">
                    </div>
                    <div style="position: absolute;" id="so_code_err_message"></div>
                </div>

                <?php
$customers_add = $this->db->get('customers');
$customers_array_add = $customers_add->result_array();

?>
                <div class="col-sm-5 col-md-5">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">To:</div>
                        </div>
                        <input type="text" required="true" class="form-control" onkeyup="populate_edit_button($('#order_to').val())" name="order_to" id="order_to" value="" placeholder="Enter Customer's Name...">

                    </div>
                </div>

                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Order Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date" id="order_date" data-format="dd-mm-yyyy"
                            value="<?php echo date('d-m-Y'); ?>">

                        <input type="hidden" class="form-control datepicker" name="order_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('bill_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="bill_to" id="bill_to" class="form-control" cols="50"></textarea>
                    </div>
                </div>

                <!--<div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('ship_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="ship_to" id="ship_to" class="form-control" cols="50" readonly="readonly"></textarea>
                    </div>
                </div>-->
            </div>

            <!--<div class="form-group row">
                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-danger text-light">Tax:</div>
                        </div>
                        <select class="form-control" name="tax">
                            <option value="">0.00</option>
                        </select>
                    </div>
                </div>
            </div>-->


            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="s_order_create_table">
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <!--<th>Qty Picked</th>-->
                        <th>Item</th>
                        <th>Description</th>
                        <th>Unit Price</th>
                        <!--<th>Tax</th>-->
                        <th>Total</th>
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
                    <a href="javascript:;" onclick="add_new_row()" class="btn btn-success btn-sm" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr>

            <div class="form-group row">
                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('comments'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="comments" class="form-control" cols="50" placeholder="Comments" ></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="private_comments" class="form-control" cols="50" placeholder="Private Comments"></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="subtotal">0.00</span></strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="total">0.00</span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total" id="hidden_total" value="">
                                <input type="hidden" name="hidden_payment_balance" id="hidden_payment_balance" value="">

                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="">
                                <input type="hidden" name="hidden_quantity_balance" id="hidden_quantity_balance" value="">

                                <input type="hidden" name="hidden_account_balance" id="hidden_account_balance_so" value="">


                            </thead>
                        </table>

                        <hr><hr>
                        <!--<div class="form-group row">
                            <div class="col-sm-3 col-md-3"><h3>INVOICE</h3></div>

                            <div class="col-sm-9 col-md-9">
                                <label class="control-label col-sm-6 col-sm-6"><strong class="text-danger">INSTANT PAYMENT</strong></label>  

                                <div class="switch-button  showcase-switch-button">
                                <input id="instant_payment"  type="checkbox"  value="0" name="instant_payment" onchange="value_change(this.value)">
                                <label for="instant_payment" ></label>   <strong style="font-size: 22px;" id="yes_no">NO</strong>                               
                                </div>    
                            </div>
                        </div>-->
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
                                        <input type="text" required="true" onkeyup="verify_inv_no()" class="form-control" name="invoice_code" id="invoice_code" minlength="<?php echo $inv_length; ?>" maxlength="<?php echo $inv_length; ?>" value="<?php if ($second_num_inv == 0) {echo $invoice_code;} else {echo $inv_no_prefix . $invoice_code;}?>" readonly="readonly">

                                        <input type="hidden" name="amount_paid" id="amount_paid" class="form-control" value="0">
                                    </div>

                                </div>
                            </div>

                            <!--
                        <div id="payment_holder">
                            <div class="col-sm-12 col-md-12">
                                    <div style="color: red; font-weight: bold; padding-bottom: 3px;">Please Note that customer will not receive any alert when you take payment here. Use the "Take Payment" button instead after creating this Order.</div>
                                </div>
                        <div class="form-group row">
                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Amount: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>
                                    <input type="currency" onkeyup="payment_update()" onchange="payment_update()" min="0" name="amount_paid" id="amount_paid" class="form-control" value="" required="required">
                                </div>
                            </div>

                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Bal: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>
                                    <input type="text" name="balance_amount" id="balance_amount" class="form-control form-control-plaintext" value="" readonly="readonly">
                                </div>
                            </div>
                        </div>


                        <div class="form-group row">
                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Quantity Picked:</div>
                                    </div>
                                    <input type="number" onkeyup="payment_update()" onchange="payment_update()" min="0" name="quantity_picked" id="quantity_picked" class="form-control" value="" required="required">
                                </div>
                            </div>

                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Balance:</div>
                                    </div>
                                    <input type="text" name="balance_quantity" id="balance_quantity" class="form-control form-control-plaintext" value="" readonly="readonly">
                                </div>
                            </div>
                        </div>


                        <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
?>
                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-danger text-light">Deposit Account:</div>
                                    </div>
                                    <select name="paid_to" id="paid_to" onchange="update_bank_balance($(this).val())" class="form-control" value="" required="required">
                                        <option value="">Select Account</option>
                                        <?php foreach ($accounts as $acc): ?>
                                            <option value="<?=$acc['account_id']?>"><?=$acc['name']?></option>
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
                                    <input type="text" name="account_balance" id="account_balance_so" class="form-control form-control-plaintext" value="" readonly="readonly">
                                </div>
                            </div>
                            <div class="col-sm-4 col-md-4 text-sm-right">
                                <a href="javascript:;" class="btn btn-outline-success btn-sm" onclick="auto_fill()">Autofill</a>
                            </div>
                        </div>
                    </div>-->
                </div>
            </div>
        </div>

            <div class="form-group row">
                <div class="col-sm-3 col-md-3 col-xs-6">
                    <input type="submit" class="btn btn-info btn-lg"
                        value="Create Pro Forma Invoice">
                </div>
                <div class="col-sm-2 col-md-2 col-xs-6">
                    <button class="btn btn-danger btn-lg" data-dismiss="modal">Cancel</button>
                </div>
                <div class="col-sm-4 col-md-4"></div>
            </div>
          </form>
          </div>
<a href="" target="_blank" id="redirect_me"></a>
          </div>
        </div>
    </div>
</div>

<script type="text/javascript">
    $(function() {
       // let chk_val = $('#instant_payment').val();
        value_change();
    });

    function value_change(val) {
       let instant_payment = $('#instant_payment').filter(':checked').length;

       if(instant_payment > 0) {
            $('#instant_payment').val(1);
            $('#instant_payment').attr('checked', 'checked');
            $('#yes_no').text('YES');
            $('#yes_no').css('color', '#000000');
            $('#payment_holder').slideDown('slow');
            $('#paid_to').attr('required', 'required');
            $('#amount_paid').attr('required', 'required');
       } else {
            $('#instant_payment').val(0);
            $('#yes_no').text('NO');
            $('#yes_no').css('color', '#b3afaf');

            //reset some values
            let t_hidden = Number($('#hidden_total').val());
            $('#amount_paid').val('0');
            $('#balance_amount').val(number_format(t_hidden, 2, '.', ','));
            $('#hidden_payment_balance').val(t_hidden);
            $('#account_balance_so').val('');
            $('#hidden_account_balance_so').val('');
            $('#paid_to').val('');

            $('#payment_holder').slideUp('slow');
            $('#paid_to').removeAttr('required');
            $('#amount_paid').removeAttr('required');
       }
    }

    $('#order_date').change(function(event) {
        /* Act on the event */
        //clear all table rows and inputs if Customer is changed
        $('#s_order_create_table tbody tr').css('display', 'none');
        $('#s_order_create_table tbody tr').slideUp('slow');
        $('#s_order_create_table tbody tr').remove();
    });

    ////live update ship to info
    $('#bill_to').keyup(function(event) {
        /* Act on the event */
        let bill_to = $('#bill_to').val();
        $('#ship_to').val(bill_to);
    });

    //get bank account balance
    function update_bank_balance(id) {
        if(id != '') {
            $.ajax({
                url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + id,
                type: 'POST',
                dataType: 'json',
               // cache: false
            })
            .done(function(response) {
               $('#account_balance_so').val(number_format(response.balance, 2, '.', ','));
               $('#hidden_account_balance_so').val(response.balance);
            });
        } else {
            $('#account_balance_so').val('');
            $('#hidden_account_balance_so').val('');
        }
    }

    //add row to table at a button click
    function add_new_row() {

        //be sure user selected customer before trying to add row
        let selected_customer = $('#order_to').val();
        if(selected_customer == '') {
            //no customer selected, flag error message
            showAjaxModal_confirm('No Customer\'s Name Was Entered! Enter a Customer\'s Name and Try Again.', 'Error');
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
            url: '<?php echo site_url('admin/add_proforma_invoice_row/so/0/0/') ?>' + selected_customer + '/' + order_date + '/' + selected_item_ids,
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#s_order_create_table tbody').append(tr);

            //disable the previous delete button
            $('#tr_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');
         });
    }

    //populate the edit button with the selected supplier
    function populate_edit_button(id) {

        //we need to check if this customer is at the same time a creditor with goods or negative bal
        $.ajax({
            url: '<?php echo site_url('admin/is_creditor/') ?>' + id,
            type: 'POST',
            dataType: 'json',
           // data: {param1: 'value1'},
        })
        .done(function(data) {
           // alert(data.goods);
            if(data.goods == true) {
                confirm_order('goods', id, 'This customer has some goods with you which you have not supplied yet. Do you want to supply those goods instead of creating a new Sales Order for this customer?',  data.so_code );
                
            } else if(data.negative == true) {
                confirm_order('negative', id, 'You owe this customer some cash balance. Do you want to supply this customer with goods to set off your debt instead of creating a new Sales Order for this customer?');

            } else if(data.goods_negative == true) {
                confirm_order('goods_negative', id, 'You owe this customer both cash balances and goods. If you want to settle any of the debts with goods, kindly go to the "Purchases" tab, choose "Payment" and select this customer and then choose the appropriate option');
            }
        });
        
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_sales/edit_customer/"); ?>' + id + '", "Edit Customer")');

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
  $('#proforma_invoice_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    let a_paid = Number($('#amount_paid').val());
    let ac_paid_to = $('#paid_to').val();

    let so_code = $('#order_no').val();
    let invoice_code = $('#invoice_code').val();

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
    let form_data = $('#proforma_invoice_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/create_proforma_invoice/create/') ?>' + input_ids_numeric,
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
        showAjaxModal_confirm('Pro Forma Invoice Successfully Created. <br><em>You are being redirected to the print page.</em>', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); 
          //redirect to the print page
          $('#redirect_me').attr('href', '<?php echo site_url('admin/proforma_invoice_print/'); ?>' + so_code + "/" + invoice_code);
          $('#redirect_me')[0].click();
          //window.location.reload();

        }, 1000);
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_pro_forma_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_pro_forma_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm(err.responseText, 'Error');
    });
  });

    //Verify po no
    function verify_inv_no() {
        //verify id
        var invoice_code = $('#invoice_code').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_invoice_code/'); ?>' + invoice_code
        })
        .done(function(response) {
                $('#error_holder').slideDown('slow');
                $('#inv_code_err_message').html(response);
        });
    }

    
    function remove_this_row(id) {
        //remove row now
        $('#tr_'+id).remove();
    }   
</script>