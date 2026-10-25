<?php

echo '<script src="'. base_url(). 'assets/js/neon-custom-ajax.js"></script>
    <script type="text/javascript">

      $(function() {
        $(".select2").select2({
          theme: "classic"
          });
        
      })
      
    </script>';

$so_code = $param2;

//database query
$customer_id = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->customer_id;
$date = $this->db->get_where('sales_order', array('so_code' => $so_code))->row()->date_timestamp;

//select all the account payment methods used
$this->db->select('account_id');
$this->db->distinct();
$this->db->from('payment');
$this->db->where('timestamp', $date);
$this->db->where('so_code', $so_code);
$payment_ids_array = $this->db->get()->result_array();

$payment_ids = array_column($payment_ids_array, 'account_id');

?>

<style type="text/css">
  input[name="amount_paid"] {
    font-size: 25px !important;
    font-weight: bolder !important;
  }

  input[name="account_balance"], #balance_amount {
    font-size: 20px !important;
    font-weight: bolder !important;
  }
</style>

<div class="row">
  <div class="col-md-12 col-sm-12 col-xs-12">
      <div class="panel panel-primary">

          <div class="panel-heading">
              <div class="panel-title" style="color: #fff; padding: 5px;">
                  <?php echo get_phrase('edit_sales_order'); ?>
              </div>
          </div>

          <div class="panel-body" style="padding: 10px">
            <?php
