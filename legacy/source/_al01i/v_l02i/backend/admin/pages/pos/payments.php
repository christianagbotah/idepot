<?php
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;

$this->db->select('customer_id');
$this->db->distinct();
$this->db->where('amount_due >', 0);
$customer_add = $this->db->get('invoice');
$customers_array_add = $customer_add->result_array();

?>
<style type="text/css">
  input[name="amount_received"] {
    height: 50px !important;
    font-size: 40px !important;
    font-weight: bolder !important;
    letter-spacing: 2px !important;
  }

  input[name="account_balance"], input[name="amount_tendered"], input[name="change"], input[name="total_receivable"] {
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
echo form_open(site_url('admin/payments_received/create'),
  array('class' => 'form-groups-bordered', 'id' => 'payments_form', 'target' => '_top')); ?>
                    <div class="form-group row">
                      <div class="col-sm-6 col-md-6">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-info text-light">Customer:</div>
                              </div>
                              <select class="form-control select2" onchange="populate_edit_button_payment($(this).val())" name="customer_name" id="customer_name" required="true">
                                  <option value="">Select A Customer</option>
                                  <?php
foreach ($customers_array_add as $customer):

?>
                                  <option value="<?=$customer['customer_id'];?>" <?php if($param2 == $customer['customer_id']) echo 'selected'; ?>><?=$this->db->get_where('customers', array('customer_id' => $customer['customer_id']))->row()->customer_name;?></option>
                                  <?php
endforeach;
?>                            
                          
                              </select>
                          </div>
                      </div>

                      <div class="col-sm-1 col-md-1">
                        <!--<a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer'); clearModals()"><i class="fa fa-fw fa-plus"></i></a>-->

                      <a href="javascript:;" class="btn btn-success btn-sm" title="Edit" id="edit_button" ><i class="fa fa-fw fa-edit"></i></a></div>

                      <div class="col-sm-5 col-md-5">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-dark text-light">Payment Date:</div>
                              </div>
                              <input type="text" required="true" class="form-control datepicker" name="payment_date" data-format="dd-mm-yyyy"
                                  value="<?php echo date('d-m-Y'); ?>">
                          </div>
                      </div>
                  </div>

                  <div class="form-group row" id="invoice_code_holder">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('Pay for INVOICE CODE'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                        <select name="invoice_code" id="invoice_code_payment" class="form-control select2" required="required">
                          <option value="">Select Customer First...</option>
                          </select>

                          <div class="form-group row">
                            <div class="col-sm-4 col-md-4 col-xs-4"></div>
                            <div class="col-sm-8 col-md-8 col-xs-8 text-black-50 text-right" id="invoice_date_holder_payment">
                              <p>Invoice Date:</p>
                            </div>
                          </div>

                        </div>


                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label">SO CODE</label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="so_code" id="so_code_payment" class="form-control" value="" readonly="readonly">
                        </div>
                    </div>

                      <?php

                            $accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
                        ?>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('deposit_account'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                          <select name="deposit_account[]" multiple id="deposit_account" disabled="disabled" onchange="get_account_field_payment($(this).val())" class="form-control select2" required="required" style="height: 45px; font-size: 16px !important;">
                              <?php foreach ($accounts as $acc): ?>
                                  <option value="<?=$acc['account_id']?>"><?=$acc['name']?></option>
                              <?php endforeach;?>
                          </select>

                        </div>
                    </div>
                    
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                          <div class="row grid grid-cols-1 gap-4 grid-flow-col mt-5" id="account_method_holder_payment"></div>
                        </div>
                    </div>
                    

                    <input type="hidden"  name="account_balance" id="account_balance" class="form-control form-control-plaintext" readonly="readonly">

                              <input type="hidden" name="hidden_account_balance" id="hidden_account_balance" value="">

                    <div class="form-group row" id="payable_row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label" id="recevable_label"><?php echo get_phrase('total_receivable'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="text" class="form-control" name="total_receivable" id="total_receivable_payment" value="" readonly="readonly">

                            <input type="hidden" class="form-control" name="hidden_total_receivable" id="hidden_total_receivable_payment" value="">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_tendered'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" min="1" onkeyup="update_change()" name="amount_tendered" id="amount_tendered" class="form-control" required="required" value="">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_received'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                          <div id="report_error_balance" style="display: none"></div>
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" min="1" onkeyup="check_bank_balance($(this).val())" name="amount_received" id="amount_received" readonly class="form-control" required="required" value="">

                              <input type="hidden" name="prev_amount_received" id="prev_amount_received" value="">
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
                              <input type="text" name="change" id="change" class="form-control" value="" readonly="readonly">
                            </div>
                        </div>
                    </div>
                    
                    <!--<div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('reference_number'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="reference_number" class="form-control" value="">
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
                              <textarea  name="journal_memo" class="form-control" cols="50"></textarea>
                        </div>
                    </div>

                    <!--<div class="form-group row ml-1" title="select the allocated account for this transaction">Account Allocated To</div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('allocated_account'); ?></label>
                        <div class="col-sm-5 col-md-5 col-xs-5">
                            <select name="allocated_account" id="allocated_account" class="form-control" required="required">

                            </select>
                        </div><a href="javascript:;" style="text-decoration: none" class="col-sm-1 col-md-1 col-xs-1 text-sm-center pt-2 text-light bg-success">CR</a>
                    </div>-->
                    <div class="form-group row">
                      <div class="col-sm-12 col-md-12 pull-right">
                          <label class="control-label col-md-4 col-sm-4"><strong>PRINT RECEIPT?</strong></label>  

                          <div class="switch-button  showcase-switch-button">
                          <input id="print_receipt"  type="checkbox"  value="1" checked name="print_receipt" onchange="value_change(this.value)">
                          <label for="print_receipt" ></label>   <strong style="font-size: 22px;" id="yes_no">YES</strong>                               
                          </div> 
                          <hr><hr>

                          <!--CHOOSE PRINTER TO USE-->
                          
                          <div class="col-sm-12 col-md-12 printers_holder" style="text-align: right">
                            <label class="control-label col-md-12 col-sm-12"><strong>SELECT PRINTER FOR THIS TASK</strong></label><hr>

                            <div class="col-sm-12 col-md-12">   
                                <div class="form-check-inline">
                                  <label class="form-check-label">
                                    <input type="radio" class="form-check-input" checked value="1" id="thermal" name="printer" required><img src="<?php echo base_url('uploads/printers/thermal-printer.png') ?>" width="50" height="50" /> Thermal
                                  </label>
                                </div>

                                <div class="form-check-inline" style="text-align: right">
                                    <label class="form-check-label">
                                      <input type="radio" class="form-check-input" value="0" id="normal" name="printer" required><img src="<?php echo base_url('uploads/printers/normal-printer.png') ?>" width="50" height="50" /> Normal
                                    </label>
                                </div>
                            </div>
                          </div>             
                      </div>

                    </div>

                    <div class="col-sm-4 col-md-4 col-xs-12">
                            <input type="submit" class="btn btn-info btn-lg form-control"
                                value="Take Payment" >
                        </div>
                  </form>
                  </div>
                </div>
          </div>
    </div>
  </div>

<script src="<?php echo base_url('assets/js/neon-custom.js');?>"></script>
  <script type="text/javascript">

    $(document).ready(function($) {

      //these variables are used on the payments page
      window.oldIdArrayPayment =  [];
      window.paymentMethodsIdsPayment = [];

      populate_edit_button_payment($('#customer_name').val());
      account_allocation();
     // b_balance();
    });
    

     function value_change(val) {
       let print_receipt = $('#print_receipt').filter(':checked').length;
       if(print_receipt > 0) {
            $('#print_receipt').val(1);
            $('#yes_no').text('YES');
            $('.printers_holder').slideDown('slow');
            $('#yes_no').css('color', '#000000');
       } else {
            $('#print_receipt').val(0);
            $('#yes_no').text('NO');
            $('.printers_holder').slideUp('slow');
            $('#yes_no').css('color', '#b3afaf');
       }
    }

    //close earlier modals
    function clearModals() {
      $('.close').click();
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
    function update_bank_balance2(id) {

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
      let receivable = Number($('#hidden_total_receivable_payment').val());
      let amount_received = Number($('#prev_amount_received').val());
      let amount_tendered = Number($('#amount_tendered').val());
      amount = Number(amount);

      let change_amount = Number(amount_tendered - amount);

      $('#change').val(number_format(change_amount, 2, '.', ','));//change here

      if(receivable == 0) {
        if(amount > receivable && amount > amount_received) {

          $('#report_error_balance').html('<strong style="color: red">Amount entered is more than the amount this customer owes.</strong>');
          $('#report_error_balance').slideDown('slow');
          //$('input[name="amount_received"]').attr('maxlength', _leng);
        } else {
          $('#report_error_balance').slideUp('slow');
        }

      } else if (receivable > 0) {

      let total_receivable = Number(amount_received) + Number(receivable);

        if(amount > total_receivable) {
          //alert(total_receivable);
          $('#report_error_balance').html('<strong style="color: red">Amount entered is more than the amount this customer owes.</strong>');
          $('#report_error_balance').slideDown('slow');
          //$('input[name="amount_received"]').attr('maxlength', _leng);
        } else {
          $('#report_error_balance').slideUp('slow');
        }
      }else {
        $('#report_error_balance').slideUp('slow');
      }
    }
    //populate the edit button with the selected supplier
    function populate_edit_button_payment(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_sales/edit_customer/"); ?>' + id + '", "Edit Customer"); clearModals()');

        let currency = '<?php echo $currency; ?>';
        //send data via ajax
        if(id == '' || id == null) {
            $('#total_receivable_payment').val('No Customer Selected');
            $('#deposit_account').attr('disabled', 'disabled');
          } else {

            $('#deposit_account').removeAttr('disabled');
            
            $.ajax({
            url: '<?php echo site_url('admin/get_receivable/') ?>' + id,
            type: 'POST',
            dataType: 'json',
            cache: false
            })
            .done(function(data) {

                $('#total_receivable_payment').val(currency + ' ' + number_format(data.balance_due, 2, '.', ','));
                $('#hidden_total_receivable_payment').val(data.balance_due);
                $('#prev_amount_received').val(data.prev_amount_received);
            });

            //ajax call to the get_invoice_codes function
            $.ajax({
            url: '<?php echo site_url('admin/get_inv_codes/') ?>' + id,
            type: 'POST',
            dataType: 'html',
            cache: false
            })
            .done(function(data) {

                if(data == 'Not') {
                  alert('No data found!');
                } else {
                  $('#invoice_code_payment').html('<option value="">Choose Your Option</option><option value="general">General payment</option>' + data);
                }
            });
        }

    }

    $('#invoice_code_payment').change(function(event) {

      let currency = '<?php echo $currency; ?>';
      let inv_code_value = $('#invoice_code_payment').val();
      let customer_id = $('#customer_name').val();
      let inv_code_value_raw = inv_code_value;

      if(inv_code_value != '') {
        inv_code_value = inv_code_value.replace(/ /g, '_');

          //a specific invoice code was selected
          $.ajax({
          url: '<?php echo site_url('admin/get_receivable_per_inv_code/') ?>' + customer_id + '/' + inv_code_value,
          type: 'POST',
          dataType: 'json',
          cache: false
          })
          .done(function(data) {

            if(inv_code_value == 'general') {
              //use decides to do general payment
              $('#recevable_label').html('Total Receivable for <strong>' + inv_code_value_raw + ' payment</strong>');
              $('#total_receivable_payment').val(currency + ' ' + number_format(data.amount_due, 2, '.', ','));
              $('#hidden_total_receivable_payment').val(data.amount_due);
              $('#prev_amount_received').val(data.prev_amount_received);
              $('#so_code_payment').val('');
              $('#invoice_date_holder_payment').html('<p>Invoice Date:</p>');
              
            } else {

              $('#recevable_label').html('Total Receivable for <strong>' + inv_code_value_raw + '</strong>');
              $('#total_receivable_payment').val(currency + ' ' + number_format(data.amount_due, 2, '.', ','));
              $('#hidden_total_receivable_payment').val(data.amount_due);
              $('#prev_amount_received').val(data.prev_amount_received);
              $('#so_code_payment').val(data.so_code);
              $('#invoice_date_holder_payment').html('<p>Invoice Date: ' + data.invoice_date + '</p>');
            }
          });
        
      } else {
        $.ajax({
        url: '<?php echo site_url('admin/get_receivable/') ?>' + customer_id,
        type: 'POST',
        dataType: 'json',
        cache: false
        })
        .done(function(data) {
            $('#so_code_payment').val('');
            $('#recevable_label').text('Total Receivable');
            $('#total_receivable_payment').val(currency + ' ' + number_format(data.balance_due, 2, '.', ','));
            $('#hidden_total_receivable_payment').val(data.balance_due);
            $('#prev_amount_received').val(data.prev_amount_received);
            $('#invoice_date_holder_payment').html('<p>Invoice Date:</p>');
        });
      }
    });

    //Pay Payable or other payment Creation form submitted
  $('#payments_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    let conf = confirm('You are about to receive payment from a customer. Please are you sure the amount you entered is the correct figure? This kind of operation is irrevokable! You will not be able to edit this transaction after it has been successful. If you are not sure, kindly cancel it and make the necessary corrections before proceeding. However, if you are certain, then click on the "OK" button and let\'s go.');

    if(conf == true) {

      showAjaxModal_confirm('Please wait... Processing payment', 'Loading');

      //go ahead
      let form_data = new FormData(this);

      form_data.append('paymentMethodsIdsPayment', paymentMethodsIdsPayment);

      
      //send data via ajax  
      $.ajax({
        url: '<?php echo site_url('admin/payments_received/create') ?>',
        type: 'POST',
        dataType: 'json',
        data: form_data,
        contentType: false,
        processData: false,
        cache: false
      })
      .done(function(data) {
        /*alert(data.test);
        return;*/
       // $('#loading .close').click(); 
        if(data.success == true) {
          
          $('.close').click();

          if(data.print_receipt == 1) {
            showAjaxModal_confirm('Payment received Successfully. <br><br><em>Please wait while we redirect you to the receipt page for printing...</em>', 'Loading');

            setTimeout(() => {
              $('.close').click(); 
              $('.fa-close').click(); 

              //loading receipt page
              $.ajax({
                url: '<?php echo site_url('admin/receipt/') ?>' + data.receipt_code + '/' + data.customer_id + '/' + data.date_time + '/' + data.printer + '/pos',
                type: 'POST',
                dataType: 'html',

              })
              .done(function(response) {
                $('.close').click();
                showAjaxModal_receipt('<?php echo site_url('modal/popup_pos/receipt_modal/'); ?>', response, 'Print Receipt');
               // $('#receipt_holder').html(response);
              });
              
            }, 2000); 

          } else {

           /* $('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');*/

              //getMainPage();

              

            showAjaxModal_confirm('Payment received Successfully.', 'Success');

            setTimeout(() => {
              $('.close').click(); 

            }, 2000);

            
          }
          
        }  else {
          
          $(function() {          
            $.each(data, function(index, val) {
            $('#list_err_receivable_create').append('<li>' + val + '</li>');
            });
          });

          /*
          let counter = data.total_receivable;
          counter = counter.substr(0, 14);

          if(size == 1 && counter == 'You are taking') {
            //$('.close').click();
            showAjaxModal_overpayment(size + '<ul id="list_err_receivable_create"></ul>');
          } else {*/
            //$('.close').click();
            showAjaxModal_confirm('<ul id="list_err_receivable_create"></ul>', 'Error');
          //}
          
        }
      })
      .fail(function(err) {
          showAjaxModal_confirm(err.responseText, 'Error');
      });

    } else {

      //reject
      return false;

    }
  });


  //get bank account balance
  
    function get_account_field_payment(idArray) {

      oldIdArrayPayment = paymentMethodsIdsPayment;   

        if(idArray != '') {
          paymentMethodsIdsPayment = idArray;

            $.ajax({
              url: '<?= site_url('admin/get_account_field_payment/') ?>',
              type: 'post',
              data: {'idArray[]': idArray, 'oldIdArray[]': oldIdArrayPayment},
              dataType: 'html',
              cache: false
            })
            .done(function(response) {
              $('#account_method_holder_payment').html(response);
            })
            .fail(function(err) {

            })
        } else {

          $('#account_method_holder_payment').html('<div class="flex items-center p-4 mb-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800" role="alert"><svg class="flex-shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/></svg><span class="sr-only">Info</span><div class="font-bold text-xl"><span>Error:</span> No account found!</div></div>');
            
        }
    }


    //update amount paid from the payment method/account paid to
    function update_amount_paid_payment(amount) {
      let totalAmountReceived = 0;

      for(let i in paymentMethodsIdsPayment) {
        let eachAmountReceived = Number($('#method_amount_payment_' + paymentMethodsIdsPayment[i]).val());
        totalAmountReceived += eachAmountReceived;
      }

      $('#amount_received').val(totalAmountReceived);
      

      //we update the amount tendered automatically if user didn't enter anything
      $('#amount_tendered').val(totalAmountReceived);

      check_bank_balance(totalAmountReceived);
 
    }

  </script>
