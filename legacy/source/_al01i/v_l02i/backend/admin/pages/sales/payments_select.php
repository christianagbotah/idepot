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

$customer_add = $this->db->get('customers');
$customers_array_add = $customer_add->result_array();

$invoice_code = append_words($param2, '_');


if ($param3 == '') {
	$invoice_array = $this->db->get_where('invoice', array('invoice_code' => $invoice_code))->result_array();
} else {
	$invoice_array = $this->db->get_where('invoice', array('invoice_code' => $invoice_code, 'invoice_id' => $param3))->result_array();
}

foreach ($invoice_array as $invoice):

	$total_receivable = $this->db
		->select_sum('amount_due')
		->where('customer_id', $invoice['customer_id'])
		->where('invoice_code', $invoice_code)
		->get('invoice')->row()->amount_due;

    $so_code = $this->db->get_where('invoice', array('invoice_code' => $invoice_code, 'customer_id' => $invoice['customer_id']))->row()->so_code;
	?>
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
		array('class' => 'form-groups-bordered', 'id' => 'payments_form_select', 'target' => '_top')); ?>
																	    <div class="form-group row">
																	    <div class="col-sm-5 col-md-5">
																	    <div class="input-group">
																	    <div class="input-group-prepend">
																	        <div class="input-group-text bg-info text-light">Customer:</div>
																	    </div>
																	    <select required="true" class="form-control select2" onchange="populate_edit_button($(this).val())" name="customer_name" id="customer_name_select">
																	        <option value="">Select A Customer</option>
																	        <?php
	foreach ($customers_array_add as $customer):

	?>
																	        <option value="<?=$customer['customer_id'];?>" <?php if ($customer['customer_id'] == $invoice['customer_id']) {echo 'selected';}?>><?=$customer['customer_name'];?></option>
																	        <?php
endforeach;
?>
                              </select>
                          </div>
                      </div>

                      <div class="col-sm-2 col-md-2"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer'); clearModals()"><i class="fa fa-fw fa-plus"></i></a>

                      <a href="javascript:;" class="btn btn-success btn-sm" title="Edit" id="edit_button_select" ><i class="fa fa-fw fa-edit"></i></a></div>

                      <div class="col-sm-5 col-md-5">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-dark text-light">Payment Date:</div>
                              </div>
                              <input type="text" required="true" class="form-control datepicker" name="payment_date" data-format="dd-mm-yyyy"
                                  value="<?php echo $invoice['date']; ?>">
                          </div>
                      </div>
                  </div>

                  <div class="form-group row" id="invoice_code_holder_select">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('Pay for INVOICE CODE'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                        <select name="invoice_code" id="invoice_code_select" onchange="receivable_update()" class="form-control select2" required="required">
                          <option value="">Select Customer First...</option>
                          </select>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label">SO CODE</label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="so_code" id="so_code_select" class="form-control" value="<?=$so_code; ?>" readonly="readonly">
                        </div>
                    </div>

                    <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1))->result_array();
