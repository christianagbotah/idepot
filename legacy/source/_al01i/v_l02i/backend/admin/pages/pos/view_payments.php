<style>
    .text-right {
        text-align: right !important;
    }

    .dataTables_filter {
        display: none;
    }

    #view_payment_history_table_processing {
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

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="paymentsadd" onclick="toBackground(); showAjaxModal_payments('<?php echo site_url('modal/popup_sales/payments/'); ?>', 'New Payment')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>
    <?php
        if($level < 3) {
    ?>
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="paymentsedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div> 
    <?php
        }

        if($level == 1) {
    ?>
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="paymentsdelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>
        

    <?php
        }
    ?>
            <div class="col-md-1 col-sm-1 col-lg-1"><a class="btn btn-outline-warning btn-lg" target="_blank" id="cusprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong class="ml-3">Print</strong></div>


            

    </div>

    <hr>

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

        <div class="col-sm-5 col-md-5">
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

        <div class="col-md-1 col-sm-1 col-lg-1">
            <button class="btn btn-success btn-lg" id="psoload">
                <i class="fa fa-2x fa-fw fa-refresh" id="pload-btn-icon"></i>
            </button>
            <br><strong class="ml-3 xs-hidden" id="pload-btn-text">Load</strong>
        </div>

        <!--<div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Payment Type</div>
                </div>
                <select class="form-control" name="payment_type" id="payment_type">
                    <option value="0">All</option>
                    <option value="1">Income</option></option>
                    <option value="2">Receivable</option>
                </select>
            </div>
        </div> 
        <div class="col-sm-3 col-md-3">
            <div class="input-group" id="customer_div" style="display: none;">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Customers</div>
                </div>
                <select class="form-control" name="to_supplier">
                    <option value="0">All</option>
                    <option value="1">GH BUILDERS</option>
                    <option value="2">ENI</option>
                </select>
            </div>

        </div>-->
<!--
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-danger text-light">Status</div>
                </div>
                <select class="form-control" name="search_by_supplier">
                    <option value="1">All</option>
                    <option value="2">Open</option>
                    <option value="3">Received</option>
                </select>
            </div>
        </div>
                -->
    </div>
  
    <hr>

    <?php /*
$payments_array_ids = array();
$this->db->where('payment_type', 'Receivable');
$this->db->or_where('payment_type', 'Income');
$payments_array = $this->db->get('payment')->result_array();*/
?>

<div id="main_data_payment2">
    <div class="row">
        
    
        <table class="table" width="100%" id="view_payment_history_table">
            <thead class="bg-info">
              <tr>
                <th>Date</th>
                <th>Customer</th>
               <!-- <th>SO Code</th>-->
                <th>Invoice Code</th>
                <th>Receipt Code</th>
                <th>Mode of Payment</th>
                <th style="text-align: right">Amount</th>
                <th>Type of Payment</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
            </tbody>
        </table>
    </div>

    <br>
    <hr>
    <!--<div class="row" id="bt_row"></div>-->
    </div>
</div>


