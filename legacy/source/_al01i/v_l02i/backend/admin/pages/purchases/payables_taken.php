
<?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

//use get method to retrieve the values of from and to
    if(isset($_GET['from']) && isset($_GET['to'])) {
        $from = $_GET['from'];
        $to = $_GET['to'];
    }

    $this->db->select('customer_id');
    $this->db->distinct();
    $customers_ids_array = $this->db->get_where('payment_with_goods', array('quantity_picked >' => '0', 'type_of_sales' => 'Payables'))->result_array();

    $firstDate = $this->db->get('sales_order')->first_row()->date_timestamp;

    $firstYear = date('Y', $firstDate);

?>
<div class="container-fluid">
    <div class="row">

            <div class="col-md-1 col-sm-1 col-lg-1"><a href="javascript:void(0)" onclick="PrintElem('#payments')" class="btn btn-outline-warning btn-lg" id="crprintPP"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong style="margin-left: 7px">Print</strong></div>


    </div>
    <hr>
         <?php
       echo form_open(site_url('admin/payables_taken') ,
        array('class' => 'form-horizontal form-groups-bordered','target'=>'_top')); ?>
    <div class="form-group row">
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Period</div>
                </div>
                <select class="form-control" name="search_by_periods" id="search_by_periods">
                    <!-- <option value="1">All</option> -->
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

        <div class="col-sm-4 col-md-4">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Customers</div>
                </div>
                <select class="form-control select2" name="search_by_creditor" id="search_by_creditor">
                    <option value="0">All</option>
                    <?php
                        foreach($customers_ids_array as $cu) {

                            $customer_query = $this->db->get_where('customers', ['customer_id' => $cu['customer_id']])->row();
                            $name = $customer_query->customer_name;
                            ?>
                            <option value="<?=$cu['customer_id'];?>"><?=$name;?></option>
                            <?php
                        }
                    ?>
                </select>
            </div>
        </div> 

        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Below</div>
                </div>
                <select class="form-control" name="search_by_below_year" id="search_by_below_year">
                    <option value="0">All</option>

                    <?php

                        $diff = date('Y') - $firstYear;

                        for($i = 0;  $i <= $diff; $i++) {

                            ?>
                            <option value="<?=$firstYear + $i;?>"><?=$firstYear + $i;?></option>
                            <?php
                        }
                    ?>
                    
                </select>
            </div>
        </div>    
    </div>
    </form>

<div id="main_data_acp"></div>
</div>


<script type="text/javascript">

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

    $('#search_by_below_year').change(function(event) {
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

    /*$('#from').change(function(event) {
        
        order_list_filter();
    });

    $('#from').keyup(function(event) {
       
        order_list_filter();
    });

    $('#to').keyup(function(event) {
        
        order_list_filter();
    });*/

    $('#to').change(function(event) {
      
        order_list_filter();
    });

    

    //filtering of order list
    function order_list_filter() {
        $('#main_data_acp').html('<center><p>Loading data, please wait... <i class="fa fa-spinner fa-pulse"></i></p></center>');

        let date_value = $('#search_by_periods').val();
        let below_year = $('#search_by_below_year').val();
        
        let creditor_id = $('#search_by_creditor').val();
        //let status = $('#search_by_status').val();
        if(date_value == 10) {
                //response is ready

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#crprint').attr('href', '<?php echo site_url('admin/payables_taken_report/') ?>' + from + '/' + to + '/' + creditor_id + '/' + below_year);

                $.ajax({
                    url: '<?php echo site_url('admin/get_payables_taken_list/')  ?>' + from + '/' + to + '/' + creditor_id + '/' + below_year,
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
                $('#crprint').attr('href', '<?php echo site_url('admin/payables_taken_report/') ?>' + from + '/' + to + '/' + creditor_id + '/' + below_year);

            $.ajax({
                url: '<?php echo site_url('admin/get_payables_taken_list/')  ?>' + from + '/' + to + '/' + creditor_id + '/' + below_year,
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
                $('#crprint').attr('href', '<?php echo site_url('admin/payables_taken_report/') ?>' + from + '/' + to + '/' + creditor_id + '/' + below_year);

                $.ajax({
                    url: '<?php echo site_url('admin/get_payables_taken_list/')  ?>' + from + '/' + to + '/' + creditor_id + '/' + below_year,
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










    function PrintElem(elem)
    {
      Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', '', '');
        mywindow.document.write('<!doctype html><html><head><title>DEPOSITS TAKEN</title>');
        //mywindow.document.write('<link rel="stylesheet" href="assets/css/chartjs/dist/Chart.min.css" type="text\/css" \/>');
        mywindow.document.write('<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.css');?>" />');
        mywindow.document.write('<script src="<?php echo base_url('assets/css/chartjs/dist/Chart.js');?>" type="text\/javascript"><\/script>');
        mywindow.document.write('<script type="text\/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"><\/script>');

        mywindow.document.write('<\/head><body style="font-size: 13px">');
        mywindow.document.write(data);

        mywindow.document.write('<\/body><\/html>');
        mywindow.document.close();

        mywindow.onload=function(){
            mywindow.focus();
            mywindow.print();
            mywindow.close();
        }
        
    }
</script>