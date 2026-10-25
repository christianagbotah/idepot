<?php


//generate invoice code
$inv_no_prefix = $this->db->get_where('settings', array('type' => 'inv_prefix'))->row()->description;

$inv_no = $this->db->get_where('settings', array('type' => 'inv_no'))->row()->description;
$inv_length = strlen($inv_no_prefix . $inv_no);

$this->db->select('invoice_code');
//$this->db->where('invoice_code !=', 'Opening Balance');
$this->db->like('invoice_code', $inv_no_prefix, 'after');
$this->db->not_like('invoice_code', 'R', 'before');
$this->db->order_by('invoice_code', 'desc');
$this->db->limit(1);
$inv_query = $this->db->get('invoice');
$inv_id = $inv_query->row()->invoice_code;

if ($inv_query->num_rows() < 1) {
  //let's search from the general journal table instead
  $this->db->select('invoice_code');
  $this->db->like('invoice_code', $inv_no_prefix);
  $this->db->like('invoice_code', $inv_no_prefix, 'after');
  $this->db->not_like('invoice_code', 'R', 'before');
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

<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('new_invoice'); ?>
              </div>
          </div>

          <div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/invoice/create'),
	array('class' => 'form-groups-bordered', 'target' => '_top')); ?>
                <table class="table table-responsive" width="100%" cellpadding="0" cellspacing="0">
                    <thead>
                        <tr>
                            <th>
                                <div class="form-group row">
                                <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-dark text-light">Invoice Date:</div>
                                    </div>
                                    <input type="text" required="true" class="form-control datepicker" name="invoice_date" data-format="dd-mm-yyyy"
                                        value="<?php echo date('d-m-Y'); ?>">
                                </div>
                                </div>
                                </div>

                                <?php
$customers_add = $this->db->get('customers');
$customers_array_add = $customers_add->result_array();

