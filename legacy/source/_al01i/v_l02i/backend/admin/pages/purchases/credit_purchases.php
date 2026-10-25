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
<div class="container">
    <div class="row">
        <!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="cuadd" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add New Customer')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>
-->
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="cuedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <!--

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="cudelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-secondary btn-lg" id="cuemail"><i class="fa fa-2x fa-fw fa-at"></i></button><br><strong class="ml-3">Email</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="cusms"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-3">SMS</strong></div>


            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-dark btn-lg" id="cuorder"><i class="fa fa-2x fa-fw fa-cash-register"></i></button><br><strong class="ml-3">Order</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="cuinvoice"><i class="fa fa-2x fa-fw fa-file-invoice"></i></button><br><strong class="ml-1">Invoice</strong></div>
    -->
            <div class="col-md-1 col-sm-1 col-lg-1" style="display: none;" id="payment_holder"><button class="btn btn-outline-success btn-lg" id="cupayment"><i class="fa fa-2x fa-fw fa-donate"></i></button><br><strong style="margin-left: -5px">Payment</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><a target="_blank" class="btn btn-outline-warning btn-lg" id="crprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong style="margin-left: 7px">Print</strong></div>


    </div>
    <hr>
         <?php
       echo form_open(site_url('admin/credit_purchases_search') ,
        array('class' => 'form-horizontal form-groups-bordered','target'=>'_top')); ?>
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

                    <?php
$this->db->select('supplier_id');
$this->db->distinct();
$suppliers_add = $this->db->get_where('accounts_payable', array('amount_due >' => 0));
$suppliers_array_add = $suppliers_add->result_array();

$supplier_ids = array();

foreach ($suppliers_array_add as $srow):
    array_push($supplier_ids, $srow['supplier_id']);
endforeach;


?>
        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Creditors</div>
                </div>
                <select required="true" class="form-control select2" onchange="populate_edit_button($(this).val())" name="search_by_creditor" id="search_by_creditor"><option value="0">All</option>
                <?php 
                for ($i = 0; $i < count($supplier_ids); $i++): ?>
                    <option value="su_<?=$supplier_ids[$i];?>"><?=$this->db->get_where('suppliers', array('supplier_id' => $supplier_ids[$i]))->row()->supplier_name;?></option><?php  
                endfor;
                ;?>
            </select>
            </div>
        </div>
<!--
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-danger text-light">Status</div>
                </div>
                <select class="form-control" name="search_by_creditor">
                    <option value="1">All</option>
                    <option value="2">Open</option>
                    <option value="3">Received</option>
                </select>
            </div>
        </div>
                -->
    </div>
    </form>

<div id="main_data_acp">
   

   
    </div>
</div>


<script type="text/javascript">
    $(function() {
       // $('#customers_list').DataTable();
        buttons_disabled();
    });

    //let's disable all the buttons until a customer is selected
    function buttons_disabled() {
        //$('#cuedit').attr('disabled', 'disabled');
        $('#cudelete').attr('disabled', 'disabled');
        $('#cuemail').attr('disabled', 'disabled');
        $('#cusms').attr('disabled', 'disabled');
        $('#custatement').attr('disabled', 'disabled');
        $('#cupayment').attr('disabled', 'disabled');
        $('#cuinvoice').attr('disabled', 'disabled');
        $('#cuorder').attr('disabled', 'disabled');
    }

    //let's enable all the buttons when a customer is selected
    function buttons_enabled() {
       // $('#cuedit').removeAttr('disabled');
        $('#cudelete').removeAttr('disabled');
        $('#cuemail').removeAttr('disabled');
        $('#cusms').removeAttr('disabled');
        $('#custatement').removeAttr('disabled');
        $('#cupayment').removeAttr('disabled');
        $('#cuinvoice').removeAttr('disabled');
        $('#cuorder').removeAttr('disabled');
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
    $('#search_by_creditor').change(function(event) {
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
        let date_value = $('#search_by_periods').val();
        let creditor_id = $('#search_by_creditor').val();
        //let status = $('#search_by_status').val();
        if(date_value == 10) {
                //response is ready
                //$('#from').val('<?=date('d-m-Y') ?>');
                //$('#to').val('<?=date('d-m-Y') ?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#crprint').attr('href', '<?php echo site_url('admin/credit_purchases_report/') ?>' + from + '/' + to + '/' + creditor_id);

                $.ajax({
                    url: '<?php echo site_url('admin/get_credit_purchases_list/')  ?>' + from + '/' + to + '/' + creditor_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#main_data_acp').slideUp('slow');
                    $('#main_data_acp').slideDown('slow');
                    $('#main_data_acp').html(data);
                });
                
        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#crprint').attr('href', '<?php echo site_url('admin/credit_purchases_report/') ?>' + from + '/' + to + '/' + creditor_id);

            $.ajax({
                url: '<?php echo site_url('admin/get_credit_purchases_list/')  ?>' + from + '/' + to + '/' + creditor_id,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                $('#main_data_acp').slideUp('slow');
                $('#main_data_acp').slideDown('slow');
                $('#main_data_acp').html(data);
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
                $('#crprint').attr('href', '<?php echo site_url('admin/credit_purchases_report/') ?>' + from + '/' + to + '/' + creditor_id);

                $.ajax({
                    url: '<?php echo site_url('admin/get_credit_purchases_list/')  ?>' + from + '/' + to + '/' + creditor_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now

                    $('#main_data_acp').slideUp('slow');
                    $('#main_data_acp').slideDown('slow');
                    $('#main_data_acp').html(data);
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