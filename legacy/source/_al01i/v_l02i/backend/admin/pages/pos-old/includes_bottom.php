

	<!-- Bottom Scripts -->
<script src="<?php echo base_url('assets/js/gsap/main-gsap.js');?>"></script>
<script src="<?php echo base_url('assets/js/jquery-ui/js/jquery-ui-1.10.3.minimal.min.js');?>"></script>

<script src="<?php echo base_url('assets/js/joinable.js');?>"></script>
<script src="<?php echo base_url('assets/js/resizeable.js');?>"></script>
<script src="<?php echo base_url('assets/js/neon-api.js');?>"></script>
<script src="<?php echo base_url('assets/js/toastr.js');?>"></script>
<script src="<?php echo base_url('assets/js/jquery.validate.min.js');?>"></script>
<script src="<?php echo base_url('assets/js/fullcalendar/fullcalendar.min.js');?>"></script>
<script src="<?php echo base_url('assets/js/bootstrap-datepicker.js');?>"></script>
<script src="<?php echo base_url('assets/js/bootstrap-timepicker.min.js');?>"></script>
<script src="<?php echo base_url('assets/js/fileinput.js');?>"></script>

<!--BOOTSTRAP 4 TEMPLATE SCRIPTS-->
<script src="<?php echo base_url('assets/bootstrap4-theme/vendor/bootstrap/js/bootstrap.bundle.min.js'); ?>"></script>

<!-- Core plugin JavaScript-->
<script src="<?php echo base_url('assets/bootstrap4-theme/vendor/jquery-easing/jquery.easing.min.js'); ?>"></script>

<!-- Custom scripts for all pages-->
<script src="<?php echo base_url('assets/bootstrap4-theme/js/sb-admin-2.min.js'); ?>"></script>


<!-- All pages plugins for DataTable-->
<script src="<?php echo base_url('assets/bootstrap4-theme/vendor/datatables/jquery.dataTables.min.js'); ?>"></script>
<script src="<?php echo base_url('assets/bootstrap4-theme/vendor/datatables/dataTables.bootstrap4.min.js'); ?>"></script>

<!--BOOTSTRAP 4 TEMPLATE SCRIPTS END-->


<script type="text/javascript" src="<?php echo base_url('assets/datatable/buttons/js/dataTables.buttons.js');?>"></script>
<script type="text/javascript" src="<?php echo base_url('assets/datatable/buttons/js/buttons.bootstrap.js');?>"></script>

<script src="<?php echo base_url('assets/js/select2/select2.min.js');?>"></script>
<script src="<?php echo base_url('assets/js/selectboxit/jquery.selectBoxIt.min.js');?>"></script>


<script src="<?php echo base_url('assets/js/neon-calendar.js');?>"></script>
<script src="<?php echo base_url('assets/js/neon-chat.js');?>"></script>
<script src="<?php echo base_url('assets/js/neon-custom.js');?>"></script>
<script src="<?php echo base_url('assets/js/neon-demo.js');?>"></script>

<script src="<?php echo base_url('assets/js/wysihtml5/wysihtml5-0.4.0pre.min.js');?>"></script>
<script src="<?php echo base_url('assets/js/wysihtml5/bootstrap-wysihtml5.js');?>"></script>


<script src="<?php echo base_url('assets/bootstrap4.4.1/js/popper.js');?>"></script>
<script src="<?php echo base_url('assets/bootstrap4.4.1/js/bootstrap.min.js');?>"></script>

<!-- SHOW TOASTR NOTIFIVATION -->
<?php if ($this->session->flashdata('flash_message') != ""):?>

<script type="text/javascript">
	toastr.success('<?php echo $this->session->flashdata("flash_message");?>');
</script>

<?php endif;?>

<?php if ($this->session->flashdata('error_message') != ""):?>

<script type="text/javascript">
	toastr.error('<?php echo $this->session->flashdata("error_message");?>');
</script>

<?php endif;?>


<!---  DATA TABLE EXPORT CONFIGURATIONS -->
<script type="text/javascript">

	jQuery(document).ready(function($)
	{
		var datatable = $("#table_export").dataTable();


		//update payment alert for admin
		/**setInterval(function() {
			 mobile_money_payment_alert_show();
		}, 800);

		function mobile_money_payment_alert_rows() {
			$.ajax({
				url: '<?php echo site_url('admin/mobile_money_payment_alert_rows'); ?>',
				success: function(num_rows) {
					if(num_rows > 0) {
						$('#badge1').text(num_rows);
						$('#badge1').css('display', 'inline-flex');
						$('#bell').css({'color': '#ffffff', 'font-weight': 'bold'});
					}else{
						$('#badge1').css('display', 'none');
						$('#bell').css({'color': '#1325ab'});
					}
				}
			});
		} **/
	});


$(function() {
	$('#sidebar-menu').removeAttr('style');
	$('#main-content').removeAttr('style');
});
</script>
