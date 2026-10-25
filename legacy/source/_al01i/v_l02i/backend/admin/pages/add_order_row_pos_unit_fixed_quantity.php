<?php
	$selected_item_name = $this->db->get_where('items', array('item_id' => $selected_item))->row()->item_name;

	$item_unit_name = $this->db->get_where('units', array('unit_id' => $item_unit_id))->row()->unit_name;

	$this->db->where('item_id', $selected_item);
	$this->db->where('unit_id', $item_unit_id);
	$item_unit_quantity = $this->db->get('units_items')->row()->unit_total;


?>
<td width="180" style="vertical-align: middle">
	<div class="col-md-12 col-sm-12 col-xs-12" style="padding-top: 10px">
		<div class="form-group flex flex-col gap-2">
			<div class="input-group">
				<div class="input-group-prepend">
					<button id="minus_btn_ton_<?=$selected_item ?>" class="btn btn-danger" type="button" onclick="minus_btn_ton($('#order_bundle_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))"><i class="fa fa-fw fa-minus"></i></button>
				</div>
				<input type="number" min="1" step="any" required="true" onkeyup="row_total_pos_ton($('#order_bundle_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total_pos_ton($('#order_bundle_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" class="form-control" id="order_bundle_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" name="order_bundle_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0" style="z-index: 2; height: 30px; font-size: 20px">
				<div class="input-group-append">
					<button id="plus_btn_ton_<?=$selected_item ?>" class="btn btn-success" type="button" onclick="plus_btn_ton($('#order_bundle_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))"><i class="fa fa-fw fa-plus"></i></button>
				</div>

			</div>
			<div class="w-fit rounded-lg">
				<span class="alert alert-warning input-group-text"><?=$item_unit_name;?>
			</span>
			</div>
		</div>

		<input type="hidden" min="1" step="any" required="true"  class="form-control sum_total_quantity_pos" id="order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" name="order_quantity_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0">
	</div>  
</td>

<?php
$readonly = '';
if ($so == 'so') {
	$readonly = 'readonly';
	?>
		<td width="150" style="vertical-align: middle">
			<div class="form-group row mt-2 pt-2 pr-3">
				<div class="input-group">
					<input type="number" min="0" step="any" required="true" onkeyup="quantity_left_ton($('#order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" class="form-control" id="order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>" name="order_picked_<?=strtotime(date('Y-m-d H:i:s'));?>" value="0" style="height: 30px; font-size: 20px"> 
					<div class="input-group-append">
						<div class="input-group-text">Pieces</div>
					</div>
				</div>
				
			</div>


			<input type="hidden" name="item_unit_name_<?=strtotime(date('Y-m-d H:i:s'));?>" value="<?=$item_unit_name?>">

			<input type="hidden" name="hidden_quantity_balance_per_<?=strtotime(date('Y-m-d H:i:s'));?>" id="hidden_quantity_balance_per_<?=strtotime(date('Y-m-d H:i:s'));?>" value="">
			<input type="hidden" name="ton_item_unit_id_<?=strtotime(date('Y-m-d H:i:s'));?>" value="<?=$item_unit_id;?>">
		</td>
		<?php
}
?>
<td style="vertical-align: middle">
	<select required="true" readonly="readonly" title="<?=$selected_item_name;?>" class="form-control" name="order_item_<?=strtotime(date('Y-m-d H:i:s'));?>" id="order_item_<?=strtotime(date('Y-m-d H:i:s'));?>" style="height: 30px; font-size: 12px !important">
			<option value="<?=$selected_item;?>"><?=$selected_item_name;?></option>
	</select>
</td>
<!--<td id="description_td_<?=strtotime(date('Y-m-d H:i:s'));?>"></td>-->
<td width="140" align="right" style="vertical-align: middle">
	<div class="input-group">
		<div class="input-group-prepend">
			<div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
			</div>
		</div>
		<input type="text" required="true" class="form-control" id="order_bundle_price_<?=strtotime(date('Y-m-d H:i:s'));?>" onkeyup="row_total_pos_ton($('#order_bundle_price_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total_pos_ton($('#order_bundle_price_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''))" name="order_bundle_price_<?=strtotime(date('Y-m-d H:i:s'));?>" placeholder="0.00" value="" <?=$readonly; ?> style="height: 30px; font-size: 20px">

		<input type="hidden" id="order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>" name="order_unit_price_<?=strtotime(date('Y-m-d H:i:s'));?>" value="">
		<input type="hidden" name="isInTon_<?=strtotime(date('Y-m-d H:i:s'));?>" value="yes" />
	</div>
