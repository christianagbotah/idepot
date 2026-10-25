<?php
    $this->db->select('general_journal.timestamp, payment_with_goods.date_timestamp');
    $this->db->distinct();
    $this->db->from('general_journal');
    if ($from != 0 && $to != 0) {
        $this->db->where('general_journal.timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
        $this->db->where('payment_with_goods.date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
    }
    $this->db->order_by('general_journal.timestamp', 'asc');
    $this->db->order_by('payment_with_goods.date_timestamp', 'asc');
    $this->db->where('general_journal.customer_id', $customer_id);
    $this->db->join('payment_with_goods', 'payment_with_goods.customer_id = general_journal.customer_id');
    $getTimestamps = $this->db->get()->result_array();

    $timetampHolderStart = [];
    $uniqueTimetampHolderStart = [];

    $timetampHolderEnd = [];
    $uniqueTimetampHolderEnd = [];

    $array_timestamp = [];

    foreach($getTimestamps as $t) {
        $array_timestamp[] = $t['timestamp'];
        $array_timestamp[] = $t['date_timestamp'];
    }

    $array_timestamp_unique = array_values(array_unique($array_timestamp, SORT_NUMERIC));

    sort($array_timestamp_unique, SORT_NUMERIC);
    
    for($i = 0; $i < sizeof($array_timestamp_unique); $i++) {
      

        //get end of each week in the transactions
        $date_week = date('W', strtotime(date('d-m-Y', $array_timestamp_unique[$i])));
        $date_year = date('Y', strtotime(date('d-m-Y', $array_timestamp_unique[$i])));

      //  echo $date_year.'<br/>';

        $weekEndsArray = getStartAndEndDate($date_week, $date_year);

        array_push($timetampHolderStart, strtotime($weekEndsArray['week_starts']));
        array_push($timetampHolderEnd, strtotime($weekEndsArray['week_ends']));
    }


    $uniqueTimetampHolderStart = array_values(array_unique($timetampHolderStart, SORT_NUMERIC));
    $uniqueTimetampHolderEnd = array_values(array_unique($timetampHolderEnd, SORT_NUMERIC));

    sort($uniqueTimetampHolderStart, SORT_NUMERIC);
    sort($uniqueTimetampHolderEnd, SORT_NUMERIC);




?>

<!doctype html>
<html>
    <head>
        <title><?=$page_title;?></title>
        <link rel="stylesheet" href="<?php echo base_url('assets/css/font-icons/entypo/css/entypo.css.min.css'); ?>"/>
        <link rel="stylesheet" href="http://fonts.googleapis.com/css?family=Noto+Sans:400,700,400italic"/>
        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css'); ?>"/>
        <link rel="shortcut icon" href="<?php echo base_url('uploads/school_logo.png'); ?>">
        <!--Chartjs-->
        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js'); ?>" type="text/javascript"></script>

    </head>
    <body>

        <div class="container">
            <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
                <a href="javascript:void(0);" onClick="print_page()">Print Statement</a>
            </div>
            <div class="row">
                <div class="col-lg-12">
                    <div id="print">
                        <?php
//Account section
$currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$system_name = $this->db->get_where('settings', array('type' => 'system_name'))->row()->description;
$location = $this->db->get_where('settings', array('type' => 'location'))->row()->description;
$address = $this->db->get_where('settings', array('type' => 'address'))->row()->description;
$phone = $this->db->get_where('settings', array('type' => 'phone'))->row()->description;

//for opening cash balance query
$opening_cash_row = $this->db->get_where('customers', array('customer_id' => $customer_id));
$opening_cash_balance = $opening_cash_row->row()->opening_balance;

$opening_date = date('d-m-Y', $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->timestamp);

?>



                        <link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.min.css'); ?>"/>
                        <!--Chartjs-->
                        <script src="<?php echo base_url('assets/css/chartjs/dist/Chart.min.js'); ?>" type="text/javascript"></script>
                        <script src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>

                        <style type="text/css">

                             #mark_print th, #grade_table th, #conducts th {
                                /*background-color: grey;*/
                                padding: 5px;
                                color: #000000;
                                border-bottom: 2px solid #e2dddd;
                             }

                             #invoice_table thead tr th {
                                color: #fff !important;
                             }

                              #invoice_table thead {
                                padding: 10px 0px !important;
                              }

                             pre {
                                    display: block;
                                    font-family: monospace;
                                    white-space: pre-wrap;
                                    margin: -40px 0px;
                                    line-height: 20px;
                                }

                             body {
                                font-size: 14px !important;
                             }

                             .account_tb th {
                                background-color: grey;
                                border: 1px solid #e2dddd;
                                padding: 5px;
                                color: white;
                                border-bottom: 1px solid red;
                                text-align: left;
                             }

                            td {
                                padding: 5px;
                            }

                            #grade_table tbody tr td{
                                line-height: 25px;
                            }

                            #term{
                                background-color: black;
                                padding: 5px 15px 5px 15px;
                                border-radius: 9px;
                                font-size: 24px;
                                letter-spacing: 5px;
                                color: #ffffff;

                            }

                            div .logo{
                                position: absolute;
                                margin-top: -40px;
                                left: 10px;
                            }

                            .footer {
                                    position: relative;
                                    bottom: 0px;
                                }

                            div .photo_passport {
                                position: absolute;
                                margin-top: -100px;
                                right: 10px;
                                border-radius: 16% 6%;
                            }

                            page[size="A4"] {
                                    width: 29.7cm;
                                    height: 21cm;
                                    page-break-after: always;
                                }

                                #print_div a {
                                background-color: black;
                                color: #fff;
                                padding: 5px;
                                border-radius: 14px;
                                font-size: 15px;
                                font-weight: bold;
                            }

                            #print_div a:hover {
                                background-color: green;
                                color: #fff;
                            }

                            #promote{
                                position: absolute;
                                    margin-top: -32px;
                                }

                            #status {
                                position: relative;
                                margin-top: -120px;
                                transform: rotate(-45deg);
                            }

                            @media Print{


                                page {
                                background: #ffffff;
                                display: block;
                                margin: 0 auto;
                                margin-bottom: 0.5cm;
                                box-shadow: 0;

                                }

                                .footer {
                                    position: relative;
                                    bottom: 0px;
                                }

                                .footer {
                                    width: 130% !important;
                                }

                                pre {
                                    display: block;
                                    font-family: monospace;
                                    white-space: pre-wrap;
                                    margin: -40px 0px;
                                    line-height: 20px;
                                }

                                page[size="A4"] {
                                    width: 27cm;
                                    height: 29.7cm;
                                    page-break-after: always;
                                }

                                body, page {
                                    margin: 0;
                                    box-shadow: 0;
                                }

                                #print_div {
                                    display: none;
                                }


                                div .logo{
                                    position: absolute;
                                    margin-top: -45px;
                                    left: 10px;
                                }

                                div .photo_passport{
                                    position: absolute;
                                    margin-top: -75px !important;
                                    right: 10px;

                                }

                                #top_row{
                                    margin-top: -15px;
                                }

                                #student_details p{
                                    line-height: 30px;
                                }

                                #promote{
                                    margin-top: -32px;
                                }

                                #box{
                                    margin-top: -10px;
                                }

                                #gh{
                                    margin-top: -15px;
                                }

                                .sign {
                                    position: fixed;
                                    bottom: 5px;
                                }
                            }
                        </style>
