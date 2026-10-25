<?php
  $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

  //for invoice
  $this->db->order_by('id', 'desc');
  $this->db->limit(1);
  $lastInvoiceRange = $this->db->get('invoice_code')->row()->code_range;

  $invoiceStartCode = explode('-', $lastInvoiceRange)[0];
  $invoiceEndCode = explode('-', $lastInvoiceRange)[1];

  //for waybil
  $this->db->order_by('id', 'desc');
  $this->db->limit(1);
  $lastWaybillRange = $this->db->get('waybill_code')->row()->code_range;

  $waybillStartCode = explode('-', $lastWaybillRange)[0];
  $waybillEndCode = explode('-', $lastWaybillRange)[1];

 //Is the current logged in user the admin -->
   if($level == 1 || $level == 2):
?>
<style type="text/css">
  #v-tabs .nav.nav-tabs {
    float: left;
    display: block;
    margin-right: 20px;
    border-bottom:0;
    border-right: 1px solid #ddd;
    padding-right: 15px;
}
#v-tabs .nav-tabs .nav-link {
    border: 1px solid transparent;
    color: #fff;
    border-top-left-radius: .25rem;
    border-top-right-radius: .25rem;
    background: #000;
}

#v-tabs .nav-tabs .nav-link.active {
    color: #495057;
    background-color:#f6f7f9 !important;
    border-color: transparent !important;
}

#v-tabs .nav-tabs .nav-link:focus, #v-tabs .nav-tabs .nav-link:hover {
    color: #495057;
    background-color:#f6f7f9 !important;
    border-color: transparent !important;
}

#v-tabs .nav-tabs .nav-link {
    border: 1px solid transparent;
    border-top-left-radius: 0rem!important;
    border-top-right-radius: 0rem!important;
}
#v-tabs .tab-content>.active {
    display: block;
    background: #fdfdfd;
    min-height: 400px;
}


#v-tabs .nav.nav-tabs {
    float: left;
    display: block;
    margin-right: 20px;
    border-bottom: 0;
    border-right: 1px solid transparent;
    padding-right: 15px;
}

</style>
<style media="screen">
.container {

}

.control-group {
display: inline-block;
vertical-align: top;
background: #fff;
text-align: left;
box-shadow: 0 1px 2px rgba(0,0,0,0.1);
padding: 30px;
width: 200px;
height: 210px;
margin: 10px;
}
.control {
display: block;
position: relative;
padding-left: 40px;
margin-bottom: 15px;
cursor: pointer;
font-size: 18px;
}
.control input {
position: absolute;
z-index: -1;
opacity: 0;
}
.control__indicator {
position: absolute;
top: 2px;
left: -11px;
height: 20px;
width: 20px;
background: #e6e6e6;
}
.control--radio .control__indicator {
border-radius: 50%;
}
.control:hover input ~ .control__indicator,
.control input:focus ~ .control__indicator {
background: #ccc;
}
.control input:checked ~ .control__indicator {
background: #2aa1c0;
}
.control:hover input:not([disabled]):checked ~ .control__indicator,
.control input:checked:focus ~ .control__indicator {
background: #0e647d;
}
.control input:disabled ~ .control__indicator {
background: #e6e6e6;
opacity: 0.6;
pointer-events: none;
}
.control__indicator:after {
content: '';
position: absolute;
display: none;
}
.control input:checked ~ .control__indicator:after {
display: block;
}
.control--checkbox .control__indicator:after {
      left: 8px;
      top: 5px;
      width: 4px;
      height: 9px;
      border: 3px solid #fff;
      border-width: 0 2px 2px 0;
      transform: rotate(45deg);
}
.control--checkbox input:disabled ~ .control__indicator:after {
border-color: #7b7b7b;
}


</style>
<div class="container-fluid" id="v-tabs">
  <div class="row"><h5>System Settings</h5></div>
  <hr>
  <ul class="nav nav-tabs p-4 shadow-2xl bg-light" id="myTab" role="tablist" style="top: 10px; left: 15px; position: fixed; z-index: 999">
    <li class="nav-item">
      <a class="nav-link active bg-secondary" data-toggle="tab" href="#company" role="tab" aria-controls="company">Company</a>
    </li>
    <hr>
    <li class="nav-item">
      <a class="nav-link bg-secondary" data-toggle="tab" href="#accounts" role="tab" aria-controls="accounts">Accounts</a>
    </li>
    <hr>
    <li class="nav-item">
      <a class="nav-link bg-secondary" data-toggle="tab" href="#logo" role="tab" aria-controls="logo">Logo</a>
    </li>
