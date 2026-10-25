<?php

echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;

$this->db->select('customer_id');
$this->db->distinct();
$this->db->where('amount_due >=', 0);
$customer_add = $this->db->get('invoice');
$customers_array_add = $customer_add->result_array();

$customer_id = $param2;
$receipt_code = $param3;
//$invoice_code = $param4;
$track_code = $this->db->get_where('payment', array('customer_id' => $customer_id, 'receipt_code' => $receipt_code))->row()->track_code;

$for_date = $this->db->get_where('payment', array('customer_id' => $customer_id, 'receipt_code' => $receipt_code))->row()->timestamp;

$payment_array = $this->db->get_where('payment', array('customer_id' => $customer_id, 'receipt_code' => $receipt_code))->result_array();

$invoice_code_array = array();
$so_code_array = array();
foreach ($payment_array as $row) {
  array_push($invoice_code_array, $row['invoice_code']);
  array_push($so_code_array, $row['so_code']);
}

$invoice_code_array = array_unique($invoice_code_array);
$so_code_array = array_unique($so_code_array);


foreach ($payment_array as $payment):

	$total_receivable = $this->db
		->select_sum('amount_due')
    ->where('amount_due >=', 0)
		->where('customer_id', $customer_id)
		//->where_in('invoice_code', $invoice_code_array)
		->get('invoice')->row()->amount_due;


  $this->db->select_sum('amount');
  $this->db->from('payment');
  $this->db->where('receipt_code', $payment['receipt_code']);
  $pamount = $this->db->get()->row()->amount;

endforeach;


	$reference = $this->db->get_where('general_journal', array('customer_id' => $customer_id, 'payment_id' => $payment['payment_id']))->row()->reference;
	$journal_memo = $this->db->get_where('general_journal', array('customer_id' => $customer_id, 'payment_id' => $payment['payment_id']))->row()->description;
	$allocated_acc = $this->db->get_where('accounts', array('name' => 'Accounts Receivable'))->row()->account_id;
	?>

 <style type="text/css">
  input[name="amount_received"], input[name="amount_tendered"], input[name="change"], input[name="account_balance"], input[name="total_receivable"] {
    height: 50px !important;
    font-size: 40px !important;
    font-weight: bolder !important;
    letter-spacing: 2px !important;
  }

  input[name="account_balance"], input[name="total_receivable"] {
    height: 40px !important;
    font-size: 26px !important;
    font-weight: bolder !important;
    letter-spacing: 2px !important;
  }
</style>

	<div class="row">

	          <div class="col-md-12 col-sm-12 col-xs-12">
	              <div class="panel panel-success">

	                  <div class="panel-heading">
	                      <div class="panel-title" style="color: #fff; padding: 5px;">
	                          <?php echo get_phrase('enter_payment_from_customer'); ?>
	                      </div>
	                  </div>

	                  <div class="panel-body" style="padding: 10px">
	                    <?php
echo form_open(site_url('admin/payments_received/update'),
		array('class' => 'form-groups-bordered', 'id' => 'payments_form', 'target' => '_top')); ?>
		<div class="form-group row">
		<div class="col-sm-5 col-md-5">
		<div class="input-group">
		<div class="input-group-prepend">
		  <div class="input-group-text bg-info text-light">Customer:</div>
		</div>
		<select required="true" class="form-control select2" onchange="populate_edit_button($(this).val())" name="customer_name" id="customer_name">
      <option value="<?=$customer_id;?>"><?=$this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name;?></option>

                              </select>
                          </div>
                      </div>

                      <div class="col-sm-2 col-md-2"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer'); clearModals()"><i class="fa fa-fw fa-plus"></i></a>

                      <a href="javascript:;" class="btn btn-success btn-sm" title="Edit" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_customer/' . $customer_id); ?>', 'Edit Customer'); clearModals()" id="edit_button" ><i class="fa fa-fw fa-edit"></i></a></div>

                      <div class="col-sm-5 col-md-5">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-dark text-light">Payment Date:</div>
                              </div>
                              <input type="text" required="true" class="form-control datepicker" name="payment_date" data-format="dd-mm-yyyy"
                                  value="<?php echo date('d-m-Y', $for_date); ?>">
                          </div>
                      </div>
                  </div>
