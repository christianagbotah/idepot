<?php 
    //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
?>
<div class="container-fluid">
    <div class="row">

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="suadd" onclick="showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/add_supplier/');?>', 'Add New Supplier')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>

            <?php
              $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

             //Is the current logged in user the admin -->
               if($level == 1 || $level == 2):
            ?>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="suedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="sudelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <?php
                endif;
            ?>
<!--
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-secondary btn-lg" id="suemail"><i class="fa fa-2x fa-fw fa-at"></i></button><br><strong class="ml-3">Email</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="susms"><i class="fa fa-2x fa-fw fa-envelope"></i></button><br><strong class="ml-3">SMS</strong></div>
-->
            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-warning btn-lg" id="sustatement"><i class="fa fa-2x fa-fw fa-file-text"></i></button><br><strong style="margin-left: -7px">Statement</strong></div>

    </div>

    <hr>
    <hr>
    <?php
        $suppliers = $this->db->get('suppliers');
        $suppliers_array = $suppliers->result_array();

        $ids_array = array();
     ?>
    <div class="row">
        <table class="table" width="100%" id="suppliers_list">
            <thead class="bg-info">
              <tr>
                <th>Supplier</th>
                <th style="text-align: right">Payable</th>
                <th style="text-align: right">Receivable</th>
                <th>Address</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
                <?php 
                    foreach($suppliers_array as $sup):
                        $this->db->select_sum('amount_due');
                        $this->db->where('amount_due >', 0);
                        $this->db->where('supplier_id', $sup['supplier_id']);
                        $payable = $this->db->get('accounts_payable')->row()->amount_due;

                        $this->db->select_sum('amount_due');
                        $this->db->where('amount_due <', 0);
                        $this->db->where('supplier_id', $sup['supplier_id']);
                        $receivable = abs($this->db->get('accounts_payable')->row()->amount_due);
                ?>
              <tr ondblclick="deselect_all()" onclick="populate_links('<?= $sup['supplier_id']?>')" id="supplier_id_<?= $sup['supplier_id']; ?>">
                <td><?= $sup['supplier_name']; ?></td>
                <td align="right"><strong><?= numfmt_format_currency($fmt, $payable, $currency); ?></strong></td>
                <td align="right"><strong><?= numfmt_format_currency($fmt, $receivable, $currency); ?></strong></td>
                <td><?= $sup['address']; ?></td>
                <td><?= $sup['mobile']; if(!empty($sup['phone'])) echo ' | '.$sup['phone']; ?></td>
              </tr>
          <?php 
                array_push($ids_array, $sup['supplier_id']);
            endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<script type="text/javascript">
    $(function() {
        $('#suppliers_list').DataTable();
        buttons_disabled();
    });

    //let's disable all the buttons until a supplier is selected
    function buttons_disabled() {
        $('#suedit').attr('disabled', 'disabled');
        $('#sudelete').attr('disabled', 'disabled');
        $('#suemail').attr('disabled', 'disabled');
        $('#susms').attr('disabled', 'disabled');
        $('#sustatement').attr('disabled', 'disabled');
    }

    //let's enable all the buttons when a supplier is selected
    function buttons_enabled() {
        $('#suedit').removeAttr('disabled');
        $('#sudelete').removeAttr('disabled');
        $('#suemail').removeAttr('disabled');
        $('#susms').removeAttr('disabled');
        $('#sustatement').removeAttr('disabled');
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
                $('#supplier_id_' + id).removeAttr('class');
                $('#supplier_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#suedit').attr("onclick", "showAjaxModal_data_create('<?php echo site_url('modal/popup_purchases/edit_supplier/');?>" + id + "', 'Edit Supplier')");

                //delete button
                
                $('#sudelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/supplier/delete/');?>" + id + "', 'Are you sure you want to delete this supplier? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < ids_array.length; j++) {
                    if(ids_array[j] != id) {
                        $('#supplier_id_' + ids_array[j]).removeAttr('style');

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
            $('#supplier_id_' + ids_array[i]).removeAttr('style');
        }
    }
</script>