</ul>

<div class="tab-content">
  <div class="tab-pane active" id="company" role="tabpanel">
    <div class="row">
      <div class="col-md-12">
        <div style="width: 100%; padding: 5px">
        <div class="col-md-12 col-sm-12 col-xs-12">
            <div class="panel panel-primary">

                <div class="panel-heading p-3">
                    <div class="panel-title">
                        <?php echo get_phrase('system_settings'); ?>
                    </div>
                </div>

                <div class="panel-body" style="padding: 10px">
                  <?php
echo form_open(site_url('admin/system_settings/do_update'),
	array('class' => 'form-groups-bordered', 'id' => 'company_settings_form', 'target' => '_top')); ?>
                  <div class="form-group row">
                      <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('company_name'); ?></label>
                      <div class="col-sm-4  col-md-4">
                          <input type="text" class="form-control" name="system_name"
                              value="<?php echo $this->db->get_where('settings', array('type' => 'system_name'))->row()->description; ?>" required>
                      </div>

                      <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('purchase_order#'); ?></label>
                      <div class="col-sm-2  col-md-2">
                          <div class="input-group">
                            <div class="input-group-prepend">
                              <div class="input-group-text bg-info text-light">Prefix</div>
                            </div>
                            <input type="text" class="form-control" name="po_prefix"
                              value="<?php echo $this->db->get_where('settings', array('type' => 'po_prefix'))->row()->description; ?>">
                          </div>
                      </div>
                      <div class="col-sm-2  col-md-2">
                          <div class="input-group">
                            <div class="input-group-prepend">
                              <div class="input-group-text bg-info text-light">Number</div>
                            </div>
                            <input type="text" class="form-control" name="po_no"
                              value="<?php echo $this->db->get_where('settings', array('type' => 'po_no'))->row()->description; ?>" required>
                          </div>
                      </div>
                  </div>

                  <div class="form-group row">
                      <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('address'); ?></label>
                      <div class="col-sm-4  col-md-4">
                          <textarea  name="address" class="form-control" cols="50" required><?php echo $this->db->get_where('settings', array('type' => 'address'))->row()->description; ?></textarea>
                      </div>

                    <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('sales_order#'); ?></label>
                      <div class="col-sm-2  col-md-2">
                          <div class="input-group">
                            <div class="input-group-prepend">
                              <div class="input-group-text bg-info text-light">Prefix</div>
                            </div>
                            <input type="text" class="form-control" name="so_prefix"
                              value="<?php echo $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description; ?>">
                          </div>
                      </div>
                      <div class="col-sm-2  col-md-2">
                          <div class="input-group">
                            <div class="input-group-prepend">
                              <div class="input-group-text bg-info text-light">Number</div>
                            </div>
                            <input type="text" class="form-control" name="so_no"
                              value="<?php echo $this->db->get_where('settings', array('type' => 'so_no'))->row()->description; ?>" required>
                          </div>
                      </div>
                  </div>

                  <div class="form-group row">
                      <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('currency'); ?></label>
                      <div class="col-sm-2  col-md-2">
                          <input type="text" class="form-control" name="currency"
                              value="<?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>" required>
                      </div>

                      <label  class="col-sm-2  col-md-2 col-form-label m-auto text-right"><?php echo get_phrase('invoice#'); ?></label>
                      <div class="col-sm-2  col-md-2">
                          <div class="input-group">
                            <div class="input-group-prepend">
                              <div class="input-group-text bg-dark text-light">Start</div>
                            </div>
                            <input type="number" min="1"  class="form-control" name="invoice_start_code" id="invoice_start_code"
                              value="" placeholder="<?=$invoiceStartCode;?>">
                          </div>
                      </div>
                      <div class="col-sm-2  col-md-2">
                          <div class="input-group">
                            <div class="input-group-prepend">
                              <div class="input-group-text bg-dark text-light">End</div>
                            </div>
                            <input type="number" min="1" class="form-control" name="invoice_end_code" id="invoice_end_code"
                              value="" placeholder="<?=$invoiceEndCode;?>">
                          </div>
                      </div>

                      <div class="col-sm-2  col-md-2 m-auto">
                          <button type="button" onclick="generateInvoiceCodes()" class="btn btn-dark btn-lg p-2 rounded-md">Generate</button>
                      </div>
                  </div>

                  <div class="form-group row">
                      <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('phone'); ?></label>
                      <div class="col-sm-2  col-md-2">
                          <input type="tel" class="form-control" name="phone"
                              value="<?php echo $this->db->get_where('settings', array('type' => 'phone'))->row()->description; ?>" required>
                      </div>

                      <label  class="col-sm-2  col-md-2 col-form-label m-auto text-right"><?php echo get_phrase('waybill#'); ?></label>
                      <div class="col-sm-2  col-md-2">
                          <div class="input-group">
                            <div class="input-group-prepend">
                              <div class="input-group-text bg-primary text-light">Start</div>
                            </div>
                            <input type="number" min="1" class="form-control" name="waybill_start_code" id="waybill_start_code"
                              value="" placeholder="<?=$waybillStartCode;?>">
                          </div>
                      </div>
                      <div class="col-sm-2  col-md-2">
                          <div class="input-group">
                            <div class="input-group-prepend">
                              <div class="input-group-text bg-primary text-light">End</div>
                            </div>
                            <input type="number" min="1" class="form-control" name="waybill_end_code" id="waybill_end_code"
                              value="" placeholder="<?=$waybillEndCode;?>">
                          </div>
                      </div>

                      <div class="col-sm-2  col-md-2 m-auto">
                          <button type="button" onclick="generateWaybillCodes()" class="btn btn-info btn-lg p-2 rounded-md">Generate</button>
                      </div>
                  </div>

                  <div class="form-group row">
                        <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('email'); ?></label>
                        <div class="col-sm-4  col-md-4">
                            <input type="email" class="form-control" name="system_email"
                                value="<?php echo $this->db->get_where('settings', array('type' => 'system_email'))->row()->description; ?>">
                        </div>

                        <label  class="col-sm-2  col-md-2 col-form-label"><strong><?php echo get_phrase('fiscal_periods'); ?>:</strong></label></label>
                      <div class="col-sm-2  col-md-2">
                                                </div>
                      <div class="col-sm-2  col-md-2">
                          
                      </div>
                  </div>

                  <div class="form-group row">
                        <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('text_messaging'); ?></label>
                        <div class="col-sm-4  col-md-4">
                            <a href="#" class="btn btn-success btn-block" style="font-size: 13px;" onclick="sms_setup_popup()">Setup SMS</a>
                        </div>

                        <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('Opening_day'); ?></label>
                      <div class="col-sm-4  col-md-4">
                          <div class="input-group">
                            <select class="form-control" name="opening_day">
                              <?php 
                              $opening_day =  $this->db->get_where('settings', array('type' => 'opening_day'))->row()->description; 
                              ?>
                              <option value="monday" <?php if($opening_day == 'monday') echo 'selected'; ?>>Monday</option>
                              <option value="tuesday" <?php if($opening_day == 'tuesday') echo 'selected'; ?>>Tuesday</option>
                              <option value="wednesday" <?php if($opening_day == 'wednesday') echo 'selected'; ?>>Wednesday</option>
                              <option value="thursday" <?php if($opening_day == 'thursday') echo 'selected'; ?>>Thursday</option>
                              <option value="friday" <?php if($opening_day == 'friday') echo 'selected'; ?>>Friday</option>
                              <option value="saturday" <?php if($opening_day == 'saturday') echo 'selected'; ?>>Saturday</option>
                              <option value="sunday" <?php if($opening_day == 'sunday') echo 'selected'; ?>>Sunday</option>
                            </select>
                          </div>
                      </div>
                  </div>

                  <div class="form-group row">
                        <div class="col-sm-6  col-md-6">

                        </div>

                        <label  class="col-sm-2  col-md-2 col-form-label"><?php echo get_phrase('closing_day'); ?></label>
                      <div class="col-sm-4  col-md-4">
                        <div class="input-group">
                            <select class="form-control" name="closing_day">
                              <?php 
                              $closing_day =  $this->db->get_where('settings', array('type' => 'closing_day'))->row()->description; 
                              ?>
                              <option value="monday" <?php if($closing_day == 'monday') echo 'selected'; ?>>Monday</option>
                              <option value="tuesday" <?php if($closing_day == 'tuesday') echo 'selected'; ?>>Tuesday</option>
                              <option value="wednesday" <?php if($closing_day == 'wednesday') echo 'selected'; ?>>Wednesday</option>
                              <option value="thursday" <?php if($closing_day == 'thursday') echo 'selected'; ?>>Thursday</option>
                              <option value="friday" <?php if($closing_day == 'friday') echo 'selected'; ?>>Friday</option>
                              <option value="saturday" <?php if($closing_day == 'saturday') echo 'selected'; ?>>Saturday</option>
                              <option value="sunday" <?php if($closing_day == 'sunday') echo 'selected'; ?>>Sunday</option>
                            </select>
                          </div>
                      </div>
                  </div>
                

                  <div class="form-group row">
                      <div class="col-sm-9 col-xs-8">
                          <input type="submit" class="btn btn-info btn-lg" name="company_submit"
                              value="Submit">
                      </div>
                  </div>
                </div>
              </div>
        </div>
      </form>
        </div>
      </div>
    </div>
  </div>

  <!--Accounts Tab-->
  <div class="tab-pane" id="accounts" role="tabpanel">
    <div class="row">
      <div class="col-md-12">
        <div style="width: 100%; padding: 5px">
          <style type="text/css">
  #preloader2{
    width: 100%;
    min-height: 1020px;
    background-color: #fff;
    text-align: center;
    z-index: 99999;
    position: absolute;
    top: 350px;
  }

  .ajax_alert {
      position: relative;
      top: 100px;
  }
