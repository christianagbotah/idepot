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

               <table class="table table-bordered datatable" id="att">
                    <thead>
                        <tr>
                            <th><div><?php echo get_phrase('date');?></div></th>
                            <th><div><?php echo get_phrase('full_name');?></div></th>
                            <th><div><?php echo get_phrase('phone');?></div></th>
                            <th><div><?php echo get_phrase('designation');?></div></th>
                            <th><div><?php echo get_phrase('clocked-In');?></div></th>
                            <th><div><?php echo get_phrase('clocked-Out');?></div></th>
                        </tr>
                    </thead>
                </table>



<!-----  DATA TABLE EXPORT CONFIGURATIONS ---->
<script type="text/javascript">

	jQuery(document).ready(function($) {
        $.fn.dataTable.ext.errMode = 'throw';
        $('#att').DataTable({
            "processing": true,
            "serverSide": true,
            "ajax":{
                "url": "<?php echo site_url('admin/get_attendance') ?>",
                "dataType": "json",
                "type": "POST",
            },
            "columns": [
                { "data": "date" },
                { "data": "name" },
                { "data": "phone" },
                { "data": "designation" },
                { "data": "in_timestamp" },
                { "data": "out_timestamp" },
            ],
            "columnDefs": [
                {
                    //"targets": [5],
                    "orderable": false
                },
            ]
        });
	});


</script>
