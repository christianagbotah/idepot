<style>
    .text-right {
        text-align: right !important;
    }

    .dataTables_filter {
        display: none;
    }

    /*#daily_cash_received_history_table_processing {
        position: absolute;
        top: 100px;
        margin-left: -120px;
        width: 250px;
        background-color: red;
        font-weight: bold;
        color: #ffffff;
    }*/

</style>

<?php
///get current user's name
  $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

//use get method to retrieve the values of date
    if(isset($_GET['date'])) {
        $date = $_GET['date'];
       
    }
?>

<div class="container">
    <!-- <div class="row">
            <div class="col-md-1 col-sm-1 col-lg-1"><a class="btn btn-outline-warning btn-lg" target="_blank" id="cusprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong class="ml-3">Print</strong></div>

    </div> -->

    <hr>
     <?php
echo form_open(site_url('admin/payments_customer_search'),
	array('class' => 'form-horizontal form-groups-bordered', 'target' => '_top')); ?>
    <div class="form-group row">
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Period</div>
                </div>
                <select class="form-control" name="search_by_periods" id="search_by_periods">
                    <!--<option value="1">All</option>-->
                    <option value="2" selected="selected">Today</option>
                    <option value="3">Yesterday</option>
                    <option value="10">Custom Date</option>
                </select>
            </div>
        </div>

        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-dark text-light">Date</div>
                </div>
                <input type="text" name="date" id="date" class="form-control datepicker" data-format="dd-mm-yyyy" value="<?php echo $date; ?>">
            </div>
        </div>
    </div>
    </form>
    <hr>

