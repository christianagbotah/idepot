<?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

//use get method to retrieve the values of from and to
if (isset($_GET['from']) && isset($_GET['to'])) {
	$from = $_GET['from'];
	$to = $_GET['to'];
}

$this->db->select('receiver');
$this->db->distinct();
$this->db->from('items_transfers');
$receivers_query = $this->db->get()->result_array();
?>

<div class="container-fluid">
    <div class="row">

            <?php
$level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

//Is the current logged in user the admin -->
if ($level == 1 || $level == 2):
?>

           <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="soadd" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_item_transfer/add_item_transfer/'); ?>', 'Transfer Item')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>



            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="soedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="sodelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <?php
endif;
?>
<!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="sorefund"><i class="fa fa-2x fa-fw fa-refresh"></i></button><br><strong class="ml-2">Refund</strong></div>

             <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="sopreview"><i class="fa fa-2x fa-fw fa-search"></i></button><br><strong>Preview</strong></div>-->

            <!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-secondary btn-lg" id="soemail"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-3">Email</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="socall"><i class="fa fa-2x fa-fw fa-phone"></i></button><br><strong class="ml-4">Call</strong></div>

           <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="soinvoice"><i class="fa fa-2x fa-fw fa-file-invoice"></i></button><br><strong class="ml-1">Invoice</strong></div> -->

            <div class="col-md-1 col-sm-1 col-lg-1"><a target="_blank" class="btn btn-outline-warning btn-lg" id="soprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong class="ml-3">Print</strong></div>

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
                    <option value="1">All</option>
                    <option value="2">Today</option>
                    <option value="3">Yesterday</option>
                    <option value="4" selected>This Week</option>
                    <option value="5">Last Week</option>
                    <option value="6">This Month</option>
                    <option value="7">Last Month</option>
                    <option value="8">This Year</option>
                    <option value="9">Last Year</option>
                    <option value="10">Custom Date</option>>
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
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Receivers</div>
                </div>
                <select class="form-control select2" name="search_by_receivers" id="search_by_receivers">
                    <option value="0">All</option>
                    <?php
foreach ($receivers_query as $receiver): ?>


                            <option value="<?=$receiver['receiver'];?>"><?=$receiver['receiver'];?></option>
                            <?php

endforeach;
?>

                </select>
            </div>
        </div>

    </div>
    </form>
    <hr>
    <div id="main_data">

    </div>
    </div>

<script type="text/javascript">
    $(function() {
        $('#order_list').DataTable();
        buttons_disabled();
    });

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

    function populate_links(id) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all order codes
        let transfer_array = <?php echo json_encode($transfer_array); ?>;

        for(i = 0; i < transfer_array.length; i++) {

            //check which table row is clicked
            if(id == transfer_array[i]) {

                //change the background of the row
                $('#token_no' + id).removeAttr('class');
                $('#token_no' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#soedit').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_item_transfer/edit_item_transfer/'); ?>" + id + "', 'Edit Transfer')");

                //delete button
                $('#sodelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/items_transfer/delete/'); ?>" + id + "', 'Are you sure you want to delete this Transfer? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < transfer_array.length; j++) {
                    if(transfer_array[j] != id) {
                        $('#token_no' + transfer_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        let transfer_array = <?php echo json_encode($transfer_array); ?>;

        for(i = 0; i < transfer_array.length; i++) {
            $('#token_no' + transfer_array[i]).removeAttr('style');
        }
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

    $('#search_by_receivers').change(function(event) {
        selection_controller();
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
        let search_by_receivers = $('#search_by_receivers').val();

        search_by_receivers = search_by_receivers.replace(/ /g, '-');//replace spaces with -
        search_by_receivers = search_by_receivers.replace(/\//g, '_');//replace / with _
        search_by_receivers = search_by_receivers.replace(/&/g, '00');//replace  with _




        if(date_value == 10) {
                //response is ready
                //$('#from').val('<?=date('d-m-Y')?>');
                //$('#to').val('<?=date('d-m-Y')?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();
                
                //propagate print button
                $('#soprint').attr('href', '<?php echo site_url('admin/item_transfer_report/') ?>' + from + '/' + to + '/' + search_by_receivers);
                
                $.ajax({
                    url: '<?php echo site_url('admin/get_item_transfer_list/') ?>' + from + '/' + to + '/' + search_by_receivers,
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
                $('#soprint').attr('href', '<?php echo site_url('admin/item_transfer_report/') ?>' + from + '/' + to + '/' + search_by_receivers);

            $.ajax({
                url: '<?php echo site_url('admin/get_item_transfer_list/') ?>' + from + '/' + to + '/' + search_by_receivers,
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
            .fail(function(err) {
                showAjaxModal_confirm(err.responseText, 'Error');
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
                $('#soprint').attr('href', '<?php echo site_url('admin/item_transfer_report/') ?>' + from + '/' + to + '/' + search_by_receivers);

                $.ajax({
                    url: '<?php echo site_url('admin/get_item_transfer_list/') ?>' + from + '/' + to + '/' + search_by_receivers,
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
