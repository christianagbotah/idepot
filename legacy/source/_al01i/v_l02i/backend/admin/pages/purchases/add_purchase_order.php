<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('new_purchase_order'); ?>
              </div>
          </div>

          <?php
//generate po id
$po_no_prefix = $this->db->get_where('settings', array('type' => 'po_prefix'))->row()->description;

$po_no = $this->db->get_where('settings', array('type' => 'po_no'))->row()->description;
$id_length = strlen($po_no_prefix . $po_no);

$this->db->select('po_code');
//$this->db->where('po_code !=', 'Opening Balance');
$this->db->like('po_code', $po_no_prefix, 'after');
$this->db->order_by('po_code', 'desc');
$this->db->limit(1);
$po_query = $this->db->get('purchase_order');
$po_id = $po_query->row()->po_code;

if ($po_query->num_rows() < 1) {
  //let's search from the general journal table instead
  $this->db->select('po_code');
  $this->db->like('po_code', $po_no_prefix, 'after');
  $this->db->order_by('po_code', 'desc');
  $this->db->limit(1);
  $po_query = $this->db->get('general_journal');
  $po_id = $po_query->row()->po_code;
}

if ($po_query->row()->po_code != '' || $po_query->row()->po_code != null) {
  if ($po_query->num_rows() > 0) {
    //extract the numeric out and increase it by 1
    $second_num = ''; //the second occurence of a number in the string ....
    $position_of_second_num = ''; //the position of the second number

    $i = 0;
    $numeric_counter = 0;
    $pos_counter = 0;
    for ($i = 0; $i < strlen($po_id); $i++) {
      if (is_numeric($po_id[$i])) {

        $numeric_counter++;

        if($numeric_counter == 2) {//get the 2nd time a number is found
            $second_num = $po_id[$i];
            break;
        }
      }

      $pos_counter++;
    }


    //find the position
    $position_of_second_num = $pos_counter; //strpos($po_id, $second_num);


    //now let's do the extraction
    $n_poid = substr($po_id, $position_of_second_num, strlen($po_id) - $i);

    $po_code = $n_poid + 1;

    if ($second_num == 0) {
      $old_len = strlen($po_id);
      $new_len = strlen($po_code);
      $act_len = ($old_len - $new_len);
      $po_code = substr($po_id, 0, $act_len) . $po_code;
    } else {
      $po_code = $po_code;
    }

  } else {
    $po_code = $po_no_prefix . $po_no;
  }
} else {
  $po_code = $po_no_prefix . $po_no;
}
?>

          <div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/purchase_order/create'),
	array('class' => 'form-groups-bordered', 'id' => 'purchase_order_form', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">PO No:</div>
                        </div>
                    <input type="text" required="true" onkeyup="verify_po_no()" class="form-control" name="purchase_order_no" id="purchase_order_no" minlength="<?php echo $id_length; ?>" maxlength="<?php echo $id_length; ?>" value="<?php if ($second_num == 0) {echo $po_code;} else {echo $po_no_prefix . $po_code;}?>">
                    </div>
                    <div style="position: absolute;" id="po_code_err_message"></div>

                   
                </div>

                <?php
$suppliers_add = $this->db->get('suppliers');
$suppliers_array_add = $suppliers_add->result_array();

?>
                <div class="col-sm-5 col-md-5">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">From:</div>
                        </div>
                        <select required="true" class="form-control select2" onchange="populate_edit_button($('#order_from').val())" name="order_from" id="order_from">
                            <option value="">Select Supplier</option>
                            <?php foreach ($suppliers_array_add as $srow): ?>
                            <option value="<?=$srow['supplier_id'];?>"><?=$srow['supplier_name'];?></option>
                            <?php endforeach;?>
                        </select>
                    </div>
                </div>

                <!-- <div class="col-sm-2 col-md-2"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php //echo site_url('modal/popup_purchases/add_supplier/'); ?>', 'Add new supplier')"><i class="fa fa-fw fa-plus"></i></a>

                <a href="javascript:;" class="btn btn-success btn-sm" id="edit_button" title="Edit"><i class="fa fa-fw fa-edit"></i></a></div>
 -->
                <div class="col-sm-3 col-md-3">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Order Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date" data-format="dd-mm-yyyy"
                            value="<?php echo date('d-m-Y'); ?>">

                        <input type="hidden" class="form-control datepicker" name="order_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('supplier\'s_address'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="vendor_address" id="vendor_address" class="form-control" cols="50" required ></textarea>
                    </div>
                </div>

            </div>


            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="p_order_create_table">
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
                        <textarea  name="comments" class="form-control" cols="50" placeholder="Comments" ></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="private_comments" placeholder="Private Comments" class="form-control" cols="50" ></textarea>
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

                                <input type="hidden" name="hidden_account_balance" id="hidden_account_balance_po" value="">

                                <input type="hidden" name="discount" id="discount" value="0">
                            </thead>
                        </table>

                        <hr><hr>

                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <label class="control-label col-sm-6 col-sm-6"><strong class="text-success">CASH PURCHASES</strong></label>  

                                <div class="switch-button  showcase-switch-button">
                                <input id="instant_payment"  type="checkbox"  value="0" name="instant_payment" onchange="value_change(this.value)">
                                <label for="instant_payment" ></label>   <strong style="font-size: 22px;" id="yes_no_inst">NO</strong>                               
                                </div>    
                            </div>
                        </div>

                            <hr>

                            <div id="payment_info_holder">

                        <div><strong>Payment <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?> <span id="amount_pd"></span></strong></div>

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
                                    <input type="currency" onchange="payment_update()" min="0" name="amount_paid" id="amount_paid" class="form-control" value="" required="required">
                                </div>
                            </div>

                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Balance: <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                                    </div>
                                    <input type="text" name="balance_amount" id="balance_amount" class="form-control form-control-plaintext" value="" readonly="readonly">
                                </div>
                            </div>
                        </div>
                        <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1))->result_array();
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
                                    <input type="text" name="account_balance" id="account_balance_po" class="form-control form-control-plaintext" value="" readonly="readonly">
                                </div>
                            </div>
                            <div class="col-sm-4 col-md-4 text-sm-right">
                                <a href="javascript:;" class="btn btn-outline-success btn-sm" onclick="auto_fill()">Autofill</a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

            <div class="form-group row">
                <div class="col-sm-3 col-md-3 col-xs-6">
                    <button type="submit" class="btn btn-info btn-lg rounded-xl p-4 font-bold text-2xl">Create Order</button>
                </div>
                <div class="col-sm-2 col-md-2 col-xs-6">
                    <button class="btn btn-danger btn-lg rounded-xl p-4 font-bold text-2xl" data-dismiss="modal">Cancel</button>
                </div>
                <div class="col-sm-4 col-md-4"></div>
            </div>
            <!--Hide items array here -->
            <input type="hidden" name="item_array[]" value="" id="item_array">
          </form>
          </div>

          </div>
        </div>
    </div>