</td>
<!--<td width="80">
	<input type="text" class="form-control" name="order_tax_<?//=strtotime(date('Y-m-d H:i:s'));?>" value="0.00">
</td>-->
<td width="200" style="vertical-align: middle">
	<div class="input-group">
		<div class="input-group-prepend">
			<div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
			</div>
		</div>
		<input type="currency" class="form-control sum_total_amount_pos" name="order_total_price_<?=strtotime(date('Y-m-d H:i:s'));?>" id="order_total_price_<?=strtotime(date('Y-m-d H:i:s'));?>" placeholder="0.00" value="" readonly="readonly" style="height: 30px; font-size: 20px">
	</div>
</td>

<script type="text/javascript">
	$(function() {
		change_fields_ton(<?=$selected_item?>, $('#order_item_<?=strtotime(date('Y-m-d H:i:s'));?>').attr('id').replace(/[^\d]+/, ''));
	});


//incremental
	function plus_btn_ton(num) {
		let current_qb = Number($('#order_bundle_quantity_' + num).val());
		let current_qb2 = Number($('#order_quantity_' + num).val());
		let current_qp = Number($('#order_picked_' + num).val());
		let item_unit_quantity = Number(<?=$item_unit_quantity;?>);
		let total_quantity = 0;


		total_quantity = item_unit_quantity * 1;
		$('#order_bundle_quantity_' + num).val(current_qb + 1);
		$('#order_picked_' + num).val(current_qb + total_quantity);
		$('#order_quantity_' + num).val(current_qb + total_quantity);

		//do the calculations
		row_total_pos_ton(num);
	}

//decremental
	function minus_btn_ton(num) {
		let current_qb = Number($('#order_bundle_quantity_' + num).val());
		let current_qp = Number($('#order_picked_' + num).val());

		let item_unit_quantity = Number(<?=$item_unit_quantity;?>);
		let total_quantity = 0;

		total_quantity = item_unit_quantity * 1;

		if(current_qb > 0) {//don't go beyond 0
			$('#order_bundle_quantity_' + num).val(current_qb - 1);
		}

		if(current_qp >  0) { //don't go beyond 0
			$('#order_picked_' + num).val(current_qp - 1);
			$('#order_picked_' + num).val(current_qb - total_quantity);
			$('#order_quantity_' + num).val(current_qb - total_quantity);
		}

		//do the calculations
		row_total_pos_ton(num);
	}

function change_fields_ton(item_id, num) {
		/* Act on the event */
		let category = '<?php echo $category; ?>'; 

		let customer_id = '<?php echo $customer_id; ?>'; 
		let order_date = '<?php echo $order_date; ?>'; 
		let so = '<?php echo $so; ?>'; 
		let item_unit_quantity = Number(<?=$item_unit_quantity;?>);

		let user = 'supplier';
		if(so == 'so') {
			user = 'customer';
		} 

		let ajax_url = '';
		if(order_date != '' && customer_id != '') {
			ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + category + '/' + customer_id + '/' + order_date + '/<?=$item_unit_id; ?>';

		} else {
			ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + category + '/<?=$item_unit_id; ?>';
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
					$('#order_bundle_price_' + num).val(response.unit_price);
					$('#order_unit_price_' + num).val(roundedToFixed(response.unit_price / item_unit_quantity, 2));

					let unit_price_raw = response.unit_price;
					let unit_price = Number(response.unit_price);

					//update unit price
					if(unit_price_raw == undefined || unit_price_raw == 0) {
						//does not exist so alert the user to update this info before proceeding
					showAjaxModal_confirm('Price of the selected item/good for this ' + user + ' is invalid! Kindly update the price of this item/good for this ' + user + ' first!', 'Error');
            

						$('#order_bundle_price_' + num).val(Number(0)); 
						$('#order_unit_price_' + num).val(Number(0));
						//set it to 0 since the price is not available
						//update total_pos price
						$('#order_total_price_' + num).val(numeric_format(0, 0, '', ''));
							
					} else {
						$('#order_bundle_price_' + num).val(unit_price);
						$('#order_unit_price_' + num).val(roundedToFixed(unit_price / item_unit_quantity, 2));
						//update total_pos price
						$('#order_total_price_' + num).val(numeric_format((quantity * unit_price), 0, '', ''));
					}
					
					

					
					//update the subtotal_pos and total_pos amounts
					grand_total_pos();

				} else {

					if(so == 'so') {
						//does not exist so alert the user to update this info before proceeding
						showAjaxModal_confirm('We couldn\'t find any valid price list for this customer. Kindly select this customer from the "View All Customers" button under the "Sales" tab  and click on the "Edit" button at the top. On the popup window, click on the "Update" button to add this customer to the price list. Then manage the price list from there using the "Pricing" button!', 'Error');
	            return false;
	          }
				}

			});
		}
}

