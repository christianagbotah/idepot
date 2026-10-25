<?php
//select order details
$this_order_array = $this->db->get_where('sales_order', array('so_code' => $so_code, 'customer_id' => $customer_id))->result_array();

?>
            <div class="form-group row">
                <table class="table table-striped table-hover table-success" width="100%" id="s_order_create_table">
                    <thead>
                      <tr>
                        <th>Quantity</th>
                        <th>Item</th>
                        <th>Description</th>
                        <th>Unit Price</th>
                        <th>Total</th>
                        <th>Delete</th>
                      </tr>
                    </thead>
                    <tbody>
                        <?php
$table_row_counter = 0;
foreach ($this_order_array as $order):
?>
                        <tr id="tr_<?=$table_row_counter;?>">
                            <td width="100">
                                <input type="number" min="1" required="true" onkeyup="row_total($('#order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" onchange="row_total($('#order_quantity_<?=$order['html_id'];?>').attr('id').replace(/[^\d]+/, ''))" class="form-control sum_total_quantity" id="order_quantity_<?=$order['html_id'];?>" name="order_quantity_<?=$order['html_id'];?>" value="<?=$order['quantity'];?>">
                            </td>

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

                            <td width="180">
                                <div class="input-group">
                                    <div class="input-group-prepend">
                                        <div class="input-group-text"><?php echo $this->db->get_where('settings', array('type' => 'currency'))->row()->description; ?>
                                        </div>
                                    </div>
                                    <input type="currency" class="form-control sum_total_amount" name="order_total_price_<?=$order['html_id'];?>" id="order_total_price_<?=$order['html_id'];?>" placeholder="0.00" value="<?=$order['amount'];?>" readonly="readonly">
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

                                <input type="hidden" name="hidden_total_quantity" id="hidden_total_quantity" value="<?=$grand_quantity;?>">
                                <input type="hidden" name="hidden_quantity_balance" id="hidden_quantity_balance" value="<?=$this->db->get_where('sales_order', array('so_code' => $so_code))->row()->quantity_due;?>">

                            </thead>
                        </table>
                    </div>
                </div>
            </div>

