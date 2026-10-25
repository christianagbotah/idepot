<?php
echo '<script src="' . base_url() . 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });

      })

    </script>';

// Batch load settings
$settings = $this->db->get_where('settings', array('type' => 'currency'))->row();
$currency = $settings->description ?? '';

// Batch load order data
$order_code_query = $this->db->get_where('sales_order', array('so_code' => $so_code, 'customer_id' => $customer_id));
$order_row = $order_code_query->row();

$date = $order_row->date_timestamp ?? '';
$track_code = $order_row->track_code ?? '';
$prev_amount_paid = $order_row->amount_paid ?? 0;
$discount = $order_row->discount ?? 0;
$grand_total = $order_row->grand_total ?? 0;
$comment = $order_row->comment ?? '';
$private_comment = $order_row->private_comment ?? '';
$grand_quantity = $order_row->total_quantity ?? 0;

$invoice_row = $this->db->get_where('invoice', array('so_code' => $so_code, 'customer_id' => $customer_id))->row();
$invoice_code = $invoice_row->invoice_code ?? '';

$this_order_array = $order_code_query->result_array();

$this->db->select_sum('quantity_due');
$total_q_due = $this->db->get_where('sales_order', array('so_code' => $so_code, 'customer_id' => $customer_id))->row()->quantity_due ?? 0;

$amount_paid = $prev_amount_paid;
$amount_due = $grand_total - $amount_paid;

// Batch load all items
$all_items = $this->db->get('items')->result_array();
$items_map = array_column($all_items, null, 'item_id');

// Batch load all units
$all_units = $this->db->get('units')->result_array();
$units_map = array_column($all_units, null, 'unit_id');

// Batch load accounts
$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
$payment_row = $this->db->get_where('payment', array('so_code' => $so_code, 'customer_id' => $customer_id))->row();
$account_id = $payment_row->account_id ?? 0;
$account_balance = 0;
if ($account_id > 0) {
    $account_row = $this->db->get_where('accounts', array('account_id' => $account_id))->row();
    $account_balance = $account_row->current_balance ?? 0;
}


?>

<div class="form-group row p-3">
    <span class="badge badge-danger" style="text-align: center;"><em>If the customer wants to pick more than what is left, kindly set off this and create a new order for the extra quantity he/she wants to pick.</em></span></div>
            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="s_order_create_table">
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <th>Picked</th>
                        <th>Picking</th>
                        <th>Item</th>
                        <!-- <th>Description</th> -->
                        <th>Unit Price</th>
                        <th>Total</th>
                        <!--<th>Delete</th>-->
                      </tr>
                    </thead>
                    <tbody>
                        <?php
$table_row_counter = 1;
$item_unit_name = '';
$unit_quantity_bought = '';

foreach ($this_order_array as $order):

	//checking if this is a unit sale
	if (($order['order_item_has_unit_sales'] ?? '') == '2') {
		//sold in ton
		$item_unit_name = $units_map[$order['unit_id'] ?? 0]['unit_name'] ?? '';
		$unit_quantity_bought = $order['bundle_quantity'] ?? 0;
	} else if (($order['order_item_has_unit_sales'] ?? '') == '1') {
		//sold in unit
		$item_unit_name = $units_map[$order['unit_id'] ?? 0]['unit_name'] ?? '';
		$unit_quantity_bought = $order['quantity'] ?? 0;
	} else {
		$item_unit_name = '';
		$unit_quantity_bought = 0;
	}
?>
                        <tr id="tr_<?=$table_row_counter;?>">
                            <td width="90">
                                <input type="number" min="1" required="true" onkeyup="row_total($('#order_quantity_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_quantity_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity" id="order_quantity_<?=$order['html_id'] ?? 0;?>" name="order_quantity_<?=$order['html_id'] ?? 0;?>" readonly="readonly" value="<?=$order['quantity'] ?? 0;?>">

                                <?php
if (($order['order_item_has_unit_sales'] ?? '') == '1' || ($order['order_item_has_unit_sales'] ?? '') == '2') {?>
                                        <div class="form-group row ml-2">
                                            <small style="font-size: 8px"><?=$unit_quantity_bought . ' ' . $item_unit_name;?> were sold.</small>
                                        </div>
                                   <?php }
