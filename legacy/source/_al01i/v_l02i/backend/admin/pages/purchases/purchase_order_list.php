<?php 
    //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

    //use get method to retrieve the values of from and to
    if(isset($_GET['from']) && isset($_GET['to'])) {
        $from = $_GET['from'];
        $to = $_GET['to'];
    }
?>
<div class="container-fluid">
    <div class="row max-xs:flex-row">

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="poadd" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_purchase_order/');?>', 'Create New Purchase Order')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>

            <?php
              $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

             //Is the current logged in user the admin -->
               if($level == 1 || $level == 2):
            ?>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="poedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="podelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <?php
                endif;
            ?>

            <!--<div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-secondary btn-lg" id="poemail"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-3">Email</strong></div>-->

            <!--<div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="pocall"><i class="fa fa-2x fa-fw fa-phone"></i></button><br><strong class="ml-4">Call</strong></div>-->

            <div class="col-md-1 col-sm-1 col-lg-1"><a target="_blank" class="btn btn-outline-warning btn-lg" id="poprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong class="ml-3">Print</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="popreview"><i class="fa fa-2x fa-fw fa-search"></i></button><br><strong>Preview</strong></div>

    </div>

    <hr>
    <hr>

     <?php
       echo form_open(site_url('admin/purchase_order_search') ,
        array('class' => 'form-horizontal form-groups-bordered','target'=>'_top')); ?>
    <div class="form-group row  max-xs:gap-8">
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Period</div>
                </div>
                <select class="form-control" name="search_by_periods" id="search_by_periods">
                    <option value="1">All</option>
                    <option value="2">Today</option>
                    <option value="3">Yesterday</option>
                    <option value="4" selected>This Week</option>
                    <option value="5">Last Week</option>
                    <option value="6">This Month</option>
                    <option value="7">Last Month</option>
                    <option value="8">This Year</option>
                    <option value="9">Last Year</option>
                    <option value="10">Custom Date</option>
                </select>
            </div>
        </div>

        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Start</div>
                </div>
                <input type="text" name="from" id="from" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo $from; ?>">
            </div>
        </div>
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">End</div>
                </div>
                <input type="text" name="to" id="to" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo $to; ?>">
            </div>
        </div>

        <div class="col-sm-3 col-md-3">
            <?php
                $suppliers_add = $this->db->get('suppliers');
                $suppliers_array_add = $suppliers_add->result_array();

             ?>
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Supplier</div>
                </div>
                <select required="true" class="form-control select2" name="search_by_supplier" id="search_by_supplier">
                    <option value="0">All</option>
                    <?php foreach($suppliers_array_add as $srow): ?>
                    <option value="<?= $srow['supplier_id']; ?>"><?= $srow['supplier_name']; ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
        </div>

        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-danger text-light">Items</div>
                </div>
                <select class="form-control select2" name="search_by_item" id="search_by_item">
                    <option value="All">All</option>
                    <?php
                    $all_items_array = $this->db->get('items')->result_array();

                    foreach ($all_items_array as $item) {
                        
                        ?>
                        <option value="<?=$item['item_id'];?>"><?=$item['item_name']; ?></option>
                        <?php
                    }
                    ?>
                </select>
            </div>
        </div>
    </div>
    </form>
    <hr>

    <div id="main_data">
    <?php
        $order_code_array = array();

        $this->db->where('date_timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
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
                <th>item_id</th>
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
                        $date = $this->db->get_where('purchase_order', array('po_code' => $q['po_code']))->row()->date;
                        $supplier_id = $this->db->get_where('purchase_order', array('po_code' => $q['po_code']))->row()->supplier_id;
                        $item_id = $this->db->get_where('purchase_order', array('po_code' => $q['po_code']))->row()->item_id;
                ?>
              <tr ondblclick="deselect_all()" onclick="populate_links('<?= $q['po_code']?>')" id="order_code_<?= $q['po_code']; ?>">
                <td><?= $date; ?></td>
                <td><?= $q['po_code']; ?></td>
                <td><?= $this->db->get_where('suppliers', array('supplier_id' => $supplier_id))->row()->supplier_name; ?></td>
                <td><?= $item_id; ?></td>
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
            <div class="col-md-2 col-sm-2 text-lg-left"><strong>Total: <?= numfmt_format_currency($fmt, $grand_amount, $currency); ?></strong></div>

    </div>
</div>
</div>

<script type="text/javascript">
    $(function() {
        $('#order_list').DataTable();
        buttons_disabled();
    });

     //let's disable all the buttons until a supplier is selected
    function buttons_disabled() {
        $('#poedit').attr('disabled', 'disabled');
        $('#popreview').attr('disabled', 'disabled');
        $('#podelete').attr('disabled', 'disabled');
        $('#poemail').attr('disabled', 'disabled');
        //$('#poprint').attr('disabled', 'disabled');
    }

    //let's enable all the buttons when a supplier is selected
    function buttons_enabled() {
        $('#poedit').removeAttr('disabled');
        $('#popreview').removeAttr('disabled');
        $('#podelete').removeAttr('disabled');
        $('#poemail').removeAttr('disabled');
        //$('#poprint').removeAttr('disabled');
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
            dataType: 'text',
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

    //FILTERING DATA
    $(function() {
        selection_controller();
        order_list_filter();
    });

    //by date
    $('#search_by_periods').change(function(event) {
        selection_controller();
        order_list_filter();      
    });

    //by supplier
    $('#search_by_supplier').change(function(event) {
        order_list_filter();      
    });

    //by item_id
    $('#search_by_item').change(function(event) {
        order_list_filter();      
    });

    $('#from').change(function(event) {
        /* Act on the event */
        order_list_filter();
    });

    $('#from').keyup(function(event) {
        /* Act on the event */
        order_list_filter();
    });

    $('#to').change(function(event) {
        /* Act on the event */
        order_list_filter();
    });

    $('#to').keyup(function(event) {
        /* Act on the event */
        order_list_filter();
    });

    //filtering of order list
    function order_list_filter() {
        let date_value = $('#search_by_periods').val();
        let supplier_id = $('#search_by_supplier').val();
        let item_id = $('#search_by_item').val();

        if(date_value == 10) {
                //response is ready
                //$('#from').val('<?=date('d-m-Y') ?>');
                //$('#to').val('<?=date('d-m-Y') ?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#poprint').attr('href', '<?php echo site_url('admin/purchase_order_report/') ?>' + from + '/' + to + '/' + supplier_id + '/' + item_id);

                $.ajax({
                    url: '<?php echo site_url('admin/get_purchase_order_list/')  ?>' + from + '/' + to + '/' + supplier_id + '/' + item_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#main_data').slideUp('slow');
                    $('#main_data').slideDown('slow');
                    $('#main_data').html(data);
                });
                
        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#poprint').attr('href', '<?php echo site_url('admin/purchase_order_report/') ?>' + from + '/' + to + '/' + supplier_id + '/' + item_id);

            $.ajax({
                url: '<?php echo site_url('admin/get_purchase_order_list/')  ?>' + from + '/' + to + '/' + supplier_id + '/' + item_id,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                $('#main_data').slideUp('slow');
                $('#main_data').slideDown('slow');
                $('#main_data').html(data);
            });

        } else {
            $.ajax({
            url: '<?php echo site_url('admin/get_selected_dates/') ?>' + date_value,
            type: 'POST',
            dataType: 'json',
            cache: false,
            //data: {param1: 'value1'},
            })
            .done(function(data) {
                //response is ready
                $('#from').val(data.from);
                $('#to').val(data.to);

                //view update
                let from = data.from;
                let to = data.to;

                //propagate print button
                $('#poprint').attr('href', '<?php echo site_url('admin/purchase_order_report/') ?>' + from + '/' + to + '/' + supplier_id + '/' + item_id);

                $.ajax({
                    url: '<?php echo site_url('admin/get_purchase_order_list/')  ?>' + from + '/' + to + '/' + supplier_id + '/' + item_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#main_data').slideUp('slow');
                    $('#main_data').slideDown('slow');
                    $('#main_data').html(data);
                });
                
            });
        } 
    }

    function selection_controller() {
        /* Act on the event */
        if($('#search_by_periods').val() == 10) {
            $('#from').removeAttr('disabled');
            $('#to').removeAttr('disabled');
        } else {

            $('#from').attr('disabled', 'disabled');
            $('#to').attr('disabled', 'disabled');
        }
    }
</script>
