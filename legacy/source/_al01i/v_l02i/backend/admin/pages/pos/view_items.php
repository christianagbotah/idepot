<style type="text/css">
    .imgcircle2 {
        transition: transform 0.6s;
    }
    .img-circle2:hover {
        transition: transform 0.6s;
        transform-style: all;
        transform: scale(3);
    }
</style>

<?php 
    
    $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;
    //currency
    $currency = $this->db->get_where('settings', array('type' => 'currency'))->row()->description;
    $fmt = new NumberFormatter('en_US', NumberFormatter::CURRENCY);
?>
<div class="container">
    <div class="row">

        <?php
              $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

             //Is the current logged in user the admin -->
               if($level == 1 || $level == 2):
            ?>

           <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-info btn-lg" id="itemadd" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_pos/add_item/');?>', 'Create New Item')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>


            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-success btn-lg" id="itemedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-danger btn-lg" id="itemdelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <?php
                endif;
            ?>

            <div class="col-md-1 col-sm-1 col-lg-1"><button class="btn btn-outline-warning btn-lg" id="itemprint"><i class="fa fa-2x fa-fw fa-print"></i></button><br><strong class="ml-3">Print</strong></div>

    </div>
    <?php
        $all_tems = $this->db->get('items');
        $all_tems_array = $all_tems->result_array();

        $ids_array = array();
        $items_amount_counter = 0;
        $total_q = 0;
     ?>
    <hr>
    <div class="row">
        <table class="table" width="100%" id="item_lists">
            <thead class="bg-info">
              <tr>
                <th style="text-align: center">item Image</th>
                <th>Item Category</th>
                <th>Item</th>
                <th>Description</th>
                <th style="text-align: right">Selling Price</th>

                <?php
                    if($level != 3) { ?>
                    <th style="text-align: right">Purchase Price</th>
                <?php
                    }; ?>
                <th style="text-align: right">Quantity</th>
                <?php
                    //Is the current logged in user the super admin -->
                    if($level == 1):
                        echo '<th style="text-align: right">Last Modified</th>';
                    endif;
                ?>
                <th style="text-align: right">Last Used</th>
              </tr>
            </thead>
            <tbody>
                <?php 
                    foreach($all_tems_array as $item):
                        $total_q += $item['quantity'];

                        $category_name = $this->db->get_where('item_category', array('category_id' => $item['category_id']))->row()->category_name;
                ?>
              <tr ondblclick="deselect_all()" onclick="populate_links('<?= $item['item_id']?>')" id="item_id_<?= $item['item_id']; ?>">
                <td align="center" >
                    <img src="<?php echo $this->crud_model->get_image_url('item',$item['item_id']);?>" class="img-circle2" width="50" />
                </td>
                <td style="vertical-align: middle;"><?= $category_name; ?></td>
                <td style="vertical-align: middle;"><?= $item['item_name']; ?></td>
                <td style="vertical-align: middle;"><?= $item['description']; ?></td>
                <td align="right" style="vertical-align: middle;"><strong><?= numfmt_format_currency($fmt, $item['selling_price'], $currency); ?></strong></td>

                <?php 
                    if($level != 3) { ?>
                <td align="right" style="vertical-align: middle;"><strong><?= numfmt_format_currency($fmt, $item['purchase_price'], $currency); ?></strong></td> <?php }; ?>
                <td align="right" style="vertical-align: middle;"><strong><?= number_format($item['quantity'], 0, '.', ','); ?></strong></td>

                <?php 
                    if($level == 1) { ?>
                <td align="right" style="vertical-align: middle;"><?php if($item['last_modified'] != '') echo date('d-m-Y H:i:s', $item['last_modified']); ?></td>
                <?php } ?>

                <td align="right" style="vertical-align: middle;"><?php if($item['last_used_timestamp'] != '') echo date('d-m-Y H:i:s', $item['last_used_timestamp']); ?></td>
              </tr>
              <?php
                    array_push($ids_array, $item['item_id']);
                    //calculate items total amount(total inventory)
                    //multiply the purchase price by the quantity
                    $item_value = $item['purchase_price'] * $item['quantity'];
                    $items_amount_counter = $items_amount_counter + $item_value;

               endforeach; ?>
            </tbody>
        </table>
    </div>
    <br>
    <hr>
    <div class="row">
            <div class="col-md-4 col-sm-4 text-lg-left"><strong class="text-dark">Total Inventory: <?= number_format($all_tems->num_rows(), 0, '.', ','); ?></strong></div>
            <div class="col-md-4 col-sm-4 text-lg-left"><strong class="text-dark">Total Inventory Amount <?= numfmt_format_currency($fmt, $items_amount_counter, $currency); ?></strong></div>
            <div class="col-md-4 col-sm-4 text-lg-left"><strong class="text-dark">Total Inventory Quantity <?= number_format($total_q, 0, '.', ','); ?> Bags</strong></div>

    </div>
</div>

<script type="text/javascript">
    $(function() {
        $('#item_lists').DataTable();
        ///$('.bg-info tr th').addClass('text-light');
        buttons_disabled();
    });

    //let's disable all the buttons until an item is selected
    function buttons_disabled() {
        $('#itemedit').attr('disabled', 'disabled');
        $('#itemdelete').attr('disabled', 'disabled');
        $('#itemprint').attr('disabled', 'disabled');
    }

    //let's enable all the buttons when an item is selected
    function buttons_enabled() {
        $('#itemedit').removeAttr('disabled');
        $('#itemdelete').removeAttr('disabled');
        $('#itemprint').removeAttr('disabled');
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
                $('#item_id_' + id).removeAttr('class');
                $('#item_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#itemedit').attr("onclick", "showAjaxModal_payments_sales('<?php echo site_url('modal/popup_pos/edit_item/');?>" + id + "', 'Edit Item')");

                //delete button
                
                $('#itemdelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/item/delete/');?>" + id + "', 'Are you sure you want to delete this item? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < ids_array.length; j++) {
                    if(ids_array[j] != id) {
                        $('#item_id_' + ids_array[j]).removeAttr('style');

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
            $('#item_id_' + ids_array[i]).removeAttr('style');
        }
    }
</script>
