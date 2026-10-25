
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

    //all categories
    $category_add = $this->db->get('item_category');
    $category_array_add = $category_add->result_array();

    //all suppliers
    $suppliers_add = $this->db->get('suppliers');
    $suppliers_array_add = $suppliers_add->result_array();

    //get all items
    $items_array = $this->db->get('items')->result_array();

    //all units
    $all_units = $this->db->get('units')->result_array();

    //all packages
    $all_packages = $this->db->get('packages')->result_array();

    //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
?>

<style type="text/css">
  .switch-button label {
    width: 30px !important;
    height: 15px !important;
  }
</style>

<div class="row" id="edit_items_bulk_top">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-success">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('item_details'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
echo form_open(site_url('admin/item/bulk_update'),
	array('class' => 'form-groups-bordered', 'id' => 'edit_bulk_item_form', 'target' => '_top')); ?>

                    <div class="form-group row">

                      <table class="table table-bordered table-hover table-striped table-active">
                        
                        <thead>
                          <tr>
                            <th>S/N</th>
                            <th>Image</th>
                            <th>Supplier</th>
                            <th>Category</th>
                            <th>Name</th>
                            <th>Description</th>
                            <th style="text-align: right">Cost Price</th>
                            <th style="text-align: right">Selling Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          <?php
                            
                            $sn = 0;
                            foreach($items_array as $item):

                              $sn++;
                              $this_item_row = $this->db->get_where('items', array('item_id' => $item['item_id']))->row();
                             ?>

                              <tr>
                                <td><?=$sn;?></td>
                                <!-- Item image starts -->
                                <td>

                                  <div class="fileinput fileinput-new col-sm-4 col-md-4 col-xs-6" data-provides="fileinput">
                                    <div class="fileinput-new thumbnail" data-trigger="fileinput">
                                      <img src="<?= base_url().'/uploads/item_image/placeholder.jpg' ?>" width = "75" height="90" alt="Item Image">
                                    </div>
                                    <div class="fileinput-preview fileinput-exists thumbnail" style="max-width: 120px; max-height: 150px"></div>
                                    <div>
                                      <span class="btn btn-info btn-file">
                                        <span class="fileinput-new">Select image</span>
                                        <span class="fileinput-exists">Change</span>
                                        <input type="file" id="item_image_<?=$item['item_id'];?>" name="item_image_<?=$item['item_id'];?>" accept="image/*">
                                      </span>
                                      <a href="#" class="btn btn-orange btn-lg fileinput-exists" data-dismiss="fileinput">Remove</a>

                                    </div>
                                  </div>

                                </td>
                                <!-- Item image ends -->

                                <!-- item supplier starts -->
                                <td>
                                  
                                    <select required="true" class="form-control select2" name="supplier_name_<?=$item['item_id'];?>" id="supplier_name_<?=$item['item_id'];?>">
                                        <option value="">Select Supplier</option>
                                        <?php foreach ($suppliers_array_add as $srow): ?>
                                        <option value="<?=$srow['supplier_id'];?>" <?php if ($this_item_row->supplier_id == $srow['supplier_id']) {
  echo 'selected';
}
?>><?=$srow['supplier_name'];?></option>
                                        <?php endforeach;?>
                                    </select>

                                </td>
                                <!-- item supplier ends -->

                                <!-- item category starts -->
                                <td>
                                  <select required="true" class="form-control select2" name="category_name_<?=$item['item_id'];?>" id="category_name_<?=$item['item_id'];?>">
                                      <option value="">Select Sub Category</option>
                                      <?php foreach ($category_array_add as $cat): ?>
                                      <option value="<?=$cat['category_id'];?>" <?php if ($this_item_row->category_id == $cat['category_id']) {
  echo 'selected';
}
?>><?=$cat['category_name'];?></option>
                                      <?php endforeach;?>
                                  </select>
                                </td>
                                <!-- item category ends -->

                                <!-- item name starts-->
                                <td>
                                  <input type="text" required="required" class="form-control" name="item_name_<?=$item['item_id'];?>" value="<?=$this_item_row->item_name;?>">
                                  
                                </td>
                                <!-- item name ends -->

                                <!-- item description starts -->
                                <td>
                                  <textarea  name="description_<?=$item['item_id'];?>" class="form-control" cols="50" placeholder="Description"><?=$this_item_row->description;?></textarea>
                                </td>
                                <!-- item description ends -->

                                <!-- item cost price starts -->
                                <td>
                                  <div class="input-group">
                                    <div class="input-group-prepend">
                                      <div class="input-group-text bg-danger text-light">
                                        <?php echo $currency; ?>
                                      </div>
                                    </div>
                                    <input type="text" class="form-control" name="purchase_price_<?=$item['item_id'];?>"
                                      value="<?=$this_item_row->purchase_price;?>" required="required">
                                  </div>
                                </td>
                                <!-- item cost price ends -->

                                <!-- item selling price starts -->

                                <td>

                                  <div class="input-group">
                                    <div class="input-group-prepend">
                                      <div class="input-group-text bg-success text-light">
                                        <?php echo $currency; ?>
                                      </div>
                                    </div>
                                    <input type="text" class="form-control" name="selling_price_<?=$item['item_id'];?>"
                                      value="<?=$this_item_row->selling_price;?>" required="required">
                                  </div>

                                  <!-- Unit price adjustment starts -->
                                  <div class="form-group row">
                                    <div class="container-fluid bg-light">
                                      <div class="d-flex flex-row justify-content-between pt-2 pb-2">
                                        <div>
                                          <h4 class="text-muted small">Item is sold in other units?</h4>
                                        </div>
                                 
                                          <div class="switch-button  showcase-switch-button btn-sm d-flex flex-row">
                                            <input id="item_switch_<?=$item['item_id'];?>"  type="checkbox" value="0" name="item_switch_<?=$item['item_id'];?>" onchange="toggleItemInUnits(this.value, <?=$item['item_id'];?>)">
                                            <label for="item_switch_<?=$item['item_id'];?>" ></label>   <strong class="small ml-2" id="yesOrNoSelector_<?=$item['item_id'];?>"> NO</strong>                               
                                          </div> 
                                      </div>

                                      <div id="item_units_holder_<?=$item['item_id'];?>" style="display: none">
                                    
                                          <?php
                                            
                                          ?>

                                          <div class="d-flex flex-column">
                                            <div class="d-flex flex-row justify-content-between align-items-center mb-3">
                                                <div class="col-md-4 col-lg-4 col-sm-4"><label>Primary Unit:</label></div>
                                                <div class="col-md-8 col-lg-8 col-sm-8">
                                                  <select class="form-control select2" name="package_name_<?=$item['item_id'];?>" id="package_name_<?=$item['item_id'];?>">
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
                                                      <select class="form-control select2" name="item_unit_<?=$item['item_id'];?>" id="item_unit_<?=$item['item_id'];?>">
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
                                                      <input type="number" placeholder="Total Unit" name="unit_total_<?=$item['item_id'];?>" step="any" class="form-control"/>
                                                    </td>
                                                    <td>
                                                      <input type="number" placeholder="Unit price" step="any" name="unit_price_<?=$item['item_id'];?>" class="form-control"/>
                                                    </td>
                                                    <td>
                                                      <input type="hidden" name="timestamp_<?=$item['item_id'];?>" id="timestamp_<?=$item['item_id'];?>" value="<?=$timestamp; ?>"/>
                                                      <a href="javascript:;" onclick="addUnits(<?=$item['item_id'];?>)" class="form-control btn btn-success btn-lg" id="addItemUnits_<?=$item['item_id'];?>">Add</a>
                                                    </td>
                                                  </tr>
                                                </tbody>
                                              </table>

                                              <!-- Display the list here -->
                                              <table class="table" id="units_item_list_<?=$item['item_id'];?>">
                                                <tbody></tbody>
                                              </table>
                                            </div>

                                            
                                           
                                          </div>
                                      </div>
                                    </div>
                                  </div>
                                  <!-- Unit price adjustment ends -->
                                </td>
                                <!-- item selling price ends -->
                              </tr>

                            <?php

                            endforeach;
                          ?>
                          
                        </tbody>

                      </table>

                    </div>

                    <div class="form-group row">
                      <div class="col-md-12 col-sm-12 text-right">
                        <input type="submit" onclick="saveItem('save_continue')" class="btn btn-info btn-lg" name="save_continue" value="Update Items">
                      </div>

                      </div>
                    </div>

                  </form>

                  </div>
                  <div class="panel-footer"></div>
                </div>
          </div>
    </div>

    
    <script type="text/javascript">