//find the total_pos for each row
function row_total_pos_ton(num) {

		let quantity = Number($('#order_bundle_quantity_' + num).val());
		let unit_price = Number($('#order_bundle_price_' + num).val());
		let category = '<?php echo $category; ?>';
		let item_unit_quantity = Number(<?=$item_unit_quantity;?>);
		let total_quantity_main = item_unit_quantity * quantity;


		$('#order_quantity_' + num).val(total_quantity_main);


		let total_pos_price = quantity * unit_price;
		$('#order_total_price_' + num).val(numeric_format(total_pos_price), 0, '', '');

		if(category != 'opening') {
			$('#order_picked_' + num).val(total_quantity_main);
			$('#hidden_quantity_balance_per_' + num).val(0);
		} else {
			$('#order_picked_' + num).val(0);
			$('#hidden_quantity_balance_per_' + num).val(total_quantity_main);
		}
		
		grand_total_pos();
}

function quantity_left_ton(num) {

		let quantity = Number($('#order_quantity_' + num).val());
		let quantity_picked = Number($('#order_picked_' + num).val());

		let balance = quantity - quantity_picked;
		$('#hidden_quantity_balance_per_' + num).val(balance);

}

function grand_total_pos() {
	let subtotal_pos = 0;
	let total_pos = 0;
	let total_quantity_pos = 0;
	let balance_due = Number('<?=$balance_due; ?>');
	let category = '<?=$category; ?>';
	let discount = $('#discount_pos').val();

	$('tbody tr').each(function() {
		//sum up the amount
	    $(this).find('td .sum_total_amount_pos').each(function() {
	    	total_pos = total_pos + Number($(this).val());
	    });

	    //sum up the quantity
	    $(this).find('td .sum_total_quantity_pos').each(function() {
	    	total_quantity_pos = total_quantity_pos + Number($(this).val());
	    });

	});

	

	//reset the amount paid value
	$('#amount_paid_pos').val(0);
	
	//for amount
	if(category == 'creditor') {
		$('#total_pos').html(number_format(total_pos - balance_due, 2, '.', ','));
		$('#subtotal_pos').html(number_format(total_pos - balance_due, 2, '.', ','));
		$('#balance_amount_pos').val(number_format(total_pos - balance_due, 2, '.', ','));
		$('#hidden_total_pos').val(total_pos - balance_due);

	} else {

		/*Effect discount*/
		subtotal_pos = total_pos
		total_pos = total_pos - discount;
		
		$('#total_pos').html(number_format(total_pos, 2, '.', ','));
		$('#subtotal_pos').html(number_format(subtotal_pos, 2, '.', ','));
		$('#balance_amount_pos').val(number_format(total_pos, 2, '.', ','));
		$('#hidden_total_pos').val(total_pos);
	}
	
		if($('#hidden_total_pos').val() > 0) {
				let amt_paid = Number($('#amount_paid_pos').val());

				if(amt_paid > 0) {
					$('#paid_to_pos').attr('required', 'required');
				} else {
					$('#paid_to_pos').removeAttr('required');
				}
				
        $('#accounts_holder').slideDown('slow');
        

    } else {

    	$('#amount_tendered_pos').val('');
        $('#amount_tendered_pos').attr('placeholder', '0.00');

    	$('#amount_paid_pos').val('');
        $('#amount_paid_pos').attr('placeholder', '0.00');
    		$('#balance_amount_pos').val(number_format(total_pos - balance_due, 2, '.', ','));
    		$('#account_balance_so_neg').val('');
    		$('#paid_to_pos').val('');

        $('#accounts_holder').slideUp('slow');
        $('#paid_to_pos').removeAttr('required');

        change_update();
    }

	//for quantity
	$('#hidden_total_quantity_pos').val(total_quantity_pos);

	payment_update();
}