</style>
            <!----CATEGORY CREATION FORM STARTS---->
            <?php
//query the account type table
$account_type_array = $this->db->get('account_type')->result_array();
?>
            <div class="container">
                <div class="row">
                  <div class="col-md-12">
                    <h5>Add New Account</h5>
                    <hr>
                    <?php echo form_open(site_url('admin/system_settings/account_create'), array('class' => 'form-horizontal form-groups-bordered validate', 'id' => 'create_account_form', 'target' => '_top')); ?>
                      <table class="table table-responsive" id="" style="width:100%; border-collapse:collapse;">
                        <thead>

                            <tr>
                                <tr>
                                <th>Account Name</th>
                                <th>Opening Balance</th>
                                <th>Type</th>
                                <th>Bank</th>
                                <th>Transferrable</th>
                                <th></th>
                            </tr>
                            </tr>
                        </thead>
                        <tbody>

                          <tr>
                                <td width="300">
                                      <input type="text" class="form-control" id="acc_name" name="acc_name" required="required" data-validate="required" placeholder="Account Name" data-message-required="<?php echo get_phrase('value_required'); ?>"/>

                                </td>
                                <td width="150">
                                  <input type="currency" class="form-control" min="0" size="40" id="acc_balance" name="acc_balance" placeholder="Account Balance"/>
                                </td>
                                <td width="150">
                                  <select class="form-control" name="acc_type" id="acc_type" required="required">
                                    <?php
