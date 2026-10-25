<?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
$customer_id = $param2;

//get  opening sales code (if any)
$this->db->where('customer_id', $customer_id);
//$this->db->like('so_code', 'Opening-SO-');
$opening_so_code = $this->db->get('customers')->row()->opening_so_code;

$this->db->where('customer_id', $customer_id);
$debtor_opening_so_code = $this->db->get('customers')->row()->debtor_opening_so_code;

//for creditor option
if ($opening_so_code != '' || $opening_so_code != NULL) {
	$yes_no = 1;
	$checked = 'checked';
} else {
	$yes_no = 0;
	$opening_so_code = '0';
	$checked = '';
}

//for debtor option
if ($debtor_opening_so_code != '' || $debtor_opening_so_code != NULL) {
	$debtor_yes_no = 1;
	$debtor_checked = 'checked';
} else {
	$debtor_yes_no = 0;
	$debtor_opening_so_code = '0';
	$debtor_checked = '';
}

//database query
$this_customer_array = $this->db->get_where('customers', array('customer_id' => $customer_id))->result_array();
?>
<div class="row">
  <div class="col-md-12">
    <!-- Main Header Tab Navs-->
    <ul class="nav nav-tabs">
      <li class="nav-item">
        <a href="#details" data-toggle="tab" class="nav-link active">
          <span class="visible-xs"><i class="fas fa-fw fa-tachometer-alt"></i></span>
          <span class="hidden-xs"><?php echo get_phrase('details'); ?></span>
        </a>
      </li>
      <li class="nav-item">
        <a href="#account_info" data-toggle="tab" class="nav-link">
          <span class="visible-xs"><i class="fas fa-fw fa-hand-holding-usd"></i></span>
          <span class="hidden-xs"><?php echo get_phrase('account_info'); ?></span>
        </a>
      </li>
    </ul>

  </div>
</div>

<?php
foreach ($this_customer_array as $cus):
?>

<hr>
<?php
echo form_open(site_url('admin/create_customer/update'),
	array('class' => 'form-groups-bordered', 'id' => 'customer_edit_form', 'target' => '_top')); ?>
