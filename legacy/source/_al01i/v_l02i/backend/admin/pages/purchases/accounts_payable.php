
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
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="cuadd" onclick="showAjaxModal_data_create('<?php //echo site_url('modal/popup_sales/add_customer/'); ?>', 'Add New Customer')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="cuedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            

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

    <div class="form-group row">
        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-success text-light">Period: </div>
                </div>
                <select class="form-control" name="search_by_periods" id="search_by_periods">
                    <option value="1">All</option>
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

                    <?php

$supplier_ids = array();


//those customers with negative balance
$this->db->select('customer_id');
$this->db->distinct();
$customers = $this->db->get_where('invoice', array('amount_due <' => 0));
$customers_array = $customers->result_array();

$customer_ids_n = array();

foreach ($customers_array as $crow):
    array_push($customer_ids_n, $crow['customer_id']);
endforeach;

//customers who still have some goods with us, yet have paid for all
$this->db->select('customer_id');
$this->db->distinct();
$this->db->where('quantity_due >', 0);
$customer_id_query = $this->db->get('sales_order');

if ($customer_id_query->num_rows() > 0) {
  $customer_id_array = $customer_id_query->result_array();

  $customer_ids = array();
  $amount_payable = 0;
  $amount_receivable = 0;

  foreach ($customer_id_array as $id) {
    array_push($customer_ids, $id['customer_id']);
  }

}

//for those customers who have not taken all their products
for ($i = 0; $i < count($customer_ids); $i++) {
    $quantity_owe_array = $this->db->get_where('sales_order', array('customer_id' => $customer_ids[$i], 'quantity_due >' => 0))->result_array();

    foreach ($quantity_owe_array as $owe) {
        $amount_payable += $owe['price'] * $owe['quantity_due'];
        $amount_receivable = $owe['grand_total'] - $owe['amount_paid'];
    }

}

?>
        <div class="col-sm-3 col-md-3">
            <div class="input-group">
                <div class="input-group-prepend">
                    <div class="input-group-text bg-info text-light">Creditors</div>
                </div>
                <select required="true" class="form-control select2" name="search_by_creditor" id="search_by_creditor"><option value="0">All</option>
                

                <optgroup label="Creditors"><?php 
                for ($c = 0; $c < count($customer_ids_n); $c++): ?>
                    <option value="cn_<?=$customer_ids_n[$c];?>"><?=$this->db->get_where('customers', array('customer_id' => $customer_ids_n[$c]))->row()->customer_name;?></option><?php  
                endfor;

             //for those customers who have not taken all their products
          for ($i = 0; $i < count($customer_ids); $i++) {$quantity_owe_array = $this->db->get_where('sales_order', array('customer_id' => $customer_ids[$i], 'quantity_due >' => 0))->result_array();
          foreach ($quantity_owe_array as $owe) {
        $amount_payable += $owe['price'] * $owe['quantity_due'];
        $amount_receivable = $owe['grand_total'] - $owe['amount_paid']; }

        //if ($amount_payable > $amount_receivable) {
            /**$payable_counter++;
            $grand_total_p += $amount_payable;
            $amount_payable = 0; //reset
            **/
            ?><option value="cg_<?=$customer_ids[$i];?>"><?=$this->db->get_where('customers', array('customer_id' => $customer_ids[$i]))->row()->customer_name;?></option><?php
        //}

      } ?></optgroup>

      <optgroup label="Oustandings">
        <?php 
            //for other outanding debts like loan, TNT etc
            $debt_query = $this->db->get_where('outstanding_debts', array('amount_due >' => 0));
            if($debt_query->num_rows() > 0) {
                $debt_array = $debt_query->result_array();

                foreach($debt_array as $debt):
                        ?>
        <option value="de_<?=$debt['debt_id'] ?>"><?=$debt['name']; ?></option>
    <?php endforeach; 
        }
     ?>
    </optgroup>
    </select>
            </div>
        </div>

        <div class="col-md-1 col-sm-1 col-lg-1">
            <button class="btn btn-success btn-lg" id="asoload">
                <i class="fa fa-2x fa-fw fa-refresh" id="aload-btn-icon"></i>
            </button>
            <br><strong class="ml-3 xs-hidden" id="aload-btn-text">Load</strong>
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


<div id="main_data_acp">
   

   
    </div>