foreach ($account_type_array as $ac):
?>
                                    <option value="<?=$ac['account_type_id'];?>"><?=$ac['name'];?></option>
                                  <?php endforeach;?>
                                  </select>
                                </td>
                                <td>
                                  <div class="form-check-inline">
                                    <label class="form-check-label">
                                      <input type="radio" class="form-check-input" value="1" id="bank_yes" name="bank" required>Yes
                                    </label>
                                  </div>
                                  <div class="form-check-inline">
                                    <label class="form-check-label">
                                      <input type="radio" class="form-check-input" value="0" id="bank_no" name="bank" required>No
                                    </label>
                                  </div>
                                </td>
                                <td align="right">
                                  <div class="form-check-inline">
                                    <label class="form-check-label">
                                      <input type="checkbox" class="form-check-input" value="1" id="transferrable" name="transferrable">
                                    </label>
                                  </div>
                                </td>
                                <td>
                                  <div class="">
                                    <button type="submit" class="btn btn-info"><?php echo get_phrase('add_account'); ?></button>
                                </div>
                                </td>
                            </tr>

                        </tbody>
                      </table>
                      <?php echo form_close(); ?>
                </div>
              </div>

                <div class="container">
                      <div><h5>List of Accounts</h5></div>
                    <hr>

                    <div class="row">
                      <div class="col-md-12">
                        <?php echo form_open(site_url('admin/system_settings/account_update/'), array('class' => 'form-horizontal form-groups-bordered validate', 'id' => 'account_update_form')); ?>
                        <table class="table table-info table-responsive table-striped table-hover" id="dataTable" width="100%" style="border-collapse:collapse;">
                        <thead>
                            <tr>
                                <th>Account Name</th>
                                <th id="balance_th" style="text-align: right;">Balance</th>
                                <th>Type</th>
                                <th>Bank</th>
                                <th>Transferrable</th>
                                <th></th>
                                <th>Edit</th>
                                <th>Delete</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php
