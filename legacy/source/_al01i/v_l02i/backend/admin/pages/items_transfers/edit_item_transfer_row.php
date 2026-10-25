
<td width="150">
	<input type="number" min="0.1" step="any" required="true" onkeyup="grand_total($('#quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" onchange="grand_total($('#quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity_transferred" id="quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>" name="quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">

	<input type="hidden" id="prev_quantity_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>" name="prev_quantity_transferred_<?=$tr['html_id'];?>" value="0">
</td>

<td>
	<select required="true" class="form-control" onchange="change_fields($('#item_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>').val(), $('#item_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" name="item_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>" id="item_transferred_<?=strtotime(date('Y-m-d H:i:s'));?>">
		<option value="">Choose Item</option>
		<?php foreach ($all_items_array as $item): ?>
			<option value="<?=$item['item_id'];?>"><?=$item['item_name'];?></option>
		<?php endforeach;?>
	</select>
</td>
<td  id="description_td_<?=strtotime(date('Y-m-d H:i:s'));?>"></td>
<td width="180">
	<input type="text" min="1" readonly="readonly" class="form-control btn btn-success btn-lg" id="available_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" name="available_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">

	<input type="hidden" id="hidden_available_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" name="hidden_available_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">
	<input type="hidden" id="hidden_available_quantity2_<?=strtotime(date('Y-m-d H:i:s'));?>" name="hidden_available_quantity2_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">
</td>






