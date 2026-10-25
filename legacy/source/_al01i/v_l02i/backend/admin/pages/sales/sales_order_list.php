<style>
    .text-right {
        text-align: right !important;
    }

    .dataTables_filter {
        display: none;
    }

    #order_list_processing {
        position: absolute;
        top: 100px;
        margin-left: -120px;
        width: 250px;
        background-color: red;
        font-weight: bold;
        color: #ffffff;
    }

    .wider-width {
        width: 200px !important;
    }

    table thead th, table tbody td {
        font-size: 12px !important;
    }

</style>

<?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

//use get method to retrieve the values of from and to
if (isset($_GET['from']) && isset($_GET['to'])) {
	$from = $_GET['from'];
	$to = $_GET['to'];
}
?>

<div class="container-fluid" id="order_list_top">

    <div class="row grid grid-cols-5 sm:grid-cols-7 gap-8 sm:gap-10 grid-flow-row">

            <div class=""><a href="<?=site_url('admin/pos');?>" target="_blank" class="btn btn-info btn-lg" id="soadd"><i class="fa fa-2x fa-fw fa-plus"></i></a><br><strong class="ml-4 hidden sm:block">Add</strong></div>
                <?php
                $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

                if ($level < 3):
                ?>
             <div class="" id="edit_div"><button class="btn btn-outline-success btn-lg" id="soedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4 hidden sm:block">Edit</strong></div>

           <?php
            endif;

            //Is the current logged in user the admin -->
            if ($level == 1):
            ?>



            <div class=""><button class="btn btn-outline-danger btn-lg" id="sodelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2 hidden sm:block">Delete</strong></div>


            <?php
            endif;
            ?>


            
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="sorefund"><i class="fa fa-2x fa-fw fa-refresh"></i></button><br><strong class="ml-2">Refund</strong></div>
            <!--
             <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="sopreview"><i class="fa fa-2x fa-fw fa-search"></i></button><br><strong>Preview</strong></div>-->

            <!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-secondary btn-lg" id="soemail"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-3">Email</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="socall"><i class="fa fa-2x fa-fw fa-phone"></i></button><br><strong class="ml-4">Call</strong></div>

           <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="soinvoice"><i class="fa fa-2x fa-fw fa-file-invoice"></i></button><br><strong class="ml-1">Invoice</strong></div> -->

           <div class=""><button class="btn btn-outline-success btn-lg" id="sopreview"><i class="fa fa-2x fa-fw fa-search"></i></button><br><strong class="hidden sm:block">Preview</strong></div>

            <div class="">
                <div class="dropdown">

                    <button class="btn btn-outline-warning dropdown-toggle" data-toggle="dropdown" type="button"><i class="fa fa-3x fa-fw fa-print"></i><span class="caret"></span></button>
                    <br><strong class="ml-3 hidden sm:block">Print</strong>

                    <div class="dropdown-menu w-60 p-3">
                        <a href="javascript:void()" class="rounded-sm btn btn-outline-success text-lg" target="_blank" id="soprint"><i class="fa fa-fw fa-print"></i> Print Sales Order</a>
                        <div class="divider"></div>
                        <a href="javascript:void()" class="rounded-sm btn btn-outline-danger text-lg mt-2" target="_blank" id="soprints"><i class="fa fa-fw fa-print"></i> Print Sales Summary</a>
                        <div class="divider"></div>
                        <a href="javascript:void()" class="rounded-sm btn btn-outline-info text-lg mt-2" target="_blank" id="soprintd"><i class="fa fa-fw fa-print"></i> Print Daily Table</a>
                    </div>
                </div>
            </div>


            <div class="" id="type_holder" style="display: none">
                <div class="input-group">
                    <div class="input-group-prepend">
                        <div class="input-group-text bg-danger text-light">Status</div>
                    </div>
                    <select class="form-control" name="search_by_status" id="search_by_status">
                        <option value="All">All</option>
                        <option value="Unpaid">Unpaid</option>
                        <option value="Partially_Paid">Partially Paid</option>
                        <option value="Paid">Paid</option>
                    </select>
                </div>
            </div>

                <div class="w-2/4">
                    <?php
                        $items_query = $this->db->get('items');
                        $items_array = $items_query->result_array();

                        ?>
                    <div class="input-group">
                        <div class="input-group-prepend">
                            <div class="input-group-text bg-info text-light">Items</div>
                        </div>
                        <select required="true" class="form-control select2" name="search_by_item" id="search_by_item">
                            <option value="0">All</option>
                            <?php foreach ($items_array as $item): ?>
                            <option value="<?=$item['item_id'];?>"><?=$item['item_name'];?></option>
                            <?php endforeach;?>
                        </select>
                    </div>
                </div>

                <div class="">
                    <button class="btn btn-success btn-lg" id="soload">
                        <i class="fa fa-2x fa-fw fa-refresh" id="load-btn-icon"></i>
                    </button>
                    <br><strong class="ml-3 xs-hidden" id="load-btn-text">Load</strong>
                </div>

    </div>

    <hr>
     <?php
