<hr />
<?php
	$active_sms_service = $this->db->get_where('settings' , array(
		'type' => 'active_sms_service'
	))->row()->description;
?>
<div class="row">
	<div class="col-md-12">

		<div class="tabs-vertical-env">

			<ul class="nav tabs-vertical">
			<li class="active" id="defa_ult"><a href="#b-profile" data-toggle="tab" style="text-decoration: none">Select An SMS Service</a></li>
				<li id="hub_tel">
					<a href="#v-home" data-toggle="tab" style="text-decoration: none">
						Hubtel Settings
						<?php if ($active_sms_service == 'hubtel'):?>
							<span class="badge badge-info" style="background-color: green;"><?php echo get_phrase('active');?></span>
						<?php endif;?>
					</a>
				</li>
			</ul>

			<div class="tab-content">

				<div class="tab-pane active" id="b-profile">

					<?php echo form_open(site_url('admin/sms_settings/active_service') ,
						array('class' => 'form-horizontal form-groups-bordered validate', 'id' => 'sms_form_active_service', 'target'=>'_top'));?>

					<div class="form-group row">
						<label class="col-sm-4 col-md-4 control-label col-form-label"><?php echo get_phrase('select_a_service');?></label>
                        <div class="col-sm-4 col-md-4">
							<select name="active_sms_service" class="form-control">
                              	<option value="hubtel"
                        			<?php if ($active_sms_service == 'hubtel') echo 'selected';?>>
                        				Hubtel-SMS
                        		</option>
                        		<option value="disabled"<?php if ($active_sms_service == 'disabled' || $active_sms_service == '' || $active_sms_service == null) echo 'selected';?>>
                        			<?php echo get_phrase('disabled');?>
                        		</option>
                          </select>
						</div>
					</div>
					<div class="form-group row">
	                    <div class="col-sm-offset-3 col-sm-4 col-md-4">
	                        <button type="submit" class="btn btn-info btn-lg"><?php echo get_phrase('save');?></button>
	                    </div>
	                </div>
	            <?php echo form_close();?>
				</div>

				<div class="tab-pane" id="v-home">
					<?php echo validation_errors(); ?>
					<?php echo form_open(site_url('admin/sms_settings/hubtel-sms') ,
						array('class' => 'form-horizontal form-groups-bordered validate', 'id' => 'sms_form_hubtel_sms', 'target'=>'_top'));?>
						<div class="form-group row">
	                      <label  class="col-sm-4 col-md-4 control-label col-form-label"><?php echo get_phrase('hubtel_sender_name');?></label>
	                      	<div class="col-sm-4 col-md-4">
	                          	<input type="text" class="form-control" name="hubtel_sender" placeholder="Not more than 11 characters" maxlength="11" value="<?php echo $this->db->get_where('settings' , array('type' =>'hubtel_sender'))->row()->description;?>" required>
	                      	</div>
	                  	</div>
	                  	<div class="form-group row">
	                      <label  class="col-sm-4 col-md-4 control-label col-form-label"><?php echo get_phrase('hubtel_client_id');?></label>
	                      	<div class="col-sm-4 col-md-4">
	                          	<input type="text" class="form-control" name="hubtel_client_id" value="<?php echo $this->db->get_where('settings' , array('type' =>'hubtel_client_id'))->row()->description;?>" required>
	                      	</div>
	                  	</div>
	                  	<div class="form-group row">
	                        <label  class="col-sm-4 col-md-4 control-label col-form-label"><?php echo get_phrase('hubtel_client_secret');?></label>
	                        <div class="col-sm-4 col-md-4">
	                            <input type="text" class="form-control" name="hubtel_client_secret"
	                                value="<?php echo $this->db->get_where('settings' , array('type' =>'hubtel_client_secret'))->row()->description;?>" required>
	                        </div>
	                    </div>
	                    <div class="form-group row">
		                    <div class="col-sm-offset-3 col-sm-5">
		                        <button type="submit" class="btn btn-info btn-lg"><?php echo get_phrase('save');?></button>
		                    </div>
		                </div>
	                <?php echo form_close();?>
				</div>
			</div>

		</div>

	</div>
</div>
<?php
    if(isset($_GET['cid']) && $_GET['cid'] == 1) { ?>
        <script type="text/javascript">
            $(function() {
               $('#defa_ult').removeClass('active');
               $('#b-profile').removeClass('active');
               $('#hub_tel').addClass('active');
               $('#v-home').addClass('active');
              // $('#hub_tel').click();
            });
        </script>
    <?php
    

    }
?>

<script type="text/javascript">
	//Update sms active sms
  $('#sms_form_active_service').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    
    let form_data = $('#sms_form_active_service').serialize();
    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/sms_settings/active_service') ?>',
      type: 'POST',
      data: form_data,
        dataType: 'json',
        cache: false,

    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('SMS Status Updated Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
        }, 3000);
      } else {
        //  $('.close').click();
          showAjaxModal_confirm('Failed to update your SMS Status. Make sure you input valid a data and try again!', 'Error');

         /* setTimeout(() => {
            $('#modal_confirm .close').click();
          }, 3000);*/
      }
    });
  });

  //Update hubtel-sms
  $('#sms_form_hubtel_sms').submit(function(event) {
    /* Act on the event */
    event.preventDefault();
    
    let form_data = $('#sms_form_hubtel_sms').serialize();
    //send data via ajax
    $.ajax({
      url: '<?php echo site_url('admin/sms_settings/hubtel-sms') ?>',
      type: 'POST',
      data: form_data,
        dataType: 'json',
        cache: false,

    })
    .done(function(data) {
      if(data.success == true) {
        $('.close').click();
        showAjaxModal_confirm('SMS Settings Updated Successfully.', 'Success');

        setTimeout(() => {
          $('#modal_confirm .close').click(); window.location.reload();
        }, 3000);
      } else {
        //  $('.close').click();
          showAjaxModal_confirm('Failed to update your SMS settings. Make sure you input valid a data and try again!', 'Error');

        /*  setTimeout(() => {
            $('#modal_confirm .close').click();
          }, 3000);*/
      }
    });
  });

</script>