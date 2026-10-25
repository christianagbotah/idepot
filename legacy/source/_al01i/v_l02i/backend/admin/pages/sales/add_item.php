<?php
  echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

    $timestamp = strtotime('now');
?>

<div class="row" id="add_item_top">

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
                      <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('item_sub_category'); ?></label>
                      <div class="col-sm-4 col-md-4 col-xs-6">
                        <select required="true" class="form-control select2" name="category_name" id="category_name">
                            <option value="">Select Sub Category</option>
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
                        <select required="true" class="form-control select2" name="supplier_name" id="supplier_name">
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

             
                      <div class="container-fluid bg-light">
                        <div class="d-flex flex-row justify-content-between p-5 ">
                          <div>
                            <h4 class="text-dark">Item will be sold in other units?</h4>
                          </div>
                   
                            <div class="switch-button  showcase-switch-button">
                              <input id="item_switch"  type="checkbox" value="0" name="item_switch" onchange="toggleItemInUnits(this.value)">
                              <label for="item_switch" ></label>   <strong style="font-size: 16px;" id="yesOrNoSelector">NO</strong>                               
                            </div> 
                        </div>

                        <div id="item_units_holder" style="display: none">
                      
                            <?php
                              $all_units = $this->db->get('units')->result_array();
                              $all_packages = $this->db->get('packages')->result_array();
                            ?>

                            <div class="d-flex flex-column">
                              <div class="d-flex flex-row justify-content-between align-items-center mb-3">
                                  <div class="col-md-4 col-lg-4 col-sm-4"><label>Primary Unit:</label></div>
                                  <div class="col-md-8 col-lg-8 col-sm-8">
                                    <select class="form-control select2" name="package_name" id="package_name">
                                        <option>Select a primary</option>
                                        <?php
                                            foreach($all_packages as $package):
                                          ?>
                                          <option value="<?=$package['package_id']?>"><?=$package['package_name']?></option>
                                          <?php
                                            endforeach;
                                          ?>
                                        
                                      </select>
                                  </div>
                              </div>
                              <div>
                                <table class="table">
                                  <tbody>
                                    <tr>
                                      <td width="200">
                                        <select class="form-control select2" name="item_unit" id="item_unit">
                                          <option>Select Other Unit</option>

                                          <?php
                                            foreach($all_units as $unit):
                                          ?>
                                          <option value="<?=$unit['unit_id']?>"><?=$unit['unit_name']?></option>
                                          <?php
                                            endforeach;
                                          ?>
                                        </select>
                                      </td>
                                      <td>
                                        <input type="number" placeholder="Total Unit" name="unit_total" step="any" class="form-control"/>
                                      </td>
                                      <td>
                                        <input type="number" placeholder="Unit price" step="any" name="unit_price" class="form-control"/>
                                      </td>
                                      <td>
                                        <input type="hidden" name="timestamp" id="timestamp" value="<?=$timestamp; ?>"/>
                                        <a href="javascript:;" class="form-control btn btn-success btn-lg" id="addItemUnits">Add</a>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>

                                <!-- Display the list here -->
                                <table class="table" id="units_item_list">
                                  <tbody></tbody>
                                </table>
                              </div>

                              
                             
                            </div>
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
                    <div class="form-group row">
                      <div class="col-md-4 col-sm-4">
                        <input type="submit" onclick="saveItem('save_continue')" class="btn btn-info btn-lg" name="save_continue" value="Create Item & Continue">
                      </div>

                      <div class="col-md-4 col-sm-4">
                        <input type="submit" onclick="saveItem('save_close')" class="btn btn-default btn-lg" name="save_close" value="Create Item & Close">
                      </div>
                    </div>

                  </form>

                  </div>
                  <div class="panel-footer"></div>
                </div>
          </div>
    </div>

<?php include 'add_item_script.php'; ?>