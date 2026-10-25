<?php
    $item_row = $this->db->get_where('items', ['item_id' => $item_id])->row();
    $isSoldInUnit = $item_row->item_sold_in_units;
    $item_price = $item_row->selling_price;
    

?>
<tr>
    <td>
        <?=intVal($currentTR) + 1;?>   
    </td>
    <td>
        <div class="font-weight-bold"><?=$item_row->item_name;?></div>
        <input type="hidden" name="item_<?=$item_id; ?>" value="<?=$item_id ?>">
        
    </td>
    <td>
        <div class="text-black-50"><?=$item_row->description;?></div>                                   
    </td>
    <td>

        <?php
            if($isSoldInUnit > 0):
                /*it's sold in unit*/

                $package_id = $item_row->package_id;
                $package_name = $this->db->get_where('packages', ['package_id' => $package_id])->row()->package_name;

                $unit_row = $this->db->get_where('units_items', ['item_id' => $item_id])->row();
                $unit_id = $unit_row->unit_id;
                $unit_price = $unit_row->unit_price;

                $unit_name = $this->db->get_where('units', ['unit_id' => $unit_id])->row()->unit_name;
                ?>
                <div class="form-group row bg-warning">
                    <div class="col-md-6 col-lg-6 col-sm-6">
                        <label class="col-md-12 col-lg-12 col-sm-12"><small style="font-size: 7px"><?=$package_name;?></small></label>
                        <input type="text" class="form-control" name="price_<?=$item_id.$customer_id ?>" id="price_<?=$item_id.$customer_id ?>" value="<?=$item_price?>">
                        </div>

                        <!-- prices for each unit -->
                        <div class="col-md-6 col-lg-6 col-sm-6">
                        <label class="col-md-12 col-lg-12 col-sm-12"><small style="font-size: 7px"><?=$unit_name;?></small></label>
                        <input type="text" class="form-control" name="unit_price_<?=$item_id.$customer_id ?>" id="unit_price_<?=$item_id.$customer_id ?>" value="<?=$unit_price?>">

                        <input type="hidden"name="unit_id_<?=$item_id.$customer_id ?>" id="unit_id_<?=$item_id.$customer_id ?>" value="<?=$unit_id?>">
                    </div>
                </div>

                <?php
                else:
                /*it's not sold in unit*/
                ?>

                <input type="text" class="form-control" name="price_<?=$item_id.$customer_id ?>" id="price_<?=$item_id .$customer_id ?>" value="<?=$item_price?>">
                <?php
            endif;
            ?>
        
        
    </td>
</tr>