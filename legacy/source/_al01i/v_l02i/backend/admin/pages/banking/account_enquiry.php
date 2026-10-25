
<div class="container-fluid">
    <div class="row">
         <!--<div class="col-md-1 col-sm-1 col-lg-1"><a class="btn btn-outline-warning btn-lg" target="_blank" id="bkprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong class="ml-3">Print</strong></div>-->
    </div>

    <hr>
     <?php
//currency
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

//use get method to retrieve the values of from and to
if (isset($_GET['from']) && isset($_GET['to'])) {
	$from = $_GET['from'];
	$to = $_GET['to'];
}

echo form_open(site_url('admin/sales_order_search'),
	array('class' => 'form-horizontal form-groups-bordered', 'target' => '_top'));?>
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

        <div class="col-sm-4 col-md-4">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Account</div>
                </div>
                <select class="form-control" name="search_by_account" id="search_by_account">
                    <option value="0">All</option>
                    <?php
$this->db->where('account_is_transferrable', 1);
$accounts = $this->db->get('accounts')->result_array();

foreach ($accounts as $acc):

?>
                        <option value="<?=$acc['account_id'];?>"><?=$acc['name'];?></option>
                        <?php
endforeach;
?>

                </select>
            </div>
        </div>
    </div>
    </form>
    <hr>
    <div class="row" id="enqueries_holder">

    </div>
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


    //by status
    $('#search_by_account').change(function(event) {
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
        let account_id = $('#search_by_account').val();

        if(date_value == 10) {
                //response is ready
                //$('#from').val('<?=date('d-m-Y')?>');
                //$('#to').val('<?=date('d-m-Y')?>');

                //view update
                let from = $('#from').val();
                let to = $('#to').val();

                //propagate print button
                $('#bkprint').attr('href', '<?php echo site_url('admin/bank_enquery_print/') ?>' + from + '/' + to + '/' + account_id);

                $.ajax({
                    url: '<?php echo site_url('admin/get_bank_enqueries/') ?>' + from + '/' + to + '/' + account_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#enqueries_holder').slideUp('slow');
                    $('#enqueries_holder').slideDown('slow');
                    $('#enqueries_holder').html(data);
                })
                fail(function(er) {
                    alert(er);
                });

        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#bkprint').attr('href', '<?php echo site_url('admin/bank_enquery_print/') ?>' + from + '/' + to + '/' + account_id);

            $.ajax({
                url: '<?php echo site_url('admin/get_bank_enqueries/') ?>' + from + '/' + to + '/' + account_id,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                $('#enqueries_holder').slideUp('slow');
                $('#enqueries_holder').slideDown('slow');
                $('#enqueries_holder').html(data);
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
                $('#bkprint').attr('href', '<?php echo site_url('admin/bank_enquery_print/') ?>' + from + '/' + to + '/' + account_id);

                $.ajax({
                    url: '<?php echo site_url('admin/get_bank_enqueries/') ?>' + from + '/' + to + '/' + account_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#enqueries_holder').slideUp('slow');
                    $('#enqueries_holder').slideDown('slow');
                    $('#enqueries_holder').html(data);
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
