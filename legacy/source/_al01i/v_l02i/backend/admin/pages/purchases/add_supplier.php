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
echo form_open(site_url('admin/supplier/create'),
	array('class' => 'form-groups-bordered', 'id' => 'supplier_create_form', 'target' => '_top')); ?>
<div class="tab-content">
  <!--FOR DETAILS-->
  <div class="tab-pane active" id="details">
    <div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-primary">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('supplier\'s_details'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('supplier_name*'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="text" required="true" class="form-control" name="supplier_name"
                                value="">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('contact_person\'s_name*'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="text" required="true" class="form-control" name="contact_person_name"
                                value="">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('address*'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <textarea  name="address" class="form-control" cols="50" required></textarea>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('mobile_number*'); ?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="tel" class="form-control" name="mobile_number" placeholder="Enter Office Mobile Number" value="" required>
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
                            <input type="email" class="form-control" name="supplier_email"
                                value="" >
                        </div>
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
              <div class="panel panel-danger">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px">
                          <?php echo get_phrase('supplier\'s_accounts_information'); ?>
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
                                value="">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('balance_due'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="number" class="form-control" id="balance_due" name="balance_due"
                                value="" readonly="readonly">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('last_order_amount'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="number" class="form-control" name="last_order_amount"
                                value="" readonly="readonly">
                            </div>
                        </div>
                    </div>
                    <hr><hr>
                  </div>
                </div>
          </div>
    </div>
  </div>
    <div class="form-group row">
        <div class="col-sm-9 col-md-9 col-xs-8">
            <input type="submit" class="btn btn-info btn-lg" name="supplier_submit"
                value="Add Supplier">
        </div>
    </div>
  </form>
</div>

<script type="text/javascript">

  //autofill the balance due field with the opening balance amount
  $('#opening_balance').keyup(function(event) {
    /* Act on the event */
    let amount_entered = $('#opening_balance').val();
    $('#balance_due').val(amount_entered);
  });

  //Supplier Creation form submitted
  $('#supplier_create_form').submit(function(event) {
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


    let form_data = $('#supplier_create_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/supplier/create') ?>',
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Supplier Added Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 3000);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: A Supplier with the same Mobile number or Email address already exists', 'Error');
      } else if(data.success == 'invalid_email') {
        showAjaxModal_confirm('Invalid Email. Please check and correct it', 'Error');
      } else if(data.success == 'not_found') {
        showAjaxModal_confirm('"Accounts Payable" not found. You must create it first before adding a supplier.', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_supplier_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_supplier_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Unknown System Error Occured. Please Try Again! If this error persists, kindly contact the System Developer on 0243 618 186.', 'Error');
    });
  });

</script>