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
<div class="container-fluid">
    <div class="row">
        <!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="cuadd" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add New Customer')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>
--> <?php
        if($level == 1) {
    ?>
            <!-- <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="cuedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>
            -->
    <?php 
        }
    ?>
<!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="cudelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-secondary btn-lg" id="cuemail"><i class="fa fa-2x fa-fw fa-at"></i></button><br><strong class="ml-3">Email</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="cusms"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-3">SMS</strong></div>


            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-dark btn-lg" id="cuorder"><i class="fa fa-2x fa-fw fa-cash-register"></i></button><br><strong class="ml-3">Order</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="cuinvoice"><i class="fa fa-2x fa-fw fa-file-invoice"></i></button><br><strong class="ml-1">Invoice</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1" style="display: none;" id="payment_holder"><button class="btn btn-outline-success btn-lg" id="cupayment"><i class="fa fa-2x fa-fw fa-donate"></i></button><br><strong style="margin-left: -5px">Payment</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><a target="_blank" class="btn btn-outline-warning btn-lg" id="cusprint"><i class="fa fa-2x fa-fw fa-print"></i></a><br><strong style="margin-left: 7px">Print</strong></div>

    -->

    </div>
    <hr>

             <?php
       echo form_open(site_url('admin/accounts_payable_search') ,
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
$this->db->select('customer_id');
$this->db->distinct();
$this->db->like('invoice_code', 'Deposit-', 'after');
$customers = $this->db->get_where('invoice', array('amount_due <' => 0));
$customers_array = $customers->result_array();

$customer_ids = array();

foreach ($customers_array as $crow):
    array_push($customer_ids, $crow['customer_id']);
endforeach;

?>
        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Debtors</div>
                </div>
                <select required="true" class="form-control select2" onchange="populate_edit_button($(this).val())"  name="search_by_debtors" id="search_by_debtors"><option value="0">All</option>        

            <?php 
            for ($c = 0; $c < count($customer_ids); $c++): ?>
                <option value="<?=$customer_ids[$c];?>"><?=$this->db->get_where('customers', array('customer_id' => $customer_ids[$c]))->row()->customer_name;?></option><?php  
            endfor;

       ?></select>
            </div>
        </div>
<!--
        <div class="col-sm-2 col-md-2">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-danger text-light">Status</div>
                </div>
                <select class="form-control" name="search_by_debtors">
                    <option value="1">All</option>
                    <option value="2">Open</option>
                    <option value="3">Received</option>
                </select>
            </div>
        </div>
                -->
    </div>
    </form>
<div id="main_data_deposit">
    
</div>


<script type="text/javascript">
    $(function() {
        $('#customers_list').DataTable();
        buttons_disabled();
    });

    //let's disable all the buttons until a customer is selected
    function buttons_disabled() {
        $('#cuedit').attr('disabled', 'disabled');
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
        $('#cuedit').removeAttr('disabled');
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
                /*$('#cusprint').attr('href', '<?php echo site_url('admin/receipt/') ?>' + from + '/' + to);*/

                $.ajax({
                    url: '<?php echo site_url('admin/get_deposit_list/')  ?>' + from + '/' + to + '/' + debtor_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#main_data_deposit').slideUp('slow');
                    $('#main_data_deposit').slideDown('slow');
                    $('#main_data_deposit').html(data);
                });
                
        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;


            $.ajax({
                url: '<?php echo site_url('admin/get_deposit_list/')  ?>' + from + '/' + to + '/' + debtor_id,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                $('#main_data_deposit').slideUp('slow');
                $('#main_data_deposit').slideDown('slow');
                $('#main_data_deposit').html(data);
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


                $.ajax({
                    url: '<?php echo site_url('admin/get_deposit_list/')  ?>' + from + '/' + to + '/' + debtor_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now

                    $('#main_data_deposit').slideUp('slow');
                    $('#main_data_deposit').slideDown('slow');
                    $('#main_data_deposit').html(data);
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





    function populate_links(id, user) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all ids
        let ids_array = <?php echo json_encode($ids_array); ?>;
        let ids_array_sup = <?php echo json_encode($ids_array_sup); ?>;

        if(user == 'customer') {
            for(i = 0; i < ids_array.length; i++) {

            //check which table row is clicked
            if(id == ids_array[i]) {

                //change the background of the row
                $('#customer_id_' + id).removeAttr('class');
                $('#customer_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                } else {
                    for(j = 0; j < ids_array.length; j++) {
                        if(ids_array[j] != id) {
                            $('#customer_id_' + ids_array[j]).removeAttr('style');

                        }
                    }
                }
            }

            for(j = 0; j < ids_array_sup.length; j++) {
                $('#supplier_id_' + ids_array_sup[j]).removeAttr('style');
            }
        } else if(user == 'supplier') {
            for(i = 0; i < ids_array_sup.length; i++) {

            //check which table row is clicked
            if(id == ids_array_sup[i]) {

                //change the background of the row
                $('#supplier_id_' + id).removeAttr('class');
                $('#supplier_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                } else {
                    for(j = 0; j < ids_array_sup.length; j++) {
                        if(ids_array[j] != id) {
                            $('#supplier_id_' + ids_array_sup[j]).removeAttr('style');

                        }
                    }

                    for(j = 0; j < ids_array.length; j++) {
                        $('#customer_id_' + ids_array[j]).removeAttr('style');

                    }
                }
            }

            for(j = 0; j < ids_array.length; j++) {
                $('#customer_id_' + ids_array[j]).removeAttr('style');

            }
        }
    }

    function deselect_all(user) {
        //call the buttons disabled function immediately
        buttons_disabled();
        let ids_array = <?php echo json_encode($ids_array); ?>;
        let ids_array_sup = <?php echo json_encode($ids_array_sup); ?>;

        if(user == 'customer') {
            for(i = 0; i < ids_array.length; i++) {
                $('#customer_id_' + ids_array[i]).removeAttr('style');
            }
        } else if(user == 'supplier') {
            for(i = 0; i < ids_array_sup.length; i++) {
                $('#supplier_id_' + ids_array_sup[i]).removeAttr('style');
            }
        }
    }
</script>