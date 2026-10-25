<?php

    $query_array = $this->db
                               // ->select_sum('quantity_due')
                                ->where('so_code', $so_code)
                                ->where('customer_id', $customer_id)
                                ->get('sales_order')->result_array();
?>

<table class="table text-black-50" border="0">
    <thead>
        <tr>
            <th>ITEM</th>
            <th style="text-align: right">Q'TY BAL</th>
        </tr>
    </thead>
    <tbody>
        
    

<?php
    foreach($query_array as $item_bal): ?>

        <tr>
            <td><?=$this->crud_model->getItemName($item_bal['item_id']);?></td>
            <td align="right"><?=number_format($item_bal['quantity_due'], 0, '.', ',');?></td>
        </tr>
        <?php

    endforeach;
?>
    </tbody>
</table>