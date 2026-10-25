<?php

$date = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->date_timestamp;
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
                    <input type="text" required="true" class="form-control" name="order_no" id="order_no" value="<?php echo $so_code; ?>" readonly="readonly">
                    </div>
                    <div style="position: absolute;" id="so_code_err_message"></div>
                </div>

                <input type="hidden" name="so_update" value="yes">

                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">INVOICE CODE:</div>
                        </div>
                        <input type="text" class="form-control" name="invoice_code" id="invoice_code" value="<?=$this->db->get_where('invoice', array('so_code' => $so_code))->row()->invoice_code;?>" readonly="readonly">
                    </div>

                </div>
            </div>
<?php
//select order details
$this_order_array = $this->db->get_where('sales_order', array('so_code' => $so_code))->result_array();

?>
    
            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="s_order_create_table">
                    <thead>
                      <tr>
                        <th>Qty</th>
                        <!--<th>Qty Picked</th>-->
                        <th>Item</th>
                        <th>Description</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                        <?php
$table_row_counter = 1;
foreach ($this_order_array as $order):
?>
                        <tr id="tr_<?=$table_row_counter;?>">
                            <td width="90">
                                <input type="number" min="1" required="true" onkeyup="row_total($('#order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity" id="order_quantity_<?=$order['html_id'];?>" name="order_quantity_<?=$order['html_id'];?>" value="<?=$order['quantity'];?>">
                            </td>


                            <!--
                            <td width="90">
                                <input type="number" min="0" required="true" onkeyup="quantity_left($('#order_picked_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control" id="order_picked_<?=$order['html_id'];?>" name="order_picked_<?=$order['html_id'];?>" value="<?=$order['quantity_picked'];?>">
                             </td>-->

                                <input type="hidden" min="0" required="true" onkeyup="quantity_left($('#order_picked_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control" id="order_picked_<?=$order['html_id'];?>" name="order_picked_<?=$order['html_id'];?>" value="<?=$order['quantity_picked'];?>">

                                <input type="hidden" name="hidden_quantity_balance_per_<?=$order['html_id'];?>" id="hidden_quantity_balance_per_<?=$order['html_id'];?>" value="<?=$order['quantity_due'];?>">
                           

                            <td>
                                <?php
$all_items_array = $this->db->get_where('items')->result_array();
?>
                                <select required="true" class="form-control" onchange="change_fields($('#order_item_<?=$order['html_id'];?>').val(), $('#order_item_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="order_item_<?=$order['html_id'];?>" id="order_item_<?=$order['html_id'];?>">
                                    <option value="">Choose Item</option>
                                    <?php foreach ($all_items_array as $item): ?>
                                        <option value="<?=$item['item_id'];?>" <?php if ($item['item_id'] === $order['item_id']) {
    echo 'selected';
}
?>><?=$item['item_name'];?></option>
                                    <?php endforeach;?>
                                </select>
                            </td>

                            <td id="description_td_<?=$order['html_id'];?>"><?=$this->db->get_where('items', array('item_id' => $order['item_id']))->row()->description;?>
                            </td>

                            <td width="120" align="right">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="currency" required="true" class="form-control" id="order_unit_price_<?=$order['html_id'];?>" onkeyup="row_total($('#order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="order_unit_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['price'];?>">
                                </div>
                            </td>

                            <td width="140">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="currency" class="form-control sum_total_amount" name="order_total_price_<?=$order['html_id'];?>" id="order_total_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['amount'];?>" readonly="readonly">
                                </div>
                            </td>

                            <td width="60">
                                <a href="javascript:;" disabled="disabled" onclick="remove_row('<?=$table_row_counter;?>')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td>
                            </tr>

                        <?php
