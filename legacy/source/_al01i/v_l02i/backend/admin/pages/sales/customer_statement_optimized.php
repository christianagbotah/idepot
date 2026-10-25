<?php
// Fetch all data upfront to minimize queries
$currency = $this->db->get_where('settings', ['type' => 'currency'])->row()->description;
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
$system_name = $this->db->get_where('settings', ['type' => 'system_name'])->row()->description;
$location = $this->db->get_where('settings', ['type' => 'location'])->row()->description;
$address = $this->db->get_where('settings', ['type' => 'address'])->row()->description;
$phone = $this->db->get_where('settings', ['type' => 'phone'])->row()->description;
$so_no_prefix = $this->db->get_where('settings', ['type' => 'so_prefix'])->row()->description;
$so_code_length = strlen($so_no_prefix) + 8;

$customer_row = $this->db->get_where('customers', ['customer_id' => $customer_id])->row();
$opening_cash_balance = $customer_row->opening_balance;
$opening_date = date('d-m-Y', $customer_row->timestamp);
$debtor_so_code = $customer_row->debtor_opening_so_code;

// Get all timestamps for the period
$this->db->select('date_timestamp as ts');
$this->db->distinct();
if ($from != 0 && $to != 0) {
    $this->db->where('date_timestamp BETWEEN ' . strtotime($from) . ' AND ' . strtotime($to));
}
$this->db->where('customer_id', $customer_id);
$this->db->order_by('date_timestamp', 'asc');
$timestamps = $this->db->get('payment_with_goods')->result_array();