<page size="A4">
<center>

<table class="table table-bordered table-striped" style="width:100%; border-collapse:collapse; margin-top: 10px;">
<thead>
</thead>
<tbody>
<tr>
<td width="50%">
   <table class="table table-bordered table-striped" style="margin-top: -10px; border-collapse:collapse;">
        <thead>
            <tr>
            <td>
               <img class="" src="<?php echo base_url(); ?>uploads/school_logo.png" style="max-height : 100px;">
            </td>
            <td>
                <h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;"><?php echo $system_name; ?></h3>
                <pre>
                    <h4 style="font-family: Nunito" align='left'><?php echo trim($address); ?></h4>
                </pre>
            </td>
            </tr>
            <tr style="border-top: 2px solid #1b1b69;">
                <td colspan="2"></td>
            </tr>
        </thead>
    </table>
</td>


<td width="50%">
    <table class="table table-bordered table-striped" style="width: 100%; margin-top: 0px; border-collapse:collapse;">
        <thead>
            <tr>
                <td align="right" colspan="2"><h3 style="font-weight: bold; font-size: 20px; letter-spacing: 2px;">STATEMENT OF ACCOUNTS</h3></td>
            </tr>
            <tr>
                <td align="right">FROM: </td>
                <td align="right"><?=$from == 0 ? $opening_date : $from;?></td>
            </tr>
            <tr>
                <td align="right">TO: </td>
                <td align="right" width="180"><?=$to == 0 ? date('d-m-Y') : $to;?></td>
            </tr>

            <tr>
                <td align="right">BALANCE DUE:</td>
                <td align="right" id="balance_due"></td>
            </tr>
            <tr>
                <td align="right" colspan="2">
                    <h3 style="font-weight: bold; text-align: right; font-size: 20px; letter-spacing: 2px; text-align: right"><?php echo $customer_name; ?></h3>

                    <?php
                        if($customer_phone != '' || $customer_address != ''): ?>
                        
                        <div style="padding: 5px 0px; margin-top: <?=$customer_phone == '' ? '20px' : '40px';?>">
                            <span style="font-family: Nunito; text-align: right;"><?php echo trim($customer_phone); ?></span>
                            <pre>
                                
                                <span style="font-family: Nunito; text-align: right"><?php echo trim($customer_address); ?></span>
                            </pre>
                        </div>

                    <?php endif; ?>
                </td>
            </tr>

            <tr style="border-top: 2px solid #1b1b69;">
                <td colspan="2"></td>
            </tr>
        </thead>
    </table>
</td>
</tr>
</tbody>
</table>
</center>



<div class="row">
<div class="col-lg-12 col-md-12">
<div class="table table-responsive" style="">
<table class="table table-bordered table-striped" id="invoice_table" style="width:100%; border-collapse:collapse; border-left: 1px solid #000; border-bottom: 1px solid #000; margin-top: 10px;">
<thead style="background-color: #4242ad; padding: 30px;">
    <tr style="height: 30px; border-right: 1px solid #fff;">
        <th style="text-align: left; border-right: 1px solid #000">Date</th>
        <th style="text-align: left; border-right: 1px solid #000">SO Code</th>
        <th style="text-align: left; border-right: 1px solid #000">Invoice Code</th>
        <th style="text-align: left; border-right: 1px solid #000">Invoice Status</th>
        <th style="text-align: left; border-right: 1px solid #000">Journal</th>
        <th style="text-align: center; border-right: 1px solid #000">Items & Picking Details</th>
        <th style="text-align: right; border-right: 1px solid #000">Debit(Debts)</th>
        <th style="text-align: right; border-right: 1px solid #000">Credit(Payments)</th>
        <th style="text-align: right; border-right: 1px solid #000">Balance</th>

    </tr>
</thead>
<tbody>
<?php

$order_code_array = array();
$prev_balance_array = [0];

$prev_balance = 0;

$balance_tempt = 0;
$d_balance_tempt = 0;
$c_balance_tempt = 0;

$balance = 0;
$d_balance = 0;
$c_balance = 0;
$qty_balance = 0;
$qty_left_balance = 0;