$table_row_counter++;
endforeach;?>
                    </tbody>

                </table>
            </div>

            <hr>
            <div class="row">
                <div class="col-md-8 col-sm-8 col-lg-8"></div>
                <div class="col-md-4 col-sm-4 col-lg-4" style="text-align: right">
                    <a href="javascript:;" onclick="add_new_row()" class="btn btn-success btn-sm" style="text-align: right">Add Item</a>
                </div>
            </div>
            <hr>

            <div class="form-group row">
                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('comments'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="comments" class="form-control" cols="50" placeholder="Comments" ><?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->comment;?></textarea>
                    </div>
                </div>

                <div class="col-md-3 col-sm-3">
                    <label  class="control-label"><?php echo get_phrase('private_comments:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="private_comments" class="form-control" cols="50" placeholder="Private Comments"><?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->private_comment;?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th>Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="subtotal"><?=number_format($this->db->get_where('sales_order', array('so_code' => $so_code))->row()->grand_total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <tr>
                                    <th>Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="total"><?=number_format($this->db->get_where('sales_order', array('so_code' => $so_code))->row()->grand_total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total" id="hidden_total" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->grand_total;?>">
                                <input type="hidden" name="hidden_payment_balance" id="hidden_payment_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->amount_due;?>">

                                <!--select total quantity here-->
                                <?php
$quantity_array = $this->db
    ->select_sum('total_quantity')
    ->from('sales_order')
    ->where('so_code', $so_code)
    ->get()->result_array();
$grand_quantity = 0;
foreach ($quantity_array as $qt) {
    $grand_quantity += $qt['total_quantity'];
}
?>
                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="<?=$grand_quantity;?>">
                                <input type="hidden" name="hidden_quantity_balance" id="hidden_quantity_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->quantity_due;?>">

                            </thead>
                        </table>

                        <hr><hr>
                        <?php

$accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();
$account_id = $this->db->get_where('payment', array('so_code' => $so_code))->row()->account_id;
if($account_id == '') {
    $account_id = $this->db->get_where('invoice', array('so_code' => $so_code))->row()->account_id;
}
?>
                        <div class="form-group row">
                            <div class="col-sm-12 col-md-12">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text bg-danger text-light">Account Paid To:</div>
                                    </div>
                                    <select name="paid_to" id="paid_to" class="form-control" value="">
                                        <option value="">Select Account</option>
                                        <?php foreach ($accounts as $acc): ?>
                                            <option value="<?=$acc['account_id']?>" <?php if ($acc['account_id'] === $account_id) {
    echo 'selected';
}
?>><?=$acc['name']?></option>
                                        <?php endforeach;?>
                                    </select>
                                </div>
                            </div>
                        </div><!-- end of accounts-->

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
        let table_row_counter = <?php echo $table_row_counter; ?>;

        //enable the last button
        $('#tr_' + (Number(table_row_counter) - 1) + ' td a').removeAttr('disabled');
    });

    

    //add row to table at a button click
    function add_new_row() {
        let tbody = $('#s_order_create_table tbody').find('tr').length + 1;

        $.ajax({
            url: '<?php echo site_url('admin/add_creditor_order_row/so/opening/') ?>',
            type: 'POST',
            dataType: 'html',
            cache: false
        })
        .done(function(data) {

            let tr = '<tr id="tr_'+ tbody +'">'+data+'<td width="60"><a href="javascript:;" onclick="remove_row('+tbody+')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td></tr>';

            //add row now
            $('#s_order_create_table tbody').append(tr);

            //disable the previous button
            $('#tr_' + (Number(tbody) - 1) + ' td a').attr('disabled', 'disabled');
         });
    }


   function change_fields(item_id, num) {
        /* Act on the event */
        if(item_id != '') {

            let quantity = Number($('#order_quantity_' + num).val());
            $.ajax({
                url: '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/' + 'purchase',
                type: 'POST',
                dataType: 'json',
            })
            .done(function(response) {
                $('#description_td_' + num).html(response.description);
                $('#order_unit_price_' + num).val(response.unit_price);

                let unit_price = Number(response.unit_price);
                $('#order_total_price_' + num).val(numeric_format((quantity * unit_price),0,'',''));
                //update the subtotal and total amounts
                grand_total();

            });
        }
}

//find the total for each row
function row_total(num) {

        let quantity = Number($('#order_quantity_' + num).val());
        let unit_price = Number($('#order_unit_price_' + num).val());


        let total_price = quantity * unit_price;
        $('#order_total_price_' + num).val(numeric_format(total_price,0,'',''));
       // $('#order_picked_' + num).val(quantity);
        $('#hidden_quantity_balance_per_' + num).val(quantity);
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

    //for amount
    $('#total').html(number_format(total, 2, '.', ','));
    $('#subtotal').html(number_format(total, 2, '.', ','));
    $('#balance_amount').val(number_format(total, 2, '.', ','));
    $('#hidden_total').val(total);

    //for quantity
    $('#hidden_total_quantity').val(total_quantity);

    payment_update();
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
    $('#amount_paid').val('0.00');
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