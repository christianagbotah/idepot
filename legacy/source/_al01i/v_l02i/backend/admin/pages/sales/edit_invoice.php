<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('edit_invoice');?>
              </div>
          </div>

          <div class="panel-body" style="padding: 10px">
            <?php
               echo form_open(site_url('admin/invoice/update') ,
                array('class' => 'form-groups-bordered','target'=>'_top')); ?>
                <table class="table table-responsive" width="100%" cellpadding="0" cellspacing="0">
                    <thead>
                        <tr>
                            <th>
                                <div class="form-group row">
                                <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-dark text-light">Invoice Date:</div>
                                    </div>
                                    <input type="text" required="true" class="form-control datepicker" name="order_date" data-format="dd-mm-yyyy"
                                        value="<?php echo date('d-m-Y'); ?>">
                                </div>
                                </div>
                                </div>
                                
                                <div class="form-group row">
                                <div class="col-sm-8 col-md-8">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light">To:</div>
                                        </div>
                                        <select required="true" class="form-control" name="invoice_to">
                                            <option value="">Alfred</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="col-sm-4 col-md-4"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/');?>', 'Add new customer')"><i class="fa fa-fw fa-plus"></i></a>

                                <a href="javascript:;" class="btn btn-success btn-sm" title="Edit" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_customer/');?>', 'Edit Customer')"><i class="fa fa-fw fa-edit"></i></a></div>
                                </div>
                                <div class="form-group row">
                                <div class="col-md-12 col-sm-12">
                                    <label  class="control-label"><?php echo get_phrase('bill_to:');?></label>
                                    <div class="col-sm-12 col-md-12">
                                        <textarea  name="bill_to" class="form-control" cols="50" required ><?php echo 'Ashaiman';?></textarea>
                                    </div>
                                </div>
                            </div>
                            </th>

                            <th>
                            <div class="form-group row">
                                <div class="col-sm-12 col-md-12">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light">Create From</div>
                                        </div>
                                        <select required="true" class="form-control" name="create_from">
                                            <option value="">New Invoice</option>
                                            <option value="">Sales Order</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div class="form-group row">
                                <div class="col-sm-12 col-md-12">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light">Invoice No</div>
                                        </div>
                                        <input type="text" name="invoice_no" class="form-control" required="required">
                                    </div>
                                    </div>
                                </div>
                            <div class="form-group row">
                                <div class="col-sm-12 col-md-12">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light">Deposit Account</div>
                                        </div>
                                        <select required="true" class="form-control" name="deposit_account">
                                            <option value="">SCB-MCM</option>
                                            <option value="">Access Bank</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            </th>
                        </tr>

                    </thead>
                    
                </table>

            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="invoice_create_table">
                    <thead>
                      <tr>
                        <th>Quantity</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                      
                    </tbody>
                    
                </table>
            </div>

            <hr>
            <div class="row">
                <div class="col-md-8 col-sm-8 col-lg-8"></div>
                <div class="col-md-4 col-sm-4 col-lg-4" style="text-align: right">
                    <a href="javascript:;" onclick="add_new_row()" class="btn btn-success btn-sm" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr>

            <div class="form-group row">
                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('comments');?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="comments" class="form-control" cols="50"  ><?php echo 'Comments';?></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:');?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="private_comments" class="form-control" cols="50" ><?php echo 'Private Comments';?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></span> 533,000.00</strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></span> 533,000.00</strong></th>
                                </tr>
                            </thead>
                        </table>
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-sm-3 col-md-3 col-xs-6">
                    <input type="submit" class="btn btn-info btn-lg"
                        value="Create Invoice">
                </div>
                <div class="col-sm-2 col-md-2 col-xs-6">
                    <button class="btn btn-danger btn-lg" data-dismiss="modal">Cancel</button>
                </div>
                <div class="col-sm-4 col-md-4"></div>
            </div>
          </form>
          </div>

          </div>
        </div>
    </div>
</div>

<script type="text/javascript">
    $(function() {
        
    });

    //format currency
    function currency_formatter(id_name) {
         $('#'+id_name).on( "keyup", function( event ) {
 
            // 1.
            var selection = window.getSelection().toString();
            if ( selection !== '' ) {
                return;
            }
         
            // 2.
            if ( $.inArray( event.keyCode, [38,40,37,39] ) !== -1 ) {
                return;
            }

            // 1
            var $this = $( this );
            var input = $this.val();
             
            // 2
            var input = input.replace(/[\D\s\._\-]+/g, "");
             
            // 3
            input = input ? parseInt( input, 10 ) : 0;
             
            // 4
            $this.val( function() {
                return ( input === 0 ) ? "" : input.toLocaleString( "en-US" );
            } );
         
        } );
    }

    //add row to table at a button click
    function add_new_row() {
        let tbody = $('#p_order_create_table').find('tr').length;

        let tr = '<tr id="tr_'+ tbody +'"><td width="80"><input type="number" required="true" class="form-control" name="order_quantity" placeholder="1" value=""></td><td><select required="true" class="form-control" name="order_item"><option value=""></option></select></td><td></td><td width="150" align="right"><div class="input-group"><div class="input-group-prepend"><div class="input-group-text"><?php echo $this->db->get_where('settings' , array('type' =>'currency'))->row()->description;?></div></div><input type="number" required="true" class="form-control" name="order_unit_price" placeholder="0.00" value=""></div></td><td></td><td><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td></tr>';
        
        //add row now
        $('#invoice_create_table tbody').append(tr);
    }

    //reemove row
    function remove_row(id) {
        $('#tr_'+id).remove();
    }
</script>