$all_accounts = $this->db->get('accounts')->result_array();
$sn = 1;
foreach ($all_accounts as $row):
?>
                              <tr <?php if ($row['name'] == 'Accounts Payable' || $row['name'] == 'Accounts Receivable' || $row['name'] == 'General Products Purchased' || $row['name'] == 'General Sales' || $row['name'] == 'General Office Expenses') {
	echo 'ondblclick="alert(\'This account is not editable\')" onclick="alert(\'This account is not editable\')"';
}
?>>
                                <td width="350">
                                    <div class="raw_<?=$row['account_id'];?>"><?=$row['name'];?></div>
                                      <input type="text" class="form-control edit_<?=$row['account_id'];?>" style="display: none;" size="40" id="edit_account_name_<?=$row['account_id'];?>" name="acc_name_<?=$row['account_id'];?>" value="<?php echo $row['name']; ?>" required/>

                                </td>
                                <td width="150" align="right">
                                  <div class="raw_<?=$row['account_id'];?>"><?=number_format($row['current_balance'], 2, '.', ',');?></div>
                                  <input type="currency" class="form-control edit_<?=$row['account_id'];?>" style="display: none;" size="40" id="edit_account_balance_<?=$row['account_id'];?>" name="acc_balance_<?=$row['account_id'];?>" value="<?php echo $row['opening_balance']; ?>" required/>
                                </td>
                                <td width="120">
                                  <div class="raw_<?=$row['account_id'];?>"><?=$this->db->get_where('account_type', array('account_type_id' => $row['account_type']))->row()->name;?></div>
                                  <select class="form-control edit_<?=$row['account_id'];?>" style="display: none;" id="edit_account_type_<?=$row['account_id'];?>" name="acc_type_<?=$row['account_id'];?>" required>
                                    <?php
foreach ($account_type_array as $act):
?>
                                    <option value="<?=$act['account_type_id'];?>" <?php if ($row['account_type'] == $act['account_type_id']) {
	echo 'selected';
}
?>><?=$act['name'];?></option>
                                    <?php endforeach;?>
                                  </select>
                                </td>
                                <td width="150">
                                  <div class="raw_<?=$row['account_id'];?>"><?Php echo $row['account_is_bank'] == 1 ? 'Yes' : 'No'; ?></div>
                                  <div class="form-check-inline edit_<?=$row['account_id'];?>" style="display: none;" >
                                    <label class="form-check-label">
                                      <input type="radio" class="form-check-input" value="1" <?php if ($row['account_is_bank'] == 1) {
	echo 'checked';
}
?> id="edit_account_bank_yes_<?=$row['account_id'];?>" name="bank_<?=$row['account_id'];?>" required>Yes
                                    </label>
                                  </div>
                                  <div class="form-check-inline edit_<?=$row['account_id'];?>" style="display: none;" >
                                    <label class="form-check-label">
                                      <input type="radio" class="form-check-input" value="0" <?php if ($row['account_is_bank'] == 0) {
	echo 'checked';
}
?> id="edit_account_bank_no_<?=$row['account_id'];?>" name="bank_<?=$row['account_id'];?>" required>No
                                    </label>
                                  </div>
                                </td>
                                <td align="right">
                                  <div class="form-check-inline">
                                    <label class="form-check-label">
                                      <input type="checkbox" class="form-check-input" value="1" <?php if ($row['account_is_transferrable'] == 1) {
	echo 'checked';
}
if ($row['name'] == "Accounts Receivable" || $row['name'] == "Accounts Payable" || $row['name'] == 'General Products Purchased' || $row['name'] == 'General Sales' || $row['name'] == 'General Office Expenses') {
	echo 'disabled="disabled"';
}
?> id="transferrable_<?=$row['account_id'];?>" name="transferrable_<?=$row['account_id'];?>">
                                    </label>
                                  </div>
                                </td>

                                <input type="hidden" value="<?=$row['account_id'];?>" name="cat_id_<?=$row['account_id'];?>" id="cat_id_<?=$row['account_id'];?>">
                                <td>
                                <a href="javascript:void(0);" class="btn btn-info update_holder_<?=$row['account_id'];?>" style="display: none" onclick="edit_category('<?=$row['account_id'];?>')">Update</a>
                                </td>
                                </form>
                                <td>
                                  <!--DISABLE THE EDIT BUTTON ON VITAL ACCOUNTS-->
                                  <?php if ($row['name'] == 'Accounts Payable' || $row['name'] == 'Accounts Receivable' || $row['name'] == 'General Products Purchased' || $row['name'] == 'General Sales' || $row['name'] == 'General Office Expenses'): ?>
                                  <a href="javascript:;" disabled="disabled" class="btn btn-success btn-sm"><i class="entypo-pencil"></i></a>
                                <?php
