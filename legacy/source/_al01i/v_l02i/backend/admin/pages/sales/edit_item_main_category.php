<?php
$category_id = $param2;

//database query
$this_item_category_array = $this->db->get_where('item_main_category', array('category_id' => $category_id))->result_array();
foreach ($this_item_category_array as $cat_e):

  ?>

<div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-success">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('item_main_category_name'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php
echo form_open(site_url('admin/item_category/update_main'),
	array('class' => 'form-groups-bordered', 'id' => 'create_item_main_category_update_form', 'target' => '_top')); ?>

                    <div class="form-group row">
                        <label  class="col-sm-4 col-md-4 col-xs-6  col-form-label"><?php echo get_phrase('item_category_name'); ?></label>
                        <div class="col-sm-8 col-md-8 col-xs-6">
                            <input type="text" required="required" class="form-control" name="item_category_name" autofocus="true"
                                value="<?=$cat_e['category_name'] ?>">
                        </div>
                    </div>

                    <div class="form-group">
                      <div class="col-md-4 col-sm-4">
                        <input type="submit" class="btn btn-info btn-lg" name="item_submit" value="Update Category">
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

      //Item Creation form submitted
  $('#create_item_main_category_update_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    //let form_data = $('#edit_item_form').serialize();
    let category_id = <?php echo $category_id; ?>;

    showAjaxModal_confirm('Please Wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/item_category/update_main/') ?>' + category_id,
      type: 'POST',
      dataType: 'json',
      data: new FormData(this),
      ache: false,
      contentType: false,
      processData: false
    })
    .done(function(data) {
      if(data.success == true) {
        //$('.close').click();
        showAjaxModal_confirm('Category Updated Successfully.', 'Success');

        setTimeout(() => {
          $('.close').click();
           //window.location.reload();
        }, 3000);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: Same category name already exists', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_item_category_edit').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_item_category_edit"></ul>', 'Error');
      }
    });
  });
    </script>