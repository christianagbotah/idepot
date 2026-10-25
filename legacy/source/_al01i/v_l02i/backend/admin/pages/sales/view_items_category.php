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
<div class="container-fluid">
    <div class="row">

        <?php
              $level = $this->db->get_where('admin', array('admin_id' => $this->session->userdata('login_user_id')))->row()->level;

             //Is the current logged in user the admin -->
               if($level == 1 || $level == 2):
            ?>

           <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-info btn-lg" id="itemCatadd" onclick="showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/add_item_category/'); ?>', 'Add Item Category')"><i class="fa fa-2x fa-fw fa-plus"></i></button><br><strong class="ml-4">Add</strong></div>


            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-success btn-lg" id="itemCatedit"><i class="fa fa-2x fa-fw fa-edit"></i></button><br><strong class="ml-4">Edit</strong></div>

            <div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-danger btn-lg" id="itemCatdelete"><i class="fa fa-2x fa-fw fa-trash"></i></button><br><strong class="ml-2">Delete</strong></div>

            <?php
                endif;
            ?>

            <!--<div class="col-md-2 col-sm-2 col-lg-2"><button class="btn btn-outline-warning btn-lg" id="itemprint"><i class="fa fa-2x fa-fw fa-print"></i></button><br><strong class="ml-3">Print</strong></div>-->

    </div>
    <?php
        $all_category = $this->db->get('item_category');
        $all_category_array = $all_category->result_array();

        $ids_array = array();
        $total_q = 0;
     ?>
    <hr>
    <div class="row">
        <table class="table" width="100%" id="item_category_list">
            <thead class="bg-info">
              <tr>
                <th>S/n</th>
                <th>Item Category</th>
                <th>Main Category</th>
              </tr>
            </thead>
            <tbody>
                <?php 
                    $sn = 1;
                    foreach($all_category_array as $cat):
                ?>
              <tr ondblclick="deselect_all()" onclick="populate_links('<?= $cat['category_id']?>')" id="category_id_<?= $cat['category_id']; ?>">
                <td width="30"><?= $sn; ?></td>
                <td><?= $cat['category_name']; ?></td>
                <td><?= $this->db->get_where('item_main_category', ['category_id' => $cat['main_id']])->row()->category_name; ?></td>
              </tr>
              <?php
                    array_push($ids_array, $cat['category_id']);
                    $sn++;
               endforeach; ?>
            </tbody>
        </table>
    </div>
</div>

<script type="text/javascript">
    $(function() {
        $('#item_category_list').DataTable();
        ///$('.bg-info tr th').addClass('text-light');
        buttons_disabled();
    });

    //let's disable all the buttons until an item is selected
    function buttons_disabled() {
        $('#itemCatedit').attr('disabled', 'disabled');
        $('#itemCatdelete').attr('disabled', 'disabled');
        $('#itemprint').attr('disabled', 'disabled');
    }

    //let's enable all the buttons when an item is selected
    function buttons_enabled() {
        $('#itemCatedit').removeAttr('disabled');
        $('#itemCatdelete').removeAttr('disabled');
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
                $('#category_id_' + id).removeAttr('class');
                $('#category_id_' + id).css({
                    background: '#1cc88a',
                    color: '#ffffff'
                });

                //populate the buttons with the links
                //edit button
                $('#itemCatedit').attr("onclick", "showAjaxModal_payments_sales('<?php echo site_url('modal/popup_sales/edit_item_category/');?>" + id + "', 'Edit Item Category')");

                //delete button
                
                $('#itemCatdelete').attr("onclick", "confirm_modal('<?php echo site_url('admin/item_category/delete/');?>" + id + "', 'Are you sure you want to delete this item? All related records will be deleted permanently.')");

            } else {
                for(j = 0; j < ids_array.length; j++) {
                    if(ids_array[j] != id) {
                        $('#category_id_' + ids_array[j]).removeAttr('style');

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
            $('#category_id_' + ids_array[i]).removeAttr('style');
        }
    }
</script>
