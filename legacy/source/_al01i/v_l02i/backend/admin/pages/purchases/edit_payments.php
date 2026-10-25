<?php
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;

$supplier_id = $param2;
$payment_id = $param3;
$po_code = urldecode($param4);
$track_code = $this->db->get_where('payment', array('payment_id' => $payment_id))->row()->track_code;
$account_used = $this->db->get_where('payment', array('payment_id' => $payment_id))->row()->account_id;

//check if debt_id column too is null
$debt_id = $this->db->get_where('payment', array('payment_id' => $payment_id))->row()->debt_id;
if($debt_id != null) {
  $debt_id = 'de_'.$debt_id;
}

$payments = $this->db->get_where('payment', array('payment_id' => $payment_id))->result_array();
foreach ($payments as $payment):
?>
<div class="row" id="edit_payment_top">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-success">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('edit_payments_and_purchases'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
echo form_open(site_url('admin/payments/update'),
	array('class' => 'form-groups-bordered', 'id' => 'payments_form_edit', 'target' => '_top')); ?>
                    <div class="form-group row">
                      <div class="input-group">
                        <div class="input-group-prepend">
                          <div class="input-group-text bg-danger text-light">Type Of Payment</div>
                        </div>
                        <div class="m-lg-3">
                          <div class="form-check-inline">
                          <label class="form-check-label">
                            <input type="radio" class="form-check-input" <?php if ($supplier_id != '0' || $debt_id != null) {
	echo 'checked';
}
?> value="1" id="to_supplier" name="payment_type" required> To A supplier
                          </label>
                        </div>
                        <div class="form-check-inline">
                          <label class="form-check-label">
                            <input type="radio" class="form-check-input" <?php if ($supplier_id == '0' && $debt_id == null) {
	echo 'checked';
}
?> value="2" id="to_expenditure" name="payment_type" required> An Expenditure
                          </label>
                          </div>
                        </div>
                        </div>
                    </div>

                    <?php
$suppliers_add = $this->db->get('suppliers');
$suppliers_array_add = $suppliers_add->result_array();

//those customers with negative balance
$this->db->select('customer_id');
$this->db->distinct();
$this->db->where('amount_due <', 0);
$customers = $this->db->get('invoice');
$customers_array = $customers->result_array();

?>
                    <div class="form-group row">
                      <div id="main_holder">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text text-light" id="pay_to_holder">Pay To:</div>
                              </div>
                              <div id="holder">

                              </div>

                          </div>
                      </div>

                      <div class="col-sm-2 col-md-2" style="display: none;" id="btnns"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/'); ?>', 'Add new supplier')"><i class="fa fa-fw fa-plus"></i></a>

                      <a href="javascript:;" class="btn btn-success btn-sm" id="edit_button" title="Edit"><i class="fa fa-fw fa-edit"></i></a></div>

                      <div class="col-sm-5 col-md-5">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-dark text-light">Transaction Date:</div>
                              </div>
                              <input type="text" required="true" class="form-control datepicker" name="payment_date" data-format="dd-mm-yyyy"
                                  value="<?php echo date('d-m-Y', $payment['timestamp']); ?>">
                          </div>
                      </div>
                  </div>

                  <div class="form-group row" id="po_code_row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('PO_CODE'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="po_code" readonly="readonly" class="form-control" value="<?php echo $po_code == '0' ? 'Not Available' : $po_code; ?>">
                        </div>
                    </div>

                    <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
