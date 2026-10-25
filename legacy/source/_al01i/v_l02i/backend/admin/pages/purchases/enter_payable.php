<div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-danger">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('record_new_accounts_payable'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
echo form_open(site_url('admin/enter_payable/create'),
  array('class' => 'form-groups-bordered', 'id' => 'enter_payable_form', 'target' => '_top')); ?>

                  <div class="form-group row">
                      <div class="input-group">
                        <div class="input-group-prepend">
                          <div class="input-group-text bg-danger text-light">Payable To</div>
                        </div>
                        <div class="m-lg-3">
                          <div class="form-check-inline">
                          <label class="form-check-label">
                            <input type="radio" class="form-check-input" checked="checked" value="1" id="to_supplier" name="payment_type" required> To A Creditor
                          </label>
                        </div>
                        <div class="form-check-inline">
                          <label class="form-check-label">
                            <input type="radio" class="form-check-input" value="2" id="to_loan" name="payment_type" required> Cash Payables & Other Outstandings
                          </label>
                          </div>
                        </div>
                        </div>
                    </div>

                        <?php
                        //customers
                        $this->db->where('amount_due <', 0);
                        $customers = $this->db->get('invoice')->result_array();


                        //suppliers
                        $suppliers_add = $this->db->get('suppliers');
                        $suppliers_array_add = $suppliers_add->result_array();

                        ?>
                    <div class="form-group row">
                      <div class="col-sm-8 col-md-8" id="main_holder">
                          <div class="input-group ss col-sm-12 col-md-12 col-xs-12">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-info text-light">Creditor:</div>
                              </div>
                              <select class="form-control select2" onchange="populate_edit_button($(this).val())" name="supplier_name" id="supplier_name">
                            
                            <optgroup label="SUPPLIERS">
                              <?php foreach ($suppliers_array_add as $srow): ?>
                                <option value="s_<?=$srow['supplier_id'];?>"><?=$srow['supplier_name'];?></option>
                            <?php endforeach;?>
                            </optgroup>

                            <optgroup label="CUSTOMERS">
                              <?php foreach ($customers as $crow): ?>
                            <option value="c_<?=$crow['customer_id'];?>"><?=$this->db->get_where('customers', ['customer_id' => $crow['customer_id']])->row()->customer_name;?></option>
                            <?php endforeach;?>
                            </optgroup>
                        </select>
                          </div>

                         
                        <div class="col-sm-12 col-md-12 col-xs-12 loan">
                              <input type="text"  name="payable_for_loan" id="payable_for_loan" class="form-control" placeholder="Enter what you will be paying for..." value="">
                        </div>
                      </div>

                      <!-- <div class="col-sm-2 col-md-2 ss"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/'); ?>', 'Add new supplier')"><i class="fa fa-fw fa-plus"></i></a>

                      <a href="javascript:;" class="btn btn-success btn-sm" id="edit_button" title="Edit"><i class="fa fa-fw fa-edit"></i></a>
                    </div> -->

                      <div class="col-sm-4 col-md-4">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-dark text-light">Entry Date:</div>
                              </div>
                              <input type="text" required="true" class="form-control datepicker" name="payable_date" data-format="dd-mm-yyyy"
                                  value="<?php echo date('d-m-Y'); ?>">
                          </div>
                      </div>
                  </div>

                  <!-- <div class="form-group row ss">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('supplier_address'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <textarea  name="supplier_address" id="supplier_address" class="form-control" cols="50" readonly="readonly"></textarea>
                        </div>
                    </div>

                    <div class="form-group row ss">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('payable_for:'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="payable_for" disabled id="payable_for" class="form-control" placeholder="Enter what you will be paying for..." value="" required="required">
                        </div>
                    </div> -->

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-danger text-light"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                              </div>
                              <input type="currency" min="1" name="amount" id="amount" class="form-control" required="required" value="">
                            </div>
                        </div>
                    </div>
                    <?php
$accounts = $this->db->get_where('accounts', array('name' => 'Accounts Payable'))->result_array();
?>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('accounts_payable'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select name="accounts_payable" id="accounts_payable" class="form-control" onchange="update_bank_balance()" required="required">
                                <?php foreach ($accounts as $acc): ?>
                                    <option value="<?=$acc['account_id']?>"><?=$acc['name']?></option>
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
                              <input type="text"  name="account_balance" id="account_balance" class="form-control form-control-plaintext" readonly="readonly">
                            </div>
                        </div>
                    </div>
                    
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('reference_number'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="reference_number" class="form-control" value="">
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('journal_memo_(Description)'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <textarea  name="journal_memo" class="form-control" cols="50"></textarea>
                        </div>
                    </div>

                    <hr>
                    <div class="form-group row ml-1" title="select the allocated account for this transaction">Account Allocated To</div>

                    <?php
                      
                      $this->db->where('account_type', 5);
                      $this->db->or_where('account_type', 2);
                      $this->db->where('name !=', 'Accounts Payable');
                      $accounts = $this->db->get('accounts')->result_array();
                    ?>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('allocated_account'); ?></label>
                        <div class="col-sm-5 col-md-5 col-xs-5">
                            <select name="allocated_account" id="allocated_account" class="form-control" required="required">
                                <?php foreach ($accounts as $acc): ?>
                                    <option value="<?=$acc['account_id']?>"><?=$acc['name']?></option>
                                <?php endforeach;?>
                            </select>
                        </div><a href="javascript:;" style="text-decoration: none" class="col-sm-1 col-md-1 col-xs-1 text-sm-center pt-2 text-light bg-success">DR</a>
                    </div>
                    <div class="form-group row">
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="submit" class="btn btn-info btn-lg form-control"
                                value="Record Accounts Payable" >
                        </div>
                    </div>
                    </form>
                  </div>
                </div>
          </div>
    </div>
  </div>

  <script type="text/javascript">
    $(function() {
      update_bank_balance();
      payable_selection();
    });

    $('#enter_payable_form input[name="payment_type"]').change(function(event) {
      /* Act on the event */
      payable_selection();
    });

    function payable_selection() {
      let valSelected = $('#enter_payable_form input[name="payment_type"]:checked').val();

      if(valSelected == 1) {
        $('#main_holder').removeClass('col-sm-7 col-md-7');
        $('#main_holder').addClass('col-sm-5 col-md-5');

        $('#payable_for_loan').removeAttr('required');
        $('.loan').slideUp('slow');
        //$('.loan').css('display', 'none');
        $('.ss').slideDown('slow');

      } else if(valSelected == 2) {
        $('#main_holder').removeClass('col-sm-5 col-md-5');
        $('#main_holder').addClass('col-sm-7 col-md-7');

        $('#payable_for').removeAttr('required');
        $('#supplier_name').removeAttr('required');
        $('.ss').slideUp('slow');
        //$('.ss').css('display', 'none');
        $('.loan').slideDown('slow');
      }
    }


    //populate the edit button with the selected supplier
    function populate_edit_button(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_purchases/edit_supplier/"); ?>' + id + '", "Edit Supplier")');
        let set_supplier_id = $('#supplier_name').val();


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
                    $('#supplier_address').val(response.address);
                }
            });
        }  else {
                    $('#supplier_address').val('');
                }

    }

//get bank account balance
function update_bank_balance() {

      let acc_id = $('#accounts_payable').val();

  if(acc_id != '') {
    $.ajax({
      url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + acc_id,
      type: 'POST',
      dataType: 'json',
      cache: false
    })
    .done(function(response) {
       $('#account_balance').val(number_format(response.balance, 2, '.', ','));
    });
  } else {
    $('#account_balance').val('');
  }

}

  //Enter Payable Creation form submitted
  $('#enter_payable_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    let valSelected = $('#enter_payable_form input[name="payment_type"]:checked').val();


    //replace the , with -
    let form_data = $('#enter_payable_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/enter_payable/create/') ?>' + valSelected,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Accounts Payable Created Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
        }, 3000);
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_enter_payable_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_enter_payable_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Make sure the amount you entered is valid and does not contain any alphabets or any other characters apart from \'dot (.)\'', 'Error');
    });
  });
  </script>