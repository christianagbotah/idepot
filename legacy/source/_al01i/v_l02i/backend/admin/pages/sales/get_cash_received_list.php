 <?php

// Batch load settings
$settings_row = $this->db->get_where('settings', array('type' => 'currency'))->row();
$currency = $settings_row->description ?? '';
$fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

$payments_array_ids = array();

// Load payments
if(($from ?? 0) != 0 && ($to ?? 0) != 0) {
    $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
}
$this->db->where('payment_type', 'Receivable');
$this->db->or_where('payment_type', 'Income');
$payments_array = $this->db->get('payment')->result_array();

// Batch load all related data
$payment_ids = array_column($payments_array, 'payment_id');
$account_ids = array_unique(array_column($payments_array, 'account_id'));
$customer_ids = array_unique(array_filter(array_column($payments_array, 'customer_id')));

// Batch load accounts
$accounts_map = array();
if (!empty($account_ids)) {
    $accounts = $this->db->where_in('account_id', $account_ids)->get('accounts')->result_array();
    $accounts_map = array_column($accounts, null, 'account_id');
}

// Batch load customers
$customers_map = array();
if (!empty($customer_ids)) {
    $customers = $this->db->where_in('customer_id', $customer_ids)->get('customers')->result_array();
    $customers_map = array_column($customers, null, 'customer_id');
}

// Batch load general journal entries
$journal_map = array();
if (!empty($payment_ids)) {
    $journals = $this->db->where_in('payment_id', $payment_ids)->where('journal', 'Receipts')->get('general_journal')->result_array();
    foreach ($journals as $j) {
        $journal_map[$j['payment_id'] ?? 0] = $j;
    }
}

// Batch load sales persons
$sales_person_ids = array_unique(array_filter(array_column($journals ?? array(), 'sales_person_id')));
$sales_persons_map = array();
if (!empty($sales_person_ids)) {
    $sales_persons = $this->db->where_in('admin_id', $sales_person_ids)->get('admin')->result_array();
    $sales_persons_map = array_column($sales_persons, null, 'admin_id');
}
?>
    <hr>
    <div class="row">
        
    
        <table class="table" width="100%" id="view_payment_history_table">
            <thead class="bg-info">
              <tr>
                <th>Date</th>
                <th>Customer</th>
                <th>SO Code</th>
                <th>Invoice Code</th>
                <th>Receipt Code</th>
                <th>Mode of Payment</th>
                <th style="text-align: right">Amount</th>
                <th>Type of Sales</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
                <?php
$total_payment = 0;
$total_amount = 0;

foreach ($payments_array as $payment):
    $payment_id = $payment['payment_id'] ?? 0;
    $customer_id = $payment['customer_id'] ?? null;
    $account_id = $payment['account_id'] ?? 0;
    
    $account_name = $accounts_map[$account_id]['name'] ?? '';
    $customer_name = $customer_id ? ($customers_map[$customer_id]['customer_name'] ?? '') : ($payment['expenditure_item'] ?? '');
    
    $journal = $journal_map[$payment_id] ?? array();
    $sales_person_id = $journal['sales_person_id'] ?? 0;
    $sales_person_name = $sales_persons_map[$sales_person_id]['name'] ?? '';

?>
              <tr ondblclick="deselect_all()" onclick="populate_links('<?=$payment_id;?>', '<?=$customer_id;?>', '<?=$payment['invoice_code'] ?? '';?>')" id="payment_<?=$payment_id;?>">
                <td><?=$payment['date'] ?? '';?></td>
                <td><?=$customer_name;?></td>
                <td><?=$payment['so_code'] ?? '';?></td>
                <td><?=$payment['invoice_code'] ?? '';?></td>
                <td><div class="p-4 bg-gray-400 rounded-lg"><?=$account_name;?></div></td>

                <td align="right"><strong><?=numfmt_format_currency($fmt, $payment['amount'] ?? 0, $currency);?></strong></td>
                <td><?=$payment['category'] ?? ''; ?></td>
                <td><?=$sales_person_name;?></td>
              </tr>
          <?php
$total_payment++;
$total_amount += $payment['amount'] ?? 0;

array_push($payments_array_ids, $payment_id);
endforeach;?>
            </tbody>
        </table>
    </div>

    <br>
    <hr>
    <div class="row">
            <div class="col-md-2 col-sm-2 text-lg-left"><strong><?php echo number_format($total_payment, 0, '.', ',') . ' ';
echo $total_payment > 1 ? 'Payments' : 'Payment'; ?></strong></div>
            <div class="col-md-2 col-sm-2 text-lg-left"><strong>Total: <?=numfmt_format_currency($fmt, $total_amount, $currency);?></strong></div>

        </div>
    <script type="text/javascript">
    $(function() {
        $('#view_payment_history_table').DataTable();

    });

       function populate_links(id, customer_id, invoice_code) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all payments
        let payments_array = <?php echo json_encode($payments_array_ids); ?>;

        for(i = 0; i < payments_array.length; i++) {

            //check which table row is clicked
            if(id == payments_array[i]) {

                //change the background of the row
                $('#payment_' + id).removeAttr('class');
                $('#payment_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#paymentsedit').attr("onclick", "toBackground(); showAjaxModal_payments('<?php echo site_url('modal/popup_sales/edit_payments/'); ?>" + customer_id + "/" + id + "/" + invoice_code + "', 'Edit Payment')");

                //delete button

                $('#paymentsdelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/payments_received/delete/'); ?>" + id + "', 'Are you sure you want to delete this Payment? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < payments_array.length; j++) {
                    if(payments_array[j] != id) {
                        $('#payment_' + payments_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function toBackground() {
        $('.btn').attr('data-dismiss', 'modal');
    }


    //loading receipt for print
    function load_receipt(receipt_code, invoice_code, customer_id, payment_id, date_time) {
        //loading receipt page
        $.ajax({
          url: '<?php echo site_url('admin/receipt/') ?>' + receipt_code + '/' + invoice_code + '/' + customer_id + '/' + payment_id + '/' + date_time,
          type: 'POST',
          dataType: 'html',

        })
        .done(function(response) {

          showAjaxModal_receipt('<?php echo site_url('modal/popup_sales/receipt_modal/'); ?>', response, 'Print Receipt');
         // $('#receipt_holder').html(response);
        });
    }


    

    </script>