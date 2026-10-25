<?php 
    //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

  $supplier_id = $param2;

  //database query
  $this_supplier_array = $this->db->get_where('suppliers', array('supplier_id' => $supplier_id))->result_array();
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
  foreach($this_supplier_array as $sup):
?>
<hr>
<?php
   echo form_open(site_url('admin/supplier/update') ,
    array('class' => 'form-groups-bordered', 'id' => 'supplier_edit_form','target'=>'_top')); ?>
<div class="tab-content">
  <!--FOR DETAILS-->
  <div class="tab-pane active" id="details">
    <div class="row">
        
          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-primary">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('supplier\'s_details');?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('supplier_name');?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="text" required="true" class="form-control" name="supplier_name"
                                value="<?= $sup['supplier_name']; ?>" required>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('contact_person\'s_name');?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="text" required="true" class="form-control" name="contact_person_name"
                                value="<?= $sup['contact_person']; ?>" required>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('address');?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <textarea  name="address" class="form-control" cols="50" required><?= $sup['address']; ?></textarea>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('mobile_number');?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="tel" class="form-control" name="mobile_number" placeholder="Enter Office Mobile Number" value="<?= $sup['mobile']; ?>" required>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-4 col-form-label"><?php echo get_phrase('phone_number');?></label>
                        <div class="col-sm-9 col-md-9 col-xs-8">
                            <input type="tel" class="form-control" name="phone_number" placeholder="Enter Office Phone Number"
                                value="<?= $sup['phone']; ?>" >
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-3 col-md-3 col-xs-5 col-form-label"><?php echo get_phrase('email');?></label>
                        <div class="col-sm-9 col-md-9 col-xs-7">
                            <input type="email" class="form-control" name="supplier_email"
                                value="<?= $sup['email']; ?>" >
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
                          <?php echo get_phrase('supplier\'s_accounts_information');?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('opening_balance');?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text"><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div>
                              </div>
                              <input type="currency" class="form-control" name="opening_balance" id="opening_balance"
                                value="<?= $sup['opening_balance']; ?>" >
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('balance_due');?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text"><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div>
                              </div>
                              <input type="currency" readonly="readonly" class="form-control" name="balance_due"
                                value="<?= $sup['balance_due']; ?>">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-7 col-form-label"><?php echo get_phrase('last_order_amount');?></label>
                        <div class="col-sm-4 col-md-4 col-xs-5">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text"><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div>
                              </div>
                              <input type="number" required="true" class="form-control" name="last_order_amount"
                                value="" readonly="readonly">
                            </div>
                        </div>
                    </div>
                    <hr><hr>

                    <?php 
                      $po_codes_array = $this->db
                                                ->select('po_code')
                                                ->distinct()
                                                ->where('supplier_id', $supplier_id)
                                                ->get('purchase_order')->result_array();
                      $codes_arrays = array();
                      foreach($po_codes_array as $po) {
                        array_push($codes_arrays, $po['po_code']);
                      }
                      
                      $total_amount = 0;
                      $total_quantity = 0;

                    ?>
                    <div class="form-group row">
                          <legend>Orders</legend>
                          <a href="javascript:;" class="btn btn-success btn-lg" disabled>Search Orders</a>
                          <table class="table table-striped table-hover table-success" width="100%" id="order_search">
                            <thead>
                              <tr>
                                <th>Date</th>
                                <th>Order No</th>
                                <th style="text-align: right">Quantity</th>
                                <th style="text-align: right">Amount</th>
                                <th style="text-align: right">Amount Due</th>
                                <th>Order Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              <?php for($i = 0; $i < count($codes_arrays); $i++): 

                                $order_search_array = $this->db
                                                  ->where('supplier_id', $supplier_id)
                                                  ->where('po_code', $codes_arrays[$i])
                                                  ->order_by('po_id', 'desc')
                                                  ->get('purchase_order')->result_array();

                                foreach($order_search_array as $order) {
                                  //addition
                                  $total_amount += $order['amount'];
                                  $total_quantity += $order['quantity'];
                                }

                                //other data
                                $date = date('d M, Y', $this->db->get_where('purchase_order', array('po_code' => $codes_arrays[$i]))->row()->date_timestamp);
                                $amount_due = $this->db->get_where('purchase_order', array('po_code' => $codes_arrays[$i]))->row()->amount_due;
                                $status = $this->db->get_where('purchase_order', array('po_code' => $codes_arrays[$i]))->row()->status;
                                ?>
                              <tr>
                                <td><?= $date; ?></td>
                                <td><?= $codes_arrays[$i]; ?></td>
                                <td align="right"><strong><?= number_format($total_quantity, 0, '.', ',') ?></strong></td>
                                <td align="right"><strong><?= numfmt_format_currency($fmt, $total_amount, $currency) ?></strong></td>
                                <td align="right"><strong><?= numfmt_format_currency($fmt, $amount_due, $currency) ?></strong></td>
                                <td <?php if($status == 'Paid') {echo 'class="bg-success text-light"'; } else if($status == 'Partially Paid') {echo 'class="bg-danger text-light"'; }; ?>><?= $status; ?></td>
                              </tr>

                            <?php endfor; ?>
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
            <input type="submit" class="btn btn-info btn-lg" name="company_submit"
                value="Submit">
        </div>
    </div>
  </form>
</div>
<?php endforeach; ?>

<script type="text/javascript">
  $('#order_search').DataTable();

  //Supplier Editing form submitted
  $('#supplier_edit_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    //check if opening balance is zero or not
    //if not zero, validate the value
    let op_bal = Number($('#opening_balance').val());
    
    if(op_bal != 0) {
      let regexp = /^-?[0-9]+([.]+[0-9]+)?$/g;
      let result = regexp.test(op_bal);

      if(result === false) {
        showAjaxModal_confirm('Ooopz! Make sure the amount you entered is valid and does not contain any alphabets or any other characters apart from \'dot (.)\'', 'Error');

        return false;
      }
    }//end

    let form_data = $('#supplier_edit_form').serialize();
    let supplier_id = <?php echo $supplier_id; ?>;

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/supplier/update/') ?>' + supplier_id,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('Supplier Updated Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); //window.location.reload();
        }, 3000);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: A Supplier with the same Mobile number or Email address already exists', 'Error');
      } else if(data.success == 'invalid_email') {
        showAjaxModal_confirm('Invalid Email. Please check and correct it', 'Error');
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_supplier_update').append('<li>' + val + '</li>');
        }); });
        
        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_supplier_update"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm('Ooopz! Unknown System Error Occured. Please Try Again! If this error persists, kindly contact the System Developer on 0243 618 186.', 'Error');
    });
  });
</script>