echo form_open(site_url('admin/sales_order_pos/update'),
	array('class' => 'form-groups-bordered', 'id' => 'sales_order_form', 'target' => '_top')); ?>
            <div class="form-group row">
                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-success text-light">SO No:</div>
                        </div>
                    <input type="text" required="true" onkeyup="verify_so_no()" class="form-control" name="order_no" id="order_no" value="<?php echo $so_code; ?>" readonly="readonly">
                    </div>
                    <div style="position: absolute;" id="so_code_err_message"></div>
                </div>

                <input type="hidden" name="so_update" value="yes">

                <?php
                    $customers_add = $this->db->get('customers');
                    $customers_array_add = $customers_add->result_array();

                    ?>
                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">To:</div>
                        </div>
                        <select required="true" class="form-control select2" onchange="populate_edit_button($('#order_to').val())" name="order_to" id="order_to">

                            <?php
                                foreach($customers_array_add as $c):?>

                                    <option value="<?=$c['customer_id'];?>" <?=$c['customer_id'] == $customer_id ? 'selected' : '';?>><?=$this->db->get_where('customers', array('customer_id' => $c['customer_id']))->row()->customer_name; ?></option>
                            
                             <?php

                                endforeach;
                            ?>
                            
                        </select>
                    </div>
                </div>

                <!-- <div class="col-sm-2 col-md-2"><a href="javascript:;" class="btn btn-info btn-sm" title="Add New" onclick="showAjaxModal_data_create('<?php //echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add new customer')"><i class="fa fa-fw fa-plus"></i></a>

                <a href="javascript:;" class="btn btn-success btn-sm" id="edit_button" title="Edit"><i class="fa fa-fw fa-edit" onclick="showAjaxModal_data_create('<?php// echo site_url('modal/popup_sales/edit_customer/'.$customer_id); ?>', 'Edit new customer')"></i></a></div> -->

                <div class="col-sm-4 col-md-4">
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-dark text-light">Order Date:</div>
                        </div>
                        <input type="text" required="true" class="form-control datepicker" name="order_date" id="order_date" data-format="dd-mm-yyyy"
                            value="<?php echo date('d-m-Y', $date); ?>" readonly="readonly">

                        <input type="hidden" class="form-control datepicker" name="order_date2"
                            value="<?php echo date('d-m-Y H:i:s'); ?>">
                    </div>
                </div>
            </div>

            <div class="form-group row">
                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('bill_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="bill_to" id="bill_to" class="form-control" cols="50"><?php echo $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->address; ?></textarea>
                    </div>
                </div>

                <div class="col-md-6 col-sm-6">
                    <label  class="control-label"><?php echo get_phrase('ship_to:'); ?></label>
                    <div class="col-sm-12 col-md-12">
                        <textarea  name="ship_to" id="ship_to" class="form-control" cols="50" readonly="readonly"><?php echo $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->address; ?></textarea>
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
                        <th>Qty Picked</th>
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



                            <td width="90">
                                <input type="number" min="0" required="true" onkeyup="quantity_left($('#order_picked_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control" id="order_picked_<?=$order['html_id'];?>" name="order_picked_<?=$order['html_id'];?>" value="<?=$order['quantity_picked'];?>">

                                <input type="hidden" name="hidden_quantity_balance_per_<?=$order['html_id'];?>" id="hidden_quantity_balance_per_<?=$order['html_id'];?>" value="<?=$order['quantity_due'];?>">
                            </td>

                            <td>
                                <?php
$all_items_array = $this->db->get_where('items')->result_array();
?>
                                <select required="true" class="form-control select2" onchange="change_fields($('#order_item_<?=$order['html_id'];?>').val(), $('#order_item_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="order_item_<?=$order['html_id'];?>" id="order_item_<?=$order['html_id'];?>">
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
                                    <input type="text" required="true" class="form-control" id="order_unit_price_<?=$order['html_id'];?>" onkeyup="row_total($('#order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_unit_price_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" name="order_unit_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['price'];?>" readonly="readonly">
                                </div>
                            </td>

                            <td width="140">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="text" class="form-control sum_total_amount" name="order_total_price_<?=$order['html_id'];?>" id="order_total_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['amount'];?>" readonly="readonly">
                                </div>
                            </td>

                            <td width="60">
                                <a href="javascript:;" onclick="remove_row('<?=$table_row_counter;?>')" class="btn btn-danger btn-sm"><i class="fa fa-fw fa-trash"></i></a></td>
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
                    <a href="javascript:;" onclick="add_new_row()" id="add_btn" class="btn btn-success btn-sm" style="text-align: right">Add Item</a>
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

                <?php
                    $totalQuery = $this->db->get_where('sales_order', array('so_code' => $so_code))->row();

                    $total = $totalQuery->grand_total;
                    $discount = $totalQuery->discount;
                    $subTotal = $total  + $discount;


                ?>

                <div class="col-md-6 col-sm-6">
                    <div class="col-sm-12 col-md-12">
                        <table width="100%">
                            <thead>
                                <tr>
                                    <th class="text-muted">Subtotal:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="subtotal"><?=number_format($subTotal, 2, '.', ',')?></span></strong></th>
                                </tr>

                                <tr>
                                    <th class="text-muted">Discount:</th>
                                    <th class="text-muted  row">
                                      <div class="mr-2">
                                        <strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span></strong> 
                                      </div>
                                      <div>
                                        <input type="currency" onkeyup="grand_total()" onchange="grand_total()" min="0" name="discount" size="5" id="discount" class="form-control" required="required" placeholder="0.00" value="<?=number_format($discount, 2, '.', ',')?>" style="height: 25px !important;">
                                      </div>
                                    </th>
                                </tr>

                                <tr>
                                    <th class="text-muted">Total:</th>
                                    <th><strong><span><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></span> <span id="total"><?=number_format($total, 2, '.', ',')?></span></strong></th>
                                </tr>
                                <input type="hidden" name="hidden_total" id="hidden_total" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->grand_total;?>">
                                <input type="hidden" name="hidden_payment_balance" id="hidden_payment_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->amount_due;?>">

                                <!--select total quantity here-->
                                <?php
                                    $grand_quantity = $this->db
                                        ->from('sales_order')
                                        ->where('so_code', $so_code)
                                        ->get()->row()->total_quantity;

                                    ?>
                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="<?=$grand_quantity;?>">
                                <input type="hidden" name="hidden_quantity_balance" id="hidden_quantity_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->quantity_due;?>">

                            </thead>
                        </table>
                </div>
            </div><br>

            <div class="grid grid-cols-3 gap-7 p-8 mt-6">
                <div class="">
                    <div class="form-group row" style="display: none" id="error_holder">
                        <div class="col-sm-12 col-md-12">
                            <div id="inv_code_err_message"></div>
                        </div>
                    </div>
                    <div class="form-group row">
                        <div class="col-sm-12 col-md-12">
                            <div class="input-group">
                                <div class="input-group-prepend">
                                    <div class="input-group-text bg-info text-light">Invoice Code</div>
                                </div>
                                <input type="text" class="form-control w-28" name="invoice_code" id="invoice_code" value="<?=$this->db->get_where('invoice', array('so_code' => $so_code))->row()->invoice_code;?>" readonly="readonly">
                            </div>

                        </div>
                    </div>
                </div>
                   

                

                <!-- <div class="form-group row">
                    <div class="col-sm-8 col-md-8">
                        <div class="input-group">
                            <div class="input-group-prepend">
                                <div class="input-group-text bg-danger text-light">Balance: <?php //echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?></div>
                            </div>
                            <input type="text" name="account_balance" id="account_balance_so_edit" class="form-control form-control-plaintext" value="<?php //echo number_format($this->db->get_where('accounts', array('account_id' => $account_id))->row()->current_balance, 2, '.', ','); ?>" readonly="readonly">
                        </div>
                    </div>
                         <div class="col-sm-4 col-md-4 text-sm-right">
                            <a href="javascript:;" class="btn btn-outline-success btn-sm" onclick="auto_fill()">Autofill</a>
                        </div>
                    </div> 
                </div>-->
            </div>

            <div class="flex flex-row p-8">
                <div class="payment_holder">
                    <?php

                        $accounts = $this->db->get_where('accounts', array('account_is_transferrable' => 1, 'account_is_bank' => 0))->result_array();

                        $sale_order_row = $this->db->get_where('sales_order', array('so_code' => $so_code))->row();
                        $payment_row = $this->db->get_where('payment', array('so_code' => $so_code))->row();
                    ?>
                <div class="form-group row text-left">
                    <div class="col-lg-6 col-md-6 col-sm-6 flex flex-col">
                        <div class="form-group row">
                            <div class="input-group">
                                <div class="input-group-prepend w-fit max-w-fit" style="height: 32px; max-height: 32px;">
                                    <div class="input-group-text bg-success text-white" style="font-size: 16px !important;">Payment Method:</div>
                                </div>

                                <div>
                                <select name="paid_to[]" multiple id="paid_to" onchange="get_account_field($(this).val())" class="form-control select2" required="required" style="height: 45px; font-size: 16px !important;">
                                    <?php foreach ($accounts as $acc):
                                        $sameId = false;
                                        foreach($payment_ids_array as $pId) {

                                            if($acc['account_id'] == $pId['account_id']) {
                                                $sameId = true;
                                            }
                                    
                                        }
                                        
                                    ?>
                                        <option value="<?=$acc['account_id']?>" <?=$sameId ? 'selected' : '';?>><?=$acc['name']?></option>
                                    <?php endforeach;?>
                                </select>
                                </div>
                            </div>
                        </div>
                        <div class="row grid grid-cols-1 gap-4 grid-flow-col mt-5" id="account_method_holder"></div>
                        </div>

                        <div class="input-group col-lg-6 col-md-6 col-sm-6">

                        <div class="payment_holder">
                            <div class="form-group row">
                                <div class="col-sm-6 col-md-6 text-left"><strong style="color: #000;">Amount Tendered</strong></div>
                                <div class="col-sm-6 col-md-6 text-left"><strong style="color: #000;">Amount Paid</strong></div>
                            </div>

                            <div class="form-group row">
                                <div class="col-sm-6 col-md-6">
                                        <input type="currency" onkeyup="change_update()" onchange="change_update()" min="0" name="amount_tendered" id="amount_tendered" class="form-control" value="<?=number_format($payment_row->amount_tendered, 2, '.', ',');?>" required="required" placeholder="0.00" style="height: 80px; font-size: 20px !important;" readonly="readonly">
                                </div>

                                <div class="col-sm-6 col-md-6">
                                        <input type="currency" onkeyup="payment_update()" onchange="payment_update()" min="0" name="amount_paid" id="amount_paid" class="form-control" required="required" readonly="readonly" placeholder="0.00" value="<?=$sale_order_row->amount_paid;?>" style="height: 80px; font-size: 20px !important;">
                                </div>
                            </div>

                            <div class="flex gap-2 items-baseline">
                                <label class="col-sm-2 col-md-2 form-control-label" style="height: 30px; font-size: 14px !important; color: #85868d; text-align: left;">Change</label>
                                <div class="col-sm-4 col-md-4">
                                    <input type="text" name="change_due" id="change_due" class="form-control form-control-plaintext p-2" placeholder="0.00" value="<?=number_format($payment_row->change_due, 2, '.', ',');?>" readonly="readonly" style="height: 30px; font-size: 16px !important; color: #85868d;">
                                </div>


                                <label class="col-sm-2 col-md-2 col-lg-2 form-control-label" style="height: 30px; font-size: 14px !important; color: #85868d; text-align: left;">Balance</label>
                                <div class="col-sm-4 col-md-4">
                                    <input type="text" name="balance_amount" id="balance_amount" class="form-control form-control-plaintext p-2" placeholder="0.00" value="<?=number_format($sale_order_row->amount_due, 2, '.', ',');?>" readonly="readonly" style="height: 30px; font-size: 16px !important; color: #85868d;">
                                </div>
                            </div>

                            </div>
                        </div>
                        <input type="hidden" name="account_balance" id="account_balance" class="form-control form-control-plaintext">
                    </div>
                </div> <!--end of holder-->
            </div>
            </div>

            <div class="flex gap-6 mt-6">
                <div class="">
                    <button type="submit" class="btn btn-info btn-lg rounded-md h-20 w-fit hover:shadow-2xl translate-y-4 hover:font-bold hover:bg-gray-800">Update</button>
                </div>
                <div class="">
                    <button class="btn btn-danger btn-lg h-20 w-fit hover:shadow-2xl translate-y-4 hover:font-bold hover:bg-gray-800" data-dismiss="modal">Cancel</button>
                </div>
                
            </div>
          </form>
          </div>
          </div>
        </div>
    </div>
</div>

<script type="text/javascript">
    $(function() {
        let table_row_counter = <?php echo $table_row_counter; ?>;
        //global variables
        window.oldIdArray =  [];
        window.paymentMethodsIds = <?php echo json_encode($payment_ids); ?>;

        //enable the last button
        $('#tr_' + (Number(table_row_counter) - 1) + ' td a').removeAttr('disabled');

        get_account_field(paymentMethodsIds, '<?=$so_code?>', '<?=$date;?>'); //call this at page load
    });

    ////live update ship to info
    $('#bill_to').keyup(function(event) {
        /* Act on the event */
        let bill_to = $('#bill_to').val();
        $('#ship_to').val(bill_to);
    });

    function get_account_field(idArray) {

        oldIdArray = paymentMethodsIds;   

        if(idArray != '') {
            paymentMethodsIds = idArray;

            
            $.ajax({
                url: '<?= site_url('admin/get_account_field/'.$so_code.'/'.$date) ?>',
                type: 'post',
                data: {'idArray[]': idArray, 'oldIdArray[]': oldIdArray},
                dataType: 'html',
                cache: false
            })
            .done(function(response) {
                
                $('#account_method_holder').html(response);

                update_amount_paid();
                
            })
            .fail(function(err) {

            })
        } else {

            update_amount_paid('empty');

            $('#account_method_holder').html('<div class="flex items-center p-4 mb-4 text-sm text-red-800 border border-red-300 rounded-lg bg-red-50 dark:bg-gray-800 dark:text-red-400 dark:border-red-800" role="alert"><svg class="flex-shrink-0 inline w-4 h-4 me-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="currentColor" viewBox="0 0 20 20"><path d="M10 .5a9.5 9.5 0 1 0 9.5 9.5A9.51 9.51 0 0 0 10 .5ZM9.5 4a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM12 15H8a1 1 0 0 1 0-2h1v-3H8a1 1 0 0 1 0-2h2a1 1 0 0 1 1 1v4h1a1 1 0 0 1 0 2Z"/></svg><span class="sr-only">Info</span><div class="font-bold text-xl"><span>Error:</span> No account found!</div></div>');
            
        }

        

        //disable the autofill button when user select more than 1 payment method
        if(idArray.length > 1) {
            $('#autofill_button').addClass('disabled');

        } else {
            $('#autofill_button').removeClass('disabled');
        }
    }

    //add row to table at a button click
    function add_new_row() {
        //be sure user selected customer before trying to add row
        let selected_customer = $('#order_to').val();
        if(selected_customer == '') {
            //no customer selected, flag error message
            showAjaxModal_confirm('No Customer Was Selected! Select One and Try Again.', 'Error');
            return false;
        }

        let tbody = $('#s_order_create_table tbody').find('tr').length + 1;

        let order_date = $('#order_date').val();

        //trying to make sure that a selected item does not appear in the next row
        let selected_item_ids = [];
        let i = 1;
        $.each($('tr td select'), function(index, val) {

             /* iterate through array or object */
                selected_item_ids.push($('#tr_'+ i +' td select').val());
            i++;
        });

        selected_item_ids = selected_item_ids.join('-');

        $.ajax({
            url: '<?php echo site_url('admin/add_order_row/so/0/0/') ?>' + selected_customer + '/' + order_date + '/' + selected_item_ids,
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

    //populate the edit button with the selected customer
    function populate_edit_button(id) {
        //populate the edit button
        $('#edit_button').attr('onclick', 'showAjaxModal_data_create("<?php echo site_url("modal/popup_sales/edit_customer/"); ?>' + id + '", "Edit Customer")');

        //clear all table rows and inputs if Customer is changed
        //amounts
        let row_total_cost = Number($('#tr_' + id + ' td .sum_total_amount').val());

        if(!isNaN(row_total_cost)) {
            let grand_total = Number($('#hidden_total').val());
            let amount_paid = Number($('#amount_paid').val());
            let balance = grand_total - row_total_cost;

            if(amount_paid > 0) {
                balance = balance - amount_paid;
            }
            

            //quantities
            let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity').val());
            let grand_total_quantity = Number($('#hidden_total_quantity').val());
            let balance_quantity = grand_total_quantity - row_total_quantity;


            $('#hidden_total').val(balance + amount_paid);
            $('#subtotal').html(number_format(balance + amount_paid, 2, '.', ','));
            $('#total').html(number_format(balance + amount_paid, 2, '.', ','));
            //$('#amount_paid').val('0.00');
            $('#balance_amount').val(number_format(balance, 2, '.', ','));


            $('#hidden_total_quantity').val(balance_quantity);
            //$('#quantity_picked').val(0);
            $('#balance_quantity').val(balance_quantity);

            $('#s_order_create_table tbody tr').css('display', 'none');
            $('#s_order_create_table tbody tr').slideUp('slow');
            $('#s_order_create_table tbody tr').remove();
        }

        //let's auto fill the bill to and ship to addresses with the customer's address
        if(id != '') {
            $.ajax({
            url: '<?php echo site_url('admin/get_customer_address/') ?>' + id,
            type: 'POST',
            dataType: 'text'
            })
            .done(function(response) {
                if(response != '') {
                    $('#bill_to').val(response);
                    $('#ship_to').val(response);
                }
            });
        }  else {
                    $('#bill_to').val('');
                    $('#ship_to').val('');
                }

    }

    //Verify po no
    function verify_so_no() {
        //verify id
        var so_no = $('#order_no').val();
        $.ajax({
            url: '<?php echo site_url('admin/get_generated_so_no/'); ?>' + so_no
        })
        .done(function(response) {
                $('#so_code_err_message').html(response);
        });
    }


    

    //Sales Order Creation form submitted
  $('#sales_order_form').submit(function(event) {
    /* Act on the event */
    event.preventDefault();

    let no_tr = $('#s_order_create_table tbody').find('tr').length; //global variable

    let a_paid = Number($('#amount_paid').val());
    let ac_paid_to = $('#paid_to').val();

    /*if(a_paid > 0 && ac_paid_to == '') {
        //reject submission
        showAjaxModal_confirm('No Deposit Account Is Selected. Select A Deposit Account!', 'Error');
        return false;

    }*/

    showAjaxModal_confirm('Please wait... <i class="fa fa-spinner fa-pulse"></i>', 'Loading');

    
    let input_ids_numeric = []; //array to hold the numeric parts of the ids
    let paymentMethodsIdsNew = [];


    for(i = 1; i <= no_tr; i++) {

      let each_id_element =  $('#tr_' + i + ' input[type="number"]');


      if(each_id_element.length < 1) {
          continue; //move on to the next element
      } 

      let each_id_numeric = each_id_element.attr('id').replace(/[^\d]+/, '');
      
      input_ids_numeric.push(each_id_numeric); //push the numbers into this array
    }

   

    //replace the , with -
    input_ids_numeric = input_ids_numeric.join('-')
    paymentMethodsIdsNew = paymentMethodsIds.join('-');
    let form_data = $('#sales_order_form').serialize();


    //send data via ajax

    $.ajax({
      url: '<?php echo site_url('admin/sales_order_pos/update/' . $so_code . '/') ?>' + input_ids_numeric + '/' + paymentMethodsIdsNew,
      type: 'POST',
      dataType: 'json',
      data: form_data,
      cache: false
    })
    .done(function(data) {
      if(data.success == true) {
        
        showAjaxModal_confirm('Sales Order Updated Successfully.', 'Success');

        reloadSalesList();
        setTimeout(() => {
          $('#create .close').click();
          $('#modal_confirm .close').click();
          
        }, 2000);
      } else if(data.success == 'duplicate') {
        showAjaxModal_confirm('Duplicate found: Order with the same SO No [' + data.so_code + '] already exists', 'Error');
      } else {
        $(function(){
          $.each(data, function(index, val) {
          $('#list_err_s_order_update').append('<li>' + val + '</li>');
        }); });

        //$('.close').click();
        showAjaxModal_confirm('<ul id="list_err_s_order_update"></ul>', 'Error');
      }
    })
    .fail(function(err) {
        showAjaxModal_confirm(err.responseText, 'Error');
    });
  });

   function change_fields(item_id, num) {
        /* Act on the event */
        if(item_id != '') {

            let selected_customer = $('#order_to').val();
            let order_date = $('#order_date').val();
            let ajax_url = '';

        if(order_date != '' && selected_customer != '') {
            ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/so' + '/' + selected_customer + '/' + order_date;

        } else {
            ajax_url = '<?php echo site_url('admin/order_item_selected/') ?>' + item_id + '/so';
        }

        if(item_id != '') {

            let quantity = Number($('#order_quantity_' + num).val());
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

                    //update unit price
                    if(unit_price_raw == undefined || unit_price_raw == 0) {
                        //does not exist so alert the user to update this info before proceeding
                    showAjaxModal_confirm('Price of the selected item/good for this customer is invalid! Kindly update the price of this item/good for this customer first!', 'Error');
            

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
                    //does not exist so alert the user to update this info before proceeding
                    showAjaxModal_confirm('We couldn\'t find any valid price list for this customer. Kindly select this customer from the "View All Customers" button under the "Sales" tab  and click on the "Edit" button at the top. On the popup window, click on the "Update" button to add this customer to the price list. Then manage the price list from there using the "Pricing" button!', 'Error');
                return false;
                    }

                });
            }
            
        }
}

function reloadSalesList() {

    let from = $('#from').val();
    let to = $('#to').val();
    showAjaxModal_settings('<?php echo site_url('modal/popup_sales/sales_order_list?'); ?>' + from + '&to=' + to, 'View Sales Orders');
}

//find the total for each row
function row_total(num) {

        let quantity = Number($('#order_quantity_' + num).val());
        let unit_price = Number($('#order_unit_price_' + num).val());


        let total_price = quantity * unit_price;
        $('#order_total_price_' + num).val(numeric_format(total_price,0,'',''));
        $('#order_picked_' + num).val(quantity);
        $('#hidden_quantity_balance_per_' + num).val(0);
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
    let discount = $('#discount').val();
    



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


    /*Effect discount*/
    subtotal = total;
    total = total - discount;

    //for amount
    $('#total').html(number_format(total, 2, '.', ','));
    $('#subtotal').html(number_format(subtotal, 2, '.', ','));
    $('#balance_amount').val(number_format(total, 2, '.', ','));
    $('#hidden_total').val(total);

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

//get bank account balance
function update_bank_balance(id) {
    if(id != '') {
        $.ajax({
            url: '<?php echo site_url('admin/get_bank_balance/'); ?>' + id,
            type: 'POST',
            dataType: 'json',
            cache: false
        })
        .done(function(response) {
           $('#account_balance_so_edit').val(number_format(response.balance, 2, '.', ','));
        });
    } else {
        $('#account_balance_so_edit').val('');
    }

}

 //reemove row
function remove_row(id) {
    //amounts
    let row_total_cost = Number($('#tr_' + id + ' td .sum_total_amount').val());
    let grand_total = Number($('#hidden_total').val());
    let amount_paid = Number($('#amount_paid').val());
    let balance = grand_total - row_total_cost;

    if(amount_paid > 0) {
        balance = balance - amount_paid;
    }


    //quantities
    let row_total_quantity = Number($('#tr_' + id + ' td .sum_total_quantity').val());
    let grand_total_quantity = Number($('#hidden_total_quantity').val());
    let balance_quantity = grand_total_quantity - row_total_quantity;


    $('#hidden_total').val(balance + amount_paid);
    $('#subtotal').html(number_format(balance + amount_paid, 2, '.', ','));
    $('#total').html(number_format(balance + amount_paid, 2, '.', ','));
    //$('#amount_paid').val('0.00');
    $('#balance_amount').val(number_format(balance, 2, '.', ','));


    $('#hidden_total_quantity').val(balance_quantity);
    //$('#quantity_picked').val(0);
    $('#balance_quantity').val(balance_quantity);

    //enable the previous button
    //$('#tr_' + (Number(id) - 1) + ' td a').removeAttr('disabled');

    //remove row now
    $('#tr_'+id).remove();
}


 //update amount paid from the payment method/account paid to
 function update_amount_paid(amount) {
      let totalAmountReceived = 0;

      for(let i in paymentMethodsIds) {
        let eachAmountReceived = Number($('#method_amount_' + paymentMethodsIds[i]).val());
        totalAmountReceived += eachAmountReceived;
      }

      if(amount == 'empty') {

        totalAmountReceived = 0;

      }


      $('#amount_paid').val(totalAmountReceived);

      //we update the amount tendered automatically if user didn't enter anything
      $('#amount_tendered').val(totalAmountReceived);
      
      payment_update();
 
    }


</script>