<div class="tab-content">
  <!--FOR DETAILS-->
  <div class="tab-pane active" id="details">
    <div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-danger">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('customer\'s_details'); ?>. <span class="text-light">Fields with the red asterisk (*) character are compulsory!</span>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">

                    <div class="form-group row">
                        <div class="col-sm-8 col-md-8 col-xs-12 form-group row">
                          <label  class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('customer_name'); ?><span class="text-danger">*</span></label>
                          <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text" required="true" class="form-control" name="customer_name"
                                  value="<?=$cus['customer_name'];?>">

                                <input type="hidden"  name="prev_opening_so_code"
                                value="<?=$opening_so_code;?>">

                                <input type="hidden"  name="debtor_prev_opening_so_code"
                                value="<?=$debtor_opening_so_code;?>">
                          </div>
                        </div>

                        <div class="col-sm-4 col-md-4 col-xs-12 form-group row">
                          <label  class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('Guest'); ?><span class="text-danger">*</span></label>

                          <div class="switch-button  showcase-switch-button">
                            <input id="guest"  type="checkbox" <?=$cus['guest'] == 1 ? 'checked' : '';?>  value="<?=$cus['guest'];?>" name="guest" onchange="guest_value_change()">
                            <label for="guest" ></label>   <strong style="font-size: 22px;" id="guest_yes_no">NO</strong>
                          </div>
                        </div>

                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('business\'_name'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="text" class="form-control" name="contact_person_name"
                                value="<?=$cus['contact_person'];?>">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('address'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <textarea  name="address" class="form-control" cols="50"><?=$cus['address'];?></textarea>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('mobile_number'); ?><span class="text-danger"></span></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="tel" class="form-control" name="mobile_number" placeholder="Enter Office Mobile Number" value="<?=$cus['mobile'];?>">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('phone_number'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="tel" class="form-control" name="phone_number" placeholder="Enter Office Phone Number"
                                value="<?=$cus['phone'];?>" >
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-5 col-form-label"><?php echo get_phrase('email'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-7">
                            <input type="email" class="form-control" name="customer_email"
                                value="<?=$cus['email'];?>" >
                        </div>
                    </div>
                    <div class="form-check">
                      <input type="checkbox" name="customer_active" class="form-check-input mt-2" <?php if ($cus['customer_active'] == 1) {
	echo 'checked';
}
?> id="customer_active" value="<?=$cus['customer_active'];?>">
                      <label class="form-check-label col-form-label ml-5" for="customer_active">This Customer Is Active</label>
                    </div>
                  </div>
                </div>
          </div>
    </div>
  </div>

  <!--FOR ACCOUNTS INFO-->

  <?php
$this->db->select_sum('amount_due');
$this->db->where('amount_due <', 0);
$this->db->where('customer_id', $cus['customer_id']);
$payable = abs($this->db->get('invoice')->row()->amount_due);

//goods with us
$quantity_owe_array = $this->db->get_where('sales_order', array('customer_id' => $cus['customer_id'], 'quantity_due >' => 0))->result_array();

foreach ($quantity_owe_array as $owe) {
	$payable += $owe['price'] * $owe['quantity_due'];
}

$this->db->select_sum('amount_due');
$this->db->where('amount_due >', 0);
$this->db->where('customer_id', $cus['customer_id']);
$receivable = $this->db->get('invoice')->row()->amount_due;

//for last invoice no
$this->db->select_max('invoice_id');
$this->db->where('customer_id', $cus['customer_id']);
$invoice_id_n = $this->db->get('invoice')->row()->invoice_id;
$last_invoice_no = $this->db->get_where('invoice', array('invoice_id' => $invoice_id_n))->row()->invoice_code;
?>
  <div class="tab-pane" id="account_info">
    <div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-danger">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px">
                          <?php echo get_phrase('customer\'s_accounts_information'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('opening_balance'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" class="form-control" name="opening_balance" id="opening_balance"
                                value="<?=$cus['opening_balance'];?>">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('receivable'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="number" disabled="disabled" class="form-control" name="receivable"
                                value="<?=number_format($receivable, 2, '.', ',');?>">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('payable'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="number" disabled="disabled" class="form-control" name="payable"
                                value="<?=number_format($payable, 2, '.', ',');?>">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('last_invoice_no.'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                              <input type="text" class="form-control form-control-plaintext" name="last_invoice_no"
                               disabled="disabled" value="<?=$last_invoice_no;?>">
                        </div>
                    </div>
                    <hr>

                    <div class="form-group row">
                        <label class="control-label col-sm-8 col-xs-12"><strong style="font-size: 16px;">DEBTOR'S BALANCE (<small><em>Unpaid Goods</em></small>)</strong> </label>

                        <div class="switch-button  showcase-switch-button">
                          <input id="debtor_is_a_creditor_edit"  type="checkbox" <?=$debtor_checked;?>  value="<?=$debtor_yes_no;?>" name="debtor_is_a_creditor_edit" onchange="debtor_value_change()">
                          <label for="debtor_is_a_creditor_edit" ></label>   <strong style="font-size: 22px;" id="debtor_yes_no_edit">NO</strong>
                        </div>
                    </div>
                    <div class="form-group row" id="debtor_info_holder_edit">
                      <strong>NB: <em>For a fixed or any accrued Cash Balance, enter a positive value in the "Opening Balance" field above. E.g: 6000</em></strong>
                    </div>

                    <div class="form-group row" id="debtor_order_holder_edit" style="display: none;">
                    </div>

                    <hr>
                    <hr>
                    <div class="form-group row">
                        <label class="control-label col-sm-8 col-xs-12"><strong style="font-size: 16px;">ALSO A CREDITOR (<small><em>Goods are with us</em></small>)</strong> </label>

                        <div class="switch-button  showcase-switch-button">
                          <input id="is_a_creditor_edit"  type="checkbox" <?=$checked;?>  value="<?=$yes_no;?>" name="is_a_creditor_edit" onchange="value_change()">
                          <label for="is_a_creditor_edit" ></label>   <strong style="font-size: 22px;" id="yes_no_edit">NO</strong>
                        </div>
                    </div>
                    <div class="form-group row" id="info_holder_edit">
                      <strong>NB: <em>For a Cash Balance Creditor, enter a negative value in the "Opening Balance" field above. E.g: -6000</em></strong>
                    </div>

                    <div class="form-group row" id="order_holder_edit" style="display: none;">
                    </div>
                    <hr>
                    <?php
$order_search_array = $this->db
	->where('customer_id', $customer_id)
	->order_by('invoice_id', 'desc')
	->get('invoice')->result_array();

?>

                    <div class="form-group row">
                          <legend>Invoices</legend>
                          <button class="btn btn-success btn-lg" disabled>Search Invoices</button>
                          <hr>
                          <table class="table table-striped table-hover table-success" width="100%" id="invoice_search_edit">
                            <thead>
                              <tr>
                                <th>Date Created</th>
                                <th>Invoice No</th>
                                <th>Cashier</th>
                                <th style="text-align: right">Amount</th>
                                <th style="text-align: right">Amount Due</th>
                                <th>Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              <?php foreach ($order_search_array as $order): ?>
                              <tr>
                                <td><?=date('d M, Y', $order['creation_timestamp']);?></td>
                                <td><?=$order['invoice_code'];?></td>
                                <td><?=$this->db->get_where('admin', array('admin_id' => $order['sales_person_id']))->row()->name;?></td>
                                <td align="right"><strong><?=numfmt_format_currency($fmt, $order['amount'], $currency);?></strong></td>
                                <td align="right"><strong><?=numfmt_format_currency($fmt, $order['amount_due'], $currency);?></strong></td>
                                <td><?=$order['status'];?></td>
                              </tr>
                              <?php endforeach;?>
                            </tbody>

                          </table>
                    </div>
                  </div>
                </div>
          </div>
    </div>
  </div>
    <div class="form-group row">
        <div class="col-sm-9 col-md-9 col-xs-8">
            <input type="submit" class="btn btn-info btn-lg" name="customer_submit_edit"
                value="Update Customer">
        </div>
    </div>
  </form>
</div>
<?php endforeach;?>

<script type="text/javascript">
  $(function() {
    $('#invoice_search_edit').DataTable();
    value_change();
    debtor_value_change();
    guest_value_change();
  });

  //this is a guest
  function guest_value_change() {
     let is_a_guest = $('#guest').filter(':checked').length;

     if(is_a_guest > 0) {

          $('#guest').val(1);
          $('#guest_yes_no').text('YES');
          $('#guest_yes_no').css('color', '#000000');

     } else {

      $('#guest').val(0);
      $('#guest_yes_no').text('NO');
      $('#guest_yes_no').css('color', '#b3afaf');
     }

  }

  //this customer is at the same time our creditor in terms of goods
  function debtor_value_change() {

     let is_a_debtor_edit = $('#debtor_is_a_creditor_edit').filter(':checked').length;

     let is_a_creditor = $('#is_a_creditor_edit').val(); //checking if is creditor button is on or not so we can be able to update the so code and invoice code accordingly

     if(is_a_debtor_edit > 0) {

          $('#debtor_is_a_creditor_edit').val(1);
          $('#debtor_yes_no_edit').text('YES');
          $('#debtor_yes_no_edit').css('color', '#000000');
          $('#debtor_info_holder_edit').slideUp('slow');

           //let's get the order form and put it here
           $.ajax({
             url: '<?php echo site_url('admin/get_debtor_opening_balance_order/edit/' . $customer_id . '/' . $debtor_opening_so_code); ?>/' + is_a_creditor,
             type: 'POST',
             dataType: 'html',
           })
           .done(function(data) {
             $('#debtor_order_holder_edit').html(data);
             $('#debtor_order_holder_edit').slideDown('slow');
             $('#paid_to').attr('required', 'required');
           });

     } else {

      $('#debtor_order_holder_edit').slideUp('slow');
      $('#debtor_order_holder_edit').html('');
      $('#debtor_info_holder_edit').slideDown('slow');
      $('#debtor_is_a_creditor_edit').val(0);
      $('#debtor_yes_no_edit').text('NO');
      $('#debtor_yes_no_edit').css('color', '#b3afaf');
      $('#paid_to').removeAttr('required');

     // value_change();
     }

  }

  //this customer is at the same time our creditor in terms of goods
  function value_change() {
     let is_a_creditor_edit = $('#is_a_creditor_edit').filter(':checked').length;

     let is_a_debtor = $('#debtor_is_a_creditor_edit').val(); //checking if is debtor button is on or not so we can be able to update the so code and invoice code accordingly

     if(is_a_creditor_edit > 0) {

          $('#is_a_creditor_edit').val(1);
          $('#yes_no_edit').text('YES');
          $('#yes_no_edit').css('color', '#000000');
          $('#info_holder_edit').slideUp('slow');

           //let's get the order form and put it here
           $.ajax({
             url: '<?php echo site_url('admin/get_creditor_opening_balance_order/edit/' . $customer_id . '/' . $opening_so_code); ?>/' + is_a_debtor,
             type: 'POST',
             dataType: 'html',
           })
           .done(function(data) {
             $('#order_holder_edit').html(data);
             $('#order_holder_edit').slideDown('slow');
             $('#paid_to').attr('required', 'required');
           });

     } else {

      $('#order_holder_edit').slideUp('slow');
      $('#order_holder_edit').html('');
      $('#info_holder_edit').slideDown('slow');
      $('#is_a_creditor_edit').val(0);
      $('#yes_no_edit').text('NO');
      $('#yes_no_edit').css('color', '#b3afaf');
      $('#paid_to').removeAttr('required');

      debtor_value_change();
     }

  }


   //Customer Editing form submitted
  $('#customer_edit_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    //check if opening balance is zero or not
    //if not zero, validate the value
    let op_bal = $('#opening_balance').val();

    if(op_bal != 0) {
      let regexp = /^-?[0-9]+([.]+[0-9]+)?$/g;
      let result = regexp.test(op_bal);

      if(result === false) {
        showAjaxModal_confirm('Ooopz! Make sure the amount you entered is valid and does not contain any alphabets or any other characters apart from \'dot (.)\'', 'Error');

        return false;
      }
    }


    let no_tr = $('#s_order_create_table tbody').find('tr').length;
    let input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(i = 1; i <= no_tr; i++) {
      let each_id_numeric =  $('#tr_' + i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');

      input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }



    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-');


    //for is debtor
    let debtor_no_tr = $('#debtor_s_order_create_table tbody').find('tr').length;
    let debtor_input_ids_numeric = []; //array to hold the numeric parts of the ids

    for(debtor_i = 1; debtor_i <= debtor_no_tr; debtor_i++) {

        let debtor_each_id_numeric =  $('#debtor_tr_' + debtor_i + ' input[type="number"]').attr('id').replace(/[^\d]+/, '');
        debtor_input_ids_numeric.push(debtor_each_id_numeric); //push the numbers into this array
    }

    //replace the , with -
    debtor_input_ids_numeric = debtor_input_ids_numeric.join('-');

    //create the url for ajax here

    if(input_ids_numeric == '') {
      input_ids_numeric = 0;

    }


    let form_data = $('#customer_edit_form').serialize();
    let customer_id = <?php echo $customer_id; ?>;

    //send data via ajax

    $.ajax({
      url: '<?php echo site_url('admin/customer/update/') ?>' + customer_id + '/<?=$opening_so_code;?>/' + input_ids_numeric + '/' + debtor_input_ids_numeric + '/<?=$debtor_opening_so_code;?>',
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {

      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Customer Updated Successfully.', 'Success');

        setTimeout(() => {
          //$('#modal_confirm .close').click();
          window.location.reload();
        }, 500);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: A Customer with the same Mobile number or Email address already exists', 'Error');
      } else if(data.success == 'invalid_email') {
        showAjaxModal_confirm('Invalid Email. Please check and correct it', 'Error');
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_customer_update').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_customer_update"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Unknown System Error Occured. Please Try Again! If this error persists, kindly contact the System Developer on 0243 618 186.', 'Error');
    });
  });
</script>