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
?>
<div class="row" id="add_payment_top">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-success">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('payments_and_purchases'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
echo form_open(site_url('admin/payments/create'),
	array('class' => 'form-groups-bordered', 'id' => 'payments_form', 'target' => '_top')); ?>
                    <div class="form-group row">
                      <div class="input-group">
                        <div class="input-group-prepend">
                          <div class="input-group-text bg-danger text-light">Type Of Payment</div>
                        </div>
                        <div class="m-lg-3">
                          <div class="form-check-inline">
                          <label class="form-check-label">
                            <input type="radio" class="form-check-input" value="1" id="to_supplier" name="payment_type" required> To A supplier
                          </label>
                        </div>
                        <div class="form-check-inline">
                          <label class="form-check-label">
                            <input type="radio" class="form-check-input" checked="checked" value="2" id="to_expenditure" name="payment_type" required> An Expenditure
                          </label>
                          </div>
                        </div>
                        </div>
                    </div>

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

                      <div class="col-sm-4 col-md-4">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-dark text-light">Date:</div>
                              </div>
                              <input type="text" required="true" class="form-control datepicker" name="payment_date" data-format="dd-mm-yyyy"
                                  value="<?php echo date('d-m-Y'); ?>">
                          </div>
                      </div>
                  </div>


                    <div class="form-group row" id="po_code_holder">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('Pay for PO_Code'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                        <select name="po_code" id="po_code" class="form-control select2">
                          </select>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_paid_from'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                        <select name="account_paid_from" id="account_paid_from" class="form-control select2" onchange="update_bank_balance($(this).val())" required="required">
                              <option value="">Select Account</option>
                              
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
                              <input type="text"  name="account_balance_payment" id="account_balance_payment" class="form-control form-control-plaintext" readonly="readonly">

                              <input type="hidden" name="hidden_account_balance_payment" id="hidden_account_balance_payment" value="">
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
                    <div class="form-group row" id="payable_row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label" id="payable_label"><?php echo get_phrase('total_payable'); ?></label>
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
                              <input type="currency" min="1" onkeyup="check_bank_balance($(this).val())" name="amount_paid" class="form-control" required="required" value="">
                            </div>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('reference_number'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="reference_number" class="form-control" value="">
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
                              <textarea  name="journal_memo" class="form-control" cols="50"></textarea>
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
                                value="Make Payment" >
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

  <script type="text/javascript">
    $(document).ready(function($) {
      payment_type();
      b_balance();
      populate_edit_button('<?=$param2; ?>');
    });

    $('#payments_form input[name="payment_type"]').change(function(event) {
      /* Act on the event */
      payment_type();
    });

    //update which payment type got selected
    function payment_type() {


      $('#holder').html('<center><small>Updating...Please wait <i class="fa fa-spinner fa-pulse"></i></small></center>');

      let valSelected = $('#payments_form input[name="payment_type"]:checked').val();

      $.ajax({
        url: '<?php echo site_url('admin/getPaymentAccount/') ?>' + valSelected,
        type: 'post',
        dataType: 'html',
        //cache: false,
      })
      .done(function(response) {

        $('#account_paid_from').html(response);

      });


      if(valSelected == 1) {
          $('#main_holder').removeClass('col-sm-7 col-md-7');
          $('#main_holder').addClass('col-sm-6 col-md-6');
          $('#pay_to_exp').css('display', 'none');
          $('#pay_to_exp').slideUp('slow');

          $.ajax({
            url: '<?php echo site_url('admin/getAllCreditors') ?>',
            type: 'post',
            dataType: 'html',
            //cache: false,
          })
          .done(function(response) {
            $('#holder').html(response);

            $('#payable_row').slideDown('slow');
            $('#po_code_holder').attr('required', 'required');
            $('#po_code_holder').slideDown('slow');
            $('#btnns').slideDown('slow');
            $('#pay_to_holder').removeClass('bg-danger');
            $('#pay_to_holder').addClass('bg-success');

          })

          
          
        } else if(valSelected == 2) {

          $('#main_holder').removeClass('col-sm-6 col-md-6');
          $('#main_holder').addClass('col-sm-7 col-md-7');
          $('#pay_to').removeAttr('required');
          $('#pay_to').css('display', 'none');
          $('#pay_to').slideUp('slow');
          $('#payable_row').slideUp('slow');
          $('#po_code_holder').removeAttr('required');
          $('#po_code_holder').css('display', 'none');
          $('#po_code_holder').slideUp('slow');
          $('#btnns').slideUp('slow');
          $('#holder').html('<input type="text" name="pay_to_exp" placeholder="Enter Expenditure" class="form-control" value="" id="pay_to_exp" required="required">');
          $('#pay_to_holder').removeClass('bg-success');
          $('#pay_to_holder').addClass('bg-danger');
        }

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
             $('#account_balance_payment').val(number_format(response.balance, 2, '.', ','));
             $('#hidden_account_balance_payment').val(response.balance);
          });
        } else {
          $('#account_balance_payment').val('');
          $('#hidden_account_balance_payment').val('');
        }

    }


