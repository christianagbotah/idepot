<?php
    //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

        $order_code_array = array();

        if($supplier_id != 0) {
            $this->db->where('supplier_id', $supplier_id);
        }

        if($item_id != 'All') {
            $this->db->where('item_id', $item_id);
        }

        if($from != 0 && $to != 0) {
            $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
        }

        $this->db->select('po_code');
        $this->db->from('purchase_order');
        $this->db->distinct();
        $order_code_q = $this->db->get();//
        $order_code_query = $order_code_q->result_array();  
     ?>
    <div class="row">
        <table class="table" width="100%" id="order_list">
            <thead class="bg-info">
              <tr>
                <th>Date</th>
                <th>Order</th>
                <th>Supplier</th>
                <th style="text-align: right">Quantity</th>
                <th style="text-align: right">Amount</th>
                <th style="text-align: right">Amount Due</th>
              </tr>
            </thead>
            <tbody>
                <?php 
                    $total_quantity = 0;
                    $total_amount = 0;
                    $grand_quantity = 0;
                    $grand_amount = 0;
                    $order_counter = 0;

                    foreach($order_code_query as $q):
                        array_push($order_code_array, $q['po_code']);
                        
                        //$this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');

                        $orders = $this->db->get_where('purchase_order', array('po_code' => $q['po_code']));
                        $orders_array = $orders->result_array();

                        $amount_due = $orders->row()->amount_due;

                        //find total amount and quantity
                        foreach($orders_array as $order) {
                            $total_quantity += $order['quantity'];
                            $total_amount += $order['amount'];
                        }

                        //find other data
                        $date = date('d-m-Y H:i:s', $this->db->get_where('purchase_order', array('po_code' => $q['po_code']))->row()->timestamp);
                        $supplier_id = $this->db->get_where('purchase_order', array('po_code' => $q['po_code']))->row()->supplier_id;
                        $item_id = $this->db->get_where('purchase_order', array('po_code' => $q['po_code']))->row()->item_id;
                ?>
              <tr ondblclick="deselect_all()" onclick="populate_links('<?= $q['po_code']?>')" id="order_code_<?= $q['po_code']; ?>">
                <td><?= $date; ?></td>
                <td><?= $q['po_code']; ?></td>
                <td><?= $this->db->get_where('suppliers', array('supplier_id' => $supplier_id))->row()->supplier_name; ?></td>
                <td align="right"><strong><?= number_format($total_quantity, 0, '.', ','); ?></strong></td>
                <td align="right"><strong><?= numfmt_format_currency($fmt, $total_amount, $currency); ?></strong></td>
                <td align="right"><strong><?= numfmt_format_currency($fmt, $amount_due, $currency); ?></strong></td>
              </tr>

              <?php 
                //find grand total and amount
                $grand_quantity += $total_quantity;
                $grand_amount += $total_amount;

                //reset total quantity and amount to 0
                $total_quantity = 0;
                $total_amount = 0;


                //count order
                $order_counter++;
                endforeach;
              ?>
            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-2 col-sm-2 text-lg-left"><strong><?php echo number_format($order_counter, 0, '.', ',').' '; echo ' '.  $order_counter > 1?'Orders': 'Order'; ?></strong></div>

            <div class="col-md-2 col-sm-2 text-lg-left"><strong>Total Quantity: <?=number_format($grand_quantity, 0, '.', ',');?></strong></div>

            <div class="col-md-2 col-sm-2 text-lg-left"><strong>Total Amount: <?= numfmt_format_currency($fmt, $grand_amount, $currency); ?></strong></div>

    </div>

    <script type="text/javascript">
    $(function() {
        $('#order_list').DataTable();

    });

    function populate_links(id) {
        //call the buttons enabled function immediately
        $.ajax({
            url: '<?php echo site_url('admin/isOpeningPo/') ?>' + id,
            type: 'POST',
            dataType: 'json',
            cache: false
        })
        .done(function(data) {
            if(data.canEdit == 1 && data.isOpening == 0) {
                buttons_enabled();
            } else {
                buttons_disabled();
            }
        });
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
                $('#poedit').attr("onclick", "can_edit_order('"+ id +"')");

                //delete button
                
                $('#podelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/purchase_order/delete/');?>" + id + "', 'Are you sure you want to delete this Purchase Order [" + id + "]? All related records will be deleted permanently.')");

                //preview button
                $('#popreview').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/preview_order/'); ?>" + id + "', 'Preview Purchases Order')");

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
    function can_edit_order(po_code) {
        //send ajax query to check how many payments are related with this order

        $.ajax({
            url: '<?php echo site_url('admin/can_edit_order/') ?>' + po_code + '/purchases',
            type: 'POST',
            dataType: 'json',
            cache: false,
        })
        .done(function(response) {
            if(response.response == 'yes') {
                $('.close').click();
                showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/edit_purchase_order/');?>' + po_code , 'Edit Purchase Order');
                
            } else {
                showAjaxModal_confirm('You are not allowed to edit this Purchase Order [' + po_code + '] because it is asscociated with more than one payment transaction. Delete any related payment and try again.', 'error');
            }
        });
        
    }
    </script>