echo form_open(site_url('admin/sales_order_search'),
	array('class' => 'form-horizontal form-groups-bordered', 'target' => '_top')); ?>
    <div class="form-group row gap-4 sm:gap-0">
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Period</div>
                </div>
                <select class="form-control" name="search_by_periods" id="search_by_periods">
                    <!--<option value="1">All</option>-->
                    <option value="2" selected>Today</option>
                    <option value="3">Yesterday</option>
                    <option value="4">This Week</option>
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
$customers_add = $this->db->get('customers');
$customers_array_add = $customers_add->result_array();

?>
            <div class="input-group">
                <!-- <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Customers</div>
                </div> -->
                <select required="true" class="form-control select2" name="search_by_customer" id="search_by_customer">
                    <option value="0">Filter By Customer</option>
                    <option value="0">All</option>
                    <?php foreach ($customers_array_add as $crow): ?>
                    <option value="<?=$crow['customer_id'];?>"><?=$crow['customer_name'];?></option>
                    <?php endforeach;?>
                </select>
            </div>
        </div>

        <div class="col-sm-3 col-md-3">

            <div class="input-group">
                    <!-- <div class="input-group-prepend">
                        <div class="input-group-text bg-success text-light">Type</div>
                    </div> -->
                    <select class="form-control select2" name="search_by_type" id="search_by_type">
                        <option value="0" selected>Filter By Type of Sales</option>
                        <option value="0">All</option>
                        <option value="Cash">Cash</option>
                        <option value="Payables">Payables</option>
                    </select>
                </div>

        </div>
    </div>
    </form>
    <hr>
    <div id="main_data2">
        <div class="row">
        <table class="table" width="100%" id="order_list">
            <thead class="bg-info">
              <tr>
                <!-- <th>Date</th> -->
                <!-- <th>Order</th> -->
                <th width="200">Customer|Date|Order</th>
                <th>Waybill/Invoice</th>
                <th>Status</th>
                <th>Sales Type</th>
                <th style="text-align: right">Qty Sold</th>
                <th style="text-align: right">Total Amt</th>
                <th style="text-align: right">Qty Picked</th>
                <th style="text-align: right">Total Picked</th>
                <th style="text-align: right">Qty Left</th>
                <th style="text-align: right">Due Amt</th>
                <th style="text-align: right">Paid</th>
                <th style="text-align: right">Balance</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody></tbody>
        </table>
    </div>

    <br>
    <hr>
    <!--<div class="row" id="bt_row"></div>-->
    </div>
</div>