$grand_dr = 0;
$grand_cr = 0;
$grand_bal = 0;


$week_counter = 0;

for($i = 0; $i < sizeof($uniqueTimetampHolderStart); $i++): //each end of week starts

$week_counter++;
//for sales query
$this->db->select('so_code');
$this->db->distinct();
//if ($from != 0 && $to != 0) {
    //$this->db->where('general_journal.timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
    //$this->db->where('payment_with_goods.date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
    $this->db->where('payment_with_goods.date_timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
//}
 //$this->db->where('general_journal.timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
 
//$this->db->order_by('general_journal.timestamp', 'asc');
$this->db->order_by('payment_with_goods.date_timestamp', 'asc');
//$this->db->join('payment_with_goods', 'payment_with_goods.customer_id = general_journal.customer_id');
$statement_query = $this->db->get_where('payment_with_goods', array('payment_with_goods.customer_id' => $customer_id));


if ($statement_query->num_rows() > 0) {
    $statement_array = $statement_query->result_array();
}



//$total_amount = 0;
//$total_amount_sell = 0;
/****************************************
 *FOR OPENING CASH BALANCE
 ****************************************/
if($i == 0): //do show this only once
    if ($opening_cash_balance != 0) {
        if ($opening_cash_row->num_rows() > 0) {
            ?>

            <tr style="border-bottom: 1px solid #000;">
                <td style="border-right: 1px solid #000;" align="left"><?=$opening_date;?></td>
                <td style="border-right: 1px solid #000;" align="left">Opening Cash Balance</td>
                <td style="border-right: 1px solid #000;" align="left">Opening Cash Balance</td>
                <td style="border-right: 1px solid #000;" align="center">-</td>
                <td style="border-right: 1px solid #000;" align="center">-</td>
                <td style="border-right: 1px solid #000;" align="center">-</td>



                <?php
        if ($opening_cash_balance < 0) {
                //negative balance so make a credit balance
                ?>
                        <td style="border-right: 1px solid #000;" align="right"></td>
                        <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, abs($opening_cash_balance), $currency);?></td>

                        <?php
        $c_balance += abs($opening_cash_balance);

                //do the increments
                $balance = (0 - $c_balance);

            } else {
                ?>
                        <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $opening_cash_balance, $currency);?></td>
                        <td style="border-right: 1px solid #000;" align="right"></td>

                        <?php
        $d_balance += $opening_cash_balance;

                //do the increments
                $balance = $d_balance;
            }

            ?>


                <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $balance, $currency);?></td>
            </tr>

            <?php //end of opening cash balance entry

        } //show opening cash balance only if it is avaible at the selected date query
    } //show only if the opening cash balance is not equal to 0;
endif;


/****************************************
 *FOR SALES
 ****************************************/
$grand_q_counter = 0;
$grand_q_due_counter = 0;

$c_balance_tempt_holder = 0;//weekly payments by the customer