<div id="main_data_payment2">
    <div class="row">
        
    
        <table class="table" width="100%" id="daily_cash_received_history_table">
            <thead class="bg-info">
              <tr>
                <th style="text-align: right">CASH SALES</th>
                <th style="text-align: right">CREDIT SALES</th>
                <th style="text-align: right">DEPOSIT</th>
                <th style="text-align: right">CASH</th>
                <th style="text-align: right">MOMO</th>
                <th style="text-align: right">CHEQUE</th>
                <th style="text-align: right">TOTAL SALES</th>
                <th style="text-align: right">EXPENDITURE</th>
                <th style="text-align: right">CASH AVAILABLE</th>
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

        let date_value = $('#search_by_periods').val();


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
                $('#date').val(data.from);

            });

            let date = $('#date').val();


        var table = $('#daily_cash_received_history_table').DataTable();


        table.ajax.url(
            "<?php echo site_url("admin/get_daily_cash_received_list/")  ?>" + date,
        )
        .load();   
    });

    //by customer
    $('#search_by_customer').change(function(event) {
        reload_datatable();      
    });



    $('#date').change(function(event) {
        /* Act on the event */
        reload_datatable(); 
    });

    $('#date').keyup(function(event) {
        /* Act on the event */
        reload_datatable(); 
    });

    
    //reload datatable
    function reload_datatable() {

        let date = $('#date').val();
        payment_list_filter();

        var table = $('#daily_cash_received_history_table').DataTable();

        table.ajax.url(
            "<?php echo site_url("admin/get_daily_cash_received_list/")  ?>" + date,
        )
        .load();         
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


       

    function toBackground() {
        $('.btn').attr('data-dismiss', 'modal');
    }

    

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


        if(date_value == 10) {

                //view update
                let date = $('#date').val();

                //propagate print button
                $('#cusprint').attr('href', '<?php echo site_url('admin/daily_cash_received_report/') ?>' + date);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#daily_cash_received_history_table').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": "<?php echo site_url("admin/get_daily_cash_received_list/")  ?>" + date,
                        "dataType": "json",
                        "type": "POST",
                    },

                    

                    "oLanguage": {
                        "sProcessing": "We're processing it..."
                    },


                    "columns": [
                        { "data": "cash_sales", "className": "text-right" },
                        { "data": "credit_sales", "className": "text-right" },
                        { "data": "deposit", "className": "text-right" },
                        { "data": "cash", "className": "text-right" },
                        { "data": "momo", "className": "text-right" },
                        { "data": "cheque", "className": "text-right" },
                        { "data": "total_sales", "className": "text-right" },
                        { "data": "expenses", "className": "text-right" },
                        { "data": "cash_available", "className": "text-right" },
                    ],
                    "columnDefs": [
                        {
                            "targets": [7],
                            "orderable": false
                        },
                    ]
                });

                
        } else if (date_value == 1) {
            //no date selected

            let date = 0;
            let to = 0;

            //propagate print button
                $('#cusprint').attr('href', '<?php echo site_url('admin/daily_cash_received_report/') ?>' + date);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#daily_cash_received_history_table').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": "<?php echo site_url("admin/get_daily_cash_received_list/")  ?>" + date,
                        "dataType": "json",
                        "type": "POST",
                    },


                    "oLanguage": {
                        "sProcessing": "We're processing it..."
                    },


                    "columns": [
                        { "data": "cash_sales", "className": "text-right" },
                        { "data": "credit_sales", "className": "text-right" },
                        { "data": "deposit", "className": "text-right" },
                        { "data": "cash", "className": "text-right" },
                        { "data": "momo", "className": "text-right" },
                        { "data": "cheque", "className": "text-right" },
                        { "data": "total_sales", "className": "text-right" },
                        { "data": "expenses", "className": "text-right" },
                        { "data": "cash_available", "className": "text-right" },
                    ],
                    "columnDefs": [
                        {
                            "targets": [7],
                            "orderable": false
                        },
                    ]
                });

        } else {
             //show search by type

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
                $('#date').val(data.from);

                //view update
                let date = data.from;

                //propagate print button
                $('#cusprint').attr('href', '<?php echo site_url('admin/daily_cash_received_report/') ?>' + date);

                //for the datatable loading
                $.fn.dataTable.ext.errMode = 'throw';
                var myDt = $('#daily_cash_received_history_table').DataTable({
                    "processing": true,
                    "serverSide": true,
                    "ajax":{
                        "url": "<?php echo site_url("admin/get_daily_cash_received_list/")  ?>" + date,
                        "dataType": "json",
                        "type": "POST",
                    },

                    "oLanguage": {
                        "sProcessing": "We're processing it..."
                    },


                    "columns": [
                        { "data": "cash_sales", "className": "text-right" },
                        { "data": "credit_sales", "className": "text-right" },
                        { "data": "deposit", "className": "text-right" },
                        { "data": "cash", "className": "text-right" },
                        { "data": "momo", "className": "text-right" },
                        { "data": "cheque", "className": "text-right" },
                        { "data": "total_sales", "className": "text-right" },
                        { "data": "expenses", "className": "text-right" },
                        { "data": "cash_available", "className": "text-right" },
                    ],
                    "columnDefs": [
                        {
                            "targets": [7],
                            "orderable": false
                        },
                    ]
                });
            });
        } 
    }

    //filtering of order list
    function payment_list_filter() {
        let date_value = $('#search_by_periods').val();
        //let status = $('#search_by_status').val();

        selection_controller(); //call this function

        if(date_value == 10) {

                //view update
                let date = $('#date').val();

                //propagate print button
                $('#cusprint').attr('href', '<?php echo site_url('admin/daily_cash_received_report/') ?>' + date);
                
        } else if (date_value == 1) {
            //no date selected

            let date = 0;

            //propagate print button
                $('#cusprint').attr('href', '<?php echo site_url('admin/daily_cash_received_report/') ?>' + date);

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

                $('#date').val(data.from);

                //view update
                let date = data.from;

                //propagate print button
                $('#cusprint').attr('href', '<?php echo site_url('admin/daily_cash_received_report/') ?>' + date);
                
            });
        } 
    }

    function selection_controller() {
        /* Act on the event */
        if($('#search_by_periods').val() == 10) {
            $('#date').removeAttr('disabled');
        } else {

            $('#date').attr('disabled', 'disabled');
        }
    }

</script>