?>

                                <input type="hidden" name="so_<?=$order['html_id'] ?? 0;?>" id="so_<?=$order['html_id'] ?? 0;?>" value="<?=$order['so_id'] ?? 0;?>">
                            </td>



                            <td width="90">
                                <input type="number" min="0" readonly="readonly" required="true" class="form-control" id="order_picked_<?=$order['html_id'] ?? 0;?>" name="order_picked_<?=$order['html_id'] ?? 0;?>" value="<?=$order['quantity_picked'] ?? 0;?>">

                                <input type="hidden" name="hidden_quantity_balance_per_<?=$order['html_id'] ?? 0;?>" id="hidden_quantity_balance_per_<?=$order['html_id'] ?? 0;?>" value="<?=$order['quantity_due'] ?? 0;?>">

                                <input type="hidden" name="hidden_quantity_picked_<?=$order['html_id'] ?? 0;?>" id="hidden_quantity_picked_<?=$order['html_id'] ?? 0;?>" value="<?=$order['quantity_picked'] ?? 0;?>">

                                <input type="hidden" name="qq_picked_<?=$order['html_id'] ?? 0;?>" id="qq_picked_<?=$order['html_id'] ?? 0;?>" value="<?=$order['quantity_picked'] ?? 0;?>">
                            </td>

                            <td width="90">
                                <input type="number" min="0" max="<?=$order['quantity_due'] ?? 0;?>" step="any" required="true" <?=($order['quantity_due'] ?? 0) == 0 ? 'readonly="readonly"' : '';?> onkeyup="quantity_left($('#order_picking_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''), $('#order_item_<?=$order['html_id'] ?? 0;?>').val(), <?=$order['item_id'] ?? 0;?>, <?=$order['quantity_due'] ?? 0;?>); change_fields($('#order_item_<?=$order['html_id'] ?? 0;?>').val(), $('#order_item_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''), <?=$order['item_id'] ?? 0;?>, <?=$order['price'] ?? 0;?>)" onchange="quantity_left($('#order_picking_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''), $('#order_item_<?=$order['html_id'] ?? 0;?>').val(), <?=$order['item_id'] ?? 0;?>, <?=$order['quantity_due'] ?? 0;?>); change_fields($('#order_item_<?=$order['html_id'] ?? 0;?>').val(), $('#order_item_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''), <?=$order['item_id'] ?? 0;?>, <?=$order['price'] ?? 0;?>)" class="form-control" id="order_picking_<?=$order['html_id'] ?? 0;?>" name="order_picking_<?=$order['html_id'] ?? 0;?>" value="0">

                                <input type="hidden" name="hidden_quantity_due_<?=$order['html_id'] ?? 0;?>" id="hidden_quantity_due_<?=$order['html_id'] ?? 0;?>" value="<?=$order['quantity_due'] ?? 0;?>">
                            </td>

                            <td>

                                <?php