// Group timestamps by week
$weekGroups = [];
foreach ($timestamps as $t) {
    $ts = (int)$t['ts'];
    $week = date('W-Y', $ts);
    if (!isset($weekGroups[$week])) {
        $year = date('Y', $ts);
        $weekNum = date('W', $ts);
        $weekGroups[$week] = [
            'start' => strtotime($year . 'W' . $weekNum),
            'end' => strtotime($year . 'W' . $weekNum . ' +6 days')
        ];
    }
}
?>
<!doctype html>
<html>
<head>
    <title><?=$page_title;?></title>
    <link rel="stylesheet" href="<?=base_url('assets/css/font-icons/entypo/css/entypo.css.min.css');?>"/>
    <link rel="shortcut icon" href="<?=base_url('uploads/school_logo.png');?>">
    <style>
        body { font-size: 14px; }
        td { padding: 5px; }
        #invoice_table thead { background-color: #4242ad; color: #fff; }
        #invoice_table th { border-right: 1px solid #000; padding: 5px; }
        #print_div a { background-color: black; color: #fff; padding: 5px; border-radius: 14px; }
        @media print { #print_div { display: none; } }
    </style>
</head>
<body>
<div class="container">
    <div class="row" style="margin-top: 15px; position: fixed; right: 5px; z-index: 9999" id="print_div">
        <a href="javascript:void(0);" onClick="print()">Print Statement</a>
    </div>
    
    <table style="width:100%; margin-top: 10px;">
        <tr>
            <td width="50%">
                <img src="<?=base_url('uploads/school_logo.png');?>" style="max-height: 100px;">
                <h3><?=$system_name;?></h3>
                <p><?=$address;?></p>
            </td>
            <td width="50%" align="right">
                <h3>STATEMENT OF ACCOUNTS</h3>
                <p>FROM: <?=$from == 0 ? $opening_date : $from;?></p>
                <p>TO: <?=$to == 0 ? date('d-m-Y') : $to;?></p>
                <p>BALANCE DUE: <span id="balance_due"></span></p>
                <h3><?=$customer_name;?></h3>
                <p><?=$customer_phone;?></p>
                <p><?=$customer_address;?></p>
            </td>
        </tr>
    </table>

    <table id="invoice_table" style="width:100%; border-collapse:collapse; margin-top: 10px;">
        <thead>
            <tr>
                <th>Date</th>
                <th>SO Code</th>
                <th>Invoice Code</th>
                <th>Status</th>
                <th>Journal</th>
                <th>Items</th>
                <th>Debit</th>
                <th>Credit</th>
                <th>Balance</th>
            </tr>
        </thead>
        <tbody>
<?php
$balance = 0;
$prev_balance_array = [0];
$week_counter = 0;

foreach ($weekGroups as $week => $period):
    $week_counter++;
    $week_debit = 0;
    $week_credit = 0;
    
    // Get sales orders for this week
    $this->db->where('customer_id', $customer_id);
    $this->db->where('date_timestamp BETWEEN ' . $period['start'] . ' AND ' . $period['end']);
    $this->db->order_by('date_timestamp', 'asc');
    $sales = $this->db->get('payment_with_goods')->result_array();
    
    $processed_so_codes = [];
    
    foreach ($sales as $sale):
        if (in_array($sale['so_code'], $processed_so_codes)) continue;
        $processed_so_codes[] = $sale['so_code'];
        
        // Get invoice details
        $invoice = $this->db->get_where('invoice', ['so_code' => $sale['so_code'], 'customer_id' => $customer_id])->row();
        $debit_amount = $invoice->amount ?? 0;
        
        if (substr($sale['so_code'], 0, $so_code_length) == 'Opening-' . $so_no_prefix && $debtor_so_code != $sale['so_code']) {
            $debit_amount = 0;
        }
        
        $date_s = date('d-m-Y', $sale['date_timestamp']);
?>
        <tr>
            <td><?=$date_s;?></td>
            <td><?=$sale['so_code'];?></td>
            <td><?=$invoice->invoice_code ?? '';?></td>
            <td><?=$invoice->status ?? '';?></td>
            <td>Sales</td>
            <td>-</td>
            <td align="right"><?=numfmt_format_currency($fmt, $debit_amount, $currency);?></td>
            <td align="right"></td>
            <td align="right"><?=numfmt_format_currency($fmt, $debit_amount, $currency);?></td>
        </tr>
<?php
        $week_debit += $debit_amount;
        
        // Get payments for this SO code (avoid duplicates)
        $this->db->where('customer_id', $customer_id);
        $this->db->where('so_code', $sale['so_code']);
        $this->db->where('timestamp BETWEEN ' . $period['start'] . ' AND ' . $period['end']);
        $this->db->where('account_name', 'Accounts Receivable');
        $this->db->where('debit_amount', 0);
        $this->db->group_by('journal_id');
        $payments = $this->db->get('general_journal')->result_array();
        
        foreach ($payments as $pmt):
            $credit_amount = $pmt['credit_amount'];
            if (substr($sale['so_code'], 0, $so_code_length) == 'Opening-' . $so_no_prefix && $debtor_so_code != $sale['so_code']) {
                $credit_amount = 0;
            }
?>
        <tr>
            <td><?=date('d-m-Y', $pmt['timestamp']);?></td>
            <td><?=$sale['so_code'];?></td>
            <td><?=$pmt['invoice_code'];?></td>
            <td>-</td>
            <td><?=$pmt['journal'];?></td>
            <td><?=$pmt['description'];?></td>
            <td align="right"></td>
            <td align="right"><?=numfmt_format_currency($fmt, $credit_amount, $currency);?></td>
            <td align="right"><?=numfmt_format_currency($fmt, -$credit_amount, $currency);?></td>
        </tr>
<?php
            $week_credit += $credit_amount;
        endforeach;
    endforeach;
    
    array_push($prev_balance_array, $balance);
    $balance += ($week_debit - $week_credit);
    $cumulative_debit = $week_debit + $prev_balance_array[$week_counter - 1];
?>
        <tr style="background-color: #d8d4d4; font-weight: bold;">
            <td colspan="6">Total as at <?=date('l, F j, Y', $period['end']);?> (Week <?=date('W', $period['start']);?>)</td>
            <td align="right"><?=numfmt_format_currency($fmt, $cumulative_debit, $currency);?></td>
            <td align="right"><?=numfmt_format_currency($fmt, $week_credit, $currency);?></td>
            <td align="right"><?=numfmt_format_currency($fmt, $balance, $currency);?></td>
        </tr>
<?php
endforeach;

if (count($weekGroups) > 0):
?>
        <tr style="background-color: #ea5d5da1; font-weight: bold;">
            <td colspan="6"><h3>GRAND TOTAL</h3></td>
            <td align="right"><?=numfmt_format_currency($fmt, $cumulative_debit, $currency);?></td>
            <td align="right"><?=numfmt_format_currency($fmt, $week_credit, $currency);?></td>
            <td align="right"><?=numfmt_format_currency($fmt, $balance, $currency);?></td>
        </tr>
<?php
else:
    echo '<tr><td colspan="9" align="center">NO RECORD FOUND FOR THIS CUSTOMER</td></tr>';
endif;
?>
        </tbody>
    </table>
</div>

<script src="<?=base_url('assets/js/jquery-3.3.1.min.js');?>"></script>
<script>
$(document).ready(function() {
    $('#balance_due').html('<?=numfmt_format_currency($fmt, $balance, $currency);?>');
    setTimeout(() => print(), 1000);
});
</script>
</body>
</html>
