<div class="row">

          <div class="col-md-12 col-sm-12 col-xs-12">
              <div class="panel panel-success">

                  <div class="panel-heading">
                      <div class="panel-title" style="color: #fff; padding: 5px;">
                          <?php echo get_phrase('item_category_name'); ?>
                      </div>
                  </div>

                  <div class="panel-body" style="padding: 10px">
                    <?php

                    $main_category_add = $this->db->get('item_main_category');
                    $main_category_array_add = $main_category_add->result_array();

                    echo form_open(site_url('admin/item_category/create'),
                    	array('class' => 'form-groups-bordered', 'id' => 'create_item_category_form', 'target' => '_top')); 
                      ?>



                    <div class="form-group row">
                        <label  class="col-sm-4 col-md-4 col-xs-6  col-form-label"><?php echo get_phrase('item_main_category'); ?></label>

                      <div class="col-sm-8 col-md-8 col-xs-6">
                            <select required="true" class="form-control select2" name="item_main_category_name" id="item_main_category_name">
                            <option value="">Select Main Category</option>
                            <?php foreach ($main_category_array_add as $mcat): ?>
                            <option value="<?=$mcat['category_id'];?>"><?=$mcat['category_name'];?></option>
                            <?php endforeach;?>
                        </select>
                        </div>
                    </div>

                    <div class="form-group row">
                        <label  class="col-sm-4 col-md-4 col-xs-6  col-form-label"><?php echo get_phrase('item_category_name'); ?></label>
                        <div class="col-sm-8 col-md-8 col-xs-6">
                            <input type="text" required="required" class="form-control" name="item_category_name"
                                value="" autofocus="true">
                        </div>
                    </div>

                    <div class="form-group row">
                      <div class="col-md-3 col-sm-4">
                        <input type="submit" onclick="saveItemCategory('save_continue')" class="btn btn-info btn-lg" name="item_submit" value="Create & Continue">
                      </div>

                      <div class="col-md-3 col-sm-4">
                        <input type="submit" onclick="saveItemCategory('save_close')" class="btn btn-default btn-lg" name="item_submit" value="Create & Close">
                      </div>
                    </div>

                  </form>

                  </div>
                  <div class="panel-footer"></div>
                </div>
          </div>
    </div>

    <script type="text/javascript">

      var cButtonValue = '';

      //Item Creation form submitted
  $('#create_item_category_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    //let form_data = $('#create_item_form').serialize();

    $('#modal_confirm').attr('data-backdrop', 'static');
    $('#modal_confirm').attr('data-keyboard', 'false');
    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/item_category/create') ?>',
      type: 'POST',
      dataType: 'json',
      data: new FormData(this),
      cache: false,
      contentType: false,
      processData: false
    })
    .done(function(data) {
      if(data.success == true) {
        //$('.close').click();
        showAjaxModal_confirm('Category Added Successfully.', 'Success');

        if(cButtonValue == 'save_continue') {

          $('#create_item_category_form')[0].reset(); //reselt form inputs

          setTimeout(() => {
            $('#modal_confirm .close').click(); 
            //window.location.reload();
          }, 2000);

        } else if(cButtonValue == 'save_close') {
          setTimeout(() => {
            //$('.close').click(); 
            window.location.reload();
          }, 500);
        }

      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: Same category already exists', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_item_category_create').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_item_category_create"></ul>', 'Error');
      }
    });
  });

  function saveItemCategory(param) {
      cButtonValue = param;
    }
    </script>