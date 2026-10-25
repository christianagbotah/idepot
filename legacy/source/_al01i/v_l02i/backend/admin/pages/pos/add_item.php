<div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-success">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('item_details'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
echo form_open(site_url('admin/item/create'),
	array('class' => 'form-groups-bordered', 'id' => 'create_item_form', 'target' => '_top')); ?>

                    <div class="form-group row">
                      <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('item_image'); ?></label>
                      <div class="fileinput fileinput-new col-sm-4 col-md-4 col-xs-6" data-provides="fileinput">
                        <div class="fileinput-new thumbnail" data-trigger="fileinput">
                          <img src="<?= base_url().'/uploads/item_image/placeholder.jpg' ?>" width = "75" height="90" alt="Item Image">
                        </div>
                        <div class="fileinput-preview fileinput-exists thumbnail" style="max-width: 120px; max-height: 150px"></div>
                        <div>
                          <span class="btn btn-info btn-file">
                            <span class="fileinput-new">Select image</span>
                            <span class="fileinput-exists">Change</span>
                            <input type="file" id="item_image" name="item_image" accept="image/*">
                          </span>
                          <a href="#" class="btn btn-orange btn-lg fileinput-exists" data-dismiss="fileinput">Remove</a>

                        </div>
                      </div>
                    </div>

                    <?php
$category_add = $this->db->get('item_category');
$category_array_add = $category_add->result_array();

?>
                <div class="form-group row">
                      <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('item_category'); ?></label>
                      <div class="col-sm-4 col-md-4 col-xs-6">
                        <select required="true" class="form-control" name="category_name" id="category_name">
                            <option value="">Select Category</option>
                            <?php foreach ($category_array_add as $cat): ?>
                            <option value="<?=$cat['category_id'];?>"><?=$cat['category_name'];?></option>
                            <?php endforeach;?>
                        </select>
                      </div>
                </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('item_name'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="text" required="required" class="form-control" name="item_name"
                                value="">
                        </div>
                    </div>

                    <?php
$suppliers_add = $this->db->get('suppliers');
$suppliers_array_add = $suppliers_add->result_array();

?>
                <div class="form-group row">
                      <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('supplier_name'); ?></label>
                      <div class="col-sm-4 col-md-4 col-xs-6">
                        <select required="true" class="form-control" name="supplier_name" id="supplier_name">
                            <option value="">Select Supplier</option>
                            <?php foreach ($suppliers_array_add as $srow): ?>
                            <option value="<?=$srow['supplier_id'];?>"><?=$srow['supplier_name'];?></option>
                            <?php endforeach;?>
                        </select>
                      </div>
                </div>
                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-6 col-form-label"><?php echo get_phrase('description'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <textarea  name="description" class="form-control" cols="50" placeholder="Description"></textarea>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-6 col-form-label"><?php echo get_phrase('unit_sales_price_(Selling_price)'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-success text-light">
                                  <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                </div>
                              </div>
                              <input type="text" class="form-control" name="selling_price"
                                value="" required="required">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('unit_purchase_price_(Cost_price)'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <div class="input-group">
                              <div class="input-group-prepend">
                                <div class="input-group-text bg-danger text-light">
                                  <?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                </div>
                              </div>
                              <input type="text" class="form-control" name="purchase_price"
                                value="" required="required">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('available_quantity'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-6">
                              <input type="text" class="form-control" name="quantity"
                                value="">
                        </div>
                    </div>
                    <div class="form-group">
                      <div class="col-md-4 col-sm-4">
                        <input type="submit" class="btn btn-info btn-lg" name="item_submit" value="Create Item">
                      </div>
                    </div>

                  </form>

                  </div>
                  <div class="panel-footer"></div>
                </div>
          </div>
    </div>

    <script type="text/javascript">

      //Item Creation form submitted
  $('#create_item_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    //let form_data = $('#create_item_form').serialize();

    $('#modal_confirm').attr('data-backdrop', 'static');
    $('#modal_confirm').attr('data-keyboard', 'false');
    showAjaxModal_confirm('Please Wait... We are working on it!', 'Loading');

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/item/create') ?>',
      type: 'POST',
      dataType: 'json',
      data: new FormData(this),
      cache: false,
      contentType: false,
      processData: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('#main_holder').html('<center><div style="position: absolute; top: 38vh; left: 46vw;"><h3 style="color: black">Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h4 style="color: black">Loading your page</h4></div></center>');

              getMainPage();
        //$('.close').click();
        showAjaxModal_confirm('Item Added Successfully.', 'Success');

        setTimeout(() => {
          $('.close').click();
          //window.location.reload();
        }, 500);
      } else if(data.success == 'duplicate') {

        $('#modal_confirm').removeAttr('data-backdrop');
        $('#modal_confirm').removeAttr('data-keyboard');

        showAjaxModal_confirm('Duplicate found: Same item\'s name already exists', 'Error');
      } else {

        $('#modal_confirm').removeAttr('data-backdrop');
        $('#modal_confirm').removeAttr('data-keyboard');
        
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_item_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_item_create"></ul>', 'Error');
      }
    });
  });
    </script>