$(function() {

  refreshUnits();//load remaining units to select

  var total_customers = Number(<?=$total_customers; ?>);
  var itemHasUnit = <?=$item_e['item_sold_in_units'];?>;

  if(itemHasUnit) {
   getItemUnitsByItemId();//to display item's units
  }


  //Item Editing form submitted
  $('#edit_item_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    //let form_data = $('#edit_item_form').serialize();
    let item_ids = <?php echo implode('-', $item_ids); ?>;

    alert(item_ids);
    return;

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
      url: '<?php echo site_url('admin/item/bulk_update/') ?>' + item_ids,
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
          $('.close').click(); 
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


    function getItemUnitsByItemId(item_id) {

      $.ajax({
        url: '<?php echo site_url('admin/getItemUnitsByItemId/') ?>/' + item_id + '/' + 1,
        type: 'POST',
        dataType: 'json',
        cache: false
      })
      .done(function(response) {

        $('#units_item_list_' + item_id + ' tbody').html(response.data);
      })
      .fail(function(err) {
        return;
      });
    }

    function toggleItemInUnits(val, item_id) {
       
       if(val == 0) {
            $('#item_switch_' + item_id).val(1);
            $('#yesOrNoSelector_' + item_id).text('YES');
            $('#item_units_holder_' + item_id).slideDown('slow');
            $('#yesOrNoSelector_' + item_id).css('color', '#000000');
       } else {
            $('#item_switch_' + item_id).val(0);
            $('#yesOrNoSelector_' + item_id).text('NO');
            $('#item_units_holder_' + item_id).slideUp('slow');
            $('#yesOrNoSelector_' + item_id).css('color', '#b3afaf');
            clearUnits(item_id);
       }
    }

    function addUnits(item_id) {


        let item_unit_e = $('form select[name="item_unit_"' + item_id']').val();
        let unit_total_e= $('form input[name="unit_total_"' + item_id']').val();
        let unit_price_e = $('form input[name="unit_price_"' + item_id']').val();
        let timestamp_e = $('#timestamp_' + item_id).val();
        
        
        if(item_unit_e == '') {
          $('form select[name="item_unit_"' + item_id']').css({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: 'red'
          });
          return;

        } else {
          $('form select[name="item_unit_"' + item_id']').css({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: 'green'
          });
        }
        if(unit_total_e == '' || unit_total_e == 0) {
          $('form input[name="unit_total_"' + item_id']').css({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: 'red'
          });
          return;

        } else {
          $('form input[name="unit_total_"' + item_id']').css({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: 'green'
          });
        }


        if(unit_price_e == '' || unit_price_e == 0) {
          $('form input[name="unit_price_"' + item_id']').css({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: 'red'
          });
          return;

        } else {
          $('form input[name="unit_price_"' + item_id']').css({
            borderWidth: '2px',
            borderStyle: 'solid',
            borderColor: 'green'
          });
        }


        $.ajax({
          url: '<?php echo site_url('admin/addItemUnits/create/0/');?>' + item_id,
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
          $('form input[name="unit_total_"' + item_id']').val('');
          $('form input[name="unit_price_"' + item_id']').val('');
          
          $('#item_unit_' + item_id).html(response.unit_list);
          $('#units_item_list_' + item_id + ' tbody').html(response.data);
          
        })
        .fail(function(err) {
   
          $('#units_item_list_' + item_id + ' tbody').html('error here ' + err.responseText);
        })
    }


    //clear all
    function clearUnits(item_id) {
           let ajaxUrl = '<?php echo site_url('admin/addItemUnits/clear/0/');?>' + item_id;

          $.ajax({
            url: ajaxUrl,
            type: 'POST',
            dataType: 'json',
            cache: false,
          })
          .done(function(resp) {
            $('form select[name="item_unit_"' + item_id'] option:first').prop('selected', true).trigger('change');
            $('form input[name="unit_total_"' + item_id + ']').val('');
            $('form input[name="unit_price_"' + item_id + ']').val('');

            $('#item_unit_' + item_id).html(resp.unit_list);
            $('#units_item_list_' + item_id + ' tbody').html(resp.data);
          })
          .fail(function(err) {
            aler(err.responseText);
            return;
          })
        }

        function refreshUnits(item_id) {

          $.ajax({
          url: '<?php echo site_url('admin/addItemUnits/0/0/');?>' + item_id,
          type: 'POST',
          dataType: 'json',
          cache: false,
        })
        .done(function(response) {
          
          $('#item_unit_' + item_id).html(response.unit_list);

          
        })

      }
    </script>