</div>


<script type="text/javascript">

    $(function() {
       //$('#customers_list').DataTable();
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
        
        if($(this).val() != 10) {

            order_list_filter(); 
        }     

    });

    //by supplier
    $('#search_by_creditor').change(function(event) {
        //order_list_filter();   
        populatePrintButton();

    });

    //by status


    $('#from').change(function(event) {
        /* Act on the event */
        //order_list_filter();
        populatePrintButton()
    });

    $('#from').keyup(function(event) {
        /* Act on the event */
        //order_list_filter();
        populatePrintButton()
    });

    $('#to').change(function(event) {
        /* Act on the event */
        //order_list_filter();
        populatePrintButton()
    });

    $('#to').keyup(function(event) {
        /* Act on the event */
        //order_list_filter();
        populatePrintButton()
    });

    function populatePrintButton() {

        let creditor_id = $('#search_by_creditor').val();

        let from = $('#from').val();
        let to = $('#to').val();

        //propagate print button
        $('#crprint').attr('href', '<?php echo site_url('admin/accounts_payable_report/') ?>' + from + '/' + to + '/' + creditor_id);
    }


    $('#asoload').click(function() {
        //change button icon
        $('#aload-btn-icon').addClass('fa-pulse');
        $('#aload-btn-text').removeClass('ml-3');
        $('#aload-btn-text').html('<span class="text-muted">Loading</span>');
        $(this).attr('disabled', 'disabled');
        order_list_filter();

    })

    //filtering of order list
    function order_list_filter() {
        $('#main_data_acp').html('<center><p>Loading data, please wait... <i class="fa fa-spinner fa-pulse"></i></p></center>');

        $('#aload-btn-icon').addClass('fa-pulse');
        $('#aload-btn-text').removeClass('ml-3');
        $('#aload-btn-text').html('<span class="text-muted">Loading</span>');
        $('#asoload').attr('disabled', 'disabled');


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
                $('#crprint').attr('href', '<?php echo site_url('admin/accounts_payable_report/') ?>' + from + '/' + to + '/' + creditor_id);

                $.ajax({
                    url: '<?php echo site_url('admin/get_accounts_payable_list/')  ?>' + from + '/' + to + '/' + creditor_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now
                    $('#main_data_acp').slideUp('slow');
                    $('#main_data_acp').slideDown('slow');
                    $('#main_data_acp').html(data);

                    $('#aload-btn-icon').removeClass('fa-pulse');
                    $('#aload-btn-text').addClass('ml-3');
                    $('#aload-btn-text').html('Load');
                    $('#asoload').removeAttr('disabled');
                });
                
        } else if (date_value == 1) {
            //no date selected

            let from = 0;
            let to = 0;

            //propagate print button
                $('#crprint').attr('href', '<?php echo site_url('admin/accounts_payable_report/') ?>' + from + '/' + to + '/' + creditor_id);

            $.ajax({
                url: '<?php echo site_url('admin/get_accounts_payable_list/')  ?>' + from + '/' + to + '/' + creditor_id,
                type: 'POST',
                dataType: 'html',
                cache: false,
            })
            .done(function(data) {
                //change view now
                $('#main_data_acp').slideUp('slow');
                $('#main_data_acp').slideDown('slow');
                $('#main_data_acp').html(data);

                $('#aload-btn-icon').removeClass('fa-pulse');
                $('#aload-btn-text').addClass('ml-3');
                $('#aload-btn-text').html('Load');
                $('#asoload').removeAttr('disabled');
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
                $('#crprint').attr('href', '<?php echo site_url('admin/accounts_payable_report/') ?>' + from + '/' + to + '/' + creditor_id);

                $.ajax({
                    url: '<?php echo site_url('admin/get_accounts_payable_list/')  ?>' + from + '/' + to + '/' + creditor_id,
                    type: 'POST',
                    dataType: 'html',
                    cache: false,
                })
                .done(function(data) {
                    //change view now

                    $('#main_data_acp').slideUp('slow');
                    $('#main_data_acp').slideDown('slow');
                    $('#main_data_acp').html(data);

                    $('#aload-btn-icon').removeClass('fa-pulse');
                    $('#aload-btn-text').addClass('ml-3');
                    $('#aload-btn-text').html('Load');
                    $('#asoload').removeAttr('disabled');
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