if (($order['quantity_due'] ?? 0) == 0) {
	?>
                                        <select required="true" class="form-control select2" readonly="readonly" onchange="change_fields($('#order_item_<?=$order['html_id'] ?? 0;?>').val(), $('#order_item_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''), <?=$order['item_id'] ?? 0;?>, <?=$order['price'] ?? 0;?>)" name="order_item_<?=$order['html_id'] ?? 0;?>" id="order_item_<?=$order['html_id'] ?? 0;?>">

                                            <option value="<?=$order['item_id'] ?? 0;?>" selected><?=$items_map[$order['item_id'] ?? 0]['item_name'] ?? '';?></option>
                                        </select>


                                        <?php
} else {

	if (($order['order_item_has_unit_sales'] ?? '') == '1' || ($order['order_item_has_unit_sales'] ?? '') == '2') {
		//sold in unit so we disallow changing
		?>

                                <select required="true" readonly class="form-control select2" name="order_item_<?=$order['html_id'] ?? 0;?>" id="order_item_<?=$order['html_id'] ?? 0;?>">
                                    <option value="<?=$order['item_id'] ?? 0;?>" selected><?=$items_map[$order['item_id'] ?? 0]['item_name'] ?? '';?></option>
                                </select>
                                <?php
} else {
		//not sold in unit so we can change it
		?>
                                    <select required="true" class="form-control select2" onchange="change_fields($('#order_item_<?=$order['html_id'] ?? 0;?>').val(), $('#order_item_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''), <?=$order['item_id'] ?? 0;?>, <?=$order['price'] ?? 0;?>)" name="order_item_<?=$order['html_id'] ?? 0;?>" id="order_item_<?=$order['html_id'] ?? 0;?>">

                                    <?php
		foreach ($all_items as $item):
		?>
                                            <option value="<?=$item['item_id'] ?? 0;?>" <?php if (($order['item_id'] ?? 0) == ($item['item_id'] ?? 0)) {echo 'selected';}?>><?=$item['item_name'] ?? '';?></option>
                                            <?php
endforeach;
		?>


                                </select>
                                    <?php
}
}
?>
                            </td>

                            <!-- <td id="description_td_<?//=$order['html_id'];?>"><?//=$this->db->get_where('items', array('item_id' => $order['item_id']))->row()->description;?>
                            </td> -->

                            <td width="120" align="right">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?=$currency;?>
                                        </div>
                                    </div>
                                    <input type="currency" required="true" class="form-control" id="order_unit_price_<?=$order['html_id'] ?? 0;?>" onkeyup="row_total($('#order_unit_price_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_unit_price_<?=$order['html_id'] ?? 0;?>').attr('id').replace(/[^\d]+/, ''))" name="order_unit_price_<?=$order['html_id'] ?? 0;?>" placeholder="0.00" readonly="readonly" value="<?=$order['price'] ?? 0;?>">

                                    <input type="hidden" name="price_<?=$order['html_id'] ?? 0;?>" id="price_<?=$order['html_id'] ?? 0;?>" value="<?=$order['price'] ?? 0;?>">
                                </div>
                            </td>

                            <td width="140">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text">
                                            <?=$currency;?>
                                        </div>
                                    </div>
                                    <input type="currency" class="form-control sum_total_amount" name="order_total_price_<?=$order['html_id'] ?? 0;?>" id="order_total_price_<?=$order['html_id'] ?? 0;?>" placeholder="0.00" value="<?=$order['amount'] ?? 0;?>" readonly="readonly">

                                    <input type="hidden" name="total_price_<?=$order['html_id'] ?? 0;?>" id="total_price_<?=$order['html_id'] ?? 0;?>" value="<?=$order['amount'] ?? 0;?>">
                                </div>
                            </td>
<!--
                            <td width="60">
                                <a href="javascript:;" disabled="disabled" onclick="remove_row('<?=$table_row_counter;?>')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td>-->
                            </tr>

                        <?php
