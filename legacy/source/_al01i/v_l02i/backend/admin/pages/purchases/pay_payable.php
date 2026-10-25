<?php
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
?>
<div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-primary">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('enter_payment_for_accounts_payable'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
echo form_open(site_url('admin/pay_payable/create'),
	array('class' => 'form-groups-bordered', 'id' => 'pay_payable_form', 'target' => '_top')); ?>

                        <?php
$suppliers_add = $this->db->get('suppliers');
$suppliers_array_add = $suppliers_add->result_array();

?>
                    <div class="form-group row">
                      <div class="col-sm-5 col-md-5">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-info text-light">Supplier:</div>
                              </div>
                              <select required="true" class="form-control" onchange="populate_edit_button($(this).val())" name="supplier_name" id="supplier_name">
                            <option value="">Select Supplier</option>
                            <?php foreach ($suppliers_array_add as $srow): ?>
                            <option value="<?=$srow['supplier_id'];?>"><?=$srow['supplier_name'];?></option>
                            <?php endforeach;?>
                        </select>
                          </div>
                      </div>

                      <div class="col-sm-2 col-md-2"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/'); ?>', 'Add new supplier')"><i class="fa fa-fw fa-plus"></i></a>

                      <a href="javascript:;" class="btn btn-success btn-sm" id="edit_button" title="Edit"><i class="fa fa-fw fa-edit"></i></a></div>

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
                    <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1))->result_array();
?>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_paid_from'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select name="account_paid_from" id="account_paid_from" class="form-control" onchange="update_bank_balance()" required="required">
                                <?php foreach ($accounts as $acc): ?>
                                    <option value="<?=$acc['account_id']?>"><?=$acc['name']?></option>
                                <?php endforeach;?>
                            </select>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('method'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select required="true" class="form-control" name="method">
                                  <option value="1">Cash</option>
                            </select>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('total_payable'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="text" class="form-control" name="" id="total_payable" value="" readonly="readonly">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_paid'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="currency" class="form-control"  min="1" name="amount_paid" placeholder="Enter Amount Paid" value="" required>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('reference_number'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="text" class="form-control" name="reference_number" placeholder="" value="">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('journal_memo'); ?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <textarea  name="journal_memo" class="form-control" cols="50"></textarea>
                        </div>
                    </div>



                    <div class="form-group row">
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="submit" class="btn btn-info btn-lg form-control"
                                value="Issue Payment" >
                        </div>
                    </div>
                  </div>
                </div>
          </div>
    </div>
  </div>

  <script type="text/javascript">
    //populate the edit button with the selected supplier
    function populate_edit_button(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_purchases/edit_supplier/"); ?>' + id + '", "Edit Supplier")');
        let set_supplier_id = $('#supplier_name').val();
        let currency = '<?php echo $currency; ?>';
        //send data via ajax
        if(id == '' || id == null) {
            $('#total_payable').val('No Supplier Selected');
          } else {
            $.ajax({
            url: '<?php echo site_url('admin/get_payable/') ?>' + id,
            type: 'POST',
            dataType: 'text',
            cache: false
            })
            .done(function(data) {
                $('#total_payable').val(currency + ' ' + number_format(data, 2, '.', ','));
            });
        }

    }

    //Pay Payable Creation form submitted
  $('#pay_payable_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    //replace the , with -
    let form_data = $('#pay_payable_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/pay_payable/create') ?>',
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Payable payment made Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
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