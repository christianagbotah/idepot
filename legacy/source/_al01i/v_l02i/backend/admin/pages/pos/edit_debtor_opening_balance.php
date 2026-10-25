<?php

$debtor_date = $this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->row()->date_timestamp;
?>

<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('opening_order_balances'); ?>
              </div>
          </div>

          <div class="panel-body" style="padding: 10px">
            <div class="form-group row">
                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">SO CODE:</div>
                        </div>
                    <input type="text" required="true" class="form-control" name="debtor_order_no" id="debtor_order_no" value="<?php echo $debtor_so_code; ?>" readonly="readonly">
                    </div>
                    <div style="position: absolute;" id="debtor_so_code_err_message"></div>
                </div>

                <input type="hidden" name="debtor_so_update" value="yes">

                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">INVOICE CODE:</div>
                        </div>
                        <input type="text" class="form-control" name="debtor_invoice_code" id="debtor_invoice_code" value="<?=$this->db->get_where('invoice', array('so_code' => $debtor_so_code))->row()->invoice_code;?>" readonly="readonly">
                    </div>

                </div>
            </div>
<?php
//select order details
$debtor_this_order_array = $this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->result_array();

?>
    
            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="debtor_s_order_create_table">
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                        <?php
$debtor_table_row_counter = 1;
foreach ($debtor_this_order_array as $order):
?>
                        <tr id="debtor_tr_<?=$debtor_table_row_counter;?>">
                            <td width="90">
                                <input type="number" min="1" required="true" onkeyup="debtor_row_total($('#debtor_order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="debtor_row_total($('#debtor_order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control debtor_sum_total_quantity" id="debtor_order_quantity_<?=$order['html_id'];?>" name="debtor_order_quantity_<?=$order['html_id'];?>" value="<?=$order['quantity'];?>">
                            </td>

                            <td>
                                <?php
$debtor_all_items_array = $this->db->get_where('items')->result_array();
?>
                                <select required="true" class="form-control" onchange="debtor_change_fields($('#debtor_order_item_<?=$order['html_id'];?>').val(), $('#debtor_order_item_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="debtor_order_item_<?=$order['html_id'];?>" id="debtor_order_item_<?=$order['html_id'];?>">
                                    <option value="">Choose Item</option>
                                    <?php foreach ($debtor_all_items_array as $item): ?>
                                        <option value="<?=$item['item_id'];?>" <?php if ($item['item_id'] === $order['item_id']) {
    echo 'selected';
}
?>><?=$item['item_name'];?></option>
                                    <?php endforeach;?>
                                </select>
                            </td>

                            <td id="debtor_description_td_<?=$order['html_id'];?>"><?=$this->db->get_where('items', array('item_id' => $order['item_id']))->row()->description;?>
                            </td>

                            <td width="120" align="right">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="currency" required="true" class="form-control" id="debtor_order_unit_price_<?=$order['html_id'];?>" onkeyup="debtor_row_total($('#debtor_order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="debtor_row_total($('#debtor_order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="debtor_order_unit_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['price'];?>">
                                </div>
                            </td>

                            <td width="140">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="currency" class="form-control debtor_sum_total_amount" name="debtor_order_total_price_<?=$order['html_id'];?>" id="debtor_order_total_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['amount'];?>" readonly="readonly">
                                </div>
                            </td>

                            <td width="60">
                                <a href="javascript:;" disabled="disabled" onclick="debtor_remove_row('<?=$debtor_table_row_counter;?>')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td>
                            </tr>

                        <?php
$debtor_table_row_counter++;
endforeach;?>
                    </tbody>

                </table>
            </div>

            <hr>
            <div class="row">
                <div class="col-md-8 col-sm-8 col-lg-8"></div>
                <div class="col-md-4 col-sm-4 col-lg-4" style="text-align: right">
                    <a href="javascript:;" onclick="debtor_add_new_row()" class="btn btn-success btn-sm" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr>

            <div class="form-group row">
                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('comments'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="debtor_comments" class="form-control" cols="50" placeholder="Comments" ><?=$this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->row()->comment;?></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="debtor_private_comments" class="form-control" cols="50" placeholder="Private Comments"><?=$this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->row()->private_comment;?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="debtor_subtotal"><?=number_format($this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->row()->grand_total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="debtor_total"><?=number_format($this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->row()->grand_total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <input type="hidden" name="debtor_hidden_total" id="debtor_hidden_total" value="<?=$this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->row()->grand_total;?>">
                                <input type="hidden" name="debtor_hidden_payment_balance" id="debtor_hidden_payment_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->row()->amount_due;?>">

                                <!--select total quantity here-->
                                <?php
$debtor_quantity_array = $this->db
    ->select_sum('total_quantity')
    ->from('sales_order')
    ->where('so_code', $debtor_so_code)
    ->get()->result_array();
$debtor_grand_quantity = 0;
foreach ($debtor_quantity_array as $qt) {
    $debtor_grand_quantity += $qt['total_quantity'];
}
?>
                                <input type="hidden" name="debtor_hidden_total_quantity" id="debtor_hidden_total_quantity" value="<?=$debtor_grand_quantity;?>">
                                <input type="hidden" name="debtor_hidden_quantity_balance" id="debtor_hidden_quantity_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $debtor_so_code))->row()->quantity_due;?>">

                            </thead>
                        </table>

                        <hr><hr>
                    </div>
                </div>
            </div>
          </div>

          </div>
        </div>
    </div>
</div>

<script type="text/javascript">
    $(function() {
        let debtor_table_row_counter = <?php echo $debtor_table_row_counter; ?>;

        //enable the last button
        $('#debtor_tr_' + (Number(debtor_table_row_counter) - 1) + ' td a').removeAttr('disabled');
    });

    

    //add row to table at a button click
    function debtor_add_new_row() {
        let tbody = $('#debtor_s_order_create_table tbody').find('tr').length + 1;

        $.ajax({
            url: '<?php echo site_url('admin/debtor_add_order_row/so/opening/') ?>',
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="debtor_tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="debtor_remove_row('+tbody+')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#debtor_s_order_create_table tbody').append(tr);

            //disable the previous button
            $('#debtor_tr_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');
         });
    }


   function debtor_change_fields(item_id, num) {
        /* Act on the event */
        if(item_id != '') {

            let quantity = Number($('#debtor_order_quantity_' + num).val());
            $.ajax({
                url: '<?php echo site_url('admin/debtor_order_item_selected/') ?>' + item_id + '/' + 'purchase',
                type: 'POST',
                dataType: 'json',
            })
            .done(function(response) {
                $('#debtor_description_td_' + num).html(response.description);
                $('#debtor_order_unit_price_' + num).val(response.unit_price);

                let unit_price = Number(response.unit_price);
                $('#debtor_order_total_price_' + num).val(numeric_format((quantity * unit_price),0,'',''));
                //update the subtotal and total amounts
                grand_total();

            });
        }
}

//find the total for each row
function debtor_row_total(num) {

        let quantity = Number($('#debtor_order_quantity_' + num).val());
        let unit_price = Number($('#debtor_order_unit_price_' + num).val());


        let total_price = quantity * unit_price;
        $('#debtor_order_total_price_' + num).val(numeric_format(total_price,0,'',''));
       // $('#order_picked_' + num).val(quantity);
        $('#debtor_hidden_quantity_balance_per_' + num).val(quantity);
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
    $('#debtor_total').html(number_format(total, 2, '.', ','));
    $('#debtor_subtotal').html(number_format(total, 2, '.', ','));
    $('#debtor_balance_amount').val(number_format(total, 2, '.', ','));
    $('#debtor_hidden_total').val(total);

    //for quantity
    $('#hidden_total_quantity').val(total_quantity);

    debtor_payment_update();
}


 //reemove row
function debtor_remove_row(id) {
    //amounts
    let row_total_cost = Number($('#debtor_tr_' + id + ' td .debtor_sum_total_amount').val());
    let grand_total = Number($('#debtor_hidden_total').val());
    let balance = grand_total - row_total_cost;

    //quantities
    let row_total_quantity = Number($('#debtor_tr_' + id + ' td .debtor_sum_total_quantity').val());
    let grand_total_quantity = Number($('#debtor_hidden_total_quantity').val());
    let balance_quantity = grand_total_quantity - row_total_quantity;


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