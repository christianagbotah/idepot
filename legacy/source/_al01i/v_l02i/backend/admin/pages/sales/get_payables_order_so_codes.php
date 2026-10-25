<div class="input-group">
    <div class="input-group-prepend">
        <div class="input-group-text bg-success text-light">SO No:</div>
    </div>
    <select required="true" class="form-control" name="order_no" onchange="get_order()" id="order_no">
                                    <?php
$this->db->select('so_code');
$this->db->distinct();
if ($param3 == 'goods') {
	$order_array = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'so_code' => $param2))->result_array();

} else {
	$order_array = $this->db->get_where('sales_order', array('customer_id' => $customer_id, 'quantity_due >' => 0))->result_array();
}
foreach ($order_array as $code):

?>
                                        <option value="<?=$code['so_code'];?>" <?php

if ($selected_so_code != '' && $selected_so_code == $code['so_code']) {

	echo 'selected';
}
?> ?><?=$code['so_code']?></option>
                                        <?php
endforeach;
?>


    </select>
</div>