</div>

<script type="text/javascript">
    $(function() {
        value_change();
    });

    function updateCode() {
        getPOCodeForNewOrder(function(code) {
            $('#purchase_order_no').val(code);
        });
    }

    function getPOCodeForNewOrder(callback) {
        var po_code = '';

        return $.ajax({
          url: '<?php echo site_url('admin/getPOCodeForNewOrder') ?>',
          type: 'POST',
          dataType: 'html',
          cache: false
        })
        .done(function(poCode) {
            callback(poCode);
        })
        .fail(function(err) {
            return;
        })
    }
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

       } else {
            $('#instant_payment').val(0);
            $('#instant_payment').removeAttr('checked');
            $('#yes_no_inst').text('NO');
            $('#yes_no_inst').css('color', '#b3afaf');

            //reset some values
            $('#amount_paid').val('0');
            $('#paid_from').val('');
            $('#account_balance_po').val('');
            $('#hidden_account_balance_po').val('');

            $('#payment_info_holder').slideUp('slow');
            $('#paid_from').removeAttr('required');
            $('#amount_paid').removeAttr('required');
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

    //get bank account balance
    function update_bank_balance(id) {
        if(id != '') {
            $.ajax({
                url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + id,
                type: 'POST',
                dataType: 'json',
                cache: true
            })
            .done(function(response) {
               $('#account_balance_po').val(number_format(response.balance, 2, '.', ','));
               $('#hidden_account_balance_po').val(response.balance);
            });
        } else {
            $('#account_balance_po').val('');
            $('#hidden_account_balance_po').val('');
        }

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
        $('#hidden_account_balance_po').val(bank_balance.balance);
         if(amount > bank_balance.balance) {

            $('#report_error').html('<strong style="color: red">Your account will be in red</strong>');
            $('#report_error').slideDown('slow');
            //$('input[name="amount_paid"]').attr('maxlength', _leng);
         } else {
            $('#report_error').slideUp('slow');
         }
      });
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

    //populate the edit button with the selected supplier
    function populate_edit_button(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_purchases/edit_supplier/"); ?>' + id + '", "Edit Supplier")');
        let set_supplier_id = $('#order_from').val();

        //clear all table rows and inputs if supplier is changed
        //amounts
        //let row_total_cost = Number($('#tr_' + id + ' td .sum_total_amount').val());
       // let grand_total = Number($('#hidden_total').val());
       // let balance = grand_total - row_total_cost;

        //quantities
        //let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity').val());
        //let grand_total_quantity = Number($('#hidden_total_quantity').val());
        //let balance_quantity = grand_total_quantity - row_total_quantity;


        $('#hidden_total').val(0);
        $('#subtotal').html(number_format(0, 2, '.', ','));
        $('#total').html(number_format(0, 2, '.', ','));
        $('#amount_paid').val('0.00');
        $('#balance_amount').val(number_format(0, 2, '.', ','));


        //$('#hidden_total_quantity').val(balance_quantity);
        //$('#quantity_picked').val(0);
        //$('#balance_quantity').val(balance_quantity);

        $('#p_order_create_table tbody tr').css('display', 'none');
        $('#p_order_create_table tbody tr').slideUp('slow');
        $('#p_order_create_table tbody tr').remove();

        //let's auto fill the bill to and ship to addresses with the supplier's address
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


    //Verify po no
    function verify_po_no() {
        //verify id
        var po_no = $('#purchase_order_no').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_po_no/'); ?>' + po_no
        })
        .done(function(response) {
                $('#po_code_err_message').html(response);
        });
    }

    //Purchase Order Creation form submitted
  $('#purchase_order_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    $('#modal_confirm').attr('data-backdrop', 'static');
    $('#modal_confirm').attr('data-keyboard', 'false');
    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading'); //show loading

    let no_tr = $('#p_order_create_table tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(i = 1; i <= no_tr; i++) {
      let each_id_numeric =  $('#tr_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');
      input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }

    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-')
    let form_data = $('#purchase_order_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/purchase_order/create/') ?>' + input_ids_numeric,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        //$('.close').click();
        showAjaxModal_confirm('Purchase Order Created Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
          updateCode(); //update the po code

          $('#purchase_order_form')[0].reset(); //reselt form inputs
          $('#purchase_order_form select option:first-child').prop('selected', true).trigger('change');//reset all select elements

          
        
        }, 3000);

      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: Order with the same PO No [' + data.po_code + '] already exists', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_p_order_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_p_order_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm(err.responseText, 'Error');
    });
  });


</script>