//check blances
//check blances
    function b_balance() {
          let paid_from = $('#paid_from').val();

          $.ajax({
              url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + paid_from,
              type: 'POST',
              dataType: 'json',
              cache: false
          })
          .done(function(bank_balance) {
                $('#hidden_account_balance_payment').val(bank_balance.balance);

          });
        }

    function check_bank_balance(amount) {
      let valSelected = $('#payments_form input[name="payment_type"]:checked').val();
      let paid_from = $('#account_paid_from').val();
      let payable = $('#hidden_total_payable').val();
      let amount_paid = '<?php echo $payment['amount']; ?>';
      amount = Number(amount);

      if(valSelected == 1) {
        $.ajax({
          url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + paid_from,
          type: 'POST',
          dataType: 'json',
          cache: false
        })
        .done(function(bank_balance) {
          $('#hidden_account_balance_payment').val(bank_balance.balance);
           if(amount > bank_balance.balance) {

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
            let total_payable = Number(amount_paid) + Number(payable);
              if(amount > total_payable) {

                $('#report_error').html('<strong style="color: red">Amount entered is more than amount owe.</strong>');
                $('#report_error').slideDown('slow');
                //$('input[name="amount_paid"]').attr('maxlength', _leng);
             } else {
                $('#report_error').slideUp('slow');
             }
           }else {
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
            $('#hidden_account_balance_payment').val(bank_balance.balance);
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
      //check if any of the other creditors was selected
      let currency = '<?php echo $currency; ?>';
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
                $('#po_code').slideUp('slow');
            });

        } else {
          //ajax call to the get_po_codes function
          $.ajax({
          url: '<?php echo site_url('admin/filter_values/') ?>' + id,
          type: 'POST',
          dataType: 'json',
          cache: false
          })
          .done(function(data) {
              if(data.negative == true) {
                showAjaxModal_cash_good('<?php echo site_url('modal/popup_sales/cash_goods/'); ?>', data.customer_id);

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
                    $('#po_code').html('<option value="">Choose Your Option</option>' + data);
                });

              } else {//customers we are owing in terms of goods
                $('.close').click(); //close the current modal
                showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/payment_with_goods/'); ?>' + data.so_code + '/' + data.customer_id, 'Payment With Goods');
                }
          });
        }
        
      } else {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_purchases/edit_supplier/"); ?>' + id + '", "Edit Supplier")');
        let set_supplier_id = $('#pay_to').val();

        //send data via ajax
        if(id == '' || id == null) {
            $('#total_payable').val('No Creditor Selected');
          } else {
            $.ajax({
            url: '<?php echo site_url('admin/get_payable/') ?>' + id,
            type: 'POST',
            dataType: 'text',
            cache: false
            })
            .done(function(data) {
                $('#total_payable').val(currency + ' ' + number_format(data, 2, '.', ','));
                $('#hidden_total_payable').val(data);
            });

            //ajax call to the get_po_codes function
            $.ajax({
            url: '<?php echo site_url('admin/get_po_codes/') ?>' + id,
            type: 'POST',
            dataType: 'html',
            cache: false
            })
            .done(function(data) {
                $('#po_code').slideDown('slow');
                $('#po_code').html('<option value="">Choose Your Option</option>' + data);
            });
        }
      }
    }

    $('#po_code').change(function(event) {
      let currency = '<?php echo $currency; ?>';
      let po_code_value = $('#po_code').val();
      let supplier_id = $('#pay_to').val();
      let po_code_value_raw = po_code_value;

      if(po_code_value != '') {
        po_code_value = po_code_value.replace(/ /g, '_');

        //is it for negative balance customer or not
        if(supplier_id.substr(0, 3) == 'ce_') {
          let customer_id = supplier_id.substr(3);
          
          $.ajax({
          url: '<?php echo site_url('admin/get_payable_per_so_code/') ?>' + customer_id + '/' + po_code_value,
          type: 'POST',
          dataType: 'text',
          cache: false
          })
          .done(function(data) {
              $('#payable_label').html('Total Payable for <strong>' + po_code_value_raw + '</strong>');
              $('#total_payable').val(currency + ' ' + number_format(data, 2, '.', ','));
              $('#hidden_total_payable').val(data);
          });


        } else {
          $.ajax({
          url: '<?php echo site_url('admin/get_payable_per_po_code/') ?>' + supplier_id + '/' + po_code_value,
          type: 'POST',
          dataType: 'text',
          cache: false
          })
          .done(function(data) {
              $('#payable_label').html('Total Payable for <strong>' + po_code_value_raw + '</strong>');
              $('#total_payable').val(currency + ' ' + number_format(data, 2, '.', ','));
              $('#hidden_total_payable').val(data);
          });
        }
        
      } else {
        $.ajax({
        url: '<?php echo site_url('admin/get_payable/') ?>' + supplier_id,
        type: 'POST',
        dataType: 'text',
        cache: false
        })
        .done(function(data) {
            $('#payable_label').html('Total Payable');
            $('#total_payable').val(currency + ' ' + number_format(data, 2, '.', ','));
            $('#hidden_total_payable').val(data);
        });
      }
    });

    //Pay Payable or other payment Creation form submitted
  $('#payments_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    //Scroll to the top
    $('html, .modal').animate({
        scrollTop: ($('#add_payment_top').offset().top )
    }, 1500);

    showAjaxModal_confirm('Please wait... Processing payment', 'Loading');

    let form_data = $('#payments_form').serialize();
    let selectedVal = $('#payments_form input[name="payment_type"]:checked').val();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/payments/create/') ?>' + selectedVal,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {

        showAjaxModal_confirm(data.payment_type + ' made Successfully.', 'Success');

        //reset form
        $('#payments_form')[0].reset(); //reset other input fields
        $('#payments_form select option:first-child').prop('selected', true).trigger('change');//reset all select elements

        //getImprestBalance();//update imprest balance

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 3000); 

      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_pay_payable_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_pay_payable_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Make sure the amount you entered is valid and does not contain any alphabets or any other characters apart from \'dot (.)\'', 'Error');
    });
  });
  </script>