foreach ($statement_array as $st):


    //for sales
    //if ($from != 0 && $to != 0) {
        //$this->db->where('timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
        $this->db->where('timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
    //}
    
    $qrg = $this->db->get_where('general_journal', array('customer_id' => $customer_id, 'so_code' => $st['so_code'], 'account_name' => 'Accounts Receivable', 'debit_amount !=' => 0));

    if($qrg->num_rows() < 1) {
        //this could be a pickup day so we look through the payment with goods table
        //if ($from != 0 && $to != 0) {
        //$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
        $this->db->where('date_timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
        //}
        
        $qrg = $this->db->get_where('payment_with_goods', array('customer_id' => $customer_id, 'so_code' => $st['so_code']));
    }

    $qr = $qrg->row();

    $date_returned = $qr->timestamp;


    $date_s = date('d-m-Y', $date_returned);


//////////////////////
    $invoice_code = $this->db->get_where('invoice', ['so_code' => $st['so_code'], 'customer_id' => $customer_id])->row()->invoice_code;


////////////////
    $invoice_status = $this->db->get_where('invoice', ['so_code' => $st['so_code'], 'customer_id' => $customer_id])->row()->status;

//////////////////////
    $journal_s = $qr->journal;
    if($journal_s == '') {
        $journal_s = 'Picking';
    }

////////////////////////////
    $description_s = $qr->description;


////////////////////////////
    $debit_amount_s = $qr->debit_amount;

    //don't show so codes like Opening-DP...
    $so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
    $so_code_length = strlen($so_no_prefix) + 8;

    if ($date_s != '01-01-1970') {
        ?>
        <tr style="border-top: 1px solid #000;">
            <td style="border-right: 1px solid #000;" align="left"><?=$date_s;?></td>
            <td style="border-right: 1px solid #000;" align="left"><?=$st['so_code'];?></td>
            <td style="border-right: 1px solid #000;" align="left"><?=$invoice_code;?></td>
            <td style="border-right: 1px solid #000;" align="left"><?=$invoice_status;?></td>
            <td style="border-right: 1px solid #000;" align="left"><?=$journal_s;?></td>


            <?php

        if ($st['so_code'] != 'Opening-balance' && substr($st['so_code'], 0, 5) != 'LREC-') {
            ?>
            <td style="border-right: 1px solid #000; vertical-align: top" align="right">

                <table style="width:100%;">
                    <thead style="background-color: #4242ad; padding: 30px;">
                        <tr>
                            <th style="text-align: left; border-right: 1px solid #000">Date | Time</th>
                            <th style="text-align: left; border-right: 1px solid #000">Item</th>
                            <th style="text-align: right; border-right: 1px solid #000">Qty</th>
                            <th style="text-align: right; border-right: 1px solid #000">Picked</th>
                            <th style="text-align: right; border-right: 1px solid #000">Due</th>
                        </tr>
                    </thead>
                    <tbody>

                        <?php
           //if ($from != 0 && $to != 0) {
                //$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
                $this->db->where('date_timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
            //}
           

            $this->db->where('opening_entry', 0);
            $this->db->select('timestamp');
            $this->db->from('payment_with_goods');
            $this->db->order_by('timestamp', 'asc');
            $this->db->where('so_code', $st['so_code']);
            $this->db->distinct();
            $code_query = $this->db->get();

            //do this if some part of the order was picked
            if (substr($st['so_code'], 0, $so_code_length) == 'Opening-' . $so_no_prefix) {

                if ($code_query->num_rows() == 0) {

                    //if ($from != 0 && $to != 0) {
                        //$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
                        $this->db->where('date_timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
                    //}
                    

                    //$this->db->where('opening_entry', 1);

                    $this->db->select('timestamp');
                    $this->db->from('payment_with_goods');
                    $this->db->order_by('timestamp', 'asc');
                    $this->db->where('so_code', $st['so_code']);
                    $this->db->distinct();
                    $code_query = $this->db->get();
                }
            } //end of adjustment

            $order_code_query = $code_query->result_array();

            //main query

            foreach ($order_code_query as $qt):

                //some counters here
                $item_total_q = 0;
                $item_total_p = 0;
                $item_total_d = 0;

                echo '<tr style="background-color: #99e69f">';

                $this->db->select('*');
                $this->db->from('payment_with_goods');
                $this->db->where('so_code', $st['so_code']);
                $this->db->where('timestamp', $qt['timestamp']);
                $items_found_array = $this->db->get()->result_array();

                //item function for extraction
                $round_counter = 0;
                $count_array = count($items_found_array);
                foreach ($items_found_array as $itm):

                    $date_time = date('d-m-Y H:i:s', $qt['timestamp']);
                    $item_name = $this->db->get_where('items', array('item_id' => $itm['item_id']))->row()->item_name;

                    $item_tquantity = $itm['quantity'];
                    $item_pquantity = $itm['quantity_picked'];
                    $item_dquantity = $itm['quantity_due'];

                    //summations here
                    $item_total_q += $item_tquantity;
                    $item_total_p += $item_pquantity;
                    $item_total_d += $item_dquantity;

//time to display them on the screen
if ($round_counter === 0) {
?>

    <td style="border-right: 1px solid #000; vertical-align: top">
        <?php

echo $date_time;

?>

    </td>
 <?php }

?>


<?php

if ($round_counter !== 0) {
//just append the data to the table row printed earlier on

?>
        <!--We can let jquery handle this for us here-->
        <script>


            var q = <?php echo number_format($item_tquantity, 0, '.', ','); ?>;
            var p = <?php echo number_format($item_pquantity, 0, '.', ','); ?>;
            var d = <?php echo number_format($item_dquantity, 0, '.', ','); ?>;

            //for item name
            $('#' + <?=$qt['timestamp']?>11).append('<br> <?=$item_name?>');

            //for item quantity
            $('#' + <?=$qt['timestamp']?>22).append('<br>' + q);

            //for item quantity
            $('#' + <?=$qt['timestamp']?>33).append('<br>' + p);

            //for item quantity
            $('#' + <?=$qt['timestamp']?>44).append('<br>' + d);


            //append the totals here if we have more than 1 item found
            //let items_array = '<?php //echo $items_found_array ?>';

            if(Number(<?=count($items_found_array)?>) == Number(<?=$count_array?>)) {

                var tq = <?php echo number_format($item_total_q, 0, '.', ','); ?>;
                var tp = <?php echo number_format($item_total_p, 0, '.', ','); ?>;
                var td = <?php echo number_format($item_total_d, 0, '.', ','); ?>;

                //for total item quantity

                //remove earlier totals added first
                $('#' + <?=$qt['timestamp']?>22 + ' hr').remove();
                $('#' + <?=$qt['timestamp']?>22 + ' strong').remove();

                $('#' + <?=$qt['timestamp']?>33 + ' hr').remove();
                $('#' + <?=$qt['timestamp']?>33 + ' strong').remove();

                $('#' + <?=$qt['timestamp']?>44 + ' hr').remove();
                $('#' + <?=$qt['timestamp']?>44 + ' strong').remove();


                //add now
                $('#' + <?=$qt['timestamp']?>22).append('<hr><strong>' + tq + '</strong>');

                //for total item quantity
                $('#' + <?=$qt['timestamp']?>33).append('<hr><strong>' + tp + '</strong>');

                //for total item quantity
                $('#' + <?=$qt['timestamp']?>44).append('<hr><strong>' + td + '</strong>');

            } //end


        </script>

        <?php

} else {
//print table columns here for the first time

?>

        <td id="<?=$qt['timestamp'];?>11" style="border-right: 1px solid #000; vertical-align: top">
            <?php
echo $item_name;
?>

        </td>

        <td id="<?=$qt['timestamp'];?>22" style="border-right: 1px solid #000; vertical-align: top" align="right">
            <?php
echo number_format($item_tquantity, 0, '.', ',');

?>

                <?php
if (count($items_found_array) == 1) {?>
                        <hr>
                        <h5><?=number_format($item_total_q, 0, '.', ',');?></h5>
                   <?php }
?>

        </td>

        <td id="<?=$qt['timestamp'];?>33" style="border-right: 1px solid #000; vertical-align: top" align="right">
            <?php
echo number_format($item_pquantity, 0, '.', ',');

?>

                <?php
if (count($items_found_array) == 1) {?>
                        <hr>
                        <h5><?=number_format($item_total_p, 0, '.', ',');?></h5>
                   <?php }
?>
        </td>
        <td id="<?=$qt['timestamp'];?>44" style="vertical-align: top" align="right">
            <?php
echo number_format($item_dquantity, 0, '.', ',');
?>


                <?php
if (count($items_found_array) == 1) {?>
                        <hr>
                        <h5><?=number_format($item_total_d, 0, '.', ',');?></h5>
                   <?php }
?>

        </td>

        <?php

}
?>


<?php

$round_counter++;
$t++;
$j++;


endforeach; //end of items array
echo '</tr>';
endforeach; //end of main

?>

                    </tbody>
                </table>
            </td> <!--END//We inserted delivery details here from the payment with goods table-->

                <?php

        } else {
            echo '<td style="border-right: 1px solid #000;" align="left">' . $description_s . '</td>';
        }

        $so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
        $so_code_length = strlen($so_no_prefix) + 8;

        $debtor_so_code = $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->debtor_opening_so_code;

        if (substr($st['so_code'], 0, $so_code_length) == 'Opening-' . $so_no_prefix && $debtor_so_code != $st['so_code']) {

            $debit_amount_s = 0; //$this->db->get_where('invoice', array('so_code' => $st['so_code']))->row()->amount;

            /* if($from != 0 && $to != 0) {
                                      $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                  }
                                $paid_query = $this->db->get_where('payment', array('so_code' => $st['so_code']));

                                if($paid_query->num_rows() > 0) {

                                    if($from != 0 && $to != 0) {
                                      $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
                                    }
                                    $this->db->select_sum('amount');
                                    $debit_amount_s = $this->db->get_where('payment', array('so_code' => $st['so_code']))->row()->amount;
                                    //$total_amount = 0;
                                } else {
                                    //$total_amount = 0;
                                    $debit_amount_s = 0;
            */

        }
        ?>




                <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $debit_amount_s, $currency);?></td>
                <td style="border-right: 1px solid #000;" align="right"></td>
                <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $debit_amount_s, $currency);?></td>
            </tr>

            <?php

    } //don't show if the data is not valid

/****************************************
 *FOR RECEIPTS
 ****************************************/
//for all receipts here
    //for receipts
    /*if ($from != 0 && $to != 0) {
        $this->db->where('timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
        
    }*/
    $this->db->where('timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
    
    $this->db->order_by('timestamp', 'asc');
    $rec_query = $this->db->get_where('general_journal', array('customer_id' => $customer_id, 'account_name' => 'Accounts Receivable', 'debit_amount' => 0));

    $num_rows = $rec_query->num_rows();

    if ($num_rows > 0) {

        $rec_total = 0;
        foreach ($rec_query->result_array() as $rec):

            if($rec['so_code'] != $st['so_code']) {
                //if it is not the same so code, check and see if the very current payment so code has any same parent so code for the time interval selected
                if(in_array($rec['so_code'], array_column($statement_array, 'so_code'))) {
                    //if we have same parent so code in the array, we skip this entry here so we can rather put it under its parent transaction
                    continue;
                }
            }

            //if ($from != 0 && $to != 0) {
                //$this->db->where('timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
                $this->db->where('timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
            //}
            
            $journal_query_array = $this->db->get_where('general_journal', array('customer_id' => $customer_id, 'so_code' => $rec['so_code'], 'journal_id' => $rec['journal_id'], 'account_name' => 'Accounts Receivable', 'debit_amount' => 0))->row();
            
            $date_r = date('d-m-Y', $journal_query_array->timestamp);


/////////////////////////////////
            $journal_r = $journal_query_array->journal;


/////////////////////////////////
            $invoice_code_r = $journal_query_array->invoice_code;

////////////////////////////////
            $invoice_status_r = $this->db->get_where('sales_order', ['so_code' => $rec['so_code']])->row()->status;

/////////////////////////////////
            $description_r = $journal_query_array->description;

/////////////////////////////////           
            $credit_amount_r = $journal_query_array->credit_amount;

//RECEIPT ROW STARTS FROM HERE
            ?>
                <tr style="border-bottom: 1px solid #000;">
                <td style="border-right: 1px solid #000;" align="left"><?=$date_r;?></td>
                <td style="border-right: 1px solid #000;" align="left"><?=$st['so_code'];?></td>
                <td style="border-right: 1px solid #000;" align="left"><?=$invoice_code_r;?></td>
                <td style="border-right: 1px solid #000;" align="left"><?=$invoice_status_r;?></td>
                <td style="border-right: 1px solid #000;" align="left"><?=$journal_r;?></td>


                <?php
                
        //show this table only if it is an opening balance so code

            $so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
            $so_code_length = strlen($so_no_prefix) + 8;

            if ($rec['so_code'] != 'Opening-balance') {
                if (substr($rec['so_code'], 0, $so_code_length) == 'Opening-' . $so_no_prefix) {
                    ?>

                <td style="border-right: 1px solid #000; vertical-align: top" align="right">

                <table style="width:100%;">
                    <thead style="background-color: #4242ad; padding: 30px;">
                        <tr>
                            <th style="text-align: left; border-right: 1px solid #000">Date | Time</th>
                            <th style="text-align: left; border-right: 1px solid #000">Item</th>
                            <th style="text-align: right; border-right: 1px solid #000">Qty</th>
                            <th style="text-align: right; border-right: 1px solid #000">Picked</th>
                            <th style="text-align: right; border-right: 1px solid #000">Due</th>
                        </tr>
                    </thead>
                    <tbody>



<?php
//if ($from != 0 && $to != 0) {
//$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
$this->db->where('date_timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
//}



$this->db->where('opening_entry', 0);

$this->db->select('timestamp');
$this->db->from('payment_with_goods');
$this->db->order_by('timestamp', 'asc');
$this->db->where('so_code', $rec['so_code']);
$this->db->distinct();
$code_query = $this->db->get();


/////////////////////////////////////////
if ($code_query->num_rows() == 0) {

//if ($from != 0 && $to != 0) {
//$this->db->where('date_timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
$this->db->where('date_timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
//}


//$this->db->where('opening_entry', 1);

$this->db->select('timestamp');
$this->db->from('payment_with_goods');
$this->db->where('so_code', $rec['so_code']);
$this->db->distinct();
$code_query = $this->db->get();
}
//$this->db->order_by('timestamp', 'desc');
$order_code_query = $code_query->result_array();

//main query

foreach ($order_code_query as $qt):

//some counters here
$item_total_q = 0;
$item_total_p = 0;
$item_total_d = 0;
$item_total_amount_d = 0;

echo '<tr style="background-color: #99e69f">';

$this->db->select('*');
$this->db->from('payment_with_goods');
$this->db->where('so_code', $rec['so_code']);
$this->db->where('timestamp', $qt['timestamp']);
$items_found_array = $this->db->get()->result_array();

//item function for extraction
$round_counter = 0;
$count_array = count($items_found_array);
foreach ($items_found_array as $itm):

$date_time = date('d-m-Y H:i:s', $qt['timestamp']);
$item_name = $this->db->get_where('items', array('item_id' => $itm['item_id']))->row()->item_name;

$item_tquantity = $itm['quantity'];
$item_pquantity = $itm['quantity_picked'];
$item_dquantity = $itm['quantity_due'];
$_item_price = $itm['price'];

//summations here
$item_total_q += $item_tquantity;
$item_total_p += $item_pquantity;
$item_total_d += $item_dquantity;
$item_total_amount_d += $item_dquantity * $_item_price;

//time to display them on the screen
if ($round_counter === 0) {
?>

            <td style="border-right: 1px solid #000; vertical-align: top">
                <?php

echo $date_time;

?>

            </td>
         <?php }

?>


        <?php

if ($round_counter !== 0) {
//just append the data to the table row printed earlier on

?>
                <!--We can let jquery handle this for us here-->
                <script>


                    var q = <?php echo number_format($item_tquantity, 0, '.', ','); ?>;
                    var p = <?php echo number_format($item_pquantity, 0, '.', ','); ?>;
                    var d = <?php echo number_format($item_dquantity, 0, '.', ','); ?>;

                    //for item name
                    $('#' + <?=$qt['timestamp']?>1).append('<br> <?=$item_name?>');

                    //for item quantity
                    $('#' + <?=$qt['timestamp']?>2).append('<br>' + q);

                    //for item quantity
                    $('#' + <?=$qt['timestamp']?>3).append('<br>' + p);

                    //for item quantity
                    $('#' + <?=$qt['timestamp']?>4).append('<br>' + d);


                    //append the totals here if we have more than 1 item found
                    //let items_array = '<?php //echo $items_found_array ?>';
                     if(Number(<?=count($items_found_array)?>) == Number(<?=$count_array?>)) {

                        var tq = <?php echo number_format($item_total_q, 0, '.', ','); ?>;
                        var tp = <?php echo number_format($item_total_p, 0, '.', ','); ?>;
                        var td = <?php echo number_format($item_total_d, 0, '.', ','); ?>;

                        //for total item quantity
                        //remove earlier totals added first
                        $('#' + <?=$qt['timestamp']?>2 + ' hr').remove();
                        $('#' + <?=$qt['timestamp']?>2 + ' strong').remove();

                        $('#' + <?=$qt['timestamp']?>3 + ' hr').remove();
                        $('#' + <?=$qt['timestamp']?>3 + ' strong').remove();

                        $('#' + <?=$qt['timestamp']?>4 + ' hr').remove();
                        $('#' + <?=$qt['timestamp']?>4 + ' strong').remove();


                        //add now
                        $('#' + <?=$qt['timestamp']?>2).append('<hr><strong>' + tq + '</strong>');

                        //for total item quantity
                        $('#' + <?=$qt['timestamp']?>3).append('<hr><strong>' + tp + '</strong>');

                        //for total item quantity
                        $('#' + <?=$qt['timestamp']?>4).append('<hr><strong>' + td + '</strong>');

                    } //end


                </script>

                <?php

} else {
//print table columns here for the first time

?>

                <td id="<?=$qt['timestamp'];?>1" style="border-right: 1px solid #000; vertical-align: top">
                    <?php
echo $item_name;
?>

                </td>

                <td id="<?=$qt['timestamp'];?>2" style="border-right: 1px solid #000; vertical-align: top" align="right">
                    <?php
echo number_format($item_tquantity, 0, '.', ',');

?>

                        <?php
if (count($items_found_array) == 1) {?>
                                <hr>
                                <h5><?=number_format($item_total_q, 0, '.', ',');?></h5>
                           <?php }
?>

                </td>

                <td id="<?=$qt['timestamp'];?>3" style="border-right: 1px solid #000; vertical-align: top" align="right">
                    <?php
echo number_format($item_pquantity, 0, '.', ',');

?>

                        <?php
if (count($items_found_array) == 1) {?>
                                <hr>
                                <h5><?=number_format($item_total_p, 0, '.', ',');?></h5>
                           <?php }
?>
                </td>
                <td id="<?=$qt['timestamp'];?>4" style="vertical-align: top" align="right">
                    <?php
echo number_format($item_dquantity, 0, '.', ',');
?>


                        <?php
if (count($items_found_array) == 1) {?>
                                <hr>
                                <h5><?=number_format($item_total_d, 0, '.', ',');?></h5>
                           <?php }
?>

                </td>

                <?php

}
?>


    <?php

$round_counter++;
endforeach; //end of items array
echo '</tr>';
endforeach; //end of main

?>

</tbody>
</table>
</td> <!--END//We inserted delivery details here from the payment with goods table-->

<?php

} //end of showing table if the so code is that of the opening balance
else {
//display only the description
echo '<td style="border-right: 1px solid #000;" align="left">' . $journal_r . '</td>';
}

} else {
echo '<td style="border-right: 1px solid #000;" align="left">' . $description_r . '</td>';
}

//this filter helps us to avoid showing amount for opening so codes
$so_no_prefix = $this->db->get_where('settings', array('type' => 'so_prefix'))->row()->description;
$so_code_length = strlen($so_no_prefix) + 8;

$debtor_so_code = $this->db->get_where('customers', array('customer_id' => $customer_id))->row()->debtor_opening_so_code;

if (substr($rec['so_code'], 0, $so_code_length) == 'Opening-' . $so_no_prefix && $debtor_so_code != $rec['so_code']) {

$credit_amount_r = 0;


}
?>

<td style="border-right: 1px solid #000;" align="right"></td>
<td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $credit_amount_r, $currency);?></td>
<td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, -$credit_amount_r, $currency);?></td>
</tr>

<!-- END OF RECEIPT ROW -->

<?php

$rec_total += $credit_amount_r;
endforeach; //end of receipts or cash paid for owings

} //end of 0 restrictions on receipts

/****************************************
*FOR DEPOSITS
****************************************/

//for deposits
//if ($from != 0 && $to != 0) {
//$this->db->where('timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
$this->db->where('timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');

//}
$this->db->order_by('date_timestamp', 'asc');
$depo_query = $this->db->get_where('general_journal', array('customer_id' => $customer_id, 'so_code' => $st['so_code'], 'account_name' => 'Accounts Payable', 'debit_amount' => 0));

$depo_rows = $depo_query->num_rows();

if ($depo_rows > 0) {

$depo_total = 0;
foreach ($depo_query->result_array() as $dp):


/////////////////////////////////////////////////////////
//if ($from != 0 && $to != 0) {
//$this->db->where('timestamp BETWEEN "' . strtotime($from) . '" AND "' . strtotime($to) . '"');
$this->db->where('timestamp BETWEEN "' . $uniqueTimetampHolderStart[$i] . '" AND "' . $uniqueTimetampHolderEnd[$i] . '"');
//}

$payable_journal_query = $this->db->get_where('general_journal', array('customer_id' => $customer_id, 'so_code' => $st['so_code'], 'journal_id' => $dp['journal_id'], 'account_name' => 'Accounts Payable', 'debit_amount' => 0))->row();

//////////////////////////
$date_dp = date('d-m-Y', $payable_journal_query->timestamp);

//////////////////////////////
$journal_dp = $payable_journal_query->journal;

//////////////////////////////
$invoice_code_dp = $payable_journal_query->invoice_code;

/////////////////////////////
$description_dp = $payable_journal_query->description;

////////////////////////////////
$credit_amount_dp = $payable_journal_query->credit_amount;
?>
<tr>
    <td style="border-right: 1px solid #000;" align="left"><?=$date_dp;?></td>
    <td style="border-right: 1px solid #000;" align="center">-</td>
    <td style="border-right: 1px solid #000;" align="left"><?=$invoice_code_dp;?></td>
    <td style="border-right: 1px solid #000;" align="center">-</td>
    <td style="border-right: 1px solid #000;" align="left"><?=$description_dp;?></td>
    <td style="border-right: 1px solid #000;" align="center"><?=$journal_dp;?></td>
    <td style="border-right: 1px solid #000;" align="right"></td>
    <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, $credit_amount_dp, $currency);?></td>
    <td style="border-right: 1px solid #000;" align="right"><?=numfmt_format_currency($fmt, -$credit_amount_dp, $currency);?></td>
</tr>

<?php
        $depo_total += $credit_amount_dp;
        endforeach; //end for deposits here
    } //end for 0 restriction on deposits

    //grand totals ends here
    $c_balance_tempt_holder += ($rec_total + $depo_total);

    $balance += ($debit_amount_s - $rec_total - $depo_total);
    $d_balance += ($debit_amount_s);
    $c_balance += ($rec_total + $depo_total);
    $qty_balance += $qty;
    $qty_left_balance += $qty_left;

    

    $grand_q_counter += $q_counter;
    $grand_q_due_counter += $due_counter;

    //reset them
    $debit_amount_s = 0;
    $credit_amount_r = 0;
    $credit_amount_dp = 0;
    $qty = 0;
    $qty_left = 0;

    $rec_total = 0;
    $depo_total = 0;

endforeach;
/*We assume the very first balance owing to the customer is 0 by setting
*the previous balance array's first value to 0
*Then during our first run of the loop, we add the balance owing of that week
*to the array and so on, we make reference to the previous weeks balance and 
add it to the current weeks total debts. This gives us the total cummulative owing by the end of the current week.
**/
array_push($prev_balance_array, $balance);

$balance_tempt = $balance;
$prev_balance = $prev_balance_array[$i];//getting previous week's balance


$d_balance_tempt = $d_balance + $prev_balance;// adding it to the current week's debt
$c_balance_tempt = $c_balance_tempt_holder;


$c_balance_tempt_holder = 0;
$d_balance = 0;

//if this is the last record, check if current date is the same as the end of week date, else use current date instead

$end_of_week_date = $uniqueTimetampHolderEnd[$i];

if(sizeof($uniqueTimetampHolderStart) == $week_counter) {
    //last row
    if($uniqueTimetampHolderEnd[$i] > strtotime('now')) {
        $end_of_week_date = strtotime('now');
    }
}

?>
<tr style="border-top: 1px solid #000; background-color: #d8d4d4">
    <td colspan="6" style="border-right: 1px solid #000;"><strong>Total as at <?=date('l, F j, Y', $end_of_week_date); ?></strong> &nbsp; &nbsp; <button class="btn btn-danger btn-sm"><strong><badge>WEEK N<sup><u>o</u></sup>:<?=date('W', $uniqueTimetampHolderStart[$i]); ?></badge></strong></button></td>

    <!-- <td style="border-right: 1px solid #000; text-align: right;"><strong>-</strong></td>

    <td style="border-right: 1px solid #000; text-align: right;"><strong>-</strong></td> -->

    <td style="border-right: 1px solid #000; text-align: right;"><strong><?=numfmt_format_currency($fmt, $d_balance_tempt, $currency);?></strong></td>

    <td style="border-right: 1px solid #000; text-align: right;"><strong><?=numfmt_format_currency($fmt, $c_balance_tempt, $currency);?></strong></td>

    <td style="border-right: 1px solid #000; text-align: right;"><strong><?=numfmt_format_currency($fmt, $balance_tempt, $currency);?></strong></td>
</tr>
<?php

//for the grand total amounts
$grand_dr = $d_balance_tempt;
$grand_cr = $c_balance_tempt;
$grand_bal = $balance_tempt;

//reset the tempt values to 0
$balance_tempt = 0;
$d_balance_tempt = 0;
$c_balance_tempt = 0;

//
$endOfWeek = $uniqueTimetampHolderEnd[$i];
$startOfWeek = $uniqueTimetampHolderStart[$i];

endfor; //each week ends

if(sizeof($getTimestamps) > 0):

?>

 <tr style="border-top: 1px solid #000; background-color: #ea5d5da1">
    <td colspan="6" style="border-right: 1px solid #000;"><h3><strong>GRAND-TOTAL AS AT <?=strtoupper(date('l, F j, Y', $end_of_week_date)); ?></strong> &nbsp; &nbsp; <button class="btn btn-danger btn-sm"><strong><badge>WEEK N<sup><u>o</u></sup>:<?=date('W', $startOfWeek); ?></badge></strong></button></h3></td>


    <td style="border-right: 1px solid #000; text-align: right;"><strong><?=numfmt_format_currency($fmt, $grand_dr, $currency);?></strong></td>

    <td style="border-right: 1px solid #000; text-align: right;"><strong><?=numfmt_format_currency($fmt, $grand_cr, $currency);?></strong></td>

    <td style="border-right: 1px solid #000; text-align: right;"><strong><?=numfmt_format_currency($fmt, $grand_bal, $currency);?></strong></td>
</tr>

<?php
else:
    echo '<tr><td colspan="9" align="center" style="border-right: 1px solid #000;">NO RECORD FOUND FOR THIS CUSTOMER</td></tr>';
endif;
?>

            <!-- <tr style="border-top: 1px solid #000">
                <td colspan="4" style="border-right: 1px solid #000;"><strong>Total</strong></td>

                <td style="border-right: 1px solid #000; text-align: right;"><strong>-</strong></td>

                <td style="border-right: 1px solid #000; text-align: right;"><strong>-</strong></td>

                <td style="border-right: 1px solid #000; text-align: right;"><strong><?//=numfmt_format_currency($fmt, $d_balance, $currency);?></strong></td>

                <td style="border-right: 1px solid #000; text-align: right;"><strong><?//=numfmt_format_currency($fmt, $c_balance, $currency);?></strong></td>

                <td style="border-right: 1px solid #000; text-align: right;"><strong><?//=numfmt_format_currency($fmt, $balance, $currency);?></strong></td>
            </tr> -->
        </tbody>
    </table>
</div>
                   <footer class="footer" style="position: fixed; bottom: -35px">
                        <div>
                            <div>
                             
                            </div>
                        </div>
                        <div style="width: 100%; height: 30px; margin-bottom: 20px; padding: 5px; text-align: left"><smal style="color:#1d1c1c; text-shadow: 1px 1px 0px #504949; position: relative; top: 5px;"><i>Software Developed & Designed by: Lightworld Technologies Ltd. Contact us on 0243618186 | 0247612799 or email us on mail@lightworldtech.com</i></smal></smal></div>
                    </footer>
                </div>
            </div>
        </page>
        </div>
     </div>
</div>
</div>


    <script type="text/javascript" src="<?php echo base_url('assets/js/jquery-3.3.1.min.js'); ?>"></script>
    <script type="text/javascript" src="<?php echo base_url('assets/js/bootstrap.js'); ?>"></script>
</body>
</html>

<script type="text/javascript">
    jQuery(document).ready(function($)
    {

      //  var elem = $('#print');
        //PrintElem(elem);
        //Popup(data);
        //update total quantity and amount at the top
        $('table tr #quantity').html('<strong><?=number_format($total_quantity, 0, '.', ',');?></strong>');
        $('table tr #amount').html('<strong><?=numfmt_format_currency($fmt, $total_amount, $currency);?></strong>');
        $('#balance_due').html('<strong><?=numfmt_format_currency($fmt, $grand_bal, $currency);?></strong>');
    });



 function PrintElem(elem)
    {
        Popup($(elem).html());
    }

    function Popup(data)
    {
        var mywindow = window.open('', '', '');
        mywindow.document.write('<!doctype html><html><head><title>CUSTOMER STATEMENT OF ACCOUNT</title>');
        //mywindow.document.write('<link rel="stylesheet" href="assets/css/chartjs/dist/Chart.min.css" type="text\/css" \/>');
        mywindow.document.write('<link rel="stylesheet" type="text/css" href="<?php echo base_url('assets/css/chartjs/dist/Chart.css'); ?>" />');
        mywindow.document.write('<script src="<?php echo base_url('assets/css/chartjs/dist/Chart.js'); ?>" type="text\/javascript"><\/script>');
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


    function print_page() {
        //window.location.reload();
        print();
       }

       function page_reload() {
        window.location.reload();
       }


        $(function() {
            setTimeout(() => {
              print_page();
            }, 1000);

        });
</script>

