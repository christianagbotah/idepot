<?php
$edit_data      =   $this->db->get_where('admin' , array('admin_id' => $param2) )->result_array();
foreach ( $edit_data as $row):
?>
<div class="row">
    <div class="col-md-12">
        <div class="panel panel-success" data-collapsed="0">
            <div class="panel-heading">
                <div class="panel-title" >
                    <i class="entypo-plus-circled"></i>
                    <?php echo get_phrase('edit_administrator');?>
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
                
                    <?php echo form_open(site_url('admin/admins/do_update/'.$row['admin_id']) , array('class' => 'form-horizontal form-groups-bordered validate','target'=>'_top', 'enctype' => 'multipart/form-data'));?>

                            <div class="form-group row">
                                <label for="field-1" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('full_name');?></label>

                                <div class="col-sm-8 col-md-8 col-xs-8">
                                    <input type="text" class="form-control" name="name" id="name" data-validate="required" data-message-required="<?php echo get_phrase('name_required');?>" value="<?php echo $row['name']; ?>" autofocus>
                                </div>
                            </div>

                            <div class="form-group row">
                                <label for="field-1" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('designation');?></label>

                                <div class="col-sm-8 col-md-8 col-xs-8">
                                    <input type="text" class="form-control" name="designation" id="designation" data-validate="required" data-message-required="<?php echo get_phrase('designation_required');?>" value="<?php echo $row['designation']; ?>">
                                </div>
                            </div>

                            <div class="form-group row">
                                <label for="field-2" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('phone');?></label>
                            
                            <div class="col-sm-8 col-md-8 col-xs-8">
                                <input type="tel" class="form-control" name="phone" data-validate="required" data-message-required="<?php echo get_phrase('value_required');?>"
                                    value="<?php echo $row['phone']; ?>">
                            </div>
                        </div>
                            <div class="form-group row">
                                <label for="field-3" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('email_address');?></label>
                                <div class="col-sm-8 col-md-8 col-xs-8">
                                    <input type="email" class="form-control" id="email" name="email" value="<?php echo $row['email']; ?>" data-validate="required" data-message-required="<?php echo get_phrase('email_required');?>">
                                </div>
                            </div>

                            <div class="form-group row">
                                <label for="field-4" class="col-sm-4 col-md-4 col-xs-4 col-form-label"><?php echo get_phrase('level');?></label>

                                <div class="col-sm-8 col-md-8 col-xs-8">
                                    <select name="level" id="level" class="form-control selectboxit" onchange="update_btn()">
                                      <option value=""><?php echo get_phrase('select');?></option>
                                      <option value="1" <?php if($row['level'] == 1) echo 'selected'; ?> ><?php echo get_phrase('super_administrator');?></option>
                                      <option value="2" <?php if($row['level'] == 2) echo 'selected'; ?>><?php echo get_phrase('administrator');?></option>
                                      <option value="3" <?php if($row['level'] == 3) echo 'selected'; ?>><?php echo get_phrase('cashier');?></option>
                                      <option value="4" <?php if($row['level'] == 4) echo 'selected'; ?>><?php echo get_phrase('shop_attendant');?></option>
                                  </select>
                                </div>
                            </div>

                       <div class="form-group">
                        <div class="col-sm-offset-3 col-sm-5">
                            <button type="submit" class="btn btn-info" id="add_btn">Edit</button>
                        </div>
                    </div>
                <?php echo form_close();?>
            </div>
        </div>
    </div>
</div>

<?php
endforeach;
?>

<script type="text/javascript">

    $(function() {
        update_btn();
    });
    
    function update_btn() {
        var level = $('#level').val();
        if(level == 1) {
            level = 'Super Administrator';
        } else if(level == 2) {
            level = 'Administrator';
        } else if(level == 3) {
            level = 'Cashier';
        }else if(level == 4) {
            level = 'Shop Attendant';
        }

        $('#add_btn').text('Edit ' + level);
    }
</script>