<script type="text/javascript">
     //pagination button clicked, scroll up
     $('.pagination li').click(function(event) {
         /* Act on the event */
         //Scroll to the top
        $('html, .modal').animate({
          scrollTop: ($('#order_list_top').offset().top)
        }, 2500);
     });




    //by date
    $('#search_by_periods').change(function(event) {
        order_list_filter();
       //selection_controller();



        let date_value = $('#search_by_periods').val();
        let type_of_sales = $('#search_by_type').val();
        let customer_id = $('#search_by_customer').val();
        let item_id = $('#search_by_item').val();

        let status = $('#search_by_status').val();

        if(date_value != 10) {

                $('#load-btn-icon').addClass('fa-pulse');
                $('#load-btn-text').removeClass('ml-3');
                $('#load-btn-text').html('<span class="text-muted">Loading</span>');
                $('#soload').attr('disabled', 'disabled');

                 //show search by type
                   // $('#type_holder').slideDown('slow');

                    $.ajax({
                    url: '<?php echo site_url('admin/get_selected_dates/') ?>' + date_value,
                    type: 'POST',
                    dataType: 'json',
                    cache: false,
                    async: false,
                    //data: {param1: 'value1'},
                    })
                    .done(function(data) {
                        //response is ready
                        $('#from').val(data.from);
                        $('#to').val(data.to);

                    });

                    let from = $('#from').val();
                    let to = $('#to').val();


                var table = $('#order_list').DataTable();


                table.ajax.url(
                    "<?php echo site_url("admin/get_sales_order_list/") ?>" + from + "/"  + to + "/" + customer_id + "/"  + status + "/"  + type_of_sales + "/" + item_id,
                )
                .load();

                table.on( 'xhr', function () {
                    var json = table.ajax.json();
                    order_code_array = json.so_codes;

                    if(order_code_array.length > 0) {
                        bottom_total_row = json.bt_row;

                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }

                    $('#load-btn-icon').removeClass('fa-pulse');
                    $('#load-btn-text').addClass('ml-3');
                    $('#load-btn-text').html('Load');
                    $('#soload').removeAttr('disabled');

                   // alert(order_codes +' row(s) were loaded' );
                } );
            }

    });

    //by type of sales
    $('#search_by_type').change(function(event) {
        //selection_controller();
        //reload_datatable();
        populatePrintButton()

    });

    //by customer
    $('#search_by_customer').change(function(event) {
        //order_list_filter();
        //reload_datatable();
        populatePrintButton()
    });

    //filter by item
    $('#search_by_item').change(function(event) {
        //order_list_filter();
       // reload_datatable();
       populatePrintButton()
    });

    //by status
    $('#search_by_status').change(function(event) {

        //order_list_filter();
        //reload_datatable();
        populatePrintButton()
    });

    $('#from').change(function(event) {
        /* Act on the event */
        //order_list_filter();
       // reload_datatable();
       populatePrintButton()
    });

    /*$('#from').keyup(function(event) {
        /* Act on the event *
        //order_list_filter();
        reload_datatable();
    });*/

    $('#to').change(function(event) {
        /* Act on the event */
        //order_list_filter();
        //reload_datatable();
        populatePrintButton();
    });

    function populatePrintButton() {

        let date_value = $('#search_by_periods').val();
        let type_of_sales = $('#search_by_type').val();
        let customer_id = $('#search_by_customer').val();
        let item_id = $('#search_by_item').val();
        let status = $('#search_by_status').val();

        let from = $('#from').val();
        let to = $('#to').val();

        //propagate print button
        $('#soprint').attr('href', '<?php echo site_url('admin/sales_order_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

        $('#soprints').attr('href', '<?php echo site_url('admin/sales_order_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

        $('#soprintd').attr('href', '<?php echo site_url('admin/sales_order_daily_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);
    }



    $(function() {
        var order_code_array = [];
        var bottom_total_row  = '';
        first_datatable_loader();
        selection_controller();

        //$('#order_list').DataTable();
        buttons_disabled();
    });

    $('#soload').click(function() {
        //change button icon
        $('#load-btn-icon').addClass('fa-pulse');
        $('#load-btn-text').removeClass('ml-3');
        $('#load-btn-text').html('<span class="text-muted">Loading</span>');
        $(this).attr('disabled', 'disabled');
        reload_datatable();

    })


    //reload datatable
    function reload_datatable() {

        $('#load-btn-icon').addClass('fa-pulse');
        $('#load-btn-text').removeClass('ml-3');
        $('#load-btn-text').html('<span class="text-muted">Loading</span>');
        $('#soload').attr('disabled', 'disabled');

        let date_value = $('#search_by_periods').val();
        let type_of_sales = $('#search_by_type').val();
        let customer_id = $('#search_by_customer').val();
        let item_id = $('#search_by_item').val();
        let status = $('#search_by_status').val();
        let from = $('#from').val();
        let to = $('#to').val();

        order_list_filter();

        var table = $('#order_list').DataTable();

        table.ajax.url(
            "<?php echo site_url("admin/get_sales_order_list/") ?>" + from + "/"  + to + "/" + customer_id + "/"  + status + "/"  + type_of_sales + "/" + item_id,
        )
        .load();

        //finished loading
        table.on('xhr', function(e) {
            $('#load-btn-icon').removeClass('fa-pulse');
            $('#load-btn-text').addClass('ml-3');
            $('#load-btn-text').html('Load');
            $('#soload').removeAttr('disabled');
        });
    }


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



    //this loads the datatable on page loads

    function first_datatable_loader() {

        let date_value = $('#search_by_periods').val();
        let type_of_sales = $('#search_by_type').val();
        let customer_id = $('#search_by_customer').val();
        let item_id = $('#search_by_item').val();
        let status = $('#search_by_status').val();


        if(date_value == 10) {

                 //show search by type
                //$('#type_holder').slideDown('slow');
                //response is ready
                //$('#from').val('<?=date('d-m-Y')?>');
                //$('#to').val('<?=date('d-m-Y')?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#soprint').attr('href', '<?php echo site_url('admin/sales_order_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprints').attr('href', '<?php echo site_url('admin/sales_order_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprintd').attr('href', '<?php echo site_url('admin/sales_order_daily_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
            var myDt = $('#order_list').DataTable({
                "processing": true,
                "serverSide": true,
                "ajax":{
                    "url": "<?php echo site_url("admin/get_sales_order_list/") ?>" + from + "/"  + to + "/" + customer_id + "/"  + status + "/"  + type_of_sales + "/" + item_id,
                    "dataType": "json",
                    "type": "POST",
                },

                "createdRow": function(row, data, dataIndex) {
                        $(row).attr("onclick", data.onclick);
                        $(row).attr("ondblclick", data.ondblclick);
                },

                "oLanguage": {
                        "sProcessing": "Please Wait! We're processing it..."
                    },

                "columns": [
                    //{ "data": "date" },
                    //{ "data": "sales_order_code", "className": "wider-width" },
                    { "data": "customer_name" },
                    { "data": "waybill_code" },
                    { "data": "status" },
                    { "data": "sales_type" },
                    { "data": "q_sold", "className": "text-right" },
                    { "data": "total_amount", "className": "text-right" },
                    { "data": "q_picked", "className": "text-right" },
                    { "data": "total_picked", "className": "text-right" },
                    { "data": "q_left", "className": "text-right"},
                    { "data": "due_amount", "className": "text-right" },
                    { "data": "amount_paid", "className": "text-right" },
                    { "data": "balance", "className": "text-right" },
                    { "data": "cashier" },
                ],
                "columnDefs": [
                    {
                        "targets": [12],
                        "orderable": false
                    },
                ]
            });

            myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    order_code_array = json.so_codes;

                    if(order_code_array.length > 0) {
                        bottom_total_row = json.bt_row;

                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }
                   // alert(order_codes +' row(s) were loaded' );
                } );


        } else if (date_value == 1) {
            //hide search by type
            //$('#type_holder').slideUp('fast');
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#soprint').attr('href', '<?php echo site_url('admin/sales_order_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprints').attr('href', '<?php echo site_url('admin/sales_order_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprintd').attr('href', '<?php echo site_url('admin/sales_order_daily_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);


            //for the datatable loading
            $.fn.dataTable.ext.errMode = 'throw';
            var myDt = $('#order_list').DataTable({
                "processing": true,
                "serverSide": true,
                "ajax":{
                    "url": "<?php echo site_url("admin/get_sales_order_list/") ?>" + from + "/"  + to + "/" + customer_id + "/"  + status + "/"  + type_of_sales + "/" + item_id,
                    "dataType": "json",
                    "type": "POST",
                },

                "createdRow": function(row, data, dataIndex) {
                        $(row).attr("onclick", data.onclick);
                        $(row).attr("ondblclick", data.ondblclick);
                },

                "oLanguage": {
                    "sProcessing": "Please Wait! We're processing it..."
                },

                "columns": [
                    //{ "data": "date" },
                    //{ "data": "sales_order_code" },
                    { "data": "customer_name" },
                    { "data": "waybill_code" },
                    { "data": "status" },
                    { "data": "sales_type" },
                    { "data": "q_sold", "className": "text-right" },
                    { "data": "total_amount", "className": "text-right" },
                    { "data": "q_picked", "className": "text-right" },
                    { "data": "total_picked", "className": "text-right" },
                    { "data": "q_left", "className": "text-right"},
                    { "data": "due_amount", "className": "text-right" },
                    { "data": "amount_paid", "className": "text-right" },
                    { "data": "balance", "className": "text-right" },
                    { "data": "cashier" },
                ],
                "columnDefs": [
                    {
                        "targets": [12],
                        "orderable": false
                    },
                ]
            });

            myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    order_code_array = json.so_codes;

                    if(order_code_array.length > 0) {
                        bottom_total_row = json.bt_row;

                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }
                   // alert(order_codes +' row(s) were loaded' );
                } );


        } else {
             //show search by type
            //$('#type_holder').slideDown('slow');

            $.ajax({
            url: '<?php echo site_url('admin/get_selected_dates/') ?>' + date_value,
            type: 'POST',
            dataType: 'json',
            cache: false,
            async: false,
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
                $('#soprint').attr('href', '<?php echo site_url('admin/sales_order_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprints').attr('href', '<?php echo site_url('admin/sales_order_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprintd').attr('href', '<?php echo site_url('admin/sales_order_daily_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#order_list').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": "<?php echo site_url("admin/get_sales_order_list/") ?>" + from + "/"  + to + "/" + customer_id + "/"  + status + "/"  + type_of_sales + "/" + item_id,
                        "dataType": "json",
                        "type": "POST",
                    },

                    "createdRow": function(row, data, dataIndex) {
                        $(row).attr("onclick", data.onclick);
                        $(row).attr("ondblclick", data.ondblclick);
                    },

                    "oLanguage": {
                        "sProcessing": "Please Wait! We're processing it..."
                    },


                    "columns": [
                        //{ "data": "date" },
                        //{ "data": "sales_order_code" },
                        { "data": "customer_name" },
                        { "data": "waybill_code" },
                        { "data": "status" },
                        { "data": "sales_type" },
                        { "data": "q_sold", "className": "text-right" },
                        { "data": "total_amount", "className": "text-right" },
                        { "data": "q_picked", "className": "text-right" },
                        { "data": "total_picked", "className": "text-right" },
                        { "data": "q_left", "className": "text-right"},
                        { "data": "due_amount", "className": "text-right" },
                        { "data": "amount_paid", "className": "text-right" },
                        { "data": "balance", "className": "text-right" },
                        { "data": "cashier" },
                    ],
                    "columnDefs": [
                        {
                            "targets": [12],
                            "orderable": false
                        },
                    ]
                });

                myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    order_code_array = json.so_codes;

                    if(order_code_array.length > 0) {
                        bottom_total_row = json.bt_row;

                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }
                   // alert(order_codes +' row(s) were loaded' );
                } );

            });
        }
    }


    //filtering of order list
    function order_list_filter() {
        let date_value = $('#search_by_periods').val();
        let type_of_sales = $('#search_by_type').val();
        let customer_id = $('#search_by_customer').val();
        let item_id = $('#search_by_item').val();
        let status = $('#search_by_status').val();

        selection_controller(); //call this function


        if(date_value == 10) {

                 //show search by type
                //$('#type_holder').slideDown('slow');
                //response is ready
                //$('#from').val('<?=date('d-m-Y')?>');
                //$('#to').val('<?=date('d-m-Y')?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#soprint').attr('href', '<?php echo site_url('admin/sales_order_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprints').attr('href', '<?php echo site_url('admin/sales_order_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprintd').attr('href', '<?php echo site_url('admin/sales_order_daily_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);



        } else if (date_value == 1) {
            //hide search by type
            //$('#type_holder').slideUp('fast');
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#soprint').attr('href', '<?php echo site_url('admin/sales_order_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprints').attr('href', '<?php echo site_url('admin/sales_order_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprintd').attr('href', '<?php echo site_url('admin/sales_order_daily_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

        } else {
             //show search by type
            //$('#type_holder').slideDown('slow');

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
                $('#soprint').attr('href', '<?php echo site_url('admin/sales_order_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprints').attr('href', '<?php echo site_url('admin/sales_order_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

                $('#soprintd').attr('href', '<?php echo site_url('admin/sales_order_daily_summary_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status + '/' + type_of_sales + "/" + item_id);

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

    //from the get order list page
    $(function() {
       // $('#order_list').DataTable();
        $('#edit_div').slideDown('fast');

    });

    function populate_links(id, order_type, timestamp, track_code, max_timestamp) {
        //call the buttons enabled function immediately

        //scroll to the top
        $('html, .modal').animate({
          scrollTop: ($('#order_list_top').offset().top )
        }, 2500);

        if(max_timestamp == timestamp) {
            buttons_enabled();

        } else {
            buttons_enabled();
            $('#soedit').attr('disabled', 'disabled');
            //$('#sopreview').attr('disabled', 'disabled');

        }
        //get all order codes
        //let order_code_array = <?php echo json_encode($order_code_array); ?>;

        for(i = 0; i < order_code_array.length; i++) {

            //check which table row is clicked
            if(timestamp == order_code_array[i]) {

                //change the background of the row
                $('#order_code_' + timestamp).removeAttr('class');
                $('#order_code_' + timestamp).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button

                if(max_timestamp == timestamp) {//only if the current row is selected

                    $('#soedit').attr("onclick", "can_edit_order('"+ id +"', '"+ order_type +"', '"+ timestamp +"', '"+ track_code +"', '"+ max_timestamp +"')");

                } else {

                    showAjaxModal_confirm('Sorry you cannot edit this delivery. There seems to be a newest delivery with the same order code. Look for it and edit it or delete the whole order.', 'Error');

                    //auto close the modal after 5 seconds
                    setTimeout(() => {
                      $('#modal_confirm').click();
                    }, 7000);
                }

                //refund button
                $('#sorefund').attr("onclick", "showAjaxModal_settings('<?php echo site_url('modal/popup_sales/refund_sales_order/'); ?>" + id + "', 'Refund Sales Order')");


                //preview button
                $('#sopreview').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/preview_order/'); ?>" + id + "', 'Preview Sales Order')");

                //delete button

                $('#sodelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/sales_order_pos/delete/'); ?>" + id + "', 'Are you sure you want to delete this Sales Order? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < order_code_array.length; j++) {
                    if(order_code_array[j] != timestamp) {
                        $('#order_code_' + order_code_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        //let order_code_array = <?php echo json_encode($order_code_array); ?>;

        for(i = 0; i < order_code_array.length; i++) {
            $('#order_code_' + order_code_array[i]).removeAttr('style');
        }
    }

    //restrict editing of orders which have more than one payment transaction related
    function can_edit_order(so_code, order_type, timestamp, track_code) {
        //send ajax query to check how many payments are related with this order

        $.ajax({
            url: '<?php echo site_url('admin/can_edit_order/') ?>' + so_code + '/sales',
            type: 'POST',
            dataType: 'json',
            cache: false,
        })
        .done(function(response) {
            if(response.response == 'yes') {
                //$('.close').click();

                //check if it is payment with goods order or payment for negative balance order or just a normal sales order
                if(order_type == 'negative') {
                    //launch the negative balance order editor
                    showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order_negative_bal/'); ?>' + so_code, 'Edit Payment With Goods (Cash Creditor)');

                } else if(order_type == 'goods') {
                    //check if this is the only copy of so code in the payment with goods table. if so, then the user is only trying to do normal editing, else he is editng payment with gooods order
                    if(response.goods_payment == 'goods_payment') {

                      //launch the payment with goods order editor
                      showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/payment_with_goods/'); ?>' + so_code + '/goods/' + timestamp + '/' + track_code, 'Edit Payment With Goods (Goods Creditor)');

                    } else {
                      //launch the normal order editor
                      showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>' + so_code, 'Edit Sales Order');
                    }


                } else {
                    //launch the normal order editor
                    showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>' + so_code, 'Edit Sales Order');
                }


            } else {
                showAjaxModal_confirm('You are not allowed to edit this Sales Order [' + so_code + '] because it is associated with more than one delivery transaction.', 'error');
            }
        });

    }

</script>
