
<td width="90">
	<input type="number" min="1" required="true" onkeyup="row_total($('#order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity" id="order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" name="order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">
</td>

<!--
<td width="90">
	<input type="number" min="0" required="true" onkeyup="quantity_left($('#order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" class="form-control" id="order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>" name="order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">

	<input type="hidden" name="hidden_quantity_balance_per_<?=strtotime(date('Y-m-d H:i:s'));?>" id="hidden_quantity_balance_per_<?=strtotime(date('Y-m-d H:i:s'));?>" value="">
</td>-->
<td>
	<input type="text" class="form-control" min="0" required="true" name="order_item_<?=strtotime(date('Y-m-d H:i:s'));?>" id="order_item_<?=strtotime(date('Y-m-d H:i:s'));?>" value="">
</td>
<td>
	<input type="text" class="form-control" required="true" name="description_td_<?=strtotime(date('Y-m-d H:i:s'));?>" id="description_td_<?=strtotime(date('Y-m-d H:i:s'));?>" value="">
</td>
<td width="120" align="right">
	<div class="input-group">
		<div class="input-group-prepend">
			<div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
			</div>
		</div>
		<input type="text" required="true" class="form-control" id="order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>" onkeyup="row_total($('#order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" name="order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>" placeholder="0.00" value="">
	</div>
</td>

<!--
<td width="80">
	<input type="text" class="form-control" name="order_tax_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0.00">
</td>-->
<td width="140">
	<div class="input-group">
		<div class="input-group-prepend">
			<div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
			</div>
		</div>
		<input type="currency" class="form-control sum_total_amount" name="order_total_price_<?=strtotime(date('Y-m-d H:i:s'));?>" id="order_total_price_<?=strtotime(date('Y-m-d H:i:s'));?>" placeholder="0.00" value="" readonly="readonly">
	</div>
</td>

<script type="text/javascript">
/*function change_fields(item_id, num) {
		/* Act on the event */
	/*	let category = '<?php echo $category; ?>'; 

		let customer_id = '<?php echo $customer_id; ?>'; 
		let order_date = '<?php echo $order_date; ?>'; 
		let so = '<?php echo $so; ?>'; 

		let user = 'supplier';
		if(so == 'so') {
			user = 'customer';
		} 

		let ajax_url = '';
		if(order_date != '' && customer_id != '') {
			ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + category + '/' + customer_id + '/' + order_date;

		} else {
			ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + category;
		}

		if(item_id != '') {

			let quantity = Number($('#order_quantity_' + num).val());
			$.ajax({
				url: ajax_url,
				type: 'POST',
				dataType: 'json',
			})
			.done(function(response) {
			//	alert(response.unit_price);
				//return false;

				if(response.exists != false) {
					//it exists
					$('#description_td_' + num).html(response.description);
					$('#order_unit_price_' + num).val(response.unit_price);

					let unit_price_raw = response.unit_price;
					let unit_price = Number(response.unit_price);

					//update unit price
					if(unit_price_raw == undefined || unit_price_raw == 0) {
						//does not exist so alert the user to update this info before proceeding
					showAjaxModal_confirm('Price of the selected item/good for this ' + user + ' is invalid! Kindly update the price of this item/good for this ' + user + ' first!', 'Error');
            

						$('#order_unit_price_' + num).val(Number(0)); //set it to 0 since the price is not available
						//update total price
						$('#order_total_price_' + num).val(numeric_format(0, 0, '', ''));
							
					} else {
						$('#order_unit_price_' + num).val(unit_price);
						//update total price
						$('#order_total_price_' + num).val(numeric_format((quantity * unit_price), 0, '', ''));
					}
					
					

					
					//update the subtotal and total amounts
					grand_total();

				} else {

					if(so == 'so') {
						//does not exist so alert the user to update this info before proceeding
						showAjaxModal_confirm('We couldn\'t find any valid price list for this customer. Kindly select this customer from the "View All Customers" button under the "Sales" tab  and click on the "Edit" button at the top. On the popup window, click on the "Update" button to add this customer to the price list. Then manage the price list from there using the "Pricing" button!', 'Error');
	            return false;
	          }
				}

			});
		}
}*/

//find the total for each row
function row_total(num) {

		let quantity = Number($('#order_quantity_' + num).val());
		let unit_price = Number($('#order_unit_price_' + num).val());
		let category = '<?php echo $category; ?>';


		let total_price = quantity * unit_price;
		$('#order_total_price_' + num).val(numeric_format(total_price), 0, '', '');

		if(category != 'opening') {
			$('#order_picked_' + num).val(quantity);
			$('#hidden_quantity_balance_per_' + num).val(0);
		} else {
			$('#order_picked_' + num).val(0);
			$('#hidden_quantity_balance_per_' + num).val(quantity);
		}
		
		grand_total();
}

function quantity_left(num) {

		let quantity = Number($('#order_quantity_' + num).val());
		let quantity_picked = Number($('#order_picked_' + num).val());

		let balance = quantity - quantity_picked;
		$('#hidden_quantity_balance_per_' + num).val(balance);

}

