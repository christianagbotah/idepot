<style>
    .text-right {
        text-align: right !important;
    }

    .dataTables_filter {
        display: none;
    }

    #invoice_list_processing {
        position: absolute;
        top: 100px;
        margin-left: -120px;
        width: 250px;
        background-color: red;
        font-weight: bold;
        color: #ffffff;
    }

</style>

<?php
///get current user's name
  $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

//use get method to retrieve the values of from and to
    if(isset($_GET['from']) && isset($_GET['to'])) {
        $from = $_GET['from'];
        $to = $_GET['to'];
    }
?>

<div class="container">
    <div class="row">
        <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="inadd" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_invoice/'); ?>', 'Create New Invoice')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>
           
    <?php
        if($level == 1) {
    ?>
            
            
           <!--  <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="inedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="indelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

        -->
    <?php
        }
    ?>
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="inpayment"><i class="fa fa-2x fa-fw fa-hand-holding-usd"></i></button><br><strong style="margin-left: -4px">Payment</strong></div>
    <!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-secondary btn-lg" id="inemail"><i class="fa fa-2x fa-fw fa-at"></i></button><br><strong class="ml-3">Email</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="incall"><i class="fa fa-2x fa-fw fa-phone"></i></button><br><strong class="ml-4">Call</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="insms"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-4">SMS</strong></div>

        -->

            <div class="col-md-1 col-sm-1 col-lg-1"><a target="_blank" class="btn btn-outline-warning btn-lg" id="inprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong class="ml-3">Print</strong></div>

            <div class="col-md-3 col-sm-3 col-lg-3"><a target="_blank" class="btn btn-outline-info btn-lg" id="inprint_bulk"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong style="margin-left: -5px">Print Bulk</strong></div>

            <div class="col-sm-4 col-md-4">
                    
            </div>

            <div class="col-md-1 col-sm-1 col-lg-1">
                <button class="btn btn-success btn-lg" id="insoload">
                    <i class="fa fa-2x fa-fw fa-refresh" id="inload-btn-icon"></i>
                </button>
                <br><strong class="ml-3 xs-hidden" id="inload-btn-text">Load</strong>
            </div>

    </div>

        <hr>
     <?php
