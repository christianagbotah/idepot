<?php

	

echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

    ?>
<td width="150">
	<input type="number" min="0.1" required="true" step="any" onkeyup="grand_total($('#quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" onchange="grand_total($('#quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity_transferred" id="quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>" name="quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">
	<span><small id="unit_name_<?=strtotime(date('Y-m-d H:i:s'));?>" class="text-danger"></small></span>
</td>

<td>
	<select required="true" class="form-control select2" onchange="change_fields($('#item_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>').val(), $('#item_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" name="item_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>" id="item_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>">
		<option value="">Choose Item</option>
		<?php foreach ($all_items_array as $item): ?>
			<option value="<?=$item['item_id'];?>"><?=$item['item_name'];?></option>
		<?php endforeach;?>
	</select>

	<input type="hidden" name="hidden_transfer_item_id_<?=strtotime(date('Y-m-d H:i:s'));?>" id="hidden_transfer_item_id_<?=strtotime(date('Y-m-d H:i:s'));?>"/>
</td>
<td  id="description_td_<?=strtotime(date('Y-m-d H:i:s'));?>"></td>
<td width="180">
	<input type="text" min="1" step="any" readonly="readonly" class="form-control btn btn-success btn-lg" id="available_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" name="available_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">

	<input type="hidden" id="hidden_available_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" name="hidden_available_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">
	<input type="hidden" id="hidden_available_quantity2_<?=strtotime(date('Y-m-d H:i:s'));?>" name="hidden_available_quantity2_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">

	<input type="hidden" id="unit_id_<?=strtotime(date('Y-m-d H:i:s'));?>"/> 
	<input type="hidden" id="unit_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>"/> 
</td>


<script type="text/javascript">

	


function change_fields(item_id, num) {
		/* Act on the event */

		$('#hidden_transfer_item_id_' + num).val(item_id);
		$('#yes_btn_unit').attr('disabled', 'disabled');


			if(item_id != '') {
				let ajax_url = '<?php echo site_url('admin/transfer_item_selected/') ?>' + item_id;

				$.ajax({
					url: ajax_url,
					type: 'POST',
					dataType: 'json',
				})
				.done(function(response) {

						$('#description_td_' + num).html(response.description);
						$('#available_quantity_' + num).val(number_format(response.quantity, 2, '.', ','));
						$('#hidden_available_quantity_' + num).val(response.quantity);

						//button colors
						if(response.quantity < 500 && response.quantity > 200) {
							$('#available_quantity_' + num).removeClass('btn-success');
							$('#available_quantity_' + num).removeClass('btn-danger');
							$('#available_quantity_' + num).addClass('bg-warning');

						} else if(response.quantity < 200) {
							$('#available_quantity_' + num).removeClass('btn-success');
							$('#available_quantity_' + num).removeClass('bg-warning');
							$('#available_quantity_' + num).addClass('btn-danger');

						} else {
							$('#available_quantity_' + num).removeClass('btn-danger');
							$('#available_quantity_' + num).removeClass('bg-warning');
							$('#available_quantity_' + num).addClass('btn-success');
						}

						//make the quantity transferred field readonly if total quantity available is 0
	          if(response.quantity == 0) {

	              $('#quantity_transferred_' + num).attr('readonly', 'readonly');
	          } else {

	              $('#quantity_transferred_' + num).removeAttr('readonly');
	          }

				});
			}

		/*$.ajax(
			{
				url: '<?php echo site_url('admin/itemSoldInUnit/'); ?>' + item_id,
				type: 'POST',
				dataType: 'json',
				cache: false
			}
		)
		.done(function(data) {
			
			let ajax_url = '<?php echo site_url('admin/transfer_item_selected/') ?>' + item_id;
			let unitName = data.unit_name;
			let packageName = data.package_name;
			let unitQuantity = data.unit_quantity;

			if(item_id != '') {

				$.ajax({
					url: ajax_url,
					type: 'POST',
					dataType: 'json',
				})
				.done(function(response) {

						$('#description_td_' + num).html(response.description);
						$('#available_quantity_' + num).val(number_format(response.quantity), 0, '.', ',');
						$('#hidden_available_quantity_' + num).val(response.quantity);

						//button colors
						if(response.quantity < 500 && response.quantity > 200) {
							$('#available_quantity_' + num).removeClass('btn-success');
							$('#available_quantity_' + num).removeClass('btn-danger');
							$('#available_quantity_' + num).addClass('bg-warning');

						} else if(response.quantity < 200) {
							$('#available_quantity_' + num).removeClass('btn-success');
							$('#available_quantity_' + num).removeClass('bg-warning');
							$('#available_quantity_' + num).addClass('btn-danger');

						} else {
							$('#available_quantity_' + num).removeClass('btn-danger');
							$('#available_quantity_' + num).removeClass('bg-warning');
							$('#available_quantity_' + num).addClass('btn-success');
						}

						//make the quantity transferred field readonly if total quantity available is 0
	          if(response.quantity == 0) {

	              $('#quantity_transferred_' + num).attr('readonly', 'readonly');
	          } else {

	              $('#quantity_transferred_' + num).removeAttr('readonly');
	          }


	          if(data.isSoldInUnit) {

		          //sold in units
							//show confirmation modal
							getPackage('0', item_id); //reset the package selection
							confirm_selection(item_id, num, '"'+unitName+'"', '"'+packageName+'"',unitQuantity);

						} else {

							$('#unit_name_' + num).text('');
						}

				});
			}

			
		});*/

}


function grand_total(num) {

	let unit_quantity = $('#unit_quantity_' + num).val();

	console.log(unit_quantity);

	let total_quantity = 0;
	const hidden_available_quantity = Number($('#hidden_available_quantity_' + num).val());
	const quantity_transferred = Number($('#quantity_transferred_' + num).val());

	$('tbody tr').each(function() {
	    //sum up the quantity
	    $(this).find('td .sum_total_quantity_transferred').each(function() {
	    	total_quantity = total_quantity + Number($(this).val());
	    });

	});

	//for quantity
	$('#total').html(number_format(total_quantity, 2, '.', ','));
	$('#hidden_total_quantity').val(total_quantity);

	$('#available_quantity_' + num).val(number_format((hidden_available_quantity - quantity_transferred), 2, '.', ','));

	$('#hidden_available_quantity2_' + num).val((hidden_available_quantity - quantity_transferred));

		let avq = Number($('#hidden_available_quantity2_' + num).val());
				//button colors
					if(avq < 500 && avq > 200) {
						$('#available_quantity_' + num).removeClass('btn-success');
						$('#available_quantity_' + num).removeClass('btn-danger');
						$('#available_quantity_' + num).addClass('bg-warning');
					} else if(avq < 200) {
						$('#available_quantity_' + num).removeClass('btn-success');
						$('#available_quantity_' + num).removeClass('bg-warning');
						$('#available_quantity_' + num).addClass('btn-danger');
					} else {
						$('#available_quantity_' + num).removeClass('btn-danger');
						$('#available_quantity_' + num).removeClass('bg-warning');
						$('#available_quantity_' + num).addClass('btn-success');
					}
}

 //reemove row
function remove_row(id) {

    //quantities
    let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity_transferred').val());
    let grand_total_quantity = Number($('#hidden_total_quantity').val());
    let balance_quantity = grand_total_quantity - row_total_quantity;


    $('#total').html(number_format(balance_quantity, 2, '.', ','));

    $('#hidden_total_quantity').val(balance_quantity);

    //enable the previous button
    $('#tr_' + (Number(id) - 1) + ' td a').removeAttr('disabled');

    //remove row now
    $('#tr_'+id).remove();
}


</script>