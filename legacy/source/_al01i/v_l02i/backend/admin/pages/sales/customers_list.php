<?php 
    //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);

    $customer_id = $param2;
?>
<div class="container-fluid">
    <div class="row">

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="cuadd" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_customer/');?>', 'Add New Customer')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>

            

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="cuedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <?php
              $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

             //Is the current logged in user the admin -->
               if($level == 1 || $level == 2):
            ?>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="cudelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <?php
                endif;
            ?>
<!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-secondary btn-lg" id="cuemail"><i class="fa fa-2x fa-fw fa-at"></i></button><br><strong class="ml-3">Email</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="cusms"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-3">SMS</strong></div>
-->

            <div class="col-md-1 col-sm-1 col-lg-1"><a class="btn btn-outline-dark btn-lg" id="cuorder" href="<?=site_url('admin/pos') ?>" target="_blank" ><i class="fa fa-2x fa-fw fa-cash-register"></i></a><br><strong class="ml-3">Order</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-info btn-lg" id="cuinvoice" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/add_sales_order/'); ?>', 'Add Sales Order')"><i class="fa fa-2x fa-fw fa-file-invoice"></i></button><br><strong class="ml-1">Invoice</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="cupayment" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/payments/'); ?>', 'New Payment')"><i class="fa fa-2x fa-fw fa-donate"></i></button><br><strong style="margin-left: -5px">Payment</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><a href="#" class="btn btn-outline-warning btn-lg" id="custatement"><i class="fa fa-2x fa-fw fa-file-text"></i></a><br><strong style="margin-left: -7px">Statement</strong></div>

    </div>
    <?php
        $customers = $this->db->get_where('customers', array('customer_id' => $customer_id));
        $customers_array = $customers->result_array();

        $ids_array = array();
     ?>
    <hr>
    <hr>
    <div class="row">
        <table class="table" width="100%" id="customers_list">
            <thead class="bg-info">
              <tr>
                <th>Customer</th>
                <th>Address</th>
                <th style="text-align: right">Payable</th>
                <th style="text-align: right">Receivable</th>
                <th>Contact</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
                <?php 
                    foreach($customers_array as $cus):
                        $this->db->select_sum('amount_due');
                        $this->db->where('amount_due <', 0);
                        $this->db->where('customer_id', $cus['customer_id']);
                        $payable = abs($this->db->get('invoice')->row()->amount_due);

                        //goods with us
                        $quantity_owe_array = $this->db->get_where('sales_order', array('customer_id' => $cus['customer_id'], 'quantity_due >' => 0))->result_array();

                        foreach ($quantity_owe_array as $owe) {
                            $payable += $owe['price'] * $owe['quantity_due'];
                        }

                        $this->db->select_sum('amount_due');
                        $this->db->where('amount_due >', 0);
                        $this->db->where('customer_id', $cus['customer_id']);
                        $receivable = $this->db->get('invoice')->row()->amount_due;
                ?>
              <tr ondblclick="deselect_all()" onclick="populate_links('<?= $cus['customer_id']?>')" id="customer_id_<?= $cus['customer_id']; ?>">
                <td><?= $cus['customer_name']; ?></td>
                <td><?= $cus['address']; ?></td>
                <td align="right"><strong><?= numfmt_format_currency($fmt, $payable, $currency); ?></strong></td>
                <td align="right"><strong><?= numfmt_format_currency($fmt, $receivable, $currency); ?></strong></td>
                <td><?= $cus['mobile']; if(!empty($cus['phone'])) echo ' | '.$cus['phone']; ?></td>

                <td align="center"><button class="btn btn-<?= $cus['customer_active'] == 1 ? 'success' : 'danger'; ?>"><?= $cus['customer_active'] == 1 ? 'Active' : 'Inactive'; ?></button></td>
              </tr>
              <?php
                    array_push($ids_array, $cus['customer_id']);
               endforeach; ?>
            </tbody>
        </table>
    </div>
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

    function populate_links(id) {
        //call the buttons enabled function immediately
        buttons_enabled();
        //get all ids
        let ids_array = <?php echo json_encode($ids_array); ?>;
        
        for(i = 0; i < ids_array.length; i++) {

            //check which table row is clicked
            if(id == ids_array[i]) {
                
                //change the background of the row
                $('#customer_id_' + id).removeAttr('class');
                $('#customer_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#cuedit').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_sales/edit_customer/');?>" + id + "', 'Edit Customer')");

                //edit button
               // $('#custatement').attr("href", "<?php echo site_url('admin/customer_statement/');?>" + id);

                $('#custatement').attr("onclick", "date_selection_modal('<?php echo site_url('modal/popup_dates/date_selection_customer_statement/'); ?>" + id + "')");

                //delete button
                
                $('#cudelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/customer/delete/');?>" + id + "', 'Are you sure you want to delete this customer? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < ids_array.length; j++) {
                    if(ids_array[j] != id) {
                        $('#customer_id_' + ids_array[j]).removeAttr('style');

                    }
                }
            } 
        }
    }

    function deselect_all() {
        //call the buttons disabled function immediately
        buttons_disabled();
        let ids_array = <?php echo json_encode($ids_array); ?>;
        
        for(i = 0; i < ids_array.length; i++) {
            $('#customer_id_' + ids_array[i]).removeAttr('style');
        }
    }
</script>