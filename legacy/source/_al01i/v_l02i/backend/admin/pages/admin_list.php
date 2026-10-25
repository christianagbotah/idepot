        <!--visible to only super admin-->
       <?php
      $name = $this->db->get_where($this->session->userdata('login_type'), array($this->session->userdata('login_type').'_id' => $this->session->userdata('login_user_id')))->row()->name;
      $admin_level = $this->db->get_where('admin', array('name' => $name))->row()->level;
    ?>
    <?php if ($account_type == 'admin' && $admin_level == 1):?>
                <a href="javascript:;" onclick="showAjaxModal('<?php echo site_url('modal/popup/modal_admin_add/');?>');"
            	class="btn btn-primary pull-right">
                <i class="entypo-plus-circled"></i>
            	<?php echo get_phrase('add_new_admin');?>
                </a>
                <br><br>
    <?php endif; ?>
        <?php if(validation_errors()) :?>
                <div class="alert alert-danger alert-dismissible" role="alert">
                    <button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span>
                    </button>
                   <strong> <?php echo validation_errors(); ?></strong>
                </div>
                <?php endif;?>

               <table class="table table-bordered datatable" id="admins">
                    <thead>
                        <tr>
                            <th><div><?php echo get_phrase('full_name');?></div></th>
                            <th><div><?php echo get_phrase('designation');?></div></th>
                            <th><div><?php echo get_phrase('email_address');?></div></th>
                            <th><div><?php echo get_phrase('auth_key');?></div></th>
                            <th><div><?php echo get_phrase('phone');?></div></th>
                            <th><div><?php echo get_phrase('level');?></div></th>
                            <th><div><?php echo get_phrase('account_status');?></div></th>
                            <th><div><?php echo get_phrase('options');?></div></th>
                            <th><div><?php echo get_phrase('');?></div></th>
                        </tr>
                    </thead>
                </table>



<!-----  DATA TABLE EXPORT CONFIGURATIONS ---->
<script type="text/javascript">

	jQuery(document).ready(function($) {
        $.fn.dataTable.ext.errMode = 'throw';
        $('#admins').DataTable({
            "processing": true,
            "serverSide": true,
            "ajax":{
                "url": "<?php echo site_url('admin/get_admin') ?>",
                "dataType": "json",
                "type": "POST",
            },
            "columns": [
                { "data": "name" },
                { "data": "designation" },
                { "data": "email" },
                { "data": "auth_key" },
                { "data": "phone" },
                { "data": "level" },
                { "data": "account_status" },
                { "data": "options" },
                { "data": "online" },
            ],
            "columnDefs": [
                {
                    "targets": [5],
                    "orderable": false
                },
            ]
        });
	});

    function admin_edit_modal(admin_id) {
        showAjaxModal_calendar('<?php echo site_url('modal/popup/modal_admin_edit/');?>' + admin_id, 'Edit User');
    }

    function admin_delete_confirm(admin_id) {
        confirm_modal_user('<?php echo site_url('admin/admins/delete/');?>' + admin_id, 'user_delete');
        
    }

    function account_block(admin_id) {
        confirm_modal_user('<?php echo site_url('admin/admins/block/');?>' + admin_id, 'modal_block');   
    }

    function account_unblock(admin_id) {
        confirm_modal_user('<?php echo site_url('admin/admins/unblock/');?>' + admin_id, 'modal_unblock');   
    }

</script>
