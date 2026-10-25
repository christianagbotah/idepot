<?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$transfer_array = array();

$search_by_receivers = str_replace('-', ' ', $search_by_receivers);
$search_by_receivers = str_replace('_', '/', $search_by_receivers);
$search_by_receivers = str_replace('00', '&', $search_by_receivers);

if ($search_by_receivers != '0') {
	$this->db->where('receiver', $search_by_receivers);
}

if ($from != 0 && $to != 0) {
	$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
}

$this->db->select('token_no, timestamp');
$this->db->distinct();
$this->db->order_by('timestamp', 'asc');
$this->db->from('items_transfers');
$transfer_query = $this->db->get()->result_array();
?>
    <div class="row">
        <table class="table" width="100%" id="order_list_t">
            <thead class="bg-info">
              <tr>
                <th>Date</th>

                <th>Receiver</th>
                <th>Token Number</th>
                <th>Item(s)</th>
                <th style="text-align: right">Q'ty</th>
                <th style="text-align: right">Price</th>
                <th style="text-align: right">Value</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
              <?php
$total_quantity = 0;
$transfer_counter = 0;
$grand_value = 0;
foreach ($transfer_query as $q):
	array_push($transfer_array, $q['token_no']);

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$this->db->select_sum('quantity');
	$this->db->where('token_no', $q['token_no']);
	$total_quantity = $this->db->get('items_transfers')->row()->quantity;

	//find other data
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$date = date('d-m-Y H:i:s', $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->timestamp);

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$receiver = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->receiver;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$item_id = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->item_id;

	$item_name = $this->db->get_where('items', array('item_id' => $item_id))->row()->item_name;

	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$sales_person_id = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->sales_person_id;
	$sales_person = $this->db->get_where('admin', array('admin_id' => $sales_person_id))->row()->name;

    if ($from != 0 && $to != 0) {
        $this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
    }
    $this->db->where('item_id', $item_id);
    $this->db->order_by('stock_id', 'DESC');
    $this->db->limit(1);
    $sellingPrice = $this->db->get('stock_manager')->row()->selling_price;

	?>
  <tr ondblclick="deselect_all()" onclick="populate_links('<?=$q['token_no']?>')" id="token_no<?=$q['token_no'];?>">
    <td style="vertical-align: middle"><?=$date;?></td>
    <td style="vertical-align: middle"><?=$receiver;?></td>
    <td style="vertical-align: middle"><?=$q['token_no'];?></td>

    <td style="vertical-align: middle">
        <table>
            <tbody>
                <?php
	$items_q = $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->result_array();

	foreach ($items_q as $it):
		$it_name = $this->db->get_where('items', array('item_id' => $it['item_id']))->row()->item_name;

		?>
		<tr>
        <td><?=$it_name;?></td>
        <td align="right"><strong><?=number_format($it['quantity'], 0, '.', ',');?></strong></td>
        </tr>
        <?php
    endforeach;
    	?>
              </tbody>
        </table>
    </td>

    <td align="right" style="vertical-align: middle"><strong><?=number_format($total_quantity, 0, '.', ',');?></strong></td>
    <td align="right" style="vertical-align: middle"><strong><?=number_format($sellingPrice, 2, '.', ',');?></strong></td>
    <td align="right" style="vertical-align: middle"><strong><?=number_format(($total_quantity * $sellingPrice), 2, '.', ',');?></strong></td>
    <td style="vertical-align: middle"><strong><?=$sales_person;?></strong></td>
    </tr>

    <?php   
	//find grand total and amount
	if ($from != 0 && $to != 0) {
		$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
	}
	$grand_quantity += $this->db->get_where('items_transfers', array('token_no' => $q['token_no']))->row()->total_quantity;

	$transfer_counter++;
    $grand_value += ($total_quantity * $sellingPrice);

endforeach;
?>
            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-4 col-sm-4 text-lg-left"><strong><?php echo number_format($transfer_counter, 0, '.', ',') . ' ';
echo ' ' . $transfer_counter > 1 ? 'Transfers' : 'Transfer'; ?></strong></div>

            <div class="col-md-4 col-sm-4 text-lg-left"><strong>Total Quantity: <?=number_format($grand_quantity, 0, '.', ',');?></strong></div>
            <div class="col-md-4 col-sm-4 text-lg-left"><strong>Total Value: <?=number_format($grand_value, 0, '.', ',');?></strong></div>

    </div>


    <script type="text/javascript">
    $(function() {
        $('#order_list_t').DataTable(
            {
                processing: true,
            });
        //$('#edit_div').slideUp('fast');

    });


     //let's disable all the buttons until a supplier is selected
    function buttons_disabled() {
        $('#soedit').attr('disabled', 'disabled');
        $('#sopreview').attr('disabled', 'disabled');
        $('#sodelete').attr('disabled', 'disabled');
        $('#soemail').attr('disabled', 'disabled');
        $('#sorefund').attr('disabled', 'disabled');
    }

    //let's enable all the buttons when a supplier is selected
    function buttons_enabled() {
        $('#soedit').removeAttr('disabled');
        $('#sopreview').removeAttr('disabled');
        $('#sodelete').removeAttr('disabled');
        $('#soemail').removeAttr('disabled');
        $('#sorefund').removeAttr('disabled');
    }

    function populate_links(id) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all order codes
        let transfer_array = <?php echo json_encode($transfer_array); ?>;

        for(i = 0; i < transfer_array.length; i++) {

            //check which table row is clicked
            if(id == transfer_array[i]) {

                //change the background of the row
                $('#token_no' + id).removeAttr('class');
                $('#token_no' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#soedit').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_item_transfer/edit_item_transfer/'); ?>" + id + "', 'Edit Transfer')");

                //delete button
                $('#sodelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/items_transfer/delete/'); ?>" + id + "', 'Are you sure you want to delete this Transfer? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < transfer_array.length; j++) {
                    if(transfer_array[j] != id) {
                        $('#token_no' + transfer_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        let transfer_array = <?php echo json_encode($transfer_array); ?>;

        for(i = 0; i < transfer_array.length; i++) {
            $('#token_no' + transfer_array[i]).removeAttr('style');
        }
    }

    </script>