?>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('deposit_account'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                        <select name="deposit_account" id="deposit_account_select" class="form-control select2" onchange="update_bank_balance($(this).val())" required="required">
                              <option value="">Select Account</option>
                              <?php foreach ($accounts as $acc): ?>
                                  <option value="<?=$acc['account_id'];?>" <?php if ($invoice['account_id'] == $acc['account_id']) {echo 'selected';}?>><?=$acc['name'];?></option>
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
                              <input type="text"  name="account_balance" id="account_balance_select" class="form-control form-control-plaintext" readonly="readonly">

                              <input type="hidden" name="hidden_account_balance" id="hidden_account_balance_select" value="">
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
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label" id="receivable_label_select"><?php echo get_phrase('total_receivable'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="text" class="form-control" name="" id="total_receivable_select" value="<?=$total_receivable;?>" readonly="readonly">

                            <input type="hidden" class="form-control" name="hidden_total_receivable" id="hidden_total_receivable_select" value="<?=$total_receivable;?>">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_tendered'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" min="1" onkeyup="update_change()" name="amount_tendered" id="amount_tendered_select" class="form-control" required="required" value="">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_received'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                          <div id="report_error_select" style="display: none"></div>
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" min="1" onkeyup="check_bank_balance($(this).val())" name="amount_received" id="amount_received_select" class="form-control" required="required" value="">
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
                              <input type="text" name="change" id="change_select" class="form-control" value="" readonly="readonly">
                            </div>
                        </div>
                    </div>

                    <!--
                    <div class="form-group row">
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

                    <!--
                    <hr>
                    <div class="form-group row ml-1" title="select the allocated account for this transaction">Account Allocated To</div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php //echo get_phrase('allocated_account'); ?></label>
                        <div class="col-sm-5 col-md-5 col-xs-5">
                            <select name="allocated_account" id="allocated_account_select" class="form-control" required="required">

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
                    <div class="form-group row">
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="submit" class="btn btn-info btn-lg form-control"
                                value="Take Payment" >
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
    $(document).ready(function($) {
      account_allocation();
      b_balance();
      populate_edit_button('<?=$invoice['customer_id'];?>', '<?=$invoice_code;?>');
      update_bank_balance($('#deposit_account_select').val());

      //so_code_update();
     // receivable_update();
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
                $('#allocated_account_select').html(data);
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
             $('#account_balance_select').val(number_format(response.balance, 2, '.', ','));
             $('#hidden_account_balance_select').val(response.balance);
          });
        } else {
          $('#account_balance_select').val('');
          $('#hidden_account_balance_select').val('');
        }

    }


