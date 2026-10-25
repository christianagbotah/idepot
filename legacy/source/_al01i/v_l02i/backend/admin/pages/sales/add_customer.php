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

<hr>
<?php
echo form_open(site_url('admin/create_customer/create'),
	array('class' => 'form-groups-bordered', 'id' => 'customer_create_form', 'target' => '_top')); ?>
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
                                  value="">
                          </div>
                        </div>

                        <div class="col-sm-4 col-md-4 col-xs-12 form-group row">
                          <label  class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('Guest'); ?><span class="text-danger">*</span></label>

                          <div class="switch-button  showcase-switch-button">
                            <input id="guest"  type="checkbox"  value="0" name="guest" onchange="guest_value_change()">
                            <label for="guest" ></label>   <strong style="font-size: 22px;" id="guest_yes_no">NO</strong>
                          </div>
                        </div>

                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('business\'_name'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="text" class="form-control" name="contact_person_name"
                                value="">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('address'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <textarea  name="address" class="form-control" cols="50"></textarea>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('mobile_number'); ?><span class="text-danger"></span></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="tel" class="form-control" name="mobile_number" placeholder="Enter Office Mobile Number" value="">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('phone_number'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="tel" class="form-control" name="phone_number" placeholder="Enter Office Phone Number"
                                value="" >
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-5 col-form-label"><?php echo get_phrase('email'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-7">
                            <input type="email" class="form-control" name="customer_email"
                                value="" >
                        </div>
                    </div>
                    <div class="form-check">
                      <input type="checkbox" class="form-check-input mt-2" checked id="customer_active" value="1" name="customer_active">
                      <label class="form-check-label col-form-label ml-5" for="customer_active">This Customer Is Active</label>
                    </div>
                  </div>
                </div>
          </div>
    </div>
  </div>

  <!--FOR ACCOUNTS INFO-->
  <div class="tab-pane" id="account_info">
    <div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-success">

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
                              <input type="currency" class="form-control" id="opening_balance" name="opening_balance"
                                value="0">
                            </div>
                        </div>
                    </div>

                    <hr>
                    <div class="form-group row">
                        <label class="control-label col-sm-8 col-xs-12"><strong style="font-size: 16px;">DEBTOR'S BALANCE (<small><em>Unpaid Goods</em></small>)</strong> </label>

                        <div class="switch-button  showcase-switch-button">
                          <input id="debtor_is_a_creditor"  type="checkbox"  value="0" name="debtor_is_a_creditor" onchange="debtor_value_change()">
                          <label for="debtor_is_a_creditor" ></label>   <strong style="font-size: 22px;" id="debtor_yes_no">NO</strong>
                        </div>
                    </div>
                    <div class="form-group row" id="debtor_info_holder">
                      <strong>NB: <em>For a fixed or any accrued Cash Balance, enter a positive value in the "Opening Balance" field above. E.g: 6000</em></strong>
                    </div>

                    <div class="form-group row" id="debtor_order_holder" style="display: none;">
                    </div> <!--//END OF DEBTOR SIDE-->

                    <hr>
                    <hr>
                    <div class="form-group row">
                        <label class="control-label col-sm-8 col-xs-12"><strong style="font-size: 16px;">ALSO AS A CREDITOR (<small><em>Goods are with us</em></small>)</strong> </label>

                        <div class="switch-button  showcase-switch-button">
                          <input id="is_a_creditor"  type="checkbox"  value="0" name="is_a_creditor" onchange="value_change()">
                          <label for="is_a_creditor" ></label>   <strong style="font-size: 22px;" id="yes_no">NO</strong>
                        </div>
                    </div>
                    <div class="form-group row" id="info_holder">
                      <strong>NB: <em>For a Cash Balance Creditor, enter a negative value in the "Opening Balance" field above. E.g: -6000</em></strong>
                    </div>

                    <div class="form-group row" id="order_holder" style="display: none;">
                    </div> <!--//END OF CREDITOR SIDE-->

                    <hr>
                  </div>
                </div>
          </div>
    </div>
  </div>
    <div class="form-group row">
        <div class="col-sm-9 col-md-9 col-xs-8">
            <input type="submit" class="btn btn-info btn-lg" name="customer_submit"
                value="Add Customer">
        </div>
    </div>
  </form>
</div>

<script type="text/javascript">

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


  //this customer is owing for goods delovered
  function debtor_value_change() {
     let is_a_debtor = $('#debtor_is_a_creditor').filter(':checked').length;

     let is_a_creditor = $('#is_a_creditor').val(); //checking if is creditor button is on or not so we can be able to update the so code and invoice code accordingly

     if(is_a_debtor > 0) {

          $('#debtor_is_a_creditor').val(1);
          $('#debtor_yes_no').text('YES');
          $('#debtor_yes_no').css('color', '#000000');
          $('#debtor_info_holder').slideUp('slow');

           //let's get the order form and put it here
           $.ajax({
             url: '<?php echo site_url('admin/get_debtor_opening_balance_order/') ?>' + is_a_creditor,
             type: 'POST',
             dataType: 'html',
           })
           .done(function(data) {
             $('#debtor_order_holder').html(data);
             $('#debtor_order_holder').slideDown('slow');
             $('$paid_to').attr('required', 'required');
           });

     } else {

      $('#debtor_order_holder').slideUp('slow');
      $('#debtor_order_holder').html('');
      $('#debtor_info_holder').slideDown('slow');
      $('#debtor_is_a_creditor').val(0);
      $('#debtor_yes_no').text('NO');
      $('#debtor_yes_no').css('color', '#b3afaf');

     // value_change(); //update
     }

  }


//this customer is at the same time our creditor in terms of goods
  function value_change() {
     let is_a_creditor = $('#is_a_creditor').filter(':checked').length;

     let is_a_debtor = $('#debtor_is_a_creditor').val(); //checking if is debtor button is on or not so we can be able to update the so code and invoice code accordingly
     if(is_a_creditor > 0) {

          $('#is_a_creditor').val(1);
          $('#yes_no').text('YES');
          $('#yes_no').css('color', '#000000');
          $('#info_holder').slideUp('slow');

           //let's get the order form and put it here
           $.ajax({
             url: '<?php echo site_url('admin/get_creditor_opening_balance_order/') ?>' + is_a_debtor,
             type: 'POST',
             dataType: 'html',
           })
           .done(function(data) {
             $('#order_holder').html(data);
             $('#order_holder').slideDown('slow');
             $('#paid_to').attr('required', 'required');
           });

     } else {

      $('#order_holder').slideUp('slow');
      $('#order_holder').html('');
      $('#info_holder').slideDown('slow');
      $('#is_a_creditor').val(0);
      $('#yes_no').text('NO');
      $('#yes_no').css('color', '#b3afaf');
      $('#paid_to').removeAttr('required');

      debtor_value_change(); //update
     }

  }

  //autofill the balance due field with the opening balance amount
  $('#opening_balance').keyup(function(event) {
    /* Act on the event */
    let amount_entered = $('#opening_balance').val();
    $('#balance_due').val(amount_entered);
  });

  //Customer Creation form submitted
  $('#customer_create_form').submit(function(event) {
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


    //for is creditor
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
    debtor_input_ids_numeric = debtor_input_ids_numeric.join('-')

    let form_data = $('#customer_create_form').serialize();

    //create the url for ajax here

    if(input_ids_numeric == '') {
      input_ids_numeric = 0;

    }

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/customer/create/') ?>'+ input_ids_numeric + '/' +debtor_input_ids_numeric,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {

      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Customer Added Successfully.', 'Success');

        setTimeout(() => {
         // $('#modal_confirm .close').click();
          window.location.reload();
        }, 500);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: A Customer with the same Mobile number or Email address already exists', 'Error');
      } else if(data.success == 'invalid_email') {
        showAjaxModal_confirm('Invalid Email. Please check and correct it', 'Error');
      } else if(data.success == 'not_found') {
        showAjaxModal_confirm('"Accounts Receivable" not found. You must create it first before adding a customer.', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_customer_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_customer_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm(err.responseText +' Ooopz! Unknown System Error Occured. Please Try Again! If this error persists, kindly contact the System Developer on 0243 618 186.', 'Error');
    });
  });
</script>