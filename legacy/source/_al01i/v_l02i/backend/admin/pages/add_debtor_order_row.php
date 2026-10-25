
<td width="90">
	<input type="number" min="1" required="true" onkeyup="debtor_row_total($('#debtor_order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" onchange="debtor_row_total($('#debtor_order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" class="form-control debtor_sum_total_quantity" id="debtor_order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" name="debtor_order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">
</td>

<?php
/*
if ($so == 'so') {
	?>
		<td width="90">
			<input type="number" min="0" required="true" onkeyup="debtor_quantity_left($('#debtor_order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" class="form-control" id="debtor_order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>" name="debtor_order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">

			<input type="hidden" name="debtor_hidden_quantity_balance_per_<?=strtotime(date('Y-m-d H:i:s'));?>" id="debtor_hidden_quantity_balance_per_<?=strtotime(date('Y-m-d H:i:s'));?>" value="">
		</td>
		<?php
}

*/
?>
<td>
	<select required="true" class="form-control" onchange="debtor_change_fields($('#debtor_order_item_<?=strtotime(date('Y-m-d H:i:s'));?>').val(), $('#debtor_order_item_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" name="debtor_order_item_<?=strtotime(date('Y-m-d H:i:s'));?>" id="debtor_order_item_<?=strtotime(date('Y-m-d H:i:s'));?>">
		<option value="">Choose Item</option>
		<?php foreach ($all_items_array as $item): ?>
			<option value="<?=$item['item_id'];?>"><?=$item['item_name'];?></option>
		<?php endforeach;?>
	</select>
</td>
<td id="description_td_<?=strtotime(date('Y-m-d H:i:s'));?>"></td>
<td width="120" align="right">
	<div class="input-group">
		<div class="input-group-prepend">
			<div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
			</div>
		</div>
		<input type="text" required="true" class="form-control" id="debtor_order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>" onkeyup="debtor_row_total($('#debtor_order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" onchange="debtor_row_total($('#debtor_order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" name="debtor_order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>" placeholder="0.00" value="">
	</div>
</td>
<td width="140">
	<div class="input-group">
		<div class="input-group-prepend">
			<div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
			</div>
		</div>
		<input type="currency" class="form-control debtor_sum_total_amount" name="debtor_order_total_price_<?=strtotime(date('Y-m-d H:i:s'));?>" id="debtor_order_total_price_<?=strtotime(date('Y-m-d H:i:s'));?>" placeholder="0.00" value="" readonly="readonly">
	</div>
</td>

<script type="text/javascript">
function debtor_change_fields(item_id, num) {
		/* Act on the event */
		let category = '<?php echo $category; ?>';
		if(item_id != '') {

			let quantity = Number($('#debtor_order_quantity_' + num).val());
			$.ajax({
				url: '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + category,
				type: 'POST',
				dataType: 'json',
			})
			.done(function(response) {
				$('#debtor_description_td_' + num).html(response.description);
				$('#debtor_order_unit_price_' + num).val(response.unit_price);

				let unit_price = Number(response.unit_price);
				$('#debtor_order_total_price_' + num).val(numeric_format((quantity * unit_price), 0, '', ''));
				//update the subtotal and total amounts
				debtor_grand_total();

			});
		}
}

//find the total for each row
function debtor_row_total(num) {

		let quantity = Number($('#debtor_order_quantity_' + num).val());
		let unit_price = Number($('#debtor_order_unit_price_' + num).val());
		let category = '<?php echo $category; ?>';


		let total_price = quantity * unit_price;
		$('#debtor_order_total_price_' + num).val(numeric_format(total_price), 0, '', '');

		if(category != 'opening') {
			$('#debtor_order_picked_' + num).val(quantity);
			$('#debtor_hidden_quantity_balance_per_' + num).val(0);
		} else {
			$('#debtor_order_picked_' + num).val(0);
			$('#debtor_hidden_quantity_balance_per_' + num).val(quantity);
		}
		
		debtor_grand_total();
}

function debtor_quantity_left(num) {

		let quantity = Number($('#debtor_order_quantity_' + num).val());
		let quantity_picked = Number($('#debtor_order_picked_' + num).val());

		let balance = quantity - quantity_picked;
		$('#debtor_hidden_quantity_balance_per_' + num).val(balance);

}

