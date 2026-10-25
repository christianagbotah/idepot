<div class="row">
        
          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-success">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('payments_and_purchases');?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
                       echo form_open(site_url('admin/payments/create') ,
                        array('class' => 'form-groups-bordered','id' => 'payments_form', 'target'=>'_top')); ?>
                    <div class="form-group row">
                      <div class="input-group">
                        <div class="input-group-prepend">
                          <div class="input-group-text bg-danger text-light">Type Of Payment</div>
                        </div>
                        <div class="m-lg-3">
                          <div class="form-check-inline">
                          <label class="form-check-label">
                            <input type="radio" class="form-check-input" checked="checked" value="1" id="to_supplier" name="payment_type" required> To A supplier
                          </label>
                        </div>
                        <div class="form-check-inline">
                          <label class="form-check-label">
                            <input type="radio" class="form-check-input" value="2" id="to_expenditure" name="payment_type" required> An Expenditure
                          </label>
                          </div>
                        </div>
                        </div>
                    </div>

                    <div class="form-group row">
                      <div class="col-sm-5 col-md-5">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text text-light" id="pay_to_holder">Pay To:</div>
                              </div>
                              <select required="true" style="display: none;" class="form-control" name="pay_to" id="pay_to">
                                  <option value="">GH BUILDERS</option>
                              </select>
                              <input type="text" style="display: none" name="pay_to_exp" placeholder="Enter Expenditure" class="form-control" value="" id="pay_to_exp">
                          </div>
                      </div>

                      <div class="col-sm-2 col-md-2" style="display: none;" id="btnns"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/');?>', 'Add new supplier')"><i class="fa fa-fw fa-plus"></i></a>

                      <a href="javascript:;" class="btn btn-success btn-sm" title="Edit" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/edit_supplier/');?>', 'Edit Supplier')"><i class="fa fa-fw fa-edit"></i></a></div>

                      <div class="col-sm-5 col-md-5">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-dark text-light">Transaction Date:</div>
                              </div>
                              <input type="text" required="true" class="form-control datepicker" name="transaction_date" data-format="dd-mm-yyyy"
                                  value="<?php echo date('d-m-Y'); ?>">
                          </div>
                      </div>
                  </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_paid_from');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select required="true" class="form-control" name="account_paid_from">
                                  <option value="">SCB_MCM</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_balance');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-danger text-light"><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div>
                              </div>
                              <input type="text"  name="account_balance" class="form-control form-control-plaintext">
                            </div>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('method');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select required="true" class="form-control" name="method">
                                  <option value="">Cash</option>
                                  <option value="">Cheque</option>
                            </select>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount_paid');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-danger text-light"><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div>
                              </div>
                              <input type="text"  name="amount_paid" class="form-control" required="required" value="">
                            </div>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('reference_number');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="reference_number" class="form-control" value="">
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('transaction_reference');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <input type="text"  name="transaction_reference" class="form-control" value="">
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('journal_memo');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                              <textarea  name="journal_memo" class="form-control" cols="50"></textarea>
                        </div>
                    </div>

                    <hr>
                    <div class="form-group row ml-1" title="select the allocated account for this transaction">Account Allocated To</div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('allocated_account');?></label>
                        <div class="col-sm-5 col-md-5 col-xs-5">
                            <select required="true" class="form-control" name="allocated_account">
                                  <option value="">General Goods Purchased</option>
                                  <option value="">Expenses</option>
                            </select>
                        </div><a href="javascript:;" style="text-decoration: none" class="col-sm-1 col-md-1 col-xs-1 text-sm-center pt-2 text-light bg-success">DR</a>
                    </div>
                    <div class="form-group row">
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="submit" class="btn btn-info btn-lg form-control"
                                value="Record Account Payable" >
                        </div>
                    </div>
                  </div>
                </div>
          </div>
    </div>
  </div>

  <script src="<?php echo base_url('assets/js/neon-custom-ajax.js');?>"></script>

  <script type="text/javascript">
    $(function() {
        let valSelected = $('#payments_form input[name="payment_type"]:checked').val();
        if(valSelected == 1) {
          $('#pay_to_exp').slideUp('slow');
          $('#pay_to').slideDown('slow');
          $('#btnns').slideDown('slow');
          $('#pay_to_holder').addClass('bg-success');
        } else if(valSelected == 2) {
          $('#pay_to').slideUp('slow');
          $('#btnns').slideUp('slow');
          $('#pay_to_exp').slideDown('slow');
          $('#pay_to_holder').addClass('bg-danger');
        }
    });

    $('#payments_form input[name="payment_type"]').change(function(event) {
      /* Act on the event */
      let valSelected = $('#payments_form input[name="payment_type"]:checked').val();
      if(valSelected == 1) {
          $('#pay_to_exp').slideUp('slow');
          $('#pay_to').slideDown('slow');
          $('#btnns').slideDown('slow');
          $('#pay_to_holder').removeClass('bg-danger');
          $('#pay_to_holder').addClass('bg-success');
        } else if(valSelected == 2) {
          $('#pay_to').slideUp('slow');
          $('#btnns').slideUp('slow');
          $('#pay_to_exp').slideDown('slow');
          $('#pay_to_holder').removeClass('bg-success');
          $('#pay_to_holder').addClass('bg-danger');
        }
    });
  </script>