else:
?>
                                    <a href="javascript:;" class="btn btn-success btn-sm" id="btn_<?=$row['account_id'];?>" onclick="show_cat_edit('<?=$row['account_id'];?>')"><i class="entypo-pencil"></i></a>
                                  <?php
endif;?>
                                </td>
                                <td>
                                  <!--HIDE THE DELETE BUTTON ON VITAL ACCOUNTS-->
                                  <?php if ($row['name'] != 'Accounts Payable' && $row['name'] != 'Accounts Receivable' && $row['name'] != 'General Products Purchased' && $row['name'] != 'General Sales' && $row['name'] != 'General Office Expenses'): ?>
                                  <a href="javascript:;" class="btn btn-danger btn-sm" onclick="delete_cat('<?=$row['account_id'];?>')"><i class="entypo-trash"></i></a>
                                <?php endif;?>
                                </td>
                            </tr>
                            <?php
$sn++;
endforeach;?>

                            </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
      <!----ACCOUNT CREATION FORM ENDS-->
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="tab-pane" id="logo" role="tabpanel">
    <div class="row">
      <div class="col-md-12">
        <div style="width: 10s0%; padding: 5px">
            <?php echo form_open(site_url('admin/system_settings/upload_logo'), array(
	'class' => 'form-horizontal form-groups-bordered validate', 'id' => 'logo_upload_form', 'target' => '_top', 'enctype' => 'multipart/form-data')); ?>

              <div class="col-md-6">
                <div class="panel panel-primary" >

                  <div class="panel-heading">
                      <div class="panel-title">
                          <?php echo get_phrase('upload_logo'); ?>
                      </div>
                  </div>

                  <div class="panel-body">

                    <center>
                      <div class="form-group">
                          <label for="field-1" class="col-sm-3 col-xs-3 control-label"><?php echo get_phrase(); ?></label>

                          <div class="col-sm-9 col-xs-9">
                              <div class="fileinput fileinput-new" data-provides="fileinput">
                                  <div class="fileinput-new thumbnail" style="width: 200px; height: 200px;" data-trigger="fileinput">
                                      <img src="<?php echo base_url(); ?>uploads/school_logo.png" alt="...">
                                  </div>
                                  <div class="fileinput-preview fileinput-exists thumbnail" style="max-width: 200px; max-height: 150px"></div>
                                  <div>
                                      <span class="btn btn-white btn-file">
                                          <span class="fileinput-new btn btn-primary btn-lg btn-block">Select image</span>
                                          <span class="fileinput-exists">Change</span>
                                          <input type="file" name="userfile" id="userfile" accept="image/*" required="required">
                                      </span>
                                      <a href="#" class="btn btn-orange btn-lg fileinput-exists" data-dismiss="fileinput">Remove</a>
                                  </div>
                              </div>
                          </div>
                      </div>


                    <div class="form-group">
                      <div class="col-sm-offset-2 col-md-8 col-lg-offset-2 col-lg-8 col-xs-4 col-xs-offset-4">
                          <button type="submit" class="btn btn-info btn-block btn-lg col-sm-8 col-sm-offset-2"><?php echo get_phrase('upload'); ?></button>
                      </div>
                    </div>
                  </center>
                  </div>

              </div>
              </div>

            <?php echo form_close(); ?>
        </div>
      </div>
    </div>
  </div>
