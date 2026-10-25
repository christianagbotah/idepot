<?php
///get current user's name
  $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
?>
<div class="container-fluid">
    <div class="row">

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="paymentsadd" onclick="toBackground(); showAjaxModal_payments('<?php echo site_url('modal/popup_purchases/payments/'); ?>', 'New Payment')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>
    <?php
        if($level == 1 || $level == 2) {
    ?>
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="paymentsedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="paymentsdelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>
    <?php 
        }
    ?>

        <div class="col-md-1 col-sm-1 col-lg-1"><a class="btn btn-outline-warning btn-lg" target="_blank" id="paymentprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong class="ml-3">Print</strong></div>
    </div>

     <hr>
     <?php
echo form_open(site_url('admin/expenses_report'),
    array('class' => 'form-horizontal form-groups-bordered', 'target' => '_top')); ?>
    <div class="form-group row">
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
    </form>
    <hr>
    <div class="container-fluid col-lg-12 col-md-12 col-sm-12">
        <div id="main_data_payment">
            <center>
                <div>
                    <h3>Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3>
                    <h5>Loading your data</h5>
                </div>
            </center>
        </div>
    </div>

<script type="text/javascript">

    $(function() {
        $('#view_accounts_payable_table').DataTable();
        buttons_disabled();
    });

    //let's disable all the buttons until a payment is selected
    function buttons_disabled() {
        $('#paymentsedit').attr('disabled', 'disabled');
        $('#paymentsdelete').attr('disabled', 'disabled');
    }

    //let's enable all the buttons when a payment is selected
    function buttons_enabled() {
        $('#paymentsedit').removeAttr('disabled');
        $('#paymentsdelete').removeAttr('disabled');
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
    $('#search_by_debtors').change(function(event) {
        order_list_filter();      
    });

    //by status
    $('#search_by_status').change(function(event) {
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

        $('#main_data_payment').html('<center><div><h3>Please Wait...<i class="fa fa-spinner fa-pulse"></i></h3><h5>Loading your data</h5></div></center>');

        let date_value = $('#search_by_periods').val();
        let debtor_id = $('#search_by_debtors').val();
        //let status = $('#search_by_status').val();
        if(date_value == 10) {
                //response is ready
                //$('#from').val('<?=date('d-m-Y') ?>');
                //$('#to').val('<?=date('d-m-Y') ?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#paymentprint').attr('href', '<?php echo site_url('admin/expenses_report/') ?>' + from + '/' + to);

                $.ajax({
                    url: '<?php echo site_url('admin/get_expenses_list/')  ?>' + from + '/' + to,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    /*$('#main_data_payment').slideUp('slow');
                    $('#main_data_payment').slideDown('slow');*/
                    $('#main_data_payment').html(data);
                })
                .fail(function(err) {
                    $('#main_data_payment').html('<center>' + err.responseText + '</center>');
                });
                
        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#paymentprint').attr('href', '<?php echo site_url('admin/expenses_report/') ?>' + from + '/' + to);

            $.ajax({
                url: '<?php echo site_url('admin/get_expenses_list/')  ?>' + from + '/' + to,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                /*$('#main_data_payment').slideUp('slow');
                $('#main_data_payment').slideDown('slow');*/
                $('#main_data_payment').html(data);
            })
            .fail(function(err) {
                    $('#main_data_payment').html('<center>' + err.responseText + '</center>');
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
                $('#paymentprint').attr('href', '<?php echo site_url('admin/expenses_report/') ?>' + from + '/' + to);

                $.ajax({
                    url: '<?php echo site_url('admin/get_expenses_list/')  ?>' + from + '/' + to,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now

                    /*$('#main_data_payment').slideUp('slow');
                    $('#main_data_payment').slideDown('slow');*/
                    $('#main_data_payment').html(data);
                })
                .fail(function(err) {
                    $('#main_data_payment').html('<center>' + err.responseText + '</center>');
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