//check blances
//check blances
    function b_balance() {
          let deposit_account = $('#deposit_account_select').val();

          $.ajax({
              url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + deposit_account,
              type: 'POST',
              dataType: 'json',
              cache: false
          })
          .done(function(bank_balance) {
                $('#hidden_account_balance_select').val(bank_balance.balance);

          });
        }


    function update_change() {
      let amount_tendered = Number($('#amount_tendered_select').val());
      let amount_received = Number($('#amount_received_select').val());
      $('#change_select').val(number_format(amount_tendered - amount_received, 2, '.', ','));//change here
    }

    function check_bank_balance(amount) {
      let receivable = $('#hidden_total_receivable_select').val();
      let amount_tendered = Number($('#amount_tendered_select').val());
      amount = Number(amount);

      $('#change_select').val(number_format(amount_tendered - amount, 2, '.', ','));//change here


              if(amount > receivable) {

                $('#report_error_select').html('<strong style="color: red">Amount entered is more than the amount this customer owes.</strong>');
                $('#report_error_select').slideDown('slow');
                //$('input[name="amount_received"]').attr('maxlength', _leng);
             } else {
                $('#report_error_select').slideUp('slow');
             }
    }
    //populate the edit button with the selected supplier
    function populate_edit_button(id, invoice_code) {
        //populate the edit button
        $('#edit_button_select').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_sales/edit_customer/"); ?>' + id + '", "Edit Customer"); clearModals()');


        let currency = '<?php echo $currency; ?>';
        //send data via ajax
        if(id == '' || id == null) {
            $('#total_receivable_select').val('No Customer Selected');
          } else {
            $.ajax({
            url: '<?php echo site_url('admin/get_receivable/') ?>' + id + '/' + invoice_code,
            type: 'POST',
            dataType: 'json',
            cache: false
            })
            .done(function(data) {
                $('#total_receivable_select').val(currency + ' ' + number_format(data.balance_due, 2, '.', ','));
                $('#hidden_total_receivable_select').val(data.balance_due);

                if(invoice_code == undefined) {
                  $('#receivable_label_select').html('Total Receivable');
                } else {
                  $('#receivable_label_select').html('Total Receivable for <strong>' + invoice_code + '</strong>');
                }
            });

            //ajax call to the get_invoice_codes function
            $.ajax({
            url: '<?php echo site_url('admin/get_inv_codes/') ?>' + id + '/'+ invoice_code,
            type: 'POST',
            dataType: 'html',
            cache: false
            })
            .done(function(data) {
                if(data == 'Not') {
                  alert('No data found!');
                } else {
                  $('#invoice_code_select').html('<option value="">Choose Your Option</option><option value="general">General Payment</option>' + data);
                }

            });
        }

    }

    function receivable_update() {
      let currency = '<?php echo $currency; ?>';
      let inv_code_value = $('#invoice_code_select').val();
      let customer_id = $('#customer_name_select').val();
      let inv_code_value_raw = inv_code_value;



      if(inv_code_value != '') {
        inv_code_value = inv_code_value.replace(/ /g, '_');

        if(inv_code_value == 'general') {
          //user decides to do general payment
          $('#receivable_label_select').html('Total Receivable for <strong>' + inv_code_value_raw + ' payment</strong>');
          $('#so_code_select').val('');

        } else {
          //a specific invoice code was selected
          $.ajax({
          url: '<?php echo site_url('admin/get_receivable_per_inv_code/') ?>' + customer_id + '/' + inv_code_value,
          type: 'POST',
          dataType: 'json',
          cache: false
          })
          .done(function(data) {

              $('#receivable_label_select').html('Total Receivable for <strong>' + inv_code_value_raw + '</strong>');
              $('#total_receivable_select').val(currency + ' ' + number_format(data.amount_due, 2, '.', ','));
              $('#hidden_total_receivable_select').val(data.amount_due);
              $('#so_code_select').val(data.so_code);
          });

        }
      } else {
        $.ajax({
        url: '<?php echo site_url('admin/get_receivable/') ?>' + customer_id,
        type: 'POST',
        dataType: 'text',
        cache: false
        })
        .done(function(data) {
            $('#so_code_select').val('');
            $('#receivable_label_select').text('Total Receivable');
            $('#total_receivable_select').val(currency + ' ' + number_format(data.balance_due, 2, '.', ','));
            $('#hidden_total_receivable_select').val(data.balance_due);
            
        });
      }
    }

    function so_code_update() {
      let currency = '<?php echo $currency; ?>';
      let inv_code_value = $('#invoice_code_select').val();
      let customer_id = $('#customer_name_select').val();
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
            $('#so_code_select').val(data.so_code);
        });
      } else {
        $.ajax({
        url: '<?php echo site_url('admin/get_receivable/') ?>' + customer_id,
        type: 'POST',
        dataType: 'text',
        cache: false
        })
        .done(function(data) {
            $('#so_code_select').val('');
        });
      }
    }


    //Pay Payable or other payment Creation form submitted
  $('#payments_form_select').submit(function(event) {
    /* Act on the event */
    event.preventDefault();


    let form_data = $('#payments_form_select').serialize();

    $.ajax({
      url: '<?php echo site_url('admin/payments_received/create') ?>',
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      $('#loading .close').click(); 
      if(data.success == true) {
        $('.close').click();

        if(data.print_receipt == 1) {
          showAjaxModal_confirm(data.payment_type + ' received Successfully. <br><br><em>Please wait while we redirect you to the receipt page for printing...</em>', 'Loading');

          setTimeout(() => {
            $('#modal_confirm .close').click(); 

            //loading receipt page
            $.ajax({
              url: '<?php echo site_url('admin/receipt/') ?>' + data.receipt_code + '/' + data.invoice_code + '/' + data.customer_id + '/' + data.payment_id + '/' + data.date_time + '/' + data.so_code + '/' + data.printer,
              type: 'POST',
              dataType: 'html',

            })
            .done(function(response) {

              showAjaxModal_receipt('<?php echo site_url('modal/popup_sales/receipt_modal/'); ?>', response, 'Print Receipt');
             // $('#receipt_holder').html(response);
            });
            
          }, 5000); 

        } else {

          showAjaxModal_confirm(data.payment_type + ' received Successfully.', 'Success');

          setTimeout(() => {
            $('#modal_confirm .close').click(); window.location.reload();
          }, 5000); 
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
  });
  </script>