?>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_paid_from'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                        <select name="account_paid_from" id="account_paid_from" class="form-control" onchange="update_bank_balance($(this).val())" required="required">
                              <option value="">Select Account</option>
                              <?php foreach ($accounts as $acc): ?>
                                  <option value="<?=$acc['account_id'];?>" <?php if ($acc['account_id'] == $payment['account_id']) {
	echo 'selected';
}
?>><?=$acc['name']?></option>
                              <?php endforeach;?>
                          </select>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_balance'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-danger text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="text"  name="account_balance_payment_edit" id="account_balance_payment_edit" class="form-control form-control-plaintext" readonly="readonly">

                              <input type="hidden" name="hidden_account_balance_payment_edit" id="hidden_account_balance_payment_edit" value="">
                              <input type="hidden" name="hidden_account_used" id="hidden_account_used" value="<?=$account_used;?>">
                            </div>
                        </div>
                    </div>
                    <!--<div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('method'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select required="true" class="form-control" name="method">
                                  <option value="1">Cash</option>
                            </select>
                        </div>
                    </div>-->
                    <?php
if(substr($supplier_id, 0, 3) == 'ce_') {
  $customer_id = substr($supplier_id, 3);

  $this->db->select_sum('amount_due');
  $this->db->where('amount_due <', 0);
  $this->db->where('customer_id', $customer_id);
  $payable = abs($this->db->get('invoice')->row()->amount_due);

} else {
  if ($po_code == '0') {
    $this->db->select_sum('amount_due');
    $this->db->where('amount_due >', 0);
    $this->db->where('supplier_id', $supplier_id);
    $payable = $this->db->get('accounts_payable')->row()->amount_due;
  } else {
    if($debt_id != null) {
      $this->db->select_sum('amount_due');
      $this->db->where('debt_id', substr($debt_id, 3));
      $payable = $this->db->get('outstanding_debts')->row()->amount_due;
    } else {
      $this->db->select_sum('amount_due');
      $this->db->where('supplier_id', $supplier_id);
      $this->db->where('po_code', $po_code);
      $payable = $this->db->get('accounts_payable')->row()->amount_due;
    }
  }
}


?>
                    <div class="form-group row" id="payable_row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('total_payable'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="text" class="form-control" name="" id="total_payable" value="" readonly="readonly">

                            <input type="hidden" class="form-control" name="hidden_total_payable" id="hidden_total_payable" value="">
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_paid'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                          <div id="report_error" style="display: none"></div>
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-danger text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" min="1" name="amount_paid" onkeyup="check_bank_balance($(this).val())" class="form-control" required="required" value="<?=$payment['amount'];?>">

                              <input type="hidden" min="1" name="hidden_amount_paid" class="form-control" value="<?=$payment['amount'];?>">
                            </div>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('reference_number'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="reference_number" class="form-control" value="<?=$this->db->get_where('general_journal', array('payment_id' => $payment_id))->row()->reference;?>">
                        </div>
                    </div>
                    <!--<div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('transaction_reference'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="transaction_reference" class="form-control" value="">
                        </div>
                    </div>-->
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('journal_memo'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <textarea  name="journal_memo" class="form-control" cols="50"><?=$this->db->get_where('general_journal', array('payment_id' => $payment_id))->row()->description;?></textarea>
                        </div>
                    </div>

                    <hr>
                    <div class="form-group row ml-1" title="select the allocated account for this transaction">Account Allocated To</div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('allocated_account'); ?></label>
                        <div class="col-sm-5 col-md-5 col-xs-5">
                            <select name="allocated_account" id="allocated_account" class="form-control" required="required">

                            </select>
                        </div><a href="javascript:;" style="text-decoration: none" class="col-sm-1 col-md-1 col-xs-1 text-sm-center pt-2 text-light bg-success">DR</a>
                    </div>
                    <div class="form-group row">
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="submit" class="btn btn-info btn-lg form-control"
                                value="Update Payment" >
                        </div>

                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="button" class="btn btn-danger close btn-lg form-control" data-dismiss="modal" value="Cancel" >
                        </div>
                    </div>
                  </div>
                </div>
          </div>
    </div>
  </div>
  <?php
endforeach;
?>
  <script type="text/javascript">
    $(function($) {

      let account_id = $('#account_paid_from').val();

      payment_type();
      update_bank_balance(account_id);
      populate_edit_button($('#pay_to').val());
    });

    $('#payments_form_edit input[name="payment_type"]').change(function(event) {
      /* Act on the event */
      payment_type();
    });

    //update which payment type got selected
    function payment_type() {
      let valSelected = $('#payments_form_edit input[name="payment_type"]:checked').val();

        let supplier_id = '<?php echo $supplier_id; ?>';
        let payment_id = '<?php echo $payment_id; ?>';


      if(valSelected == 1 || supplier_id != 0) {
          $('#main_holder').removeClass('col-sm-7 col-md-7');
          $('#main_holder').addClass('col-sm-5 col-md-5');
          $('#pay_to_exp').css('display', 'none');
          $('#pay_to_exp').slideUp('slow');
          $('#holder').html('<?php if(substr($supplier_id, 0, 3) == 'ce_') {
            //customers
            echo '<select required="true" class="form-control" readonly="readonly" name="supplier_name" id="pay_to"><option value="'.$supplier_id.'">'.$this->db->get_where('customers', array('customer_id' => $customer_id))->row()->customer_name.'</option></select>'; } else { if($supplier_id != 0) {
                //suppliers
              echo '<select required="true" class="form-control" readonly="readonly" name="supplier_name" id="pay_to"><option value="'.$supplier_id.'">'.$this->db->get_where('suppliers', array('supplier_id' => $supplier_id))->row()->supplier_name.'</option></select>';

              } else {
                //outstanding debts
                echo '<select required="true" class="form-control" readonly="readonly" name="supplier_name" id="pay_to"><option value="de_'.$debt_id.'">'.$this->db->get_where('outstanding_debts', array('debt_id' => substr($debt_id, 3)))->row()->name.'</option></select>';
              }
            }  ?>');

            
            

          $('#payable_row').slideDown('slow');
          $('#po_code_row').slideDown('slow');
          $('#btnns').slideDown('slow');
          $('#pay_to_holder').removeClass('bg-danger');
          $('#pay_to_holder').addClass('bg-success');
        } else if(valSelected == 2 || supplier_id == 0) {

          $('#main_holder').removeClass('col-sm-5 col-md-5');
          $('#main_holder').addClass('col-sm-7 col-md-7');
          $('#pay_to').css('display', 'none');
          $('#pay_to').slideUp('slow');
          $('#payable_row').slideUp('slow');
          $('#po_code_row').slideUp('slow');
          $('#btnns').slideUp('slow');
          $('#holder').html('<input type="text" name="pay_to_exp" placeholder="Enter Expenditure" class="form-control" value="<?=$this->db->get_where('payment', array('payment_id' => $payment_id))->row()->expenditure_item;?>" id="pay_to_exp" required="required">');
          $('#pay_to_holder').removeClass('bg-success');
          $('#pay_to_holder').addClass('bg-danger');
        }

        $('#pay_to').change(function(event) {
          /* Act on the event */
          
          return false;
        });
        //update allocated account
        $.ajax({
            url: '<?php echo site_url('admin/account_allocation/') ?>' + valSelected + '/' + payment_id,
            type: 'POST',
            dataType: 'html',
            cache: false
            })
            .done(function(data) {
                $('#allocated_account').html(data);
            });
    }
    //get bank account balance
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
             $('#account_balance_payment_edit').val(number_format(response.balance, 2, '.', ','));
             $('#hidden_account_balance_payment_edit').val(response.balance);
          });
        } else {
          $('#account_balance_payment_edit').val('');
          $('#hidden_account_balance_payment_edit').val('');
        }

    }

    //check blances
    function check_bank_balance(amount) {
      let valSelected = $('#payments_form_edit input[name="payment_type"]:checked').val();
      let paid_from = $('#account_paid_from').val();
      let payable = Number($('#hidden_total_payable').val());
      let amount_paid = Number('<?php echo $payment['amount']; ?>');
      amount = Number(amount);

      if(valSelected == 1) {
          $.ajax({
              url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + paid_from,
              type: 'POST',
              dataType: 'json',
              cache: false
          })
          .done(function(bank_balance) {
            $('#hidden_account_balance_payment_edit').val(bank_balance.balance);
             if((amount - amount_paid) > bank_balance.balance) {

                $('#report_error').html('<strong style="color: red">Your account will be in red</strong>');
                $('#report_error').slideDown('slow');
                //$('input[name="amount_paid"]').attr('maxlength', _leng);
             } else if(payable == 0) {
                if(amount > payable && amount > amount_paid) {

                  $('#report_error').html('<strong style="color: red">Amount entered is more than amount owe.</strong>');
                  $('#report_error').slideDown('slow');
                  //$('input[name="amount_paid"]').attr('maxlength', _leng);
               } else {
                  $('#report_error').slideUp('slow');
               }
             } else if (payable > 0) {
            let total_payable = amount_paid + payable;
              if(amount > total_payable) {

                $('#report_error').html('<strong style="color: red">Amount entered is more than amount owe.</strong>');
                $('#report_error').slideDown('slow');
                //$('input[name="amount_paid"]').attr('maxlength', _leng);
             } else {
                $('#report_error').slideUp('slow');
             }
           } else {
                $('#report_error').slideUp('slow');
             }
          });
        } else {
          $.ajax({
              url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + paid_from,
              type: 'POST',
              dataType: 'json',
              cache: false
          })
          .done(function(bank_balance) {
            $('#hidden_account_balance_payment_edit').val(bank_balance.balance);
             if(amount > bank_balance.balance) {

                $('#report_error').html('<strong style="color: red">Your account will be in red</strong>');
                $('#report_error').slideDown('slow');
                //$('input[name="amount_paid"]').attr('maxlength', _leng);
             } else {
                $('#report_error').slideUp('slow');
             }
           });
        }
    }

    //populate the edit button with the selected supplier
    function populate_edit_button(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_purchases/edit_supplier/"); ?>' + id + '", "Edit Supplier")');
        let set_supplier_id = $('#supplier_name').val();
        let po_code = '<?php echo str_replace(' ', '_', $po_code); ?>';

        let currency = '<?php echo $currency; ?>';
        //send data via ajax

        if(id == '' || id == null) {
            $('#total_payable').val('No Supplier Selected');
          } else {

            if(isNaN(id)) {
              if(id.substr(0, 3) == 'de_') {

              id = id.substr(3);
                $.ajax({
                url: '<?php echo site_url('admin/get_payable/') ?>' + id + '/debt',
                type: 'POST',
                dataType: 'text',
                cache: false
                })
                .done(function(data) {
                    $('#total_payable').val(currency + ' ' + number_format(data, 2, '.', ','));
                    $('#hidden_total_payable').val(data);
                    $('#po_code_row').slideUp('slow');
                });

              } else {
                    //user decided to pay with cash for this creditor with negative balance
                    id = id.substr(3);

                    $.ajax({ //ajax to get the amount payable
                    url: '<?php echo site_url('admin/get_payable/') ?>' + id + '/negative_bal',
                    type: 'POST',
                    dataType: 'text',
                    cache: false
                    })
                    .done(function(data) {
                        $('#total_payable').val(currency + ' ' + number_format(data, 2, '.', ','));
                        $('#hidden_total_payable').val(data);
                    });


                    //ajax call to the get_po_codes function to get so_code actually
                    $.ajax({
                    url: '<?php echo site_url('admin/get_po_codes/') ?>' + id + '/negative_bal',
                    type: 'POST',
                    dataType: 'html',
                    cache: false
                    })
                    .done(function(data) {
                        $('#po_code_holder label').text('Pay For SO CODE');//change the text from PO CODE to SO CODE
                        $('#po_code').slideDown('slow');
                        //$('#po_code').html('<option value="">Choose Your Option</option>' + data);
                    });

              }

            } else {
             $.ajax({
            url: '<?php echo site_url('admin/get_payable/') ?>' + id + '/' + po_code,
            type: 'POST',
            dataType: 'text',
            cache: false
            })
            .done(function(data) {
                $('#total_payable').val(currency + ' ' + number_format(data, 2, '.', ','));
                $('#hidden_total_payable').val(data);
                $('#po_code_row').slideDown('slow');
            });
          }
           
        }

    }

    //Pay Payable or other payment Creation form submitted
  $('#payments_form_edit').submit(function(event) {
    /* Act on the event */
    event.preventDefault();


    showAjaxModal_confirm('Please wait... Processing payment', 'Loading');

    let form_data = $('#payments_form_edit').serialize();
    let selectedVal = $('#payments_form_edit input[name="payment_type"]:checked').val();

    let track_code = '<?php echo $track_code; ?>';
    let payment_id = '<?php echo $payment_id; ?>';

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/payments/update/') ?>' + selectedVal + '/' + payment_id + '/' + track_code,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {

        showAjaxModal_confirm(data.payment_type + ' updated Successfully.', 'Success');


        getImprestBalance();//update imprest balance

        setTimeout(() => {
          $('.close').click(); //window.location.reload();
        }, 3000);
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_pay_payable_update').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_pay_payable_update"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Make sure the amount you entered is valid and does not contain any alphabets or any other characters apart from \'dot (.)\'', 'Error');
    });
  });
  </script>