echo form_open(site_url('admin/sales_order_search'),
    array('class' => 'form-horizontal form-groups-bordered', 'target' => '_top')); ?>
    <div class="form-group row">
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
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Customers</div>
                </div>
                <select required="true" class="form-control select2" name="search_by_customer" id="search_by_customer">
                    <option value="0">All</option>
                    <?php foreach ($customers_array_add as $crow): ?>
                    <option value="<?=$crow['customer_id'];?>"><?=$crow['customer_name'];?></option>
                    <?php endforeach;?>
                </select>
            </div>
        </div>

        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-danger text-light">Status</div>
                </div>
                <select class="form-control" name="search_by_status" id="search_by_status">
                    <option value="All">All</option>
                    <option value="Unpaid">Unpaid</option>
                    <option value="Partially_Paid">Partially Paid</option>
                    <option value="Paid">Paid</option>
                    <option value="Over_Paid">Over Paid</option>
                </select>
            </div>
        </div>
    </div>
    </form>

    <hr>
    
    <div id="main_data2">

        <div class="row">
        <table class="table" width="100%" id="invoice_list">
            <thead class="bg-info">
              <tr>
                <th>Date</th>
                <th>Invoice No</th>
                <th>Order Code</th>
                <th>Customer</th>
                <th>Status</th>
                <th style="text-align: right">Amount</th>
                <th style="text-align: right">Amount Paid</th>
                <th style="text-align: right">Amount Due</th>
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
    $(function() {
        var invoice_ids_array = [];
        var bottom_total_row  = '';
        first_datatable_loader();
        selection_controller();
        
        buttons_disabled();
    });
        //by date
    $('#search_by_periods').change(function(event) {
        invoice_list_filter();
       //selection_controller();

        $('#inload-btn-icon').addClass('fa-pulse');
        $('#inload-btn-text').removeClass('ml-3');
        $('#inload-btn-text').html('<span class="text-muted">Loading</span>');
        $('#insoload').attr('disabled', 'disabled');

        let date_value = $('#search_by_periods').val();
        let customer_id = $('#search_by_customer').val();
        let status = $('#search_by_status').val();


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


        var table = $('#invoice_list').DataTable();


        table.ajax.url(
            '<?php echo site_url('admin/get_invoice_list/')  ?>' + from + '/' + to + '/' + customer_id + '/' + status,
        )
        .load();   

        table.on( 'xhr', function () {
            var json = table.ajax.json();
            invoice_ids_array = json.invoice_ids;



            if(invoice_ids_array.length > 0) {
                bottom_total_row = json.bt_row;

                $('#bt_row').html(bottom_total_row.bottom_row);

            } else {
                $('#bt_row').html('');
            }
            
            $('#inload-btn-icon').removeClass('fa-pulse');
            $('#inload-btn-text').addClass('ml-3');
            $('#inload-btn-text').html('Load');
            $('#insoload').removeAttr('disabled');
            
        } );    
    });

    //by customer
    $('#search_by_customer, #search_by_status, #from, #to').on('change keyup', populatePrintButton);

    function populatePrintButton() {
        $('#inprint_bulk').attr('href', '<?php echo site_url('admin/invoice_report/') ?>' + $('#from').val() + '/' + $('#to').val() + '/' + $('#search_by_customer').val() + '/' + $('#search_by_status').val());
    }



    
    $('#insoload').click(function() {
        $('#inload-btn-icon').addClass('fa-pulse');
        $('#inload-btn-text').removeClass('ml-3').html('<span class="text-muted">Loading</span>');
        $(this).attr('disabled', 'disabled');
        reload_datatable();
    });

    function reload_datatable() {
        $('#inload-btn-icon').addClass('fa-pulse');
        $('#inload-btn-text').removeClass('ml-3').html('<span class="text-muted">Loading</span>');
        $('#insoload').attr('disabled', 'disabled');
        invoice_list_filter();
        var table = $('#invoice_list').DataTable();
        table.ajax.url('<?php echo site_url('admin/get_invoice_list/')  ?>' + $('#from').val() + '/' + $('#to').val() + '/' + $('#search_by_customer').val() + '/' + $('#search_by_status').val()).load();
        table.on('xhr', function(e) {
            $('#inload-btn-icon').removeClass('fa-pulse');
            $('#inload-btn-text').addClass('ml-3').html('Load');
            $('#insoload').removeAttr('disabled');
        });
    }

     //let's disable all the buttons until a supplier is selected
    function buttons_disabled() {
        $('#inedit, #indelete, #inemail, #inprint, #incall, #inpayment, #insms').attr('disabled', 'disabled');
    }

    function buttons_enabled() {
        $('#inedit, #indelete, #inemail, #inprint, #incall, #inpayment, #insms').removeAttr('disabled');
    }


    function first_datatable_loader() {
        let date_value = $('#search_by_periods').val();
        let customer_id = $('#search_by_customer').val();
        let status = $('#search_by_status').val();



        if(date_value == 10) {

                 //show search by type 
                //$('#type_holder').slideDown('slow');
                //response is ready
                //$('#from').val('<?=date('d-m-Y') ?>');
                //$('#to').val('<?=date('d-m-Y') ?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#inprint_bulk').attr('href', '<?php echo site_url('admin/invoice_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#invoice_list').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": '<?php echo site_url('admin/get_invoice_list/')  ?>' + from + '/' + to + '/' + customer_id + '/' + status,
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
                        { "data": "date" },
                        { "data": "invoice_code" },
                        { "data": "sales_order_code" },
                        { "data": "customer_name" },
                        { "data": "status" },
                        { "data": "total_amount", "className": "text-right"},
                        { "data": "amount_paid", "className": "text-right" },
                        { "data": "amount_due", "className": "text-right" },
                        { "data": "cashier" }
                    ],
                    "columnDefs": [
                        {
                            "targets": [8],
                            "orderable": false
                        },
                    ]
                });

                myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    invoice_ids_array = json.invoice_ids;
                    
                    if(invoice_ids_array.length > 0) {
                        bottom_total_row = json.bt_row;

                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }
                } );
                
        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#inprint_bulk').attr('href', '<?php echo site_url('admin/invoice_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#invoice_list').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": '<?php echo site_url('admin/get_invoice_list/')  ?>' + from + '/' + to + '/' + customer_id + '/' + status,
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
                        { "data": "date" },
                        { "data": "invoice_code" },
                        { "data": "sales_order_code" },
                        { "data": "customer_name" },
                        { "data": "status" },
                        { "data": "total_amount", "className": "text-right"},
                        { "data": "amount_paid", "className": "text-right" },
                        { "data": "amount_due", "className": "text-right" },
                        { "data": "cashier" }
                    ],
                    "columnDefs": [
                        {
                            "targets": [8],
                            "orderable": false
                        },
                    ]
                });

                myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    invoice_ids_array = json.invoice_ids;
                    
                    if(invoice_ids_array.length > 0) {
                        bottom_total_row = json.bt_row;

                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }
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
                $('#inprint_bulk').attr('href', '<?php echo site_url('admin/invoice_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#invoice_list').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": '<?php echo site_url('admin/get_invoice_list/')  ?>' + from + '/' + to + '/' + customer_id + '/' + status,
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
                        { "data": "date" },
                        { "data": "invoice_code" },
                        { "data": "sales_order_code" },
                        { "data": "customer_name" },
                        { "data": "status" },
                        { "data": "total_amount", "className": "text-right"},
                        { "data": "amount_paid", "className": "text-right" },
                        { "data": "amount_due", "className": "text-right" },
                        { "data": "cashier" }
                    ],
                    "columnDefs": [
                        {
                            "targets": [8],
                            "orderable": false
                        },
                    ]
                });

                myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    invoice_ids_array = json.invoice_ids;
                    
                    if(invoice_ids_array.length > 0) {
                        bottom_total_row = json.bt_row;



                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }
                } );
            });
        } 
    }


    

    //filtering of invoice list
    function invoice_list_filter() {
        let date_value = $('#search_by_periods').val();
        //let type_of_sales = $('#search_by_type').val();
        let customer_id = $('#search_by_customer').val();
        let status = $('#search_by_status').val();

        selection_controller(); //call this function

        if(date_value == 10) {

                 //show search by type 
                //$('#type_holder').slideDown('slow');
                //response is ready
                //$('#from').val('<?=date('d-m-Y') ?>');
                //$('#to').val('<?=date('d-m-Y') ?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#inprint_bulk').attr('href', '<?php echo site_url('admin/invoice_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status);


               /* $.ajax({
                    url: '<?php echo site_url('admin/get_invoice_list/')  ?>' + from + '/' + to + '/' + customer_id + '/' + status,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#main_data').slideUp('slow');
                    $('#main_data').slideDown('slow');
                    $('#main_data').html(data);
                }) 
                fail(function(er) {
                    alert(er);
                });*/
                
        } else if (date_value == 1) {
            //hide search by type 
            //$('#type_holder').slideUp('fast');
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#inprint_bulk').attr('href', '<?php echo site_url('admin/invoice_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status);

           /* $.ajax({
                url: '<?php echo site_url('admin/get_invoice_list/')  ?>' + from + '/' + to + '/' + customer_id + '/' + status,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                $('#main_data').slideUp('slow');
                $('#main_data').slideDown('slow');
                $('#main_data').html(data);
            });*/

        } else {
             //show search by type 
           // $('#type_holder').slideDown('slow');

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
                $('#inprint_bulk').attr('href', '<?php echo site_url('admin/invoice_report/') ?>' + from + '/' + to + '/' + customer_id + '/' + status);

               /* $.ajax({
                    url: '<?php echo site_url('admin/get_invoice_list/')  ?>' + from + '/' + to + '/' + customer_id + '/' + status,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#main_data').slideUp('slow');
                    $('#main_data').slideDown('slow');
                    $('#main_data').html(data);
                });*/
                
            });
        } 
    }

    function populate_links(id, so_code, invoice_code, customer_id) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all invoice codes
        //let invoice_array = <?php echo json_encode($invoice_ids_array); ?>;
        let invoice_array = invoice_ids_array;

        invoice_code = invoice_code.replace(/ /g, '_');
        //so_code = so_code.replace(/ /g, '_');

        for(i = 0; i < invoice_array.length; i++) {

            //check which table row is clicked
            if(id == invoice_array[i]) {

                //change the background of the row
                $('#invoice_id_' + id).removeAttr('class');
                $('#invoice_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                if(so_code == 'Opening Balance') {
                    $('#inedit').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_customer/'); ?>" + customer_id + "', 'Edit Customer')");
                } else {
                    $('#inedit').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>" + so_code + "', 'Edit Sales Order')");
                }


                //delete button

                $('#indelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/sales_order/delete/invoice/'); ?>" + invoice_code + "/" + id + "', 'Are you sure you want to delete this Invoice? All related records will be deleted permanently.')");

                //payment button
                $('#inpayment').attr("onclick", "showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/payments_select/'); ?>" + invoice_code + "/" + id + "', 'New Payment'), clearModals()");

                //print button
                $('#inprint').attr("href", "<?php echo site_url('admin/invoice_print/'); ?>" + customer_id + "/" + so_code + "/" + invoice_code, "clearModals()");

            } else {
                for(j = 0; j < invoice_array.length; j++) {
                    if(invoice_array[j] != id) {
                        $('#invoice_id_' + invoice_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function deselect_all() {
        buttons_disabled();
        invoice_ids_array.forEach(id => $('#invoice_id_' + id).removeAttr('style'));
    }

    function clearModals() {
        $('.close').click();
    }


    function selection_controller() {
        const isCustomDate = $('#search_by_periods').val() == 10;
        $('#from, #to').attr('disabled', !isCustomDate);
    }
</script>
