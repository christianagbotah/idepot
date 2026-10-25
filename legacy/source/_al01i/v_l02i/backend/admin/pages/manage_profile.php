<?php

$edit_data  = $this->db->get_where('admin', array(
            'admin_id' => $this->session->userdata('admin_id')
        ))->result_array();
?>
<hr />
<div class="row">
	<div class="col-md-12">
    
    	<!------CONTROL TABS START------>
		<ul class="nav nav-tabs bordered">

			<li class="active">
            	<h3><a href="#list" style="color: #000; text-decoration: none" data-toggle="tab"><i class="entypo-user"></i> 
                    <?php echo get_phrase('manage_profile');?>
                        </a></h3>
            </li>
		</ul>
    	<!------CONTROL TABS END------>
        
	
		<div class="tab-content">
        <br>
        	<!----EDITING FORM STARTS---->
			<div class="tab-pane box active" id="list" style="padding: 5px">
                <div class="box-content">
					<?php 
                    foreach($edit_data as $row):
                        ?>
                        <?php echo form_open(site_url('admin/manage_profile/update_profile_info/'.$row['admin_id']) , array('class' => 'form-horizontal form-groups-bordered validate','target'=>'_top' , 'id' => 'profile_form', 'enctype' => 'multipart/form-data'));?>
                            

                                <div class="form-group row">
                                    <label class="col-sm-4 col-md-4 control-label"><?php echo get_phrase('name');?></label>
                                    <div class="col-sm-8 col-md-8">
                                        <input type="text" class="form-control" name="name" value="<?php echo $row['name'];?>" required/>
                                    </div>
                                </div>

                                <div class="form-group row">
                                    <label class="col-sm-4 col-md-4 control-label"><?php echo get_phrase('email');?></label>
                                    <div class="col-sm-8 col-md-8">
                                        <input type="text" class="form-control" name="email" value="<?php echo $row['email'];?>" required/>
                                    </div>
                                </div>


                                <div class="form-group row">
                                    <label for="field-1" class="col-sm-4 col-md-4 control-label"><?php echo get_phrase('photo');?></label>
                                    
                                    <div class="col-sm-8 col-md-8">
                                        <div class="fileinput fileinput-new" data-provides="fileinput">
                                            <div class="fileinput-new thumbnail" style="width: 150px; height: 150px;" data-trigger="fileinput">
                                                <img src="<?php echo $this->crud_model->get_image_url('admin' , $row['admin_id']);?>" width="150" alt="...">
                                            </div>
                                            <div class="fileinput-preview fileinput-exists thumbnail" style="max-width: 200px; max-height: 150px"></div>
                                            <!--<div>
                                                <span class="btn btn-white btn-file">
                                                    <span class="fileinput-new btn btn-success">Select image</span>
                                                    <span class="fileinput-exists btn btn-info">Change</span>
                                                    <input type="file" name="userfile" accept="image/*">
                                                </span>
                                                <a href="#" class="btn btn-warning fileinput-exists" data-dismiss="fileinput">Remove</a>
                                            </div>-->

                                            <div>
                                              <span class="btn btn-info btn-file">
                                                <span class="fileinput-new">Select image</span>
                                                <span class="fileinput-exists">Change</span>
                                                <input type="file" id="userfile" name="userfile" accept="image/*">
                                              </span>
                                              <a href="#" class="btn btn-danger btn-lg fileinput-exists" data-dismiss="fileinput">Remove</a>

                                            </div>

                                        </div>
                                    </div>
                                </div>

                            

                            <div class="form-group row">
                              <div class="col-sm-offset-4 col-sm-8 col-md-offset-4 col-md-8">
                                  <button type="submit" class="btn btn-info btn-lg"><?php echo get_phrase('update_profile');?></button>
                              </div>
								</div>
                        </form>
						<?php
                    endforeach;
                    ?>
                </div>
			</div>
            <!----EDITING FORM ENDS-->
            
		</div>
	</div>
</div>

<br>

<!--password-->
<div class="row">
	<div class="col-md-12">
    
    	<!------CONTROL TABS START------>
		<ul class="nav nav-tabs bordered">

			<li class="active">
                <h3><a href="#list" style="color: #000; text-decoration: none" data-toggle="tab"><i class="entypo-lock"></i> 
                    <?php echo get_phrase('change_password');?>
                        </a></h3>	
            </li>
		</ul>
    	<!------CONTROL TABS END------>
        
	
		<div class="tab-content">
        <br>
        	<!----EDITING FORM STARTS---->
			<div class="tab-pane box active" id="list" style="padding: 5px">
                <div class="box-content padded">
					<?php 
                    foreach($edit_data as $row):
                        ?>
                        <?php echo form_open(site_url('admin/manage_profile/change_password') , array('class' => 'form-horizontal form-groups-bordered validate', 'id' => 'password_change_form', 'target'=>'_top'));?>
                            <div class="form-group row">
                                <label class="col-sm-4 col-md-4 control-label"><?php echo get_phrase('current_password');?></label>
                                <div class="col-sm-8 col-md-8">
                                    <input type="password" class="form-control" name="password" value="" required/>
                                </div>
                            </div>
                            <div class="form-group row">
                                <label class="col-sm-4 col-md-4 control-label"><?php echo get_phrase('new_password');?></label>
                                <div class="col-sm-8 col-md-8">
                                    <input type="password" class="form-control" name="new_password" value="" required/>
                                </div>
                            </div>
                            <div class="form-group row">
                                <label class="col-sm-4 col-md-4 control-label"><?php echo get_phrase('confirm_new_password');?></label>
                                <div class="col-sm-8 col-md-8">
                                    <input type="password" class="form-control" name="confirm_new_password" value="" required/>
                                </div>
                            </div>
                            <div class="form-group row">
                              <div class="col-sm-offset-4 col-sm-8 col-md-offset-4 col-md-8">
                                  <button type="submit" class="btn btn-success btn-lg"><?php echo get_phrase('update_password');?></button>
                              </div>
								</div>
                        </form>
						<?php
                    endforeach;
                    ?>
                </div>
			</div>
            <!----EDITING FORM ENDS--->
            
		</div>
	</div>
</div>


<script type="text/javascript">

  //Profile form submitted
  $('#profile_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    //let form_data = $('#create_item_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/manage_profile/update_profile_info/'.$row['admin_id']); ?>',
      type: 'POST',
      dataType: 'json',
      data: new FormData(this),
      cache: false,
      contentType: false,
      processData: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm(data.message, 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
        }, 3000);
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_profile_update').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_profile_update"></ul>', 'Error');
      }
    });
  });

  //Password change form submitted
  $('#password_change_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    //let form_data = $('#create_item_form').serialize();

    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/manage_profile/change_password'); ?>',
      type: 'POST',
      dataType: 'json',
      data: new FormData(this),
      cache: false,
      contentType: false,
      processData: false
    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm(data.message, 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
        }, 6000);
      }  else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_password_change').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_password_change"></ul>', 'Error');
      }
    });
  });
    </script>