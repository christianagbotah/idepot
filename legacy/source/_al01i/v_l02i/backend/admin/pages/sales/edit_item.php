
<?php
echo '<script src="' . base_url() . 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });

      })

    </script>';

$timestamp = strtotime('now');
?>

<?php
$item_id = $param2;

//database query
$this_item_array = $this->db->get_where('items', array('item_id' => $item_id))->result_array();

$this->db->select('*');
$this->db->from('customers');
$this->db->where('customer_active', 1);
$this->db->where('guest', '0');
$total_customers = $this->db->get()->num_rows();

foreach ($this_item_array as $item_e):
?>
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
echo form_open(site_url('admin/item/update'),
	array('class' => 'form-groups-bordered', 'id' => 'edit_item_form', 'target' => '_top')); ?>

                    <div class="form-group row">
                      <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('item_image'); ?></label>
                      <div class="fileinput fileinput-new col-sm-4 col-md-4 col-xs-6" data-provides="fileinput">
                        <div class="fileinput-new thumbnail" data-trigger="fileinput">
                          <img src="<?=file_exists('uploads/item_image/' . $item_id . '.jpg') ? base_url() . '/uploads/item_image/' . $item_id . '.jpg' : base_url() . '/uploads/item_image/placeholder.jpg';?>" width = "75" height="90" alt="Item Image">
                        </div>
                        <div class="fileinput-preview fileinput-exists thumbnail" style="max-width: 120px; max-height: 150px"></div>
                        <div class="flex gap-2">
                          <span class="btn btn-info btn-file">
                            <span class="fileinput-exists" style="display: inline;">Change</span>
                            <input type="file" id="item_image" name="item_image" accept="image/*">

                          </span>
                          
                          <span><a href="#" onclick="removeImageUrl()" class="btn btn-danger btn-lg fileinput-exists" data-dismiss="fileinput" style="display: inline;"><i class="fa fa-trash"></i></a></span>
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
                        <select required="true" class="form-control select2" name="category_name" id="category_name">
                            <option value="">Select Category</option>
                            <?php foreach ($category_array_add as $cat): ?>
                            <option value="<?=$cat['category_id'];?>" <?php if ($item_e['category_id'] == $cat['category_id']) {
	echo 'selected';
}
?>><?=$cat['category_name'];?></option>
                            <?php endforeach;?>
                        </select>
                      </div>
                </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('item_name'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <input type="text" required="required" class="form-control" name="item_name"
                                value="<?=$item_e['item_name'];?>">
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
                            <option value="<?=$srow['supplier_id'];?>" <?php if ($item_e['supplier_id'] == $srow['supplier_id']) {
	echo 'selected';
}
?>><?=$srow['supplier_name'];?></option>
                            <?php endforeach;?>
                        </select>
                      </div>
                </div>
                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-6 col-form-label"><?php echo get_phrase('description'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-6">
                            <textarea  name="description" class="form-control" cols="50" placeholder="Description"><?=$item_e['description'];?></textarea>
                        </div>
                    </div>


                    <div class="container-fluid bg-light">
                        <div class="d-flex flex-row justify-content-between p-5 ">
                          <div>
                            <h4 class="text-dark">Item will be sold in other units?</h4>
                          </div>

                            <div class="switch-button  showcase-switch-button">
                              <input id="item_switch_e" <?=$item_e['item_sold_in_units'] == 1 ? 'checked value="1"' : 'value="0"';?>  type="checkbox" name="item_switch_e" onchange="toggleItemInUnits(this.value)">
                              <label for="item_switch_e" ></label>   <strong style="font-size: 16px;" id="yesOrNoSelector_e"><?=$item_e['item_sold_in_units'] == 1 ? 'YES' : 'NO';?></strong>
                            </div>
                        </div>

                        <div id="item_units_holder_e" <?=$item_e['item_sold_in_units'] == 1 ? '' : 'style="display: none"';?> >

                            <?php
$all_units = $this->db->get('units')->result_array();
$all_packages = $this->db->get('packages')->result_array();
?>

                            <div class="d-flex flex-column">
                              <div class="d-flex flex-row justify-content-between align-items-center mb-3">
                                  <div class="col-md-4 col-lg-4 col-sm-4"><label>Primary Unit:</label></div>
                                  <div class="col-md-8 col-lg-8 col-sm-8">
                                    <select class="form-control select2" name="package_name_e" id="package_name_e">
                                        <option>Select a primary</option>
                                        <?php
foreach ($all_packages as $package):
?>
                                          <option <?=$item_e['package_id'] == $package['package_id'] ? 'selected' : '';?> value="<?=$package['package_id']?>"><?=$package['package_name']?></option>
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
                                        <select class="form-control select2" name="item_unit_e" id="item_unit_e">
                                          <option>Select Other Unit</option>

                                          <?php
foreach ($all_units as $unit):
?>
                                          <option value="<?=$unit['unit_id']?>"><?=$unit['unit_name']?></option>
                                          <?php
endforeach;
?>
                                        </select>
                                      </td>
                                      <td>
                                        <input type="number" placeholder="Total Unit" name="unit_total_e" step="any" class="form-control"/>
                                      </td>
                                      <td>
                                        <input type="number" placeholder="Unit price" step="any" name="unit_price_e" class="form-control"/>
                                      </td>
                                      <td>
                                         <input type="hidden" name="timestamp_e" id="timestamp_e" value="<?=$timestamp;?>"/>
                                        <a href="javascript:;" class="form-control btn btn-success btn-lg" id="addItemUnits_e">Add</a>
                                      </td>
                                    </tr>
                                  </tbody>
                                </table>

                                <!-- Display the list here -->
                                <table class="table" id="units_item_list_e">
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
                                value="<?=$item_e['selling_price'];?>" required="required">
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
                                value="<?=$item_e['purchase_price'];?>" required="required">
                            </div>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-8 col-md-8 col-xs-6  col-form-label"><?php echo get_phrase('available_quantity'); ?></label>
                        <div class="col-sm-4 col-md-4 col-xs-6 toast-disabled text-right">
                              <?=number_format($item_e['quantity'], 0, '.', ',');?>
                        </div>
                    </div>
                    <div class="form-group">
                      <div class="col-md-4 col-sm-4">
                        <input type="submit" class="btn btn-info btn-lg" name="item_submit" value="Edit Item">
                      </div>
                    </div>

                  </form>

                  </div>
                  <div class="panel-footer"></div>
                </div>
          </div>
    </div>
  <?php endforeach;?>

    <script type="text/javascript">
$(function() {

  refreshUnits();//load remaining units to select

  var total_customers = Number(<?=$total_customers;?>);
  var itemHasUnit = <?=$item_e['item_sold_in_units'];?>;

  if(itemHasUnit) {
   getItemUnitsByItemId();//to display item's units
  }


  //Item Editing form submitted
  $('#edit_item_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    //let form_data = $('#edit_item_form').serialize();
    let item_id = <?php echo $item_id; ?>;

    $('#modal_confirm').attr('data-backdrop', 'static');
    $('#modal_confirm').attr('data-keyboard', 'false');

    /*var pValue = 0;
    var barType = 'info';
    var milliSeconds = Math.round(total_customers / 1.7);

    var timer = setInterval(() => {
      pValue += 2;

    if(pValue >= 100) {
      clearInterval(timer);
    }

    showAjaxModal_confirm('<div><i class="fa fa-spinner fa-pulse"></i> Please Wait... This might take some time!</div><br><div class="progress"><div class="progress-bar progress-bar-'+barType+' progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="'+ pValue +'" aria-valuemin="0" aria-valuemax="100" style="width: '+pValue+'%">'+ pValue +'%</div></div><div id="bottom_notice" style="display: none; text-align:center;"><p>Finalizing...<i class="fa fa-spinner fa-pulse"></i></p></div>', 'Loading');
    }, milliSeconds);
    */

   /* var timer2 = setInterval(() => {

      if(pValue >= 100) {
        pValue = 100;

        showAjaxModal_confirm('<div><i class="fa fa-spinner fa-pulse"></i> Please Wait... This might take some time!</div><br><div class="progress"><div class="progress-bar progress-bar-success progress-bar-striped progress-bar-animated" role="progressbar" aria-valuenow="'+ pValue +'" aria-valuemin="0" aria-valuemax="100" style="width: '+pValue+'%">'+ pValue +'%</div></div><div id="bottom_notice" style="text-align:center;"><p>Finalizing...<i class="fa fa-spinner fa-pulse"></i></p></div>', 'Loading');
      }
    }, 500);*/

    showAjaxModal_confirm('<div><i class="fa fa-spinner fa-pulse"></i> Please Wait... </div>', 'Loading');

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/item/update/') ?>' + item_id,
      type: 'POST',
      dataType: 'json',
      data: new FormData(this),
      ache: false,
      contentType: false,
      processData: false
    })
    .done(function(data) {
      showAjaxModal_confirm('Item Updated Successfully.', 'Success');


      if(data.success == true) {
        //$('.close').click();

        setTimeout(() => {
          $('#modal_confirm .close').click();
          $('#payments_sales .close').click();
          //window.location.reload();
        }, 2000);
      } else if(data.success == 'duplicate') {

        $('#modal_confirm').removeAttr('data-backdrop');
        $('#modal_confirm').removeAttr('data-keyboard');

        showAjaxModal_confirm('Duplicate found: Same item\'s name already exists', 'Error');
      } else {

        $('#modal_confirm').removeAttr('data-backdrop');
        $('#modal_confirm').removeAttr('data-keyboard');


        $(function(){

          $.each(data, function(index, val) {
          $('#list_err_item_edit').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_item_edit"></ul>', 'Error');
      }
    });
  });

  })
  
    function removeImageUrl() {

      $('.fileinput-new .thumbnail img').attr('src', '<?=base_url() . '/uploads/item_image/placeholder.jpg';?>');
    }

    function getItemUnitsByItemId() {

      $.ajax({
        url: '<?php echo site_url('admin/getItemUnitsByItemId/' . $item_e['item_id']) ?>/' + 1,
        type: 'POST',
        dataType: 'json',
        cache: false
      })
      .done(function(response) {

        $('#units_item_list_e tbody').html(response.data);
      })
      .fail(function(err) {
        return;
      });
    }

    function toggleItemInUnits(val) {

       if(val == 0) {
            $('#item_switch_e').val(1);
            $('#yesOrNoSelector_e').text('YES');
            $('#item_units_holder_e').slideDown('slow');
            $('#yesOrNoSelector_e').css('color', '#000000');
       } else {
            $('#item_switch_e').val(0);
            $('#yesOrNoSelector_e').text('NO');
            $('#item_units_holder_e').slideUp('slow');
            $('#yesOrNoSelector_e').css('color', '#b3afaf');
            clearUnits();
       }
    }

    $('#addItemUnits_e').click(function(e) {


      let item_unit_e = $('form select[name="item_unit_e"]').val();
      let unit_total_e= $('form input[name="unit_total_e"]').val();
      let unit_price_e = $('form input[name="unit_price_e"]').val();
      let timestamp_e = $('#timestamp_e').val();


      if(item_unit_e == '') {
        $('form select[name="item_unit_e"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'red'
        });
        return;

      } else {
        $('form select[name="item_unit_e"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'green'
        });
      }
      if(unit_total_e == '' || unit_total_e == 0) {
        $('form input[name="unit_total_e"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'red'
        });
        return;

      } else {
        $('form input[name="unit_total_e"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'green'
        });
      }


      if(unit_price_e == '' || unit_price_e == 0) {
        $('form input[name="unit_price_e"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'red'
        });
        return;

      } else {
        $('form input[name="unit_price_e"]').css({
          borderWidth: '2px',
          borderStyle: 'solid',
          borderColor: 'green'
        });
      }


      $.ajax({
        url: '<?php echo site_url('admin/addItemUnits/create/0/' . $item_e['item_id']); ?>',
        type: 'POST',
        dataType: 'json',
        data: {
          'item_unit': item_unit_e,
          'unit_total': unit_total_e,
          'unit_price': unit_price_e,
          'timestamp': timestamp_e
        },

        cache: false,
      })
      .done(function(response) {
        //clear the form

        $('form select[name="item_unit_e"] option:first').prop('selected', true).trigger('change');
        $('form input[name="unit_total_e"]').val('');
        $('form input[name="unit_price_e"]').val('');

        $('#item_unit_e').html(response.unit_list);
        $('#units_item_list_e tbody').html(response.data);

      })
      .fail(function(err) {

        $('#units_item_list_e tbody').html('error here ' + err.responseText);
      })
    });


    //clear all
    function clearUnits() {
           let ajaxUrl = '<?php echo site_url('admin/addItemUnits/clear/0/' . $item_e['item_id']); ?>';

          $.ajax({
            url: ajaxUrl,
            type: 'POST',
            dataType: 'json',
            cache: false,
          })
          .done(function(resp) {
            $('form select[name="item_unit_e"] option:first').prop('selected', true).trigger('change');
            $('form input[name="unit_total_e"]').val('');
            $('form input[name="unit_price_e"]').val('');

            $('#item_unit_e').html(resp.unit_list);
            $('#units_item_list_e tbody').html(resp.data);
          })
          .fail(function(err) {
            aler(err.responseText);
            return;
          })
        }

        function refreshUnits() {

          $.ajax({
          url: '<?php echo site_url('admin/addItemUnits/0/0/' . $item_e['item_id']); ?>',
          type: 'POST',
          dataType: 'json',
          cache: false,
        })
        .done(function(response) {

          $('#item_unit_e').html(response.unit_list);


        })

      }
    </script>