function debtor_grand_total() {
	let subtotal = 0;
	let total = 0;
	let total_quantity = 0;
	let balance_due = Number('<?=$balance_due; ?>');
	let category = '<?=$category; ?>';

	$('#debtor_s_order_create_table tbody tr').each(function() {
		//sum up the amount
	    $(this).find('td .debtor_sum_total_amount').each(function() {
	    	total = total + Number($(this).val());
	    });

	    //sum up the quantity
	    $(this).find('td .debtor_sum_total_quantity').each(function() {
	    	total_quantity = total_quantity + Number($(this).val());
	    });

	});

	//for amount
	if(category == 'creditor') {
		$('#debtor_total').html(number_format(total - balance_due, 2, '.', ','));
		$('#debtor_subtotal').html(number_format(total - balance_due, 2, '.', ','));
		$('#debtor_balance_amount').val(number_format(total - balance_due, 2, '.', ','));
		$('#debtor_hidden_total').val(total - balance_due);

	} else {
		$('#debtor_total').html(number_format(total, 2, '.', ','));
		$('#debtor_subtotal').html(number_format(total, 2, '.', ','));
		$('#debtor_balance_amount').val(number_format(total, 2, '.', ','));
		$('#debtor_hidden_total').val(total);
	}
	

	if($('#debtor_hidden_total').val() > 0) {
		$('#debtor_accounts_holder').slideDown('slow');
	} else {
		$('#debtor_accounts_holder').slideUp('slow');
	}

	//for quantity
	$('#debtor_hidden_total_quantity').val(total_quantity);

	debtor_payment_update();
}

//update amount left to be paid when user enters the amount paid in all
function debtor_payment_update() {
    /* Act on the event */
    //amount balancing
    let total_amount = Number($('#debtor_hidden_total').val());
    let amount_paid = Number($('#debtor_amount_paid').val());
    let amount_left = total_amount - amount_paid;
    $('#debtor_amount_pd').html(number_format(amount_paid, 2, '.', ','));

    //qunatity balancing
    let total_quantity = Number($('#debtor_hidden_total_quantity').val());
    let quantity_picked = Number($('#debtor_quantity_picked').val());
    let debtor_quantity_left = total_quantity - quantity_picked;


    //amount fields
    //populate the hidden payment balance field with this
    $('#debtor_hidden_payment_balance').val(amount_left);
    ///Now let's format the balance field with this
    $('#debtor_balance_amount').val(number_format(amount_left, 2, '.', ','));

    //qunatity fields
    //populate the hidden quantity balance field with this
    $('#debtor_hidden_quantity_balance').val(debtor_quantity_left);
    ///Now let's format the balance field with this
    $('#debtor_balance_quantity').val(number_format(debtor_quantity_left, 0, '.', ','));
}

function debtor_auto_fill() {
    /* Act on the event */
    //amounts
    let total_amount = Number($('#debtor_hidden_total').val());
    let amount_paid = Number(total_amount);
    let amount_left = total_amount - amount_paid;

    //quantities
    let total_quantity = Number($('#debtor_hidden_total_quantity').val());
    let quantity_picked = Number(total_quantity);
    let debtor_quantity_left = total_quantity - quantity_picked;


    //amounts
    //populate the hidden payment balance field with this
    $('#debtor_hidden_payment_made').val(amount_paid);

    //populate the hidden payment balance field with this
    $('#debtor_hidden_payment_balance').val(amount_left);
    ///Now let's format the balance field with this
    $('#debtor_amount_pd').html(number_format(total_amount, 2, '.', ','));
    $('#debtor_amount_paid').val(total_amount);
    $('#debtor_balance_amount').val(number_format(amount_left, 2, '.', ','));


    //quantities
    //populate the hidden quantity balance field with this
    $('#debtor_hidden_quantity_balance').val(debtor_quantity_left);
    ///Now let's format the balance field with this
    $('#debtor_quantity_picked').val(quantity_picked);
    $('#debtor_balance_quantity').val(number_format(debtor_quantity_left, 0, '.', ','));
}

 //reemove row
function debtor_remove_row(id) {
	//amounts
    let debtor_row_total_cost = Number($('#debtor_tr_' + id + ' td .debtor_sum_total_amount').val());
    let debtor_grand_total = Number($('#debtor_hidden_total').val());
    let balance = debtor_grand_total - debtor_row_total_cost;

    //quantities
    let debtor_row_total_quantity = Number($('#debtor_tr_' + id + ' td .debtor_sum_total_quantity').val());
    let debtor_grand_total_quantity = Number($('#debtor_hidden_total_quantity').val());
    let balance_quantity = debtor_grand_total_quantity - debtor_row_total_quantity;


    $('#debtor_hidden_total').val(balance);
    $('#debtor_subtotal').html(number_format(balance, 2, '.', ','));
    $('#debtor_total').html(number_format(balance, 2, '.', ','));
    $('#debtor_amount_paid').val('0.00');
    $('#debtor_balance_amount').val(number_format(balance, 2, '.', ','));


    $('#debtor_hidden_total_quantity').val(balance_quantity);
    $('#debtor_quantity_picked').val(0);
    $('#debtor_balance_quantity').val(balance_quantity);

    //enable the previous button
    $('#debtor_tr_' + (Number(id) - 1) + ' td a').removeAttr('disabled');

    //remove row now
    $('#debtor_tr_'+id).remove();
}


</script>