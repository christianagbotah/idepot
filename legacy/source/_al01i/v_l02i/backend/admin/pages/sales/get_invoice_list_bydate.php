<?php
//currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

if($customer_id != 0) {
      $this->db->where('customer_id', $customer_id);
  }

  if($status != 'All') {
      $this->db->where('status', $status);
  }
if($from != 0 && $to != 0) {
      $this->db->where('timestamp BETWEEN "'. strtotime($from) .'" AND "'. strtotime($to) . '"');
  }

$invoice_query = $this->db->get('invoice');
$invoice_array = $invoice_query->result_array();

?>
    <div class="row">
        <table class="table" width="100%" id="invoice_list">
            <thead class="bg-info">
              <tr>
                <th>Date</th>
                <th>Invoice No</th>
                <th>Order Code</th>
                <th>Customer</th>
                <th>Status</th>
                <th style="text-align: right">Amount</th>
                <th style="text-align: right">Amount Paid</th>
                <th style="text-align: right">Amount Due</th>
                <th>Cashier</th>
              </tr>
            </thead>
            <tbody>
                <?php
$invoice_counter = 0;
$total_amount = 0;
$invoice_codes_array = array();
$invoice_ids_array = array();

foreach ($invoice_array as $invoice):
  $customer_name = $this->db->get_where('customers', array('customer_id' => $invoice['customer_id']))->row()->customer_name;
  $sales_person = $this->db->get_where('admin', array('admin_id' => $invoice['sales_person_id']))->row()->name;
  ?>
    <tr ondblclick="deselect_all()" onclick="populate_links('<?=$invoice['invoice_id']?>', '<?=$invoice['so_code']?>', '<?=$invoice['invoice_code']?>', '<?=$invoice['customer_id']?>')" id="invoice_id_<?=$invoice['invoice_id'];?>">
        <td><?=$invoice['date'];?></td>
        <td><?=$invoice['invoice_code'];?></td>
        <td><?=$invoice['so_code'];?></td>
        <td><?=$customer_name;?></td>
        <td><?=$invoice['status'];?></td>
        <td align="right"><strong><?=numfmt_format_currency($fmt, $invoice['amount'], $currency);?></strong></td>
        <td align="right"><strong><?=numfmt_format_currency($fmt, $invoice['amount_paid'], $currency);?></strong></td>
        <td align="right"><strong><?=numfmt_format_currency($fmt, $invoice['amount_due'], $currency);?></strong></td>
        <td><?=$sales_person;?></td>
    </tr>

    <?php

  $invoice_counter += 1;
  $total_amount += $invoice['amount'];
  array_push($invoice_codes_array, $invoice['invoice_code']);
  array_push($invoice_ids_array, $invoice['invoice_id']);
endforeach;
?>

            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-3 col-sm-3 text-lg-left"><strong><?php echo number_format($invoice_counter, 0, '.', ',') . ' ';
echo ' ' . $invoice_counter > 1 ? 'Invoices' : 'Invoice'; ?></strong></div>
            <div class="col-md-6 col-sm-6 text-lg-left"><strong>Total: <?=numfmt_format_currency($fmt, $total_amount, $currency);?></strong></div>

    </div>
</div>


    <script type="text/javascript">
    $(function() {
        $('#invoice_list').DataTable();
        //$('#edit_div').slideDown('fast');

    });

    function populate_links(id, so_code, invoice_code, customer_id) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all invoice codes
        let invoice_array = <?php echo json_encode($invoice_ids_array); ?>;

        invoice_code = invoice_code.replace(/ /g, '_');
        //so_code = so_code.replace(/ /g, '_');

        for(i = 0; i < invoice_array.length; i++) {

            //check which table row is clicked
            if(id == invoice_array[i]) {

                //change the background of the row
                $('#invoice_id_' + id).removeAttr('class');
                $('#invoice_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                if(so_code == 'Opening Balance') {
                    $('#inedit').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_customer/'); ?>" + customer_id + "', 'Edit Customer')");
                } else {
                    $('#inedit').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_sales_order/'); ?>" + so_code + "', 'Edit Sales Order')");
                }


                //delete button

                $('#indelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/sales_order/delete/invoice/'); ?>" + invoice_code + "/" + id + "', 'Are you sure you want to delete this Invoice? All related records will be deleted permanently.')");

                //payment button
                $('#inpayment').attr("onclick", "showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/payments_select/'); ?>" + invoice_code + "/" + id + "', 'New Payment'), clearModals()");

                //print button
                $('#inprint').attr("href", "<?php echo site_url('admin/invoice_print/'); ?>" + customer_id + "/" + so_code + "/" + invoice_code, "clearModals()");

            } else {
                for(j = 0; j < invoice_array.length; j++) {
                    if(invoice_array[j] != id) {
                        $('#invoice_id_' + invoice_array[j]).removeAttr('style');

                    }
                }
            }
        }
    }

    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        let invoice_array = <?php echo json_encode($invoice_ids_array); ?>;

        for(i = 0; i < invoice_array.length; i++) {
            $('#invoice_id_' + invoice_array[i]).removeAttr('style');
        }
    }

    //close earlier modals
    function clearModals() {
      $('.close').click();
    }

    </script>