$table_row_counter++;
endforeach;?>
                    </tbody>

                </table>
            </div>

            <hr>
          <!--  <div class="row">
                <div class="col-md-8 col-sm-8 col-lg-8"></div>
                <div class="col-md-4 col-sm-4 col-lg-4" style="text-align: right">
                    <a href="javascript:;" onclick="add_new_row()" id="add_btn" class="btn btn-success btn-sm" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr> -->

            <div class="form-group row">
                <div class="col-md-4 col-sm-4">
                    <div class="col-md-12 col-sm-12 mb-3">
                        <label  class="control-label"><?php echo get_phrase('comments'); ?></label>
                        <div class="col-sm-12 col-md-12">
                            <textarea  name="comments" class="form-control" cols="50" placeholder="Comments" ><?=$comment;?></textarea>
                        </div>
                    </div>

                    <div class="col-md-12 col-sm-12">
                        <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                        <div class="col-sm-12 col-md-12">
                            <textarea  name="private_comments" class="form-control" cols="50" placeholder="Private Comments"><?=$private_comment;?></textarea>
                        </div>
                    </div>
                </div>

                <div class="col-md-8 col-sm-8">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th class="text-muted">Total:</th>
                                    <th style="text-align: right"><strong><span><?=$currency;?></span> <span id="total"><?=number_format($grand_total, 2, '.', ',')?></span></strong>

                                        <input type="hidden" name="grand_total_price" id="grand_total_price" value="<?=$grand_total?>">
                                    </th>
                                </tr>
                                <tr>
                                    <th class="text-muted">Discount:</th>
                                    <th style="text-align: right"><strong><span><?=$currency;?></span> <span><?=number_format($discount, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <tr>
                                    <th class="text-muted">Net Payable:</th>
                                    <th style="text-align: right"><strong><span><?=$currency;?></span> <span id="total_paid"><?=number_format(($grand_total + $discount )- $discount, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <tr style="border-top: 2px solid #c6c3c3;"><td></td></tr>
                                <tr>
                                    <th class="text-muted">Total Paid:</th>
                                    <th style="text-align: right"><strong><span><?=$currency;?></span> <span id="total_paid"><?=number_format($amount_paid, 2, '.', ',')?></span></strong></th>
                                </tr>

                                <tr>
                                    <th class="text-muted">Total Owing:</th>
                                    <th style="text-align: right"><strong><span><?=$currency;?></span> <span id="total_owing"><?=number_format($amount_due, 2, '.', ',')?></span></strong></th>
                                </tr>

                                <input type="hidden" name="hidden_total" id="hidden_total" value="<?=$grand_total;?>">
                                <input type="hidden" name="hidden_payment_balance" id="hidden_payment_balance" value="<?=$amount_due;?>">
                                <input type="hidden" name="discount" value="<?=$discount;?>">

                                 <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="<?=$grand_quantity;?>">
                                <input type="hidden" name="hidden_quantity_balance" id="hidden_quantity_balance" value="<?=$total_q_due;?>">

                            </thead>
                        </table>

                        <hr><hr>
                        <input type="hidden" min="0" name="amount_paid" class="form-control" value="<?=$amount_paid;?>" required="required">
                        <!--
                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12"><h3>INVOICE</h3></div>
                        </div>
                        <hr>
                        <div class="form-group row" style="display: none" id="error_holder">
                                <div class="col-sm-12 col-md-12">
                                    <div id="inv_code_err_message"></div>
                                </div>
                            </div>-->
                            <div class="form-group row mt-5">
                                <div class="col-sm-6 col-md-6" id="waybill_verification_holder"></div>
                                <div class="col-sm-6 col-md-6">
                                    <div class="input-group">
                                        <div class="input-group-prepend">
                                            <div class="input-group-text bg-info text-light font-bold">INVOICE CODE</div>
                                        </div>
                                        <input type="text" title="<?php echo $invoice_code; ?>" class="form-control" name="invoice_code" id="invoice_code" value="<?php echo $invoice_code; ?>" readonly="readonly">
                                    </div>

                                </div>
                            </div>


                    <!-- <div id="accounts_holder">
                        <div class="form-group row">
                            <div class="col-sm-6 col-md-6">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-info text-light">Amount Received: <?=$currency;?></div>
                                    </div>
                                    <input type="currency" onkeyup="payment_update()" onchange="payment_update()" min="0" name="amount_paid" id="amount_paid" class="form-control" value="0" required="required" <?php //if(substr($so_code, 0, 8) == 'Opening-') { echo 'readonly'; }; ?>>
                                </div>
                            </div>

                            <input type="hidden" name="balance_amount" id="balance_amount" class="form-control form-control-plaintext" value="<?=number_format($amount_due, 2, '.', ',');?>" readonly="readonly">
                        </div>

                       

                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-danger text-light">Payment Mode:</div>
                                    </div>
                                    <select name="paid_to" id="paid_to" onchange="update_bank_balance($(this).val())" class="form-control" required="required">

                                        <?php
                                            foreach ($accounts as $acc):
                                            ?>
                                                <option value="<?=$acc['account_id'] ?? 0;?>" <?php if ($account_id == ($acc['account_id'] ?? 0)) {echo 'selected';}?>><?=$acc['name'] ?? '';?></option>
                                                <?php
                                            endforeach;
                                            ?>

                                    </select>
                                </div>
                            </div>
                        </div>

                      <div class="form-group row">
                            <div class="col-sm-8 col-md-8">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-danger text-light">Balance: <?=$currency;?></div>
                                    </div>
                                    <input type="text" name="account_balance" id="account_balance" class="form-control form-control-plaintext" value="<?=number_format($account_balance, 2, '.', ',');?>" readonly="readonly">
                                </div>
                            </div>
                        </div>
                    </div>
                </div> -->
            </div>
        </div>

    <script type="text/javascript">

        $(function() {
            grand_total();
            getWaybillCodeSection4Verification(<?=$customer_id?>);//load new invoice code
        });

    function quantity_left(num, item_id, order_item_id, quantity_due) {



        let hidden_quantity_picked = Number($('#hidden_quantity_picked_' + num).val());

        let quantity = Number($('#order_quantity_' + num).val());
        //let total_quantity_due = Number(<?=$total_q_due?>);
        let quantity_picking = Number($('#order_picking_' + num).val());

        //if user enters more than what is left, we force the quantity entered to be the quantity actually left for that item
        if(quantity_picking > quantity_due) {
            quantity_picking = quantity_due;
        }

        $('#order_picked_' + num).val(hidden_quantity_picked + quantity_picking);
        let quantity_picked = Number($('#order_picked_' + num).val());


        let balance = quantity - quantity_picked;
        $('#hidden_quantity_balance_per_' + num).val(balance);
        $('#order_picking_' + num).val(quantity_picking);


       // let q_picked = Number($('#hidden_quantity_balance').val());
       // $('#hidden_quantity_balance').val(q_picked - quantity_picking);
        //$('#q_due').val(number_format((q_picked - quantity_picking), 0, '.', ','));

        //update fields
       // change_fields(item_id, num, order_item_id, caller="input");

}

    //update same item selected for picking
    function updateItemPickingAgain() {
        console.log('worked');
    }

    function change_fields(item_id, num, order_item_id, order_price, caller="select") {
            /* Act on the event */

            //check if the item selected has already been selected in another field
            let dup_counter = 0;
            $('tbody tr').each(function() {
                //sum up the amount
                $(this).find('td select').each(function() {

                    if(item_id == $(this).val()) {
                        dup_counter++;
                    }
                });

            });

            if(dup_counter > 1) {
                //duplicate found
                confirm_prompt('<h3>This Item has already been selected. Please choose a different Item.</h3><h4>Is the customer really picking this item again?</h4><br/>', updateItemPickingAgain());

                $('#order_item_' + num).find("option[value='"+order_item_id+"']").prop('selected', true).trigger('change');
                return false;
            }


            let category = 'creditor';

            let customer_id = '<?php echo $customer_id; ?>';
            let order_date = '<?php echo $date; ?>';
            let so = 'so';
            let first_unit_price = Number($('#price_' + num).val());

            let user = 'supplier';
            if(so == 'so') {
                user = 'customer';
            }

            let ajax_url = '';
            if(order_date != '' && customer_id != '') {
                ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + category + '/' + customer_id + '/' + order_date;

            } else {
                ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + category + '/' + customer_id;
            }

            if(item_id != '') {

                let quantity = Number($('#order_quantity_' + num).val()); //same item, no change

                let qq_picked = Number($('#qq_picked_' + num).val());
                let qq_picking = Number($('#order_picking_' + num).val());
                let first_item_qq_left = quantity - qq_picked; //quantity left for the item so far
                let first_item_qq_picked = qq_picked; //quantity of the item picked so far
                
                if(qq_picking > 0) {
                    first_item_qq_left -= qq_picking; /*this is the item left for the one being swaaped, but when picking now is more than 0, we deduct it from the one left earlier*/
                }


                $.ajax({
                    url: ajax_url,
                    type: 'POST',
                    dataType: 'json',
                })
                .done(function(response) {
                //  alert(response.unit_price);
                    //return false;

                    if(response.exists != false) {
                        //it exists

                        $('#description_td_' + num).html(response.description);
                        $('#order_unit_price_' + num).val(response.unit_price);

                        let unit_price_raw = response.unit_price;
                        let unit_price = Number(response.unit_price);

                        if(item_id == order_item_id) { //same item seleceted

                            $('#description_td_' + num).html(response.description);
                            

                            if(Number(<?=$date_difference?>) > 180) {
                                // more than 6 months old order so we use the new price
                                $('#order_unit_price_' + num).val(response.unit_price);
                                unit_price_raw = response.unit_price;
                                unit_price = Number(response.unit_price);

                            } else {

                                $('#order_unit_price_' + num).val(order_price);
                                unit_price_raw = order_price;
                                unit_price = Number(order_price);
                            }
                            

                        }



                        if(item_id != order_item_id) { //item changed

                            if(caller == 'select') { //show this only if an item field is changed
                              //  showAjaxModal_confirm('Please note that: Once an item is changed, it cannot be picked during the subsequent pickup again!', 'Warning');
                            }

                            if(unit_price != first_unit_price) { //and different prices
                                quantity = qq_picking;
                            }

                        }

                        //update unit price
                        if(unit_price_raw == undefined || unit_price_raw == 0) {
                            //does not exist so alert the user to update this info before proceeding
                            showAjaxModal_confirm('Price of the selected item/good for ' + response.customer_name + ' is invalid! Kindly update the price of this item/good for ' + response.customer_name + ' first!', 'Error');


                            $('#order_unit_price_' + num).val(Number(0)); //set it to 0 since the price is not available
                            //update total price
                            $('#order_total_price_' + num).val(numeric_format(0, 0, '', ''));

                        } else {
                            $('#order_unit_price_' + num).val(unit_price);
                            //update total price

                            if(unit_price == first_unit_price) { //same price, so no need to change total
                                $('#order_total_price_' + num).val(numeric_format((quantity * unit_price), 0, '', ''));

                                //$('#hidden_total').val(<?//=$prev_amount_paid?>);

                            } else {


                                //alert(qq_picked);
                                let initial_amount = first_item_qq_left * first_unit_price; /*on the quantity left for the first item being swapped after picking the new quantity or not*/
                                let initial_amount_picked = first_item_qq_picked * first_unit_price;
                                $('#order_total_price_' + num).val(numeric_format(initial_amount + initial_amount_picked + (qq_picking * unit_price), 0, '', '')); //calculate the actual amount on the quantity picked so far at the old price and adding the amount of the quantity being picked now at the current price.

                                //let grand_total2 = $('#hidden_total').val();
                                //alert($('#total').text());
                               // let balance_due = Number($('#total').text());
                                //$('#hidden_total').val(balance_due);
                            }
                        }




                        //update the total_paid and total amounts
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
    }

    /*//find the total for each row
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
    }*/



    function grand_total() {
        let prev_amount_paid = Number(<?=$prev_amount_paid;?>);
        let total = 0;
        let total_owing = 0;
        let total_quantity = 0;
        let category = 'creditor';
        let discount = Number(<?=$discount;?>);


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

        total = total - discount;

        //reset the amount paid value
        $('#amount_paid').val(0);
        //for amount
        if(category == 'creditor') {
            let owing = Number($('#hidden_payment_balance').val());
            $('#total').html(number_format(total + discount, 2, '.', ','));
            $('#grand_total_price').val(total);
            $('#hidden_total').val(total);

            $('#total_owing').html(number_format(total - prev_amount_paid, 2, '.', ','));
            $('#hidden_payment_balance').val(total - prev_amount_paid);
        }

        if($('#hidden_payment_balance').val() > 0) {
            let owing = Number($('#hidden_payment_balance').val());
            $('#balance_amount').val(number_format(total - prev_amount_paid, 2, '.', ','));
            let amt_paid = Number($('#amount_paid').val());
            let total_amount = Number($('#hidden_total').val());// + owing;
            //$('#hidden_total').val(total_amount);

            if(amt_paid > 0) {
                $('#paid_to').attr('required', 'required');
            } else {
                $('#paid_to').removeAttr('required');
            }

            $('#accounts_holder').slideDown('slow');


        } else {
            let owing = Number($('#hidden_payment_balance').val());
            let total_amount = Number($('#hidden_total').val());
            //$('#hidden_total').val(total_amount - owing);
            $('#amount_paid').val(0);
            $('#balance_amount').val(number_format(total - prev_amount_paid, 2, '.', ','));
            $('#paid_to').val(<?=$account_id?>);

            $('#accounts_holder').slideUp('slow');
            $('#paid_to').removeAttr('required');
        }

        //for quantity
        $('#hidden_total_quantity').val(total_quantity);

    }

    function auto_fill() {
    /* Act on the event */
    //amounts
    if($('#hidden_payment_balance').val() == 0) {
        return false;
    }
    let owing = Number($('#hidden_payment_balance').val());
    let total_amount = Number($('#hidden_total').val());//+ owing;
    //$('#hidden_total').val(total_amount);
    let amount_paid = Number(total_amount);
    let amount_left = total_amount - amount_paid;

    //amounts
    //populate the hidden payment balance field with this
    $('#hidden_payment_made').val(amount_paid);

    //populate the hidden payment balance field with this
    $('#hidden_payment_balance').val(amount_left);
    ///Now let's format the balance field with this
    //$('#amount_pd').html(number_format(owing, 2, '.', ','));
    $('#amount_paid').val(owing);
    $('#balance_amount').val(number_format(amount_left, 2, '.', ','));

}

//update amount left to be paid when user enters the amount paid in all
function payment_update() {
    /* Act on the event */
    //amount balancing
    let prev_amount_paid = Number(<?=$prev_amount_paid;?>);
    let total_amount = $('#hidden_total').val()
    let amount_paid = Number($('#amount_paid').val()) + prev_amount_paid;
    let amount_left = total_amount - amount_paid;
    //$('#amount_pd').html(number_format($('#amount_paid').val(), 2, '.', ','));


    //amount fields
    //populate the hidden payment balance field with this
    $('#hidden_payment_balance').val(amount_left);
    ///Now let's format the balance field with this
    $('#balance_amount').val(number_format(amount_left, 2, '.', ','));

}

    </script>