<?php
  $this->db->where('amount_due >=', 0);
  $this->db->where('customer_id', $customer_id);
  $this->db->where_in('invoice_code', $invoice_code_array);
$invoice_codes_array = $this->db->get('invoice')->result_array()
?>
                  <div class="form-group row" id="invoice_code_holder">
                        <label  class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('Pay for INVOICE CODE'); ?></label>
                        <div class="col-sm-8 col-md-8 col-xs-8">
                        <select name="invoice_code" id="invoice_code" class="form-control select2" required="required">

                          <option value="<?=implode('_', $invoice_code_array);?>"><?=implode(', ', $invoice_code_array);?></option>

                </select>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-4 col-md-4 col-xs-4 col-form-label">SO CODE</label>
                        <div class="col-sm-8 col-md-8 col-xs-8">
                              <input type="text"  name="so_code_disabled"  class="form-control" value="<?=implode(', ', $so_code_array);?>" disabled="disabled">

                              <input type="hidden"  name="so_code" id="so_code" class="form-control" value="<?=implode('_', $so_code_array);?>" readonly="readonly">
                        </div>
                    </div>

                    <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
?>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('deposit_account'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                        <select name="deposit_account" id="deposit_account" class="form-control select2" onchange="update_bank_balance($(this).val())" required="required">
                              <option value="">Select Account</option>
                              <?php foreach ($accounts as $acc): ?>
                                  <option value="<?=$acc['account_id'];?>" <?php if ($acc['account_id'] == $payment['account_id']) {echo 'selected';}?>><?=$acc['name']?></option>
                              <?php endforeach;?>
                          </select>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_balance'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="text"  name="account_balance" id="account_balance" value="<?=number_format($this->db->get_where('accounts', array('account_id' => $payment['account_id']))->row()->current_balance, 2, '.', ',');?>" class="form-control form-control-plaintext" readonly="readonly">

                              <input type="hidden" name="hidden_account_balance" id="hidden_account_balance" value="<?=$this->db->get_where('accounts', array('account_id' => $payment['account_id']))->row()->current_balance;?>">

                              <input type="hidden" name="hidden_account_used" value="<?=$payment['account_id']?>">
                            </div>
                        </div>
                    </div>
                    <!--<div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php //echo get_phrase('method'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select required="true" class="form-control" name="method">
                                  <option value="1">Cash</option>
                            </select>
                        </div>
                    </div>-->
                    <div class="form-group row" id="payable_row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label" id="recevable_label"><?php echo get_phrase('total_receivable'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="text" class="form-control" name="total_receivable" id="total_receivable" value="<?=$currency . ' ' . number_format($total_receivable, 2, '.', ',');?>" readonly="readonly">

                            <input type="hidden" class="form-control" name="hidden_total_receivable" id="hidden_total_receivable" value="<?=$total_receivable;?>">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_tendered'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" min="1" onkeyup="update_change()" name="amount_tendered" id="amount_tendered" class="form-control" required="required" value="<?=$payment['amount_tendered'];?>">
                            </div>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_received'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                          <div id="report_error" style="display: none"></div>
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" min="1" onkeyup="check_bank_balance($(this).val())" name="amount_received" id="amount_received" class="form-control" required="required" value="<?=$pamount;?>">

                              <input type="hidden" min="1" name="hidden_amount_paid" class="form-control" value="<?=$pamount;?>">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('change'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="text" name="change" id="change" class="form-control" value="<?=number_format($payment['change_due'], 2, '.', ',');?>" readonly="readonly">
                            </div>
                        </div>
                    </div>

                    <!--
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('reference_number'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="reference_number" class="form-control" value="<?=$reference;?>">
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('transaction_reference'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="transaction_reference" class="form-control" value="">
                        </div>
                    </div>-->
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('journal_memo'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <textarea  name="journal_memo" class="form-control" cols="50"><?=$journal_memo;?></textarea>
                        </div>
                    </div>

                    <!--
                    <hr>
                    <div class="form-group row ml-1" title="select the allocated account for this transaction">Account Allocated To</div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php //echo get_phrase('allocated_account'); ?></label>
                        <div class="col-sm-5 col-md-5 col-xs-5">
                            <select name="allocated_account" id="allocated_account" class="form-control" required="required">
                              <option value="<?=$allocated_acc;?>">Accounts Receivable</option>
                            </select>
                        </div><a href="javascript:;" style="text-decoration: none" class="col-sm-1 col-md-1 col-xs-1 text-sm-center pt-2 text-light bg-success">CR</a>
                    </div>-->
                    <div class="form-group row">
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="submit" class="btn btn-info btn-lg form-control"
                                value="Edit Payment" >
                        </div>

                      
                      <!--   <div class="col-md-2 col-sm-2"></div>
                      <div class="col-sm-6 col-md-6 pull-right">
                          <label class="control-label col-md-6 col-sm-6"><strong>PRINT RECEIPT?</strong></label>  

                          <div class="switch-button  showcase-switch-button col-md-6 col-sm-6">
                          <input id="print_receipt"  type="checkbox"  value="1" checked name="print_receipt" onchange="value_change(this.value)">
                          <label for="print_receipt" ></label>   <strong style="font-size: 22px;" id="yes_no">YES</strong>                               
                          </div>            
                      </div> -->

                    </div>
                  </div>
                </div>
          </div>
    </div>
  </div>
  <script src="<?php echo base_url('assets/js/neon-custom-ajax.js');?>"></script>
  <script type="text/javascript">
    $(document).ready(function($) {
      account_allocation();
      b_balance();
    });

    //close earlier modals
    function clearModals() {
      $('.close').click();
    }

    function value_change(val) {
       let print_receipt = $('#print_receipt').filter(':checked').length;
       if(print_receipt > 0) {
            $('#print_receipt').val(1);
            $('#yes_no').text('YES');
            $('#yes_no').css('color', '#000000');
       } else {
        $('#print_receipt').val(0);
        $('#yes_no').text('NO');
        $('#yes_no').css('color', '#b3afaf');
       }
    }
    
    //update account_allocation
    function account_allocation() {
      let valSelected = 3;

        //update allocated account
        $.ajax({
            url: '<?php echo site_url('admin/account_allocation/') ?>' + valSelected,
            type: 'POST',
            dataType: 'html',
            cache: false
            })
            .done(function(data) {
                $('#allocated_account').html(data);
            });
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
             $('#account_balance').val(number_format(response.balance, 2, '.', ','));
             $('#hidden_account_balance').val(response.balance);
          });
        } else {
          $('#account_balance').val('');
          $('#hidden_account_balance').val('');
        }

    }


//check blances
//check blances
    function b_balance() {
          let deposit_account = $('#deposit_account').val();

          $.ajax({
              url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + deposit_account,
              type: 'POST',
              dataType: 'json',
              cache: false
          })
          .done(function(bank_balance) {
                $('#hidden_account_balance').val(bank_balance.balance);

          });
        }


    function update_change() {
      let amount_tendered = Number($('#amount_tendered').val());
      let amount_received = Number($('#amount_received').val());
      $('#change').val(number_format(amount_tendered - amount_received, 2, '.', ','));//change here
    }

    function check_bank_balance(amount) {
      let receivable = $('#hidden_total_receivable').val();
      let amount_received = '<?php echo $pamount; ?>';
      let amount_tendered = Number($('#amount_tendered').val());
      amount = Number(amount);

      $('#change').val(number_format(amount_tendered - amount, 2, '.', ','));//change here

            if(receivable == 0) {
              if(amount > receivable && amount > amount_received) {

                $('#report_error').html('<strong style="color: red">Amount entered is more than the amount this customer owes.</strong>');
                $('#report_error').slideDown('slow');
                //$('input[name="amount_received"]').attr('maxlength', _leng);
             } else {
                $('#report_error').slideUp('slow');
             }
           } else if (receivable > 0) {
            let total_receivable = Number(amount_received) + Number(receivable);
              if(amount > total_receivable) {

                $('#report_error').html('<strong style="color: red">Amount entered is more than the amount this customer owes.</strong>');
                $('#report_error').slideDown('slow');
                //$('input[name="amount_received"]').attr('maxlength', _leng);
             } else {
                $('#report_error').slideUp('slow');
             }
           }else {
              $('#report_error').slideUp('slow');
           }
    }
    //populate the edit button with the selected supplier
    function populate_edit_button(id) {

        //populate the edit button
        $('#edit_button').removeAttr('onclick');
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_sales/edit_customer/"); ?>' + id + '", "Edit Customer"); clearModals()');

        let currency = '<?php echo $currency; ?>';
        //send data via ajax
        if(id == '' || id == null) {
            $('#total_receivable').val('No Customer Selected');
          } else {
            $.ajax({
            url: '<?php echo site_url('admin/get_receivable/') ?>' + id,
            type: 'POST',
            dataType: 'text',
            cache: false
            })
            .done(function(data) {
                $('#total_receivable').val(currency + ' ' + number_format(data, 2, '.', ','));
                $('#hidden_total_receivable').val(data);
            });

            //ajax call to the get_invoice_codes function
            $.ajax({
            url: '<?php echo site_url('admin/get_inv_codes/') ?>' + id,
            type: 'POST',
            dataType: 'html',
            cache: false
            })
            .done(function(data) {
                $('#invoice_code').html('<option value="">Choose Your Option</option>' + data);
            });
        }

    }

    $('#invoice_code').change(function(event) {
      let currency = '<?php echo $currency; ?>';
      let inv_code_value = $('#invoice_code').val();
      let customer_id = $('#customer_name').val();
      let inv_code_value_raw = inv_code_value;

      if(inv_code_value != '') {
        inv_code_value = inv_code_value.replace(/ /g, '_');

        $.ajax({
        url: '<?php echo site_url('admin/get_receivable_per_inv_code/') ?>' + customer_id + '/' + inv_code_value,
        type: 'POST',
        dataType: 'json',
        cache: false
        })
        .done(function(data) {

            $('#recevable_label').html('Total Receivable for <strong>' + inv_code_value_raw + '</strong>');
            $('#total_receivable').val(currency + ' ' + number_format(data.amount_due, 2, '.', ','));
            $('#hidden_total_receivable').val(data.amount_due);
            $('#so_code').val(data.so_code);
        });
      } else {
        $.ajax({
        url: '<?php echo site_url('admin/get_receivable/') ?>' + customer_id,
        type: 'POST',
        dataType: 'text',
        cache: false
        })
        .done(function(data) {
            $('#recevable_label').text('Total Receivable');
            $('#total_receivable').val(currency + ' ' + number_format(data, 2, '.', ','));
            $('#hidden_total_receivable').val(data);
            $('#so_code').val('');
        });
      }
    });

    //Pay Payable or other payment Creation form submitted
  $('#payments_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();


    let form_data = $('#payments_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/payments_received/update/' . $receipt_code . '/' . $track_code) ?>',
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm(data.payment_type + ' updated Successfully.', 'Success');

        setTimeout(() => {
          //$('#modal_confirm .close').click(); 
          window.location.reload();
        }, 500);
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_receivable_edit').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_receivable_edit"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Make sure the amount you entered is valid and does not contain any alphabets or any other characters apart from \'dot (.)\'', 'Error');
    });
  });
  </script>