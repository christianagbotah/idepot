<div class="row">
        
          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-danger">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('edit_account_payable');?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
                       echo form_open(site_url('admin/edit_enter_payable/create') ,
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
                                  <div class="input-group-text bg-dark text-light">Entry Date:</div>
                              </div>
                              <input type="text" required="true" class="form-control datepicker" name="payment_date" data-format="dd-mm-yyyy"
                                  value="<?php echo date('d-m-Y'); ?>">
                          </div>
                      </div>
                  </div>

                  <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('supplier_address');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <textarea  name="supplier_address" class="form-control" cols="50"></textarea>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-6 col-md-6 col-xs-6 col-form-label"><?php echo get_phrase('account_payable');?></label>
                        <div class="col-sm-6 col-md-6 col-xs-6">
                            <select required="true" class="form-control" name="account_payable">
                                  <option value="">Account Payable</option>
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