<script type="text/javascript">

    $(function() {
        var payments_array_ids = [];
        var bottom_total_row  = '';
        first_datatable_loader();
        selection_controller();
        
        buttons_disabled();
    });
        //by date
    $('#search_by_periods').change(function(event) {
        payment_list_filter();
       //selection_controller();

        $('#pload-btn-icon').addClass('fa-pulse');
        $('#pload-btn-text').removeClass('ml-3');
        $('#pload-btn-text').html('<span class="text-muted">Loading</span>');
        $('#psoload').attr('disabled', 'disabled');


        let date_value = $('#search_by_periods').val();
        let customer_id = $('#search_by_customer').val();


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


        var table = $('#view_payment_history_table').DataTable();


        table.ajax.url(
            "<?php echo site_url("admin/get_cash_received_list/")  ?>" + from + "/"  + to + "/" + customer_id,
        )
        .load();   

        table.on( 'xhr', function () {
            var json = table.ajax.json();
            payments_array_ids = json.payment_ids;



            if(payments_array_ids.length > 0) {
                bottom_total_row = json.bt_row;

                $('#bt_row').html(bottom_total_row.bottom_row);

            } else {
                $('#bt_row').html('');
            }

            $('#pload-btn-icon').removeClass('fa-pulse');
            $('#pload-btn-text').addClass('ml-3');
            $('#pload-btn-text').html('Load');
            $('#psoload').removeAttr('disabled');
            
           // alert(order_codes +' row(s) were loaded' );
        } );    
    });

    //by customer
    $('#search_by_customer').change(function(event) {
        //reload_datatable(); 
        populatePrintButton()     
    });



    $('#from').change(function(event) {
        /* Act on the event */
        //reload_datatable(); 
        populatePrintButton()
    });

    $('#from').keyup(function(event) {
        /* Act on the event */
        //reload_datatable(); 
        populatePrintButton()
    });

    $('#to').change(function(event) {
        /* Act on the event */
       // reload_datatable(); 
       populatePrintButton()
    });

    $('#to').keyup(function(event) {
        /* Act on the event */
        //reload_datatable(); 
        populatePrintButton()
    });

    function populatePrintButton() {

        let customer_id = $('#search_by_customer').val();


        let from = $('#from').val();
        let to = $('#to').val();

        //propagate print button
        $('#cusprint').attr('href', '<?php echo site_url('admin/cash_received_report/') ?>' + from + '/' + to + '/' + customer_id);
    }

    $('#psoload').click(function() {
        //change button icon
        $('#pload-btn-icon').addClass('fa-pulse');
        $('#pload-btn-text').removeClass('ml-3');
        $('#pload-btn-text').html('<span class="text-muted">Loading</span>');
        $(this).attr('disabled', 'disabled');
        reload_datatable();

    })
    //reload datatable
    function reload_datatable() {

        $('#pload-btn-icon').addClass('fa-pulse');
        $('#pload-btn-text').removeClass('ml-3');
        $('#pload-btn-text').html('<span class="text-muted">Loading</span>');
        $('#psoload').attr('disabled', 'disabled');

       // let date_value = $('#search_by_periods').val();
        let customer_id = $('#search_by_customer').val();
        let from = $('#from').val();
        let to = $('#to').val();

        payment_list_filter();

        var table = $('#view_payment_history_table').DataTable();

        table.ajax.url(
            "<?php echo site_url("admin/get_cash_received_list/")  ?>" + from + "/"  + to + "/" + customer_id,
        )
        .load(); 

        //finished loading
        table.on('xhr', function(e) {
            $('#pload-btn-icon').removeClass('fa-pulse');
            $('#pload-btn-text').addClass('ml-3');
            $('#pload-btn-text').html('Load');
            $('#psoload').removeAttr('disabled');
        });        
    }

    //let's disable all the buttons until a payment is selected
    function buttons_disabled() {
        $('#paymentsedit').attr('disabled', 'disabled');
        $('#paymentsdelete').attr('disabled', 'disabled');
        //$('#cusprint').attr('disabled', 'disabled');
    }

    //let's enable all the buttons when a payment is selected
    function buttons_enabled() {
        $('#paymentsedit').removeAttr('disabled');
        $('#paymentsdelete').removeAttr('disabled');
        //$('#cusprint').removeAttr('disabled');
    }


       function populate_links(id, customer_id) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all payments
        //let payments_array = <?php echo json_encode($payments_array_ids); ?>;
        let payments_array = payments_array_ids; //we are actually using the receipt code

        for(i = 0; i < payments_array.length; i++) {

            //check which table row is clicked
            if(id == payments_array[i]) {

                //change the background of the row
                $('#payment_' + id).removeAttr('class');
                $('#payment_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#paymentsedit').attr("onclick", "toBackground(); showAjaxModal_payments('<?php echo site_url('modal/popup_sales/edit_payments/'); ?>" + customer_id + "/" + id + "', 'Edit Payment')");

                //delete button

                $('#paymentsdelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/payments_received/delete/'); ?>" + id + "', 'Are you sure you want to delete this Payment? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < payments_array.length; j++) {
                    if(payments_array[j] != id) {
                        $('#payment_' + payments_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function toBackground() {
        $('.btn').attr('data-dismiss', 'modal');
    }

    /*function populate_links(id, customer_id, invoice_code) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all payments
        let payments_array = <?php echo json_encode($payments_array_ids); ?>;

        for(i = 0; i < payments_array.length; i++) {

            //check which table row is clicked
            if(id == payments_array[i]) {

                //change the background of the row
                $('#payment_' + id).removeAttr('class');
                $('#payment_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#paymentsedit').attr("onclick", "toBackground(); showAjaxModal_payments('<?php echo site_url('modal/popup_sales/edit_payments/'); ?>" + customer_id + "/" + id + "/" + invoice_code + "', 'Edit Payment')");

                //delete button

                $('#paymentsdelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/payments_received/delete/'); ?>" + id + "', 'Are you sure you want to delete this Payment? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < payments_array.length; j++) {
                    if(payments_array[j] != id) {
                        $('#payment_' + payments_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }*/
    //show whether it is a supplier or expenses
    $('#payment_type').change(function(event) {
        /* Act on the event */
        let valSelected = $('select[name="payment_type"]').val();

        if(valSelected == 1) {
            $('#income_div').css('display', 'none');
            $('#customer_div').slideDown('slow');
            $('#income_div').slideUp('slow');
        } else if(valSelected == 2) {
            $('#customer_div').css('display', 'none');
            $('#customer_div').slideUp('slow');
            $('#income_div').slideDown('slow');
        } else {
            $('#customer_div').css('display', 'none');
            $('#income_div').css('display', 'none');
        }
    });

    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        let payments_array = payments_array_ids;

        for(i = 0; i < payments_array.length; i++) {
            $('#payment_' + payments_array[i]).removeAttr('style');
        }
    }


    function first_datatable_loader() {
        let date_value = $('#search_by_periods').val();
        let customer_id = $('#search_by_customer').val();



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
                $('#cusprint').attr('href', '<?php echo site_url('admin/cash_received_report/') ?>' + from + '/' + to + '/' + customer_id);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#view_payment_history_table').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": "<?php echo site_url("admin/get_cash_received_list/")  ?>" + from + "/"  + to + "/" + customer_id,
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
                        { "data": "customer_name" },
                       // { "data": "sales_order_code" },
                        { "data": "invoice_code" },
                        { "data": "receipt_code" },
                        { "data": "paid_to" },
                        { "data": "total_amount", "className": "text-right" },
                        { "data": "sales_type" },
                        { "data": "cashier" },
                    ],
                    "columnDefs": [
                        {
                            "targets": [7],
                            "orderable": false
                        },
                    ]
                });

                myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    payments_array_ids = json.payment_ids;
                    
                    if(payments_array_ids.length > 0) {
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
                $('#cusprint').attr('href', '<?php echo site_url('admin/cash_received_report/') ?>' + from + '/' + to + '/' + customer_id);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#view_payment_history_table').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": "<?php echo site_url("admin/get_cash_received_list/")  ?>" + from + "/"  + to + "/" + customer_id,
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
                        { "data": "customer_name" },
                        //{ "data": "sales_order_code" },
                        { "data": "invoice_code" },
                        { "data": "receipt_code" },
                        { "data": "paid_to" },
                        { "data": "total_amount", "className": "text-right" },
                        { "data": "sales_type" },
                        { "data": "cashier" },
                    ],
                    "columnDefs": [
                        {
                            "targets": [7],
                            "orderable": false
                        },
                    ]
                });

                myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    payments_array_ids = json.payment_ids;
                    
                    if(payments_array_ids.length > 0) {
                        bottom_total_row = json.bt_row;

                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }
                } );


        } else {
             //show search by type 
            $('#type_holder').slideDown('slow');

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
                $('#cusprint').attr('href', '<?php echo site_url('admin/cash_received_report/') ?>' + from + '/' + to + '/' + customer_id);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#view_payment_history_table').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": "<?php echo site_url("admin/get_cash_received_list/")  ?>" + from + "/"  + to + "/" + customer_id,
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
                        { "data": "customer_name" },
                       // { "data": "sales_order_code" },
                        { "data": "invoice_code" },
                        { "data": "receipt_code" },
                        { "data": "paid_to" },
                        { "data": "total_amount", "className": "text-right" },
                        { "data": "sales_type" },
                        { "data": "cashier" },
                    ],
                    "columnDefs": [
                        {
                            "targets": [7],
                            "orderable": false
                        },
                    ]
                });

                myDt.on( 'xhr', function () {
                    var json = myDt.ajax.json();
                    payments_array_ids = json.payment_ids;
                    
                    if(payments_array_ids.length > 0) {
                        bottom_total_row = json.bt_row;



                        $('#bt_row').html(bottom_total_row.bottom_row);

                    } else {
                        $('#bt_row').html('');
                    }
                } );
            });
        } 
    }

    //filtering of order list
    function payment_list_filter() {
        let date_value = $('#search_by_periods').val();
        let customer_id = $('#search_by_customer').val();
        //let status = $('#search_by_status').val();

        selection_controller(); //call this function

        if(date_value == 10) {
                //response is ready
                //$('#from').val('<?=date('d-m-Y') ?>');
                //$('#to').val('<?=date('d-m-Y') ?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#cusprint').attr('href', '<?php echo site_url('admin/cash_received_report/') ?>' + from + '/' + to + '/' + customer_id);

               /* $.ajax({
                    url: '<?php echo site_url('admin/get_cash_received_list/')  ?>' + from + '/' + to + '/' + debtor_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#main_data_payment').slideUp('slow');
                    $('#main_data_payment').slideDown('slow');
                    $('#main_data_payment').html(data);
                });*/
                
        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#cusprint').attr('href', '<?php echo site_url('admin/cash_received_report/') ?>' + from + '/' + to + '/' + customer_id);

            /*$.ajax({
                url: '<?php echo site_url('admin/get_cash_received_list/')  ?>' + from + '/' + to + '/' + debtor_id,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                $('#main_data_payment').slideUp('slow');
                $('#main_data_payment').slideDown('slow');
                $('#main_data_payment').html(data);
            });*/

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
                $('#cusprint').attr('href', '<?php echo site_url('admin/cash_received_report/') ?>' + from + '/' + to + '/' + customer_id);

                /*$.ajax({
                    url: '<?php echo site_url('admin/get_cash_received_list/')  ?>' + from + '/' + to + '/' + debtor_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now

                    $('#main_data_payment').slideUp('slow');
                    $('#main_data_payment').slideDown('slow');
                    $('#main_data_payment').html(data);
                })
                .fail(function(err) {
                    showAjaxModal_confirm(err.responseText, 'Error');
                });*/
                
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
