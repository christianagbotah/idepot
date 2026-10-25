<?php
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'name !=' => 'Accounts Receivable'))->result_array();
?>
          

<div class="container-fluid">
    <div class="row">
        <div class="col-md-12 col-sm-12">
            <?php
       echo form_open(site_url('admin/accounts_transfer/create') ,
        array('class' => 'form-horizontal form-groups-bordered', 'id' => 'accounts_transfer_form', 'target'=>'_top')); ?>
    <div class="form-group row">
        <label class="col-sm-4 col-md-4 col-form-label">Transfer From:</label>
        <div class="col-sm-4 col-md-4">
            <select name="account_from" id="account_from" class="form-control" onchange="update_bank_balance($(this).val(), 'from')" required="required">
                  <option value="">Select Account</option>
                  <?php foreach ($accounts as $acc): ?>
                      <option value="<?=$acc['account_id']?>"><?=$acc['name']?></option>
                  <?php endforeach;?>
              </select>
        </div>
        <div class="col-sm-4 col-md-4">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-danger text-light">Current Balance <?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div>
                </div>
                <input type="text" class="form-control form-control-plaintext"  name="from_balance" id="from_balance" readonly="readonly">
            </div>
        </div>
    </div>
    <div class="form-group row">
        <label class="col-sm-4 col-md-4 col-form-label">Transfer To:</label>
        <div class="col-sm-4 col-md-4">
           <select name="account_to" id="account_to" class="form-control" onchange="update_bank_balance($(this).val(), 'to')" required="required">
              <option value="">Select Account</option>
              <?php foreach ($accounts as $acc_to): ?>
                  <option value="<?=$acc_to['account_id']?>"
                    <?= $param2 == '' ? '' : $param2 == $acc_to['account_id'] ? 'selected' : ''; ?>
                    ><?=$acc_to['name']?></option>
              <?php endforeach;?>
          </select>
        </div>
        <div class="col-sm-4 col-md-4">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-danger text-light">Current Balance <?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div>
                </div>
                <input type="text" class="form-control form-control-plaintext"  name="to_balance" id="to_balance" readonly="readonly">
            </div>
        </div>
    </div>
    <div class="form-group row">
        <label class="col-sm-4 col-md-4  col-form-label">Amount:</label>
        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text"><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div>
                </div>
                <input type="currency" class="form-control" min="1"  name="amount" id="amount" required="required">
            </div>
        </div>
        <div class="col-sm-1 col-md-1"></div>
    </div>
    <div class="form-group row">
        <label class="col-sm-4 col-md-4  col-form-label">Date:</label>
        <div class="col-sm-2 col-md-2">
            <input type="text" name="date" id="date" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo date('d-m-Y'); ?>" required="required">
        </div>
        <div class="col-sm-2 col-md-2"></div>
    </div>
    <div class="form-group row">
        <div class="col-sm-4 col-md-4">
            <input type="submit" name="submit" id="submit" class="btn btn-info btn-lg" value="Transfer Fund">
        </div>
    </div>
</form>
        </div>
    
    </div>
</div>

<script type="text/javascript">
    //get bank account balance
    function update_bank_balance(id, type) {
        if(id != '') {
          $.ajax({
              url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + id,
              type: 'POST',
              dataType: 'json',
              cache: false
          })
          .done(function(response) {
            if(type == 'from') {
                $('#from_balance').val(number_format(response.balance, 2, '.', ','));
            } else if(type == 'to') {
                $('#to_balance').val(number_format(response.balance, 2, '.', ','));
            }

          });
        } else {
          $('#from_balance').val('');
          $('#to_balance').val('');
        }

    }

    //do the transaction now
     $('#accounts_transfer_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    //get real confirmation from the user before proceeding
    let from_name = $('#account_from option:selected').html();
    let to_name = $('#account_to option:selected').html();
    let amount = $('#amount').val();
    let currency = '<?=$currency; ?>';

    //check if he selected the same account
    if(from_name == to_name) {
        showAjaxModal_confirm('You have selected the same account name for both options.', 'Error');
        return false;
    }

    //confirmation prompt
    let result = confirm('Are you sure you want to transfer ' + currency + ' ' + number_format(amount, 2, '.', ',') + ' from ' + from_name + ' to ' + to_name + '?\nThis Action is totally irreversible. Click "OK" if you really want to proceed, or click "Cancel" to cancel this request.');
    
    if(result == false) {
        return false;
    }

    let form_data = $('#accounts_transfer_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/accounts_transfer/create/') ?>',
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Fund Transferred Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
        }, 3000);
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_s_order_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_s_order_create"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Make sure the amount you entered is valid and does not contain any alphabets or any other characters apart from \'dot (.)\'', 'Error');
    });
  });

</script>