//update amount left to be paid when user enters the amount paid in all
function payment_update() {
    /* Act on the event */
    //amount balancing
    let total_amount_pos = Number($('#hidden_total_pos').val());
    let amount_tendered_pos = Number($('#amount_tendered_pos').val());
    let amount_paid_pos = Number($('#amount_paid_pos').val());
    let amount_left = total_amount_pos - amount_paid_pos;
    $('#amount_pd').html(number_format(amount_paid_pos, 2, '.', ','));

    //qunatity balancing
    let total_quantity_pos = Number($('#hidden_total_quantity_pos').val());
    let quantity_picked = Number($('#quantity_picked_pos').val());
    let quantity_left_ton = total_quantity_pos - quantity_picked;


    //amount fields
    //populate the hidden payment balance field with this
    $('#hidden_payment_balance_pos').val(amount_left);
    ///Now let's format the balance field with this
    $('#balance_amount_pos').val(number_format(amount_left, 2, '.', ','));
    $('#change_due_pos').val(number_format((amount_tendered_pos - amount_paid_pos), 2, '.', ','));

    //qunatity fields
    //populate the hidden quantity balance field with this
    $('#hidden_quantity_balance_pos').val(quantity_left_ton);
    ///Now let's format the balance field with this
    $('#balance_quantity_pos').val(number_format(quantity_left_ton, 0, '.', ','));
}

//update change due when amount tendered is changed
function change_update() {
    /* Act on the event */
    let amount_tendered_pos = Number($('#amount_tendered_pos').val());
    let amount_paid_pos = Number($('#amount_paid_pos').val());


    $('#change_due_pos').val(number_format((amount_tendered_pos - amount_paid_pos), 2, '.', ','));
}

function auto_fill() {
    /* Act on the event */
    //amounts
    let total_amount_pos = Number($('#hidden_total_pos').val());
    let amount_paid_pos = Number(total_amount_pos);
    let amount_left = total_amount_pos - amount_paid_pos;

    //quantities
    let total_quantity_pos = Number($('#hidden_total_quantity_pos').val());
    let quantity_picked = Number(total_quantity_pos);
    let quantity_left_ton = total_quantity_pos - quantity_picked;


    //amounts
    //populate the hidden payment balance field with this
    $('#hidden_payment_made').val(amount_paid_pos);

    //populate the hidden payment balance field with this
    $('#hidden_payment_balance_pos').val(amount_left);
    ///Now let's format the balance field with this
    $('#amount_pd').html(number_format(total_amount_pos, 2, '.', ','));
    $('#amount_paid_pos').val(total_amount_pos);
    $('#amount_tendered_pos').val(total_amount_pos);
    $('#balance_amount_pos').val(number_format(amount_left, 2, '.', ','));

    //quantities
    //populate the hidden quantity balance field with this
    $('#hidden_quantity_balance_pos').val(quantity_left_ton);
    ///Now let's format the balance field with this
    $('#quantity_picked_pos').val(quantity_picked);
    $('#balance_quantity_pos').val(number_format(quantity_left_ton, 0, '.', ','));

    change_update();
}

//remove row
function remove_row(id) {
	//amounts
    let row_total_pos_ton_cost = Number($('#tr_pos_' + id + ' td .sum_total_amount_pos').val());
    let grand_total_pos = Number($('#hidden_total_pos').val());
    let balance = grand_total_pos - row_total_pos_ton_cost;

    //quantities
    let row_total_quantity_pos = Number($('#tr_pos_' + id + ' td .sum_total_quantity_pos').val());
    let grand_total_quantity_pos = Number($('#hidden_total_quantity_pos').val());
    let balance_quantity_pos = grand_total_quantity_pos - row_total_quantity_pos;


    $('#hidden_total_pos').val(balance);
    $('#subtotal_pos').html(number_format(balance, 2, '.', ','));
    $('#total_pos').html(number_format(balance, 2, '.', ','));

    $('#amount_tendered_pos').val('');
    $('#amount_tendered_pos').attr('placeholder', '0.00');

    $('#amount_paid_pos').val('');
    $('#amount_paid_pos').attr('placeholder', '0.00');
    $('#balance_amount_pos').val(number_format(balance, 2, '.', ','));

    change_update();


    $('#hidden_total_quantity_pos').val(balance_quantity_pos);
    $('#quantity_picked_pos').val(0);
    $('#balance_quantity_pos').val(balance_quantity_pos);

    //enable the previous button
    $('#tr_pos_' + (Number(id) - 1) + ' td a').removeAttr('disabled');

    //remove row now
    $('#tr_pos_'+id).remove();
}


function roundedToFixed(input, digits){
  var rounder = Math.pow(10, digits);
  return (Math.round(input * rounder) / rounder).toFixed(digits);
}

</script>