<div class="row">
        
          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-primary">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('enter_payment_for_accounts_payable');?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
                       echo form_open(site_url('admin/pay_payable/create') ,
                        array('class' => 'form-groups-bordered','target'=>'_top')); ?>
                    <div class="form-group row">
                      <div class="col-sm-5 col-md-5">
                          <div class="input-group">
                              <div class="input-group-prepend">
                                  <div class="input-group-text bg-info text-light">Supplier:</div>
                              </div>
                              <select required="true" class="form-control" name="supplier_name">
                                  <option value="">GH BUILDERS</option>
                              </select>
                          </div>
                      </div>

                      <div class="col-sm-2 col-md-2"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/');?>', 'Add new supplier')"><i class="fa fa-fw fa-plus"></i></a>

                      <a href="javascript:;" class="btn btn-success btn-sm" title="Edit" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/edit_supplier/');?>', 'Edit Supplier')"><i class="fa fa-fw fa-edit"></i></a></div>

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

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_paid_from');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select required="true" class="form-control" name="account_paid_from">
                                  <option value="">Standard Chattered Bank-MCM</option>
                                  <option value="">Access Bank-MCM</option>
                            </select>
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
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('amount');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="number" class="form-control" name="amount_paid" placeholder="Enter Amount Paid" value="<?php echo '65,000'?>" required>
                        </div>
                    </div>
                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('reference_number');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <input type="text" class="form-control" name="reference_number" placeholder="" value="">
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('journal_memo');?></label>
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