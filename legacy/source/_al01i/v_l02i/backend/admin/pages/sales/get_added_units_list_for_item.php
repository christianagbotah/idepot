<?php
	
	if(!isset($isEdit)) {
		$isEdit = 0;
	}
	
	$unit_ids = [];
	foreach($list as $a) {
				$unitName = $this->db->get_where('units', ['unit_id' => $a['unit_id']])->row()->unit_name;

				echo '<tr>
						<td width="200" class="text-black-50">'.$unitName .'</td>
						<td class="text-black-50">'.$a['unit_total'].'</td>
						<td class="text-black-50">'.$a['unit_price'].'</td>
						<td><a href="javascript:;" onclick="removeUnits('.$a['id'].', '.$a['item_id'].')" class="btn btn-danger btn-lg"><i class="fa fa-close"></i></a></td>
				</tr>';
				?>
					<input type="hidden" name="unit_ids[]" value="<?=$a['unit_id'];?>"/>
				<?php
			}
		?>



		<style>
			.btn-danger {
				background-color: #ab5b59 !important;
				border-color: #ab5b59 !important;
			}
		</style>

		<script type="text/javascript">

				
				function removeUnits(id, item_id) {

					let isEdit = <?= $isEdit; ?>;

					$.ajax({
		        url: '<?php echo site_url('admin/addItemUnits/remove/');?>' + id + '/' + item_id,
		        type: 'POST',
		        dataType: 'json',
		        cache: false,
		      })
		      .done(function(resp) {
		      	if(isEdit == 1) {
		      		//coming from edit item page
		      		$('#item_unit_e').html(resp.unit_list);
        			$('#units_item_list_e tbody').html(resp.data);

		      	} else {
		      		//coming from add item page
		      		$('#item_unit').html(resp.unit_list);
        			$('#units_item_list tbody').html(resp.data);
		      	}
		      	
		      })
		      .fail(function(err) {
		      	return;
		      })
				}
		</script>