function grand_total() {
	let subtotal = 0;
	let total = 0;
	let total_quantity = 0;
	let balance_due = Number('<?=$balance_due; ?>');
	let category = '<?=$category; ?>';

	$('tbody tr').each(function() {
		//sum up the amount
	    $(this).find('td .sum_total_amount').each(function() {
	    	total = total + Number($(this).val());
	    });

	    //sum up the quantity
	    $(this).find('td .sum_total_quantity').each(function() {
	    	total_quantity = total_quantity + Number($(this).val());
	    });

	});

	//reset the amount paid value
	$('#amount_paid').val(0);
	//for amount
	if(category == 'creditor') {
		$('#total').html(number_format(total - balance_due, 2, '.', ','));
		$('#subtotal').html(number_format(total - balance_due, 2, '.', ','));
		$('#balance_amount').val(number_format(total - balance_due, 2, '.', ','));
		$('#hidden_total').val(total - balance_due);

	} else {
		$('#total').html(number_format(total, 2, '.', ','));
		$('#subtotal').html(number_format(total, 2, '.', ','));
		$('#balance_amount').val(number_format(total, 2, '.', ','));
		$('#hidden_total').val(total);
	}
	
		if($('#hidden_total').val() > 0) {
				let amt_paid = Number($('#amount_paid').val());

				if(amt_paid > 0) {
					$('#paid_to').attr('required', 'required');
				} else {
					$('#paid_to').removeAttr('required');
				}
				
        $('#accounts_holder').slideDown('slow');
        

    } else {
    		$('#amount_paid').val('0');
    		$('#balance_amount').val(number_format(total - balance_due, 2, '.', ','));
    		$('#account_balance_so_neg').val('');
    		$('#paid_to').val('');

        $('#accounts_holder').slideUp('slow');
        $('#paid_to').removeAttr('required');
    }

	//for quantity
	$('#hidden_total_quantity').val(total_quantity);

	payment_update();
}

//update amount left to be paid when user enters the amount paid in all
function payment_update() {
    /* Act on the event */
    //amount balancing
    let total_amount = Number($('#hidden_total').val());
    let amount_paid = Number($('#amount_paid').val());
    let amount_left = total_amount - amount_paid;
    $('#amount_pd').html(number_format(amount_paid, 2, '.', ','));

    //qunatity balancing
    let total_quantity = Number($('#hidden_total_quantity').val());
    let quantity_picked = Number($('#quantity_picked').val());
    let quantity_left = total_quantity - quantity_picked;


    //amount fields
    //populate the hidden payment balance field with this
    $('#hidden_payment_balance').val(amount_left);
    ///Now let's format the balance field with this
    $('#balance_amount').val(number_format(amount_left, 2, '.', ','));

    //qunatity fields
    //populate the hidden quantity balance field with this
    $('#hidden_quantity_balance').val(quantity_left);
    ///Now let's format the balance field with this
    $('#balance_quantity').val(number_format(quantity_left, 0, '.', ','));
}

function auto_fill() {
    /* Act on the event */
    //amounts
    let total_amount = Number($('#hidden_total').val());
    let amount_paid = Number(total_amount);
    let amount_left = total_amount - amount_paid;

    //quantities
    let total_quantity = Number($('#hidden_total_quantity').val());
    let quantity_picked = Number(total_quantity);
    let quantity_left = total_quantity - quantity_picked;


    //amounts
    //populate the hidden payment balance field with this
    $('#hidden_payment_made').val(amount_paid);

    //populate the hidden payment balance field with this
    $('#hidden_payment_balance').val(amount_left);
    ///Now let's format the balance field with this
    $('#amount_pd').html(number_format(total_amount, 2, '.', ','));
    $('#amount_paid').val(total_amount);
    $('#balance_amount').val(number_format(amount_left, 2, '.', ','));


    //quantities
    //populate the hidden quantity balance field with this
    $('#hidden_quantity_balance').val(quantity_left);
    ///Now let's format the balance field with this
    $('#quantity_picked').val(quantity_picked);
    $('#balance_quantity').val(number_format(quantity_left, 0, '.', ','));
}

 //reemove row
function remove_row(id) {
	//amounts
    let row_total_cost = Number($('#tr_' + id + ' td .sum_total_amount').val());
    let grand_total = Number($('#hidden_total').val());
    let balance = grand_total - row_total_cost;

    //quantities
    let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity').val());
    let grand_total_quantity = Number($('#hidden_total_quantity').val());
    let balance_quantity = grand_total_quantity - row_total_quantity;


    $('#hidden_total').val(balance);
    $('#subtotal').html(number_format(balance, 2, '.', ','));
    $('#total').html(number_format(balance, 2, '.', ','));
    $('#amount_paid').val('0');
    $('#balance_amount').val(number_format(balance, 2, '.', ','));


    $('#hidden_total_quantity').val(balance_quantity);
    $('#quantity_picked').val(0);
    $('#balance_quantity').val(balance_quantity);

    //enable the previous button
    $('#tr_' + (Number(id) - 1) + ' td a').removeAttr('disabled');

    //remove row now
    $('#tr_'+id).remove();
}


</script>