</div>

</div>


<!-----  DATA TABLE EXPORT CONFIGURATIONS ---->
<script type="text/javascript">

  jQuery(document).ready(function($)
  {
    $('#dataTable').dataTable();
    var datatable = $("#table_export").dataTable();
    $('#category_tbl').dataTable();

        var class_name = '<?php echo $class_name; ?>';
        var raw_score = '<?php echo $raw_score; ?>';
        if(class_name === 'FORM' && raw_score == 'Yes') {
            $('#status').css('display', 'block');
        }else{
            $('#status').css('display', 'none');
        }
  });
  //delete category
  function delete_cat(id) {
      let conf = confirm('If you delete this account, all records such as transactions with this account will be deleted permanently. Are you sure you really want to delete it?\nClick CANCEL if you are not sure.');
      if(conf === true) {

        showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

          $.ajax({
            url: '<?php echo site_url('admin/system_settings/account_delete/') ?>' + id,
            type: 'POST',
            dataType: 'json',
            })
            .done(function(data) {
              if(data.success) {
                $('.close').click();
                showAjaxModal_confirm('Account Deleted Successfully.', 'Success');

                setTimeout(() => {
                  $('#modal_confirm .close').click(); //window.location.reload();
                }, 3000);

              } else {
               // $('.close').click();
                showAjaxModal_confirm('Account Could Not Be Deleted Successfully Because It Is Used In A Number Of Transactions.', 'Error');
              }
          });
      }

  }

  //show edit field

  function show_cat_edit(id) {
    if($('.edit_' + id).attr('style') == 'display: none;') {
        $('table #balance_th').text('');
        $('table #balance_th').text('Opening Balance');
        $('.raw_' + id).css('display', 'none');
        $('.raw_' + id).slideUp('slow');
        $('.edit_' + id).css('display', 'inline-flex');
        $('.update_holder_' + id).slideDown('slow');
    } else {
        $('table #balance_th').text('');
        $('table #balance_th').text('Balance');
        $('.edit_' + id).css('display', 'none');
        $('.edit_' + id).slideUp('slow');
        $('.raw_' + id).css('display', 'block');
        $('.update_holder_' + id).slideUp('slow');
    }



      //remove the onclick on the button
     // $('#btn_' + id).removeAtrr('onclick');
      //$('#btn_' + id i).text('Update');
  }


  //sms_setup_popup
  function sms_setup_popup() {
    showAjaxModal_payments_sales('<?php echo site_url('modal/popup/sms_settings/'); ?>', 'Setup SMS');
  }

  //company tab settings form submitted
  $('#company_settings_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');
    //get form data
    let form_data = $('#company_settings_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/system_settings/update') ?>',
      type: 'POST',
      dataType: 'json',
      data: form_data
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Company Settings Updated Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 3000);
      }
    });

  });

  //accounts tab settings form submitted
  $('#create_account_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    let form_data = $('#create_account_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/system_settings/account_create') ?>',
      type: 'POST',
      dataType: 'json',
      data: form_data
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Account Created Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click();// window.location.reload();
        }, 3000);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('The same account\'s name already exists', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err').append('<li>' + val + '</li>');
        }); })

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm(err.responseText, 'Error');
    });
  });

   //Update Accounts
  function edit_category(id) {

    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    let form_data = $('#account_update_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/system_settings/account_update/') ?>' + id,
      type: 'POST',
      dataType: 'json',
      data: form_data
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Account Updated Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 3000);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('The same account\'s name already exists', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err').append('<li>' + val + '</li>');
        }); })

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Make sure the amount you entered is valid and does not contain any alphabets or any other characters apart from \'dot (.)\'', 'Error');
    });
  }

  //Upload logo
  $('#logo_upload_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    let file_data = $('#userfile').prop('files')[0];
    let form_data = new FormData();
    form_data.append('userfile', file_data);
    form_data.append('<?php echo $this->security->get_csrf_token_name(); ?>', '<?php echo $this->security->get_csrf_hash(); ?>');

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/system_settings/upload_logo') ?>',
      type: 'POST',
      data: form_data,
        dataType: 'text',
        cache: false,
        contentType: false,
        processData: false,
    })
    .done(function(data) {
      if(data == true) {
        $('.close').click();
        showAjaxModal_confirm('Logo Uploaded Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 3000);
      } else {
          $('.close').click();
          showAjaxModal_confirm('Failed to upload Logo, please try again!', 'Error');

          setTimeout(() => {
            $('#modal_confirm .close').click();
          }, 3000);
      }
    });
  });


  //generate invoice codes
  function generateInvoiceCodes() {

    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    let start_code = $('#invoice_start_code').val();
    let end_code = $('#invoice_end_code').val();

    //client side validation
    if((start_code == '' && end_code == '') || (start_code < 1 || end_code < 1) || start_code == end_code) {
      showAjaxModal_confirm('INVALID INVOICE CODES', 'Error');
      return;
    }

    if(start_code > end_code) {
      showAjaxModal_confirm('<strong>INVALID INVOICE CODE RANGE:</strong><br/>MAKE SURE START CODE IS LESS THAN THE END CODE!', 'Error');
      return;
    }

    $.ajax({
      url: '<?php echo site_url('admin/generateInvoiceCodes/');?>' + start_code + '/' + end_code,
      type: 'post',
      dataType: 'json',
      cache: false,
    })
    .done(function(response) {

      if(response.success == true) {


        showAjaxModal_confirm('INVOICE CODES FROM ' + start_code + ' TO ' + end_code + ' INCLUSIVE GENERATED SUCCESSFULLY', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 4000);

      } else if(response.success == false) {

        showAjaxModal_confirm(response.message, 'Error');

      } else if(response.success == 'duplicate') {

        showAjaxModal_confirm(response.message, 'Error');

      } else {
        //problem
        $(function(){
          $.each(response, function(index, val) {
          $('#list_err').append('<li>' + val + '</li>');
        }); })

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err"></ul>', 'Error');
      }

    })
    .fail(function(err) {
      showAjaxModal_confirm('THERE IS A PROBLEM: ' + err.responseText, 'Error');
    })
  }


  //generate waybill codes
  function generateWaybillCodes() {

    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    let start_code = $('#waybill_start_code').val();
    let end_code = $('#waybill_end_code').val();

    //client side validation
    if((start_code == '' && end_code == '') || (start_code < 1 || end_code < 1) || start_code == end_code) {
      showAjaxModal_confirm('INVALID WAYBILL CODES', 'Error');
      return;
    }

    if(start_code > end_code) {
      showAjaxModal_confirm('<strong>INVALID WAYBILL CODE RANGE:</strong><br/>MAKE SURE START CODE IS LESS THAN THE END CODE!', 'Error');
      return;
    }

    $.ajax({
      url: '<?php echo site_url('admin/generateWaybillCodes/');?>' + start_code + '/' + end_code,
      type: 'post',
      dataType: 'json',
      cache: false,
    })
    .done(function(response) {

      if(response.success == true) {

        showAjaxModal_confirm('WAYBILL CODES FROM ' + start_code + ' TO ' + end_code + ' INCLUSIVE GENERATED SUCCESSFULLY', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 4000);

      } else if(response.success == false) {

        showAjaxModal_confirm(response.message, 'Error');

      } else if(response.success == 'duplicate') {

        showAjaxModal_confirm(response.message, 'Error');

      } else {
        //problem
        $(function(){
          $.each(response, function(index, val) {
          $('#list_err').append('<li>' + val + '</li>');
        }); })

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err"></ul>', 'Error');
      }

    })
    .fail(function(err) {
      showAjaxModal_confirm('<strong>THERE IS A PROBLEM:</strong> ' + err.responseText, 'Error');
    })
  }

</script>

<?php
else:
?>
<center><strong class="bg-danger text-light p-5">Sorry! You don't have enough permission to view this page.</strong></center>

<?php
endif; 
?>