<div class="row">
	<div class="col-md-12">
		<div class="panel panel-info" data-collapsed="0">
        	<div class="panel-heading">
            	<div class="panel-title" >
            		<i class="entypo-plus-circled"></i>
					<?php echo get_phrase('add_administrator');?>
            	</div>
            </div>
						<div class="panel-body">
							<?php if(validation_errors()) :?>
							<div class="alert alert-danger alert-dismissible" role="alert">
							    <button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span>
							    </button>
							   <strong> <?php echo validation_errors(); ?></strong>
							</div>
						    <?php endif;?>
						    <?php echo form_open(site_url('admin/admins/create/') , array('class' => 'form-horizontal form-groups-bordered validate', 'enctype' => 'multipart/form-data'));?>

					<div class="form-group row">
						<label for="field-1" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('full_name');?></label>

						<div class="col-sm-8 col-md-8 col-xs-8">
							<input type="text" class="form-control" name="name" id="name" data-validate="required" data-message-required="<?php echo get_phrase('name_required');?>" value="" autofocus>
						</div>
					</div>

					<div class="form-group row">
						<label for="field-1" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('designation');?></label>

						<div class="col-sm-8 col-md-8 col-xs-8">
							<input type="text" class="form-control" name="designation" id="designation" data-validate="required" data-message-required="<?php echo get_phrase('designation_required');?>" value="">
						</div>
					</div>

					<div class="form-group row">
						<label for="field-1" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('phone');?></label>
						<div class="col-sm-8 col-md-8 col-xs-8">
							<input type="tel" class="form-control" name="phone" value="<?php echo set_value('phone') ?>" data-validate="required" data-message-required="<?php echo get_phrase('value_required');?>">
						</div>
					</div>

					<div class="form-group row">
						<label for="field-2" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('email_address');?></label>
						<div class="col-sm-8 col-md-8 col-xs-8">
							<input type="email" class="form-control" id="email" name="email" value="" data-validate="required" data-message-required="<?php echo get_phrase('email_required');?>">
						</div>
					</div>

					<div class="form-group row">
						<label for="field-2" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('password');?></label>

						<div class="col-sm-8 col-md-8 col-xs-8">
							<input type="password" class="form-control" id="password" name="password" value="" data-validate="required" data-message-required="<?php echo get_phrase('password_required');?>">
						</div>
					</div>

					<div class="form-group row">
						<label for="field-2" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('level');?></label>

						<div class="col-sm-6 col-xs-8">
							<select name="level" id="level" class="form-control selectboxit" onchange="update_btn()">
                              <option value=""><?php echo get_phrase('select');?></option>
                              <option value="1"><?php echo get_phrase('super_administrator');?></option>
                              <option value="2"><?php echo get_phrase('administrator');?></option>
                              <option value="3"><?php echo get_phrase('cashier');?></option>
                              <option value="4"><?php echo get_phrase('shop_attendant');?></option>
                          </select>
						</div>
					</div>

                    <div class="form-group row">
						<div class="col-sm-offset-3 col-sm-5">
							<button type="submit" class="btn btn-info btn-lg" id="add_btn">Add</button>
						</div>
					</div>
                <?php echo form_close();?>
      		
            </div>
        </div>
    </div>
</div>

<script type="text/javascript">
	$(function() {
		//$('#add_btn').attr('disabled', 'disabled');

		var name_admin = $('#name').val();
		var email_admin = $('#email').val();
		var password_admin = $('#password').val();
		var level_admin = $('#level').val();

	
	});

	

	function update_btn() {
		var level = $('#level').val();
		if(level == 1) {
			level = 'Super Administrator';

		} else if(level == 2) {
			level = 'Administrator';

		} else if(level == 3) {
			level = 'Cashier';
			
		} else if(level == 4) {
			level = 'Shop Attendant';
		}

		$('#add_btn').text('Add ' + level);
	}


	
</script>