<?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$order_code_array = array();

// Build optimized query with all data in one go
$this->db->select('so.so_code, so.timestamp, so.status, so.amount_due, so.sales_person_id, so.customer_id, so.negative_or_goods,
    SUM(so.quantity) as total_quantity, SUM(so.amount) as total_amount, 
    SUM(so.quantity_due) as quantity_due, SUM(so.price * so.quantity_due) as quantity_due_amount,
    c.customer_name, a.name as sales_person');
$this->db->from('sales_order so');
$this->db->join('customers c', 'c.customer_id = so.customer_id', 'left');
$this->db->join('admin a', 'a.admin_id = so.sales_person_id', 'left');
if ($customer_id != 0) {
    $this->db->where('so.customer_id', $customer_id);
}
if ($status != 'All') {
    $this->db->where('so.status', $status);
}
$this->db->group_by('so.so_code');
$order_code_query = $this->db->get()->result_array();
?>
    <div class="row">
        <table class="table" width="100%" id="order_list">
            <thead class="bg-info">
              <tr>
                <th>Date|Time</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Status</th>
                <th style="text-align: right">Qty Bought</th>
                <th style="text-align: right">Total Amt</th>
                <th style="text-align: right">Qty Picked</th>
                <th style="text-align: right">Qty Left</th>
                <th style="text-align: right">Due Amt</th>
                <th style="text-align: right">Balance</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
              <?php
$grand_quantity = 0;
$grand_amount = 0;
$order_counter = count($order_code_query);

foreach ($order_code_query as $q):
    $order_code_array[] = $q['so_code'];
    $date = date('d-m-Y H:i:s', $q['timestamp']);
    $qty_picked = $q['total_quantity'] - $q['quantity_due'];
    
    $grand_quantity += $q['total_quantity'];
    $grand_amount += $q['total_amount'];
?>
              <tr ondblclick="deselect_all()" onclick="populate_links('<?=$q['so_code']?>', '<?=$q['negative_or_goods']?>')" id="order_code_<?=$q['so_code']?>">
                <td><?=$date?></td>
                <td><?=$q['so_code']?></td>
                <td><?=$q['customer_name']?></td>
                <td><?=$q['status']?></td>
                <td align="right"><strong><?=number_format($q['total_quantity'], 0, '.', ',')?></strong></td>
                <td align="right"><strong><?=numfmt_format_currency($fmt, $q['total_amount'], $currency)?></strong></td>
                <td align="right"><strong><?=number_format($qty_picked, 0, '.', ',')?></strong></td>
                <td align="right"><strong><?=number_format($q['quantity_due'], 0, '.', ',')?></strong></td>
                <td align="right"><strong><?=numfmt_format_currency($fmt, $q['quantity_due_amount'], $currency)?></strong></td>
                <td align="right"><strong><?=numfmt_format_currency($fmt, $q['amount_due'], $currency)?></strong></td>
                <td><strong><?=$q['sales_person']?></strong></td>
              </tr>
<?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-2 col-sm-2 text-lg-left"><strong><?=number_format($order_counter, 0, '.', ',') . ' ' . ($order_counter > 1 ? 'Orders' : 'Order')?></strong></div>

            <div class="col-md-4 col-sm-4 text-lg-left"><strong>Total Quantity: <?=number_format($grand_quantity, 0, '.', ',');?></strong></div>

            <div class="col-md-6 col-sm-6 text-lg-left"><strong>Total Amount: <?=numfmt_format_currency($fmt, $grand_amount, $currency);?></strong></div>

    </div>


    <script type="text/javascript">
    $(function() {
        $('#order_list').DataTable();
        $('#edit_div').slideUp('fast');

    });

    function populate_links(id, order_type) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all order codes
        let order_code_array = <?php echo json_encode($order_code_array); ?>;

        for(i = 0; i < order_code_array.length; i++) {

            //check which table row is clicked
            if(id == order_code_array[i]) {

                //change the background of the row
                $('#order_code_' + id).removeAttr('class');
                $('#order_code_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#soedit').attr("onclick", "can_edit_order('"+ id +"', '"+ order_type +"')");

                //refund button
                $('#sorefund').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/refund_sales_order/'); ?>" + id + "', 'Refund Sales Order')");


                //preview button
                $('#sopreview').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>" + id + "', 'Preview Sales Order')");

                //delete button

                $('#sodelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/sales_order/delete/'); ?>" + id + "', 'Are you sure you want to delete this Sales Order? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < order_code_array.length; j++) {
                    if(order_code_array[j] != id) {
                        $('#order_code_' + order_code_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        let order_code_array = <?php echo json_encode($order_code_array); ?>;

        for(i = 0; i < order_code_array.length; i++) {
            $('#order_code_' + order_code_array[i]).removeAttr('style');
        }
    }

    //restrict editing of orders which have more than one payment transaction related
    function can_edit_order(so_code, order_type) {
        //send ajax query to check how many payments are related with this order

        $.ajax({
            url: '<?php echo site_url('admin/can_edit_order/') ?>' + so_code + '/sales',
            type: 'POST',
            dataType: 'json',
            cache: false,
        })
        .done(function(response) {
            if(response.response == 'yes') {
                $('.close').click();

                //check if it is payment with goods order or payment for negative balance order or just a normal sales order
                if(order_type == 'negative') {
                    //launch the negative balance order editor
                    showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order_negative_bal/'); ?>' + so_code, 'Edit Payment With Goods (Cash Creditor)');

                } else if(order_type == 'goods') {
                    //check if this is the only copy of so code in the payment with goods table. if so, then the user is only trying to do normal editing, else he is editng payment with gooods order
                    if(response.goods_payment == 'goods_payment') {
                        //launch the payment with goods order editor
                        showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/sales_order/'); ?>' + so_code + '/goods', 'Edit Payment With Goods (Goods Creditor)');

                    } else {
                        //launch the normal order editor
                        showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>' + so_code, 'Edit Sales Order');
                    }


                } else {
                    //launch the normal order editor
                    showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>' + so_code, 'Edit Sales Order');
                }


            } else {
                showAjaxModal_confirm('You are not allowed to edit this Sales Order [' + so_code + '] because it is associated with more than one payment transaction. Delete any related payment and try again.', 'error');
            }
        });

    }
    </script>