?>
                                <div class="form-group row">
                                <div class="col-sm-8 col-md-8">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light">To:</div>
                                        </div>
                                        <select required="true" class="form-control" onchange="populate_edit_button($('#invoice_to').val()); get_orders_by_customer()" name="invoice_to" id="invoice_to">
                            <option value="">Select Customer</option>
                            <?php foreach ($customers_array_add as $crow): ?>
                            <option value="<?=$crow['customer_id'];?>"><?=$crow['customer_name'];?></option>
                            <?php endforeach;?>
                        </select>
                                    </div>
                                </div>

                                <div class="col-sm-4 col-md-4"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer')"><i class="fa fa-fw fa-plus"></i></a>

                                <a href="javascript:;" class="btn btn-success btn-sm" id="edit_button" title="Edit"><i class="fa fa-fw fa-edit"></i></a></div>
                                </div>
                                <div class="form-group row">
                                <div class="col-md-12 col-sm-12">
                                    <label  class="control-label"><?php echo get_phrase('bill_to:'); ?></label>
                                    <div class="col-sm-12 col-md-12">
                                        <textarea  name="bill_to" id="bill_to" class="form-control" cols="50" required ></textarea>
                                    </div>
                                </div>
                            </div>
                            </th>

                            <th>

                            <div class="form-group row">
                                <div class="col-sm-12 col-md-12">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light">Create From</div>
                                        </div>
                                        <select required="true" class="form-control" name="create_invoice_from" id="create_invoice_from" required="required">
                                            <option>Select Customer First...</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="form-group row" style="display: none" id="error_holder">
                                <div class="col-sm-12 col-md-12">
                                    <div id="inv_code_err_message"></div>
                                </div>
                            </div>
                            <div class="form-group row">
                                <div class="col-sm-12 col-md-12">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light">Invoice No</div>
                                        </div>
                                        <input type="text" required="true" onkeyup="verify_inv_no()" class="form-control" name="invoice_code" id="invoice_code" minlength="<?php echo $id_length; ?>" maxlength="<?php echo $id_length; ?>" value="<?php if ($first_num == 0) {echo $invoice_code;} else {echo $inv_no_prefix . $invoice_code;}?>">
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
                                            <div class="input-group-text bg-info text-light">Deposit Account</div>
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
                            </th>
                        </tr>

                    </thead>

                </table>
        <div id="transaction_holder">
            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="s_order_create_table">
                    <thead>
                      <tr>
                        <th>Quantity</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Unit Price</th>
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
                    <a href="javascript:;" onclick="add_new_row()" id="add_btn" class="btn btn-success btn-sm" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr>

            <div class="form-group row">
                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('comments'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="comments" class="form-control" cols="50"  ><?php echo 'Comments'; ?></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="private_comments" class="form-control" cols="50" ><?php echo 'Private Comments'; ?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span><span id="subtotal">0.00</span></strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span><span id="total">0.00</span></strong></th>
                                </tr>

                                <input type="hidden" name="hidden_total" id="hidden_total" value="">
                                <input type="hidden" name="hidden_payment_balance" id="hidden_payment_balance" value="">

                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="">
                                <input type="hidden" name="hidden_quantity_balance" id="hidden_quantity_balance" value="">
                            </thead>
                        </table>
                    </div>
                </div>
            </div>
        </div>

            <div class="form-group row">
                <div class="col-sm-3 col-md-3 col-xs-6">
                    <input type="submit" id="create_btn" class="btn btn-info btn-lg"
                        value="Create Invoice">
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

    });

    //get all orders of the selected customer
    function get_orders_by_customer() {
        let customer_id = $('#invoice_to').val();

        if(customer_id != '') {
            $.ajax({
                url: '<?php echo site_url('admin/get_orders_by_customer/'); ?>' + customer_id,
                type: 'POST',
                dataType: 'html',
                cache: false
            })
            .done(function(response) {

                $('#create_invoice_from').html('<option value="1">Choose Invoice</option>' + response);

                let id = $('#create_invoice_from').val();
                if(id == 1) {
                    $('#add_btn').attr('disabled', 'disabled');
                    $('#create_btn').attr('disabled', 'disabled');
                } else {
                    $('#add_btn').removeAttr('disabled');
                    $('#create_btn').removeAttr('disabled');
                }
            });
        } else {
            $('#create_invoice_from').html('<option value="1">Choose Invoice</option>');
        }
    }

    //disable some button f user select no order found option
    $('#create_invoice_from').change(function(event) {
        /* Act on the event */
        let id = $('#create_invoice_from').val();
        if(id == '') {
            alert('You have selected "No Order Found" option. There is no order created for this customer. Create Sales Order for this customer to continue.');
            $('#add_btn').attr('disabled', 'disabled');
            $('#create_btn').attr('disabled', 'disabled');
        } else if(id == 1) {
            $('#add_btn').attr('disabled', 'disabled');
            $('#create_btn').attr('disabled', 'disabled');
        } else {
            $('#add_btn').removeAttr('disabled');
            $('#create_btn').removeAttr('disabled');
        }
    });

    //get orders by so_code
    $('#create_invoice_from').change(function(event) {
        /* Act on the event */
        let so_code = $('#create_invoice_from').val();

        if(so_code != '' || so_code != 1) {
            $.ajax({
                url: '<?php echo site_url('admin/get_orders_by_so_code/'); ?>' + so_code,
                type: 'POST',
                dataType: 'html',
               // cache: false
            })
            .done(function(response) {

               $('#transaction_holder').html(response);

            });
        } else {

        }
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
               $('#account_balance').val(number_format(response.balance, 2, '.', ','));
               $('#hidden_account_balance').val(response.balance);
            });
        } else {
            $('#account_balance').val('');
            $('#hidden_account_balance').val('');
        }

    }

    //add row to table at a button click
    function add_new_row() {
        let tbody = $('#s_order_create_table tbody').find('tr').length;

        $.ajax({
            url: '<?php echo site_url('admin/add_order_row/') ?>',
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#s_order_create_table tbody').append(tr);
         });
    }

     //remove row
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

    //remove row now
    $('#tr_'+id).remove();
}

    //populate the edit button with the selected supplier
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
                }
            });
        }  else {
                    $('#bill_to').val('');
                }

    }

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

    //Sales Order Creation form submitted
  $('#sales_order_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    let no_tr = $('#s_order_create_table tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(i = 0; i < no_tr; i++) {
      let each_id_numeric =  $('#tr_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');
      input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }

    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-')
    let form_data = $('#sales_order_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/sales_order/create/') ?>' + input_ids_numeric,
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
        showAjaxModal_confirm('Sales Order Created Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click();
           //window.location.reload();
        }, 500);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: Order with the same SO No [' + data.so_code + '] already exists', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_s_order_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_s_order_